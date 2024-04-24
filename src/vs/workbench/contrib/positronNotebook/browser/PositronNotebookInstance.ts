/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { ISettableObservable, observableValue } from 'vs/base/common/observableInternal/base';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { insertCellAtIndex } from 'vs/workbench/contrib/notebook/browser/controller/cellOperations';
import { IActiveNotebookEditorDelegate, IBaseCellEditorOptions, INotebookEditorCreationOptions, INotebookEditorViewState, INotebookViewCellsUpdateEvent } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/browser/notebookOptions';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellEditType, CellKind, ICellReplaceEdit, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { createNotebookCell } from 'vs/workbench/contrib/positronNotebook/browser/PositronNotebookCell';
import { PositronNotebookEditorInput } from 'vs/workbench/contrib/positronNotebook/browser/PositronNotebookEditorInput';
import { BaseCellEditorOptions } from './BaseCellEditorOptions';
import * as DOM from 'vs/base/browser/dom';
import { IPositronNotebookCell } from 'vs/workbench/contrib/positronNotebook/browser/notebookCells/interfaces';
import { selectionMachine, SelectionState } from 'vs/workbench/contrib/positronNotebook/browser/notebookCells/selectionMachine';

// eslint-disable-next-line local/code-import-patterns
import { Actor, createActor } from 'xstate';


enum KernelStatus {
	Uninitialized = 'Uninitialized',
	Connecting = 'Connecting',
	Connected = 'Connected',
	Disconnected = 'Disconnected',
	Errored = 'Errored'
}

/**
 * Class that abstracts away _most_ of the interfacing with existing notebook classes/models/functions
 * in an attempt to control the complexity of the notebook. This class is passed into React
 * and is the source of truth for rendering and controlling the notebook.
 * This is where all the logic and state for the notebooks is controlled and encapsulated.
 * This is then given to the UI to render.
 */
export interface IPositronNotebookInstance {

	/**
	 * URI of the notebook file being edited
	 */
	get uri(): URI;

	/**
	 * The cells that make up the notebook
	 */
	cells: ISettableObservable<IPositronNotebookCell[]>;

	/**
	 * Status of kernel for the notebook.
	 */
	kernelStatus: ISettableObservable<KernelStatus>;

	// /**
	//  * The currently selected cells. Typically a single cell but can be multiple cells.
	//  */
	// selectedCells: ISettableObservable<IPositronNotebookCell[]>;

	selectionStateMachine: Actor<typeof selectionMachine>;

	/**
	 * The current selection state of the notebook.
	 */
	selectionState: ISettableObservable<SelectionState>;

	// /**
	//  * Cell currently being edited. Undefined if no cell is being edited.
	//  */
	// editingCell: ISettableObservable<IPositronNotebookCell | undefined>;

	/**
	 * Has the notebook instance been disposed?
	 */
	isDisposed: boolean;

	// Methods for interacting with the notebook

	/**
	 * Run the given cells
	 * @param cells The cells to run
	 */
	runCells(cells: IPositronNotebookCell[]): Promise<void>;

	/**
	 * Run the selected cells
	 */
	runSelectedCells(): Promise<void>;

	/**
	 * Run all cells in the notebook
	 */
	runAllCells(): Promise<void>;

	/**
	 * Add a new cell of a given type to the notebook at the requested index
	 */
	addCell(type: CellKind, index: number): void;

	/**
	 * Delete a cell from the notebook
	 */
	deleteCell(cell: IPositronNotebookCell): void;

	/**
	 * Attach a view model to this instance
	 * @param viewModel View model for the notebook
	 * @param viewState Optional view state for the notebook
	 */
	attachView(viewModel: NotebookViewModel, container: HTMLElement, viewState?: INotebookEditorViewState): void;

	readonly viewModel: NotebookViewModel | undefined;

	/**
	 * Method called when the instance is detached from a view. This is used to cleanup
	 * all the logic and variables related to the view/DOM.
	 */
	detachView(): void;

	/**
	 * Set the currently selected cells for notebook instance
	 * @param cellOrCells The cell or cells to set as selected
	 */
	setSelectedCells(cellOrCells: IPositronNotebookCell[]): void;

	/**
	 * Remove selection from cell
	 * @param cell The cell to deselect
	 */
	deselectCell(cell: IPositronNotebookCell): void;

	/**
	 * Move the current selected cell upwards
	 * @param addMode If true, add the cell to the selection. If false, replace the selection.
	 */
	moveSelectionUp(addMode: boolean): void;

	/**
	 * Move the current selected cell downwards
	 * @param addMode If true, add the cell to the selection. If false, replace the selection.
	 */
	moveSelectionDown(addMode: boolean): void;

	/**
	 * Set the currently editing cell.
	 */
	setEditingCell(cell: IPositronNotebookCell | undefined): void;
}

export class PositronNotebookInstance extends Disposable implements IPositronNotebookInstance {
	/**
	 * Value to keep track of what instance number.
	 * Used for keeping track in the logs.
	 */
	static count = 0;

	private _identifier: string = `Positron Notebook | NotebookInstance(${PositronNotebookInstance.count++}) |`;

	/**
	 * Internal cells that we use to manage the state of the notebook
	*/
	private _cells: IPositronNotebookCell[] = [];

	/**
	 * User facing cells wrapped in an observerable for the UI to react to changes
	*/
	cells: ISettableObservable<IPositronNotebookCell[]>;
	selectedCells: ISettableObservable<IPositronNotebookCell[]> = observableValue<IPositronNotebookCell[]>('positronNotebookSelectedCells', []);
	selectionState: ISettableObservable<SelectionState> = observableValue<SelectionState>('positronNotebookSelectionState', { cells: [], selectedCells: null, editingCell: false });
	editingCell: ISettableObservable<IPositronNotebookCell | undefined, void> = observableValue<IPositronNotebookCell | undefined>('positronNotebookEditingCell', undefined);

	selectionStateMachine = createActor(selectionMachine);

	/**
	 * Status of kernel for the notebook.
	 */
	kernelStatus: ISettableObservable<KernelStatus>;

	private language: string | undefined = undefined;

	/**
	 * A set of disposables that are linked to a given model
	 * that need to be cleaned up when the model is changed.
	 */
	private _modelStore = this._register(new DisposableStore());

	/**
	 * Store of disposables.
	 */
	private _localStore = this._register(new DisposableStore());

	private _textModel: NotebookTextModel | undefined = undefined;
	private _viewModel: NotebookViewModel | undefined = undefined;

	/**
	 * Callback to clear the keyboard navigation listeners. Set when listeners are attached.
	 */
	private _clearKeyboardNavigation: (() => void) | undefined = undefined;

	/**
	 * Key-value map of language to base cell editor options for cells of that language.
	 */
	private _baseCellEditorOptions: Map<string, IBaseCellEditorOptions> = new Map();

	readonly isReadOnly: boolean;

	/**
	 * Mirrored cell state listeners from the notebook model.
	 */
	private _localCellStateListeners: DisposableStore[] = [];
	// private readonly _scopedContextKeyService: IContextKeyService;

	get uri(): URI {
		return this._input.resource;
	}

	get viewModel(): NotebookViewModel | undefined {
		return this._viewModel;
	}


	/**
	 * Internal event emitter for when the editor's options change.
	 */
	private readonly _onDidChangeOptions = this._register(new Emitter<void>());
	/**
	 * Event emitter for when the editor's options change.
	 */
	readonly onDidChangeOptions: Event<void> = this._onDidChangeOptions.event;

	/**
	 * Internal event emitter for when the editor's decorations change.
	 */
	private readonly _onDidChangeDecorations = this._register(new Emitter<void>());
	/**
	 * Event emitter for when the editor's decorations change.
	 */
	readonly onDidChangeDecorations: Event<void> = this._onDidChangeDecorations.event;

	/**
	 * Internal event emitter for when the cells of the current view model change.
	 */
	private readonly _onDidChangeViewCells = this._register(new Emitter<INotebookViewCellsUpdateEvent>());
	/**
	 * Event emitter for when the cells of the current view model change.
	 */
	readonly onDidChangeViewCells: Event<INotebookViewCellsUpdateEvent> = this._onDidChangeViewCells.event;

	// #region NotebookModel
	/**
	 * Model for the notebook contents. Note the difference between the NotebookTextModel and the
	 * NotebookViewModel.
	 */
	private readonly _onWillChangeModel = this._register(new Emitter<NotebookTextModel | undefined>());
	/**
	 * Fires an event when the notebook model for the editor is about to change. The argument is the
	 * outgoing `NotebookTextModel` model.
	 */
	readonly onWillChangeModel: Event<NotebookTextModel | undefined> = this._onWillChangeModel.event;
	private readonly _onDidChangeModel = this._register(new Emitter<NotebookTextModel | undefined>());
	/**
	 * Fires an event when the notebook model for the editor has changed. The argument is the new
	 * `NotebookTextModel` model.
	 */
	readonly onDidChangeModel: Event<NotebookTextModel | undefined> = this._onDidChangeModel.event;

	/**
	 * Keep track of if this editor has been disposed.
	 */
	isDisposed: boolean = false;

	constructor(
		public _input: PositronNotebookEditorInput,
		public readonly creationOptions: INotebookEditorCreationOptions | undefined,
		@INotebookKernelService private readonly notebookKernelService: INotebookKernelService,
		@INotebookExecutionService private readonly notebookExecutionService: INotebookExecutionService,
		@INotebookExecutionStateService private readonly notebookExecutionStateService: INotebookExecutionStateService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this.cells = observableValue<IPositronNotebookCell[]>('positronNotebookCells', this._cells);
		this.kernelStatus = observableValue<KernelStatus>('positronNotebookKernelStatus', KernelStatus.Uninitialized);

		this.selectionStateMachine.subscribe((state) => {
			console.log('~~~~~~~~~~State:', state.context, state.value);
			this.selectionState.set(state.context, undefined);
		});
		this.selectionStateMachine.start();
		// this.selectionStateMachine.send({ type: 'setCells', cells: this._cells });

		this.isReadOnly = this.creationOptions?.isReadOnly ?? false;

		this.setupNotebookTextModel();

		this._logService.info(this._identifier, 'constructor');
	}

	/**
	 * Gets the notebook options for the editor.
	 * Exposes the private internal notebook options as a get only property.
	 */
	get notebookOptions() {

		if (this._notebookOptions) {
			return this._notebookOptions;
		}
		this._logService.info(this._identifier, 'Generating new notebook options');


		this._notebookOptions = this.creationOptions?.options ?? new NotebookOptions(
			DOM.getActiveWindow(),
			this.configurationService,
			this.notebookExecutionStateService,
			this._codeEditorService,
			this.isReadOnly
		);

		return this._notebookOptions;
	}

	/**
	 * Options for how the notebook should be displayed. Currently not really used but will be as
	 * notebook gets fleshed out.
	 */
	private _notebookOptions: NotebookOptions | undefined;


	private async setupNotebookTextModel() {
		const model = await this._input.resolve();
		if (model === null) {
			throw new Error(
				localize(
					'fail.noModel',
					'Failed to find a model for view type {0}.',
					this._input.viewType
				)
			);
		}

		const notebookModel = model.notebook;

		const fillCells = () => {

			// dispose old cells
			this._cells.forEach(cell => cell.dispose());

			// Update cells with new cells
			this._cells = notebookModel.cells.map(cell => createNotebookCell(cell, this, this._instantiationService));


			this.language = notebookModel.cells[0].language;
			this.cells.set(this._cells, undefined);
			this.selectionStateMachine.send({ type: 'setCells', cells: this._cells });
		};

		fillCells();

		this._textModel = notebookModel;

		// TODO: Make sure this is cleaned up properly.
		this._modelStore.add(this._textModel);
		this._modelStore.add(
			this._textModel.onDidChangeContent((e) => {
				// Only update cells if the number of cells has changed. Aka we've added or removed
				// cells. There's a chance this is not smart enough. E.g. it may be possible to
				// swap cells in the notebook and this would not catch that.
				const numOldCells = this._cells.length;
				const numNewCells = notebookModel.cells.length;

				if (numOldCells === numNewCells) {
					return;
				}

				fillCells();
			})
		);

	}

	async runCells(cells: IPositronNotebookCell[]): Promise<void> {

		if (!cells) {
			throw new Error(localize('noCells', "No cells to run"));
		}
		await this._runCells(cells);
	}

	async runAllCells(): Promise<void> {
		await this._runCells(this._cells);
	}

	async runSelectedCells(): Promise<void> {
		await this._runCells(this.selectedCells.get());
	}

	/**
	 * Internal method to run cells, used by other cell running methods.
	 * @param cells Cells to run
	 * @returns
	 */
	private async _runCells(cells: IPositronNotebookCell[]): Promise<void> {
		// Filter so we're only working with code cells.
		const codeCells = cells;
		this._logService.info(this._identifier, '_runCells');

		if (!this._textModel) {
			throw new Error(localize('noModel', "No model"));
		}

		this._trySetupKernel();

		for (const cell of codeCells) {
			if (cell.isCodeCell()) {
				cell.executionStatus.set('running', undefined);
			}
		}

		const hasExecutions = [...cells].some(cell => Boolean(this.notebookExecutionStateService.getCellExecution(cell.uri)));

		if (hasExecutions) {
			this.notebookExecutionService.cancelNotebookCells(this._textModel, Array.from(cells).map(c => c.cellModel));
			return;
		}

		await this.notebookExecutionService.executeNotebookCells(this._textModel, Array.from(cells).map(c => c.cellModel), this._contextKeyService);
		for (const cell of codeCells) {
			if (cell.isCodeCell()) {
				cell.executionStatus.set('idle', undefined);
			}
		}
	}

	addCell(type: CellKind, index: number): void {
		if (!this._viewModel) {
			throw new Error(localize('noViewModel', "No view model for notebook"));
		}

		if (!this.language) {
			throw new Error(localize('noLanguage', "No language for notebook"));
		}
		const synchronous = true;
		const pushUndoStop = true;
		insertCellAtIndex(
			this._viewModel,
			index,
			'',
			this.language,
			type,
			undefined,
			[],
			synchronous,
			pushUndoStop
		);
	}

	deleteCell(cell: IPositronNotebookCell): void {
		if (!this._textModel) {
			throw new Error(localize('noModelForDelete', "No model for notebook to delete cell from"));
		}

		const textModel = this._textModel;
		// TODO: Hook up readOnly to the notebook actual value
		const readOnly = false;
		const computeUndoRedo = !readOnly || textModel.viewType === 'interactive';
		const cellIndex = textModel.cells.indexOf(cell.cellModel);

		const edits: ICellReplaceEdit = {
			editType: CellEditType.Replace, index: cellIndex, count: 1, cells: []
		};

		const nextCellAfterContainingSelection = textModel.cells[cellIndex + 1] ?? undefined;
		const focusRange = {
			start: cellIndex,
			end: cellIndex + 1
		};

		textModel.applyEdits([edits], true, { kind: SelectionStateType.Index, focus: focusRange, selections: [focusRange] }, () => {
			if (nextCellAfterContainingSelection) {
				const cellIndex = textModel.cells.findIndex(cell => cell.handle === nextCellAfterContainingSelection.handle);
				return { kind: SelectionStateType.Index, focus: { start: cellIndex, end: cellIndex + 1 }, selections: [{ start: cellIndex, end: cellIndex + 1 }] };
			} else {
				if (textModel.length) {
					const lastCellIndex = textModel.length - 1;
					return { kind: SelectionStateType.Index, focus: { start: lastCellIndex, end: lastCellIndex + 1 }, selections: [{ start: lastCellIndex, end: lastCellIndex + 1 }] };

				} else {
					return { kind: SelectionStateType.Index, focus: { start: 0, end: 0 }, selections: [{ start: 0, end: 0 }] };
				}
			}
		}, undefined, computeUndoRedo);

	}

	/**
	 * Get the current `NotebookTextModel` for the editor.
	 */
	get textModel() {
		return this._viewModel?.notebookDocument;
	}

	/**
	 * Type guard to check if the editor has a model.
	 * @returns True if the editor has a model, false otherwise.
	 */
	hasModel(): this is IActiveNotebookEditorDelegate {
		return Boolean(this._viewModel);
	}

	/**
	 * Set the currently selected cells for notebook instance
	 * @param cellOrCells The cell or cells to set as selected
	 */
	setSelectedCells(cells: IPositronNotebookCell[]): void {
		this.selectionStateMachine.send({ type: 'selectCell', cell: cells[0] });
	}

	deselectCell(cell: IPositronNotebookCell): void {
		this.selectionStateMachine.send({ type: 'deselectCell', cell });
	}

	setEditingCell(cell: IPositronNotebookCell | undefined): void {
		if (cell === undefined) {
			return;
		}
		this.selectionStateMachine.send({ type: 'selectCell', cell });
		this.selectionStateMachine.send({ type: 'enterPress' });
	}

	private _moveSelection(addMode: boolean, direction: 'up' | 'down'): void {
		const selectedCells = this.selectedCells.get();
		if (selectedCells.length === 0) {
			return;
		}

		const indicesOfSelected = selectedCells.map(cell => this._cells.indexOf(cell));

		const indexOfSelection = indicesOfSelected.reduce((acc, index) => {
			if (direction === 'up') {
				return Math.min(acc, index);
			} else {
				return Math.max(acc, index);
			}
		}, indicesOfSelected[0]);

		const indexOfNewSelection = indexOfSelection + (direction === 'up' ? -1 : 1);

		const selectedCell = this._cells[indexOfNewSelection];

		if (addMode) {
			this.selectedCells.set([...selectedCells, selectedCell], undefined);
		} else {
			this.selectedCells.set([selectedCell], undefined);
		}
	}
	moveSelectionUp(addMode: boolean): void {
		this._moveSelection(addMode, 'up');
	}

	moveSelectionDown(addMode: boolean): void {
		this._moveSelection(addMode, 'down');
	}

	async attachView(viewModel: NotebookViewModel, container: HTMLElement, viewState?: INotebookEditorViewState) {
		// Make sure we're detethered from existing views. (Useful when we're swapping to a new
		// window and the old window still exists)

		this.detachView();

		const alreadyHasModel = this._viewModel !== undefined && this._viewModel.equal(viewModel.notebookDocument);
		if (alreadyHasModel) {
			// No need to do anything if the model is already set.
			return;
		}

		const notifyOfModelChange = true;

		if (notifyOfModelChange) {
			// Fire on will change with old model
			this._onWillChangeModel.fire(this._viewModel?.notebookDocument);
		}

		this._viewModel = viewModel;

		if (notifyOfModelChange) {
			// Fire on did change with new model
			this._onDidChangeModel.fire(this._viewModel?.notebookDocument);
		}

		// Bring the view model back to the state it was in when the view state was saved.
		this._viewModel?.restoreEditorViewState(viewState);

		if (this._viewModel) {
			this._localStore.add(this._viewModel.onDidChangeViewCells(e => {
				this._onDidChangeViewCells.fire(e);
			}));
		}

		this._setupKeyboardNavigation(container);

		this._logService.info(this._identifier, 'attachView');
	}



	/**
	 * Setup keyboard navigation for the current notebook.
	 * @param container The main containing node the notebook is rendered into
	 */
	private _setupKeyboardNavigation(container: HTMLElement) {

		const window = DOM.getWindow(container);

		const onKeyDown = (event: KeyboardEvent) => {
			const editingCell = this.editingCell.get() !== undefined;
			const addMode = event.metaKey || event.ctrlKey;

			if (editingCell) {
				switch (event.key) {
					case 'Escape':
						this.setEditingCell(undefined);
						break;
				}
			} else {
				switch (event.key) {
					case 'ArrowUp':
						// this.moveSelectionUp(addMode);

						this.selectionStateMachine.send({
							type: 'arrowKeys',
							up: true,
							meta: addMode
						});

						break;
					case 'ArrowDown':
						// this.moveSelectionDown(addMode);
						this.selectionStateMachine.send({
							type: 'arrowKeys',
							up: false,
							meta: addMode
						});
						break;
					case 'Enter': {
						const selectedCells = this.selectedCells.get();
						if (selectedCells.length === 1) {
							this.setEditingCell(this.selectedCells.get()[0]);
							event.stopImmediatePropagation();
						}
						break;
					}
				}
			}
		};

		window.addEventListener('keydown', onKeyDown);

		this._clearKeyboardNavigation = () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}

	/**
	 * Remove and cleanup the current model for notebook.
]	 */
	private _detachModel() {
		this._logService.info(this._identifier, 'detachModel');
		// Clear store of disposables
		this._localStore.clear();

		// Dispose of all cell state listeners from the outgoing model
		dispose(this._localCellStateListeners);

		this._viewModel?.dispose();
		this._viewModel = undefined;
	}




	/**
	 * Attempt to connect to the kernel for running notebook code.
	 * Eventually this will be replaced with a more robust kernel selection system.
	 */
	private async _trySetupKernel(): Promise<void> {
		const kernelStatus = this.kernelStatus.get();
		if (kernelStatus === KernelStatus.Connected || kernelStatus === KernelStatus.Connecting) {
			return;
		}
		this.kernelStatus.set(KernelStatus.Connecting, undefined);
		// How long we wait before trying to attach the kernel again if we fail to find one.
		const KERNEL_RETRY_DELAY = 2000;

		// How many times we attempt to attach the kernel before giving up.
		const KERNEL_RETRY_COUNT = 3;

		let lastError: unknown;
		for (let tryCount = 0; tryCount < KERNEL_RETRY_COUNT; tryCount++) {

			this._logService.info(this._identifier, `trySetupKernel (#${tryCount})`);

			const kernelAttempt = this._lookForKernel();

			if (kernelAttempt.success) {
				this._logService.info(this._identifier, 'Successfully located kernel');

				this.kernelStatus.set(KernelStatus.Connected, undefined);

				return;
			}

			lastError = kernelAttempt.msg;

			// Wait for a bit before trying again.
			await new Promise(resolve => setTimeout(resolve, KERNEL_RETRY_DELAY));
		}

		this.kernelStatus.set(KernelStatus.Errored, undefined);

		this._logService.error(
			this._identifier,
			localize('failedToFindKernel', "Failed to locate kernel for file '{0}'.", this._viewModel?.uri.path),
			lastError
		);
	}

	/**
	 * Look for and attach a kernel to the notebook if possible.
	 * @returns result object with success status and message if failed.
	 */
	private _lookForKernel(): { success: true } | { success: false; msg: string } {
		if (!this._viewModel) {
			throw new Error('No view model');
		}

		const kernelMatches = this.notebookKernelService.getMatchingKernel(this._viewModel.notebookDocument);

		// Make sure we actually have kernels that have matched
		if (kernelMatches.all.length === 0) {
			// Throw localized error explaining that there are no kernels that match the notebook
			// language.
			return {
				success: false,
				msg: localize('noKernel', "No kernel for file '{0}' found.", this._viewModel.uri.path)
			};
		}

		const positronKernels = kernelMatches.all.filter(k => k.extension.value === 'vscode.positron-notebook-controllers');

		const LANGUAGE_FOR_KERNEL = 'python';

		const kernelForLanguage = positronKernels.find(k => k.supportedLanguages.includes(LANGUAGE_FOR_KERNEL));

		if (!kernelForLanguage) {
			return {
				success: false,
				msg: localize('noKernelForLanguage', "No kernel for language '{0}' found.", LANGUAGE_FOR_KERNEL)
			};
		}

		// Link kernel with notebook
		this.notebookKernelService.selectKernelForNotebook(kernelForLanguage, this._viewModel.notebookDocument);

		return { success: true };
	}


	// #endregion

	/**
	 * Gets the base cell editor options for the given language.
	 * If they don't exist yet, they will be created.
	 * @param language The language to get the options for.
	 */
	getBaseCellEditorOptions(language: string): IBaseCellEditorOptions {
		const existingOptions = this._baseCellEditorOptions.get(language);

		if (existingOptions) {
			return existingOptions;
		}

		const options = new BaseCellEditorOptions({
			onDidChangeModel: this.onDidChangeModel,
			hasModel: this.hasModel,
			onDidChangeOptions: this.onDidChangeOptions,
			isReadOnly: this.isReadOnly,
		}, this.notebookOptions, this.configurationService, language);
		this._baseCellEditorOptions.set(language, options);
		return options;
	}


	/**
	 * Gets the current state of the editor. This should
	 * fully determine the view we see.
	 */
	getEditorViewState(): INotebookEditorViewState {
		// TODO: Implement logic here.
		return {
			editingCells: {},
			cellLineNumberStates: {},
			editorViewStates: {},
			collapsedInputCells: {},
			collapsedOutputCells: {},
		};
	}

	detachView(): void {
		this._logService.info(this._identifier, 'detachView');
		this._clearKeyboardNavigation?.();
		this._notebookOptions?.dispose();
		this._detachModel();
		this._localStore.clear();
	}

	override dispose() {

		this._logService.info(this._identifier, 'dispose');

		super.dispose();
		this.detachView();
	}
}

