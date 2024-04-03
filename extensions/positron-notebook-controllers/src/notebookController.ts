/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as positron from 'positron';
import { NotebookSessionService } from './notebookSessionService';

/**
 * Wraps a vscode.NotebookController for a specific language, and manages a notebook runtime session
 * for each vscode.NotebookDocument that uses this controller.
 */
export class NotebookController implements vscode.Disposable {

	private readonly _disposables: vscode.Disposable[] = [];

	/** The wrapped VSCode notebook controller. */
	public readonly controller: vscode.NotebookController;

	/** A map of the current execution order, keyed by session ID. */
	private readonly _executionOrderBySessionId: Map<string, number> = new Map();

	/** Incremented for each cell we create to give it a unique ID. */
	private static _CELL_COUNTER = 0;

	/**
	 * @param _languageId The language ID for which this controller is responsible.
	 * @param _notebookSessionService The notebook session service.
	 */
	constructor(
		private readonly _languageId: string,
		private readonly _notebookSessionService: NotebookSessionService,
	) {
		// Create a VSCode notebook controller for this language.
		this.controller = vscode.notebooks.createNotebookController(
			`positron-${_languageId}`,
			// The 'jupyter-notebook' notebook type is contributed via the built-in extension
			// extensions/ipynb. Registering our notebook controllers with the same type ensures
			// that they show up in the notebook UI's kernel picker for .ipynb files.
			'jupyter-notebook',
			// Display name in the notebook UI's kernel picker.
			this.label,
		);
		this.controller.supportsExecutionOrder = true;
		this.controller.executeHandler = this.executeCells.bind(this);

		// We intentionally don't set this.controller.supportedLanguages. If we restrict it, when a
		// user first runs a cell in a new notebook with no selected controller, and they select a
		// controller from the quickpick for a language that differs from the cell, the cell will
		// not be executed.

		this._disposables.push(this.controller);

		this._disposables.push(vscode.workspace.onDidCloseNotebookDocument(async (notebook) => {
			if (this._notebookSessionService.hasStartingOrRunningNotebookSession(notebook.uri)) {
				await this._notebookSessionService.shutdownRuntimeSession(notebook.uri);
			}
		}));

		this._disposables.push(this.controller.onDidChangeSelectedNotebooks(async (e) => {
			// Has this controller been selected for a notebook?
			if (e.selected) {
				// Note that this is also reached when a notebook is opened, if this controller was
				// already selected.

				await Promise.all([
					updateNotebookLanguage(e.notebook, this._languageId),
					this.startRuntimeSession(e.notebook),
				]);
			} else {
				await this._notebookSessionService.shutdownRuntimeSession(e.notebook.uri);
			}
		}));
	}

	/** The human-readable label of the controller. */
	public get label(): string {
		return `${this._languageId[0].toUpperCase()}${this._languageId.slice(1)}`;
	}

	/**
	 * Start a runtime session for a notebook.
	 *
	 * @param notebook The notebook to start a runtime for.
	 * @returns Promise that resolves when the runtime has started.
	 */
	public async startRuntimeSession(notebook: vscode.NotebookDocument): Promise<positron.LanguageRuntimeSession> {
		try {
			return await this._notebookSessionService.startRuntimeSession(notebook.uri, this._languageId);
		} catch (err) {
			const retry = vscode.l10n.t("Retry");
			const selection = await vscode.window.showErrorMessage(
				vscode.l10n.t(
					"Starting {0} interpreter for '{1}' failed. Reason: {2}",
					this.label,
					notebook.uri.path,
					err
				),
				retry,
			);
			if (selection === retry) {
				return vscode.window.withProgress(this.startProgressOptions(notebook), () => this.startRuntimeSession(notebook));
			}

			throw err;
		}
	}

	/**
	 * Notebook controller execute handler.
	 *
	 * @param cells Cells to execute.
	 * @param _notebook Notebook containing the cells.
	 * @param _controller Notebook controller.
	 * @returns Promise that resolves when the language has been set.
	 */
	private async executeCells(cells: vscode.NotebookCell[], notebook: vscode.NotebookDocument, _controller: vscode.NotebookController) {
		// Get the notebook's session.
		let session = this._notebookSessionService.getNotebookSession(notebook.uri);

		// If the runtime is still starting, wait for it to be ready.
		if (!session) {
			const startingSessionPromise = this._notebookSessionService.getStartingNotebookSessionPromise(notebook.uri);
			if (startingSessionPromise && !startingSessionPromise.isSettled) {
				session = await vscode.window.withProgress(this.startProgressOptions(notebook), () => startingSessionPromise.p);
			}
		}

		// No session has been started for this notebook, start one.
		if (!session) {
			session = await vscode.window.withProgress(this.startProgressOptions(notebook), () => this.startRuntimeSession(notebook));
		}

		for (const cell of cells) {
			await this.executeCell(cell, session);
		}
	}

	/**
	 * Execute a notebook cell.
	 *
	 * @param cell Cell to execute.
	 * @returns Promise that resolves when the runtime has finished executing the cell.
	 */
	private async executeCell(cell: vscode.NotebookCell, session: positron.LanguageRuntimeSession): Promise<void> {
		// Get the execution order for the session, default to 0 for the first execution.
		let executionOrder = this._executionOrderBySessionId.get(session.metadata.sessionId) ?? 0;

		// Create a cell execution.
		const currentExecution = this.controller.createNotebookCellExecution(cell);

		// If the cell's stop button is pressed, interrupt the runtime.
		currentExecution.token.onCancellationRequested(session.interrupt.bind(session));

		// Start the execution timer.
		currentExecution.start(Date.now());

		// Clear any existing outputs.
		currentExecution.clearOutput();

		// Increment the execution order.
		this._executionOrderBySessionId.set(session.metadata.sessionId, ++executionOrder);
		currentExecution.executionOrder = executionOrder;

		// Create a promise that resolves when the cell execution is complete i.e. when the runtime
		// receives an error or status idle reply message.
		const cellId = `positron-notebook-cell-${NotebookController._CELL_COUNTER++}`;
		const promise = new Promise<void>((resolve) => {
			// Update the cell execution using received runtime messages.
			const handler = session.onDidReceiveRuntimeMessage(message => {
				// Track whether the cell execution was successful.
				let success: boolean | undefined;

				// Is the message a reply to the cell we're executing?
				if (message.parent_id === cellId) {

					// Handle the message, and store any resulting outputs.
					let cellOutputItems: vscode.NotebookCellOutputItem[] = [];
					switch (message.type) {
						case positron.LanguageRuntimeMessageType.Output:
							cellOutputItems = handleRuntimeMessageOutput(message as positron.LanguageRuntimeOutput);
							break;
						case positron.LanguageRuntimeMessageType.Stream:
							cellOutputItems = handleRuntimeMessageStream(message as positron.LanguageRuntimeStream);
							break;
						case positron.LanguageRuntimeMessageType.Error:
							cellOutputItems = handleRuntimeMessageError(message as positron.LanguageRuntimeError);
							success = false;
							break;
						case positron.LanguageRuntimeMessageType.State:
							if ((message as positron.LanguageRuntimeState).state === positron.RuntimeOnlineState.Idle) {
								success = true;
							}
							break;
					}

					// Append any resulting outputs to the cell execution.
					if (cellOutputItems.length > 0) {
						currentExecution.appendOutput(new vscode.NotebookCellOutput(cellOutputItems));
					}
				}

				// If a success code was set, end the execution, dispose the handler, and resolve the promise.
				if (success !== undefined) {
					currentExecution.end(success, Date.now());
					handler.dispose();
					resolve();
				}
			});
		});

		// Execute the cell.
		session.execute(
			cell.document.getText(),
			cellId,
			positron.RuntimeCodeExecutionMode.Interactive,
			positron.RuntimeErrorBehavior.Stop
		);

		return promise;
	}

	/** Get the progress options for starting a runtime.  */
	private startProgressOptions(notebook: vscode.NotebookDocument): vscode.ProgressOptions {
		return {
			location: vscode.ProgressLocation.Notification,
			title: vscode.l10n.t("Starting {0} interpreter for '{1}'", this.label, notebook.uri.path),
		};
	}

	public async dispose() {
		this._disposables.forEach(d => d.dispose());
	}
}

/**
 * Set the language for a notebook.
 *
 * @param notebook Notebook whose language to set.
 * @param languageId The VSCode-compatible language ID compatible.
 * @returns Promise that resolves when the language has been set.
 */
async function updateNotebookLanguage(notebook: vscode.NotebookDocument, languageId: string): Promise<void> {
	// Set the language in the notebook's metadata.
	// This follows the approach from the vscode-jupyter extension.
	if (notebook.metadata?.custom?.metadata?.language_info?.name !== languageId) {
		const edit = new vscode.WorkspaceEdit();
		edit.set(notebook.uri, [
			vscode.NotebookEdit.updateNotebookMetadata({
				...notebook.metadata,
				custom: {
					...notebook.metadata.custom ?? {},
					metadata: {
						...(notebook.metadata.custom?.metadata ?? {}),
						language_info: {
							name: languageId
						}
					}
				}
			})]);
		await vscode.workspace.applyEdit(edit);
	}

	// Set the language in each of the notebook's cells.
	await Promise.all(notebook.getCells()
		.filter(cell => cell.kind === vscode.NotebookCellKind.Code && cell.document.languageId !== languageId)
		.map(cell => vscode.languages.setTextDocumentLanguage(cell.document, languageId))
	);
}


/**
 * Handle a LanguageRuntimeOutput message.
 *
 * @param message Message to handle.
 * @returns Resulting cell output items.
 */
function handleRuntimeMessageOutput(message: positron.LanguageRuntimeOutput): vscode.NotebookCellOutputItem[] {
	const cellOutputItems: vscode.NotebookCellOutputItem[] = [];
	const mimeTypes = Object.keys(message.data);
	mimeTypes.map(mimeType => {
		const data = message.data[mimeType];
		if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
			cellOutputItems.push(new vscode.NotebookCellOutputItem(Buffer.from(data, 'base64'), mimeType));
		} else {
			cellOutputItems.push(vscode.NotebookCellOutputItem.text(data, mimeType));
		}
	});
	return cellOutputItems;
}

/**
 * Handle a LanguageRuntimeStream message.
 *
 * @param message Message to handle.
 * @returns Resulting cell output items.
 */
function handleRuntimeMessageStream(message: positron.LanguageRuntimeStream): vscode.NotebookCellOutputItem[] {
	switch (message.name) {
		case positron.LanguageRuntimeStreamName.Stdout:
			return [vscode.NotebookCellOutputItem.stdout(message.text)];
		case positron.LanguageRuntimeStreamName.Stderr:
			return [vscode.NotebookCellOutputItem.stderr(message.text)];
	}
}

/**
 * Handle a LanguageRuntimeError message.
 *
 * @param message Message to handle.
 * @returns Resulting cell output items.
 */
function handleRuntimeMessageError(message: positron.LanguageRuntimeError): vscode.NotebookCellOutputItem[] {
	return [
		vscode.NotebookCellOutputItem.error({
			name: message.name,
			message: message.message,
			stack: message.traceback.join('\n'),
		})
	];
}
