/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as positron from 'positron';
import { PromiseHandles, timeout } from './util';
import { RStatementRangeProvider } from './statement-range';
import { LOGGER } from './extension';

import {
	CloseAction,
	CloseHandlerResult,
	ErrorAction,
	ErrorHandler,
	ErrorHandlerResult,
	LanguageClient,
	LanguageClientOptions,
	Message,
	State,
	StreamInfo,
} from 'vscode-languageclient/node';

import { Socket } from 'net';
import { RHelpTopicProvider } from './help';

/**
 * The state of the language server.
 */
export enum LspState {
	uninitialized = 'uninitialized',
	starting = 'starting',
	stopped = 'stopped',
	running = 'running',
}

/**
 * Wraps an instance of the client side of the ARK LSP.
 */
export class ArkLsp implements vscode.Disposable {

	/** The languge client instance, if it has been created */
	private _client?: LanguageClient;

	private _state: LspState = LspState.uninitialized;

	/** Promise that resolves after initialization is complete */
	private _initializing?: Promise<void>;

	/** Disposable for per-activation items */
	private activationDisposables: vscode.Disposable[] = [];

	public constructor(
		private readonly _version: string,
		private readonly _notebookUri: vscode.Uri | undefined
	) {
	}

	/**
	 * Activate the language server; returns a promise that resolves when the LSP is
	 * activated.
	 *
	 * @param port The port on which the language server is listening.
	 * @param context The VSCode extension context.
	 */
	public async activate(
		port: number,
		_context: vscode.ExtensionContext
	): Promise<void> {

		// Clean up disposables from any previous activation
		this.activationDisposables.forEach(d => d.dispose());
		this.activationDisposables = [];

		// Define server options for the language server. Connects to `port`.
		const serverOptions = async (): Promise<StreamInfo> => {
			const out = new PromiseHandles<StreamInfo>();
			const socket = new Socket();

			socket.on('ready', () => {
				const streams: StreamInfo = {
					reader: socket,
					writer: socket
				};
				out.resolve(streams);
			});
			socket.on('error', (error) => {
				out.reject(error);
			});
			socket.connect(port);

			return out.promise;
		};

		const clientOptions: LanguageClientOptions = {
			// If this client belongs to a notebook, set the document selector to only include that notebook.
			// Otherwise, this is the main client for this language, so set the document selector to include
			// untitled R files, in-memory R files (e.g. the console), and R / Quarto / R Markdown files on disk.
			documentSelector: this._notebookUri ?
				[{ language: 'r', pattern: this._notebookUri.path }] :
				[
					{ language: 'r', scheme: 'untitled' },
					{ language: 'r', scheme: 'inmemory' },  // Console
					{ language: 'r', pattern: '**/*.{r,R}' },
					{ language: 'r', pattern: '**/*.{qmd,Qmd}' },
					{ language: 'r', pattern: '**/*.{rmd,Rmd}' },
				],
			synchronize: this._notebookUri ?
				undefined :
				{
					fileEvents: vscode.workspace.createFileSystemWatcher('**/*.R')
				},
			errorHandler: new ArkLanguageClientErrorHandler(this._version, port)
		};

		// With a `.` rather than a `-` so vscode-languageserver can look up related options correctly
		const id = 'positron.r';

		LOGGER.info(`Creating Positron R ${this._version} language client (port ${port})...`);
		this._client = new LanguageClient(id, `Positron R Language Server (${this._version})`, serverOptions, clientOptions);

		const out = new PromiseHandles<void>();
		this._initializing = out.promise;

		this.activationDisposables.push(this._client.onDidChangeState(event => {
			const oldState = this._state;
			// Convert the state to our own enum
			switch (event.newState) {
				case State.Starting:
					this._state = LspState.starting;
					break;
				case State.Running:
					if (this._initializing) {
						LOGGER.info(`ARK (R ${this._version}) language client init successful`);
						this._initializing = undefined;
						if (this._client) {
							// Register Positron-specific LSP extension methods
							this.registerPositronLspExtensions(this._client);
						}
						out.resolve();
					}
					this._state = LspState.running;
					break;
				case State.Stopped:
					if (this._initializing) {
						LOGGER.info(`ARK (R ${this._version}) language client init failed`);
						out.reject('Ark LSP client stopped before initialization');
					}
					this._state = LspState.stopped;
					break;
			}
			LOGGER.info(`ARK (R ${this._version}) language client state changed ${oldState} => ${this._state}`);
		}));

		this._client.start();
		await out.promise;
	}

	/**
	 * Stops the client instance.
	 *
	 * @param awaitStop If true, waits for the client to stop before returning.
	 *   This should be set to `true` if the server process is still running, and
	 *   `false` if the server process has already exited.
	 * @returns A promise that resolves when the client has been stopped.
	 */
	public async deactivate(awaitStop: boolean) {
		if (!this._client) {
			// No client to stop, so just resolve
			return;
		}

		// If we don't need to stop the client, just resolve
		if (!this._client.needsStop()) {
			return;
		}

		// First wait for initialization to complete.
		// `stop()` should not be called on a
		// partially initialized client.
		await this._initializing;

		const promise = awaitStop ?
			// If the kernel hasn't exited, we can just await the promise directly
			this._client!.stop() :
			// The promise returned by `stop()` never resolves if the server
			// side is disconnected, so rather than awaiting it when the runtime
			// has exited, we wait for the client to change state to `stopped`,
			// which does happen reliably.
			new Promise<void>((resolve) => {
				const disposable = this._client!.onDidChangeState((event) => {
					if (event.newState === State.Stopped) {
						resolve();
						disposable.dispose();
					}
				});
				this._client!.stop();
			});

		// Don't wait more than a couple of seconds for the client to stop
		await Promise.race([promise, timeout(2000, 'waiting for client to stop')]);
	}

	/**
	 * Gets the current state of the client.
	 */
	get state(): LspState {
		return this._state;
	}

	/**
	 * Registers additional Positron-specific LSP methods. These programmatic
	 * language features are not part of the LSP specification, and are
	 * consequently not covered by vscode-languageserver, but are used by
	 * Positron to provide additional functionality.
	 *
	 * @param client The language client instance
	 */
	private registerPositronLspExtensions(client: LanguageClient) {
		// Register a statement range provider to detect R statements
		const rangeDisposable = positron.languages.registerStatementRangeProvider('r',
			new RStatementRangeProvider(client));
		this.activationDisposables.push(rangeDisposable);

		// Register a help topic provider to provide help topics for R
		const helpDisposable = positron.languages.registerHelpTopicProvider('r',
			new RHelpTopicProvider(client));
		this.activationDisposables.push(helpDisposable);
	}

	/**
	 * Dispose of the client instance.
	 */
	async dispose() {
		this.activationDisposables.forEach(d => d.dispose());
		await this.deactivate(false);
	}
}

// The `DefaultErrorHandler` adds restarts on close, which we don't want. We want to be fully in
// control over restarting the client side of the LSP, both because we have our own runtime restart
// behavior, and because we have state that relies on client status changes being accurate (i.e.
// in `this._client.onDidChangeState()`). Additionally, we set `handled: true` to avoid a toast
// notification that is inactionable from the user's point of view.
// https://github.com/posit-dev/positron/pull/2880
// https://github.com/microsoft/vscode-languageserver-node/blob/8e625564b531da607859b8cb982abb7cdb2fbe2e/client/src/common/client.ts#L420
// https://github.com/microsoft/vscode-languageserver-node/blob/8e625564b531da607859b8cb982abb7cdb2fbe2e/client/src/common/client.ts#L1617
class ArkLanguageClientErrorHandler implements ErrorHandler {
	constructor(
		private readonly _version: string,
		private readonly _port: number
	) {
	}

	public error(error: Error, _message: Message, count: number): ErrorHandlerResult {
		LOGGER.error(`ARK (R ${this._version}) language client error occurred (port ${this._port}). '${error.name}' with message: ${error.message}. This is error number ${count}.`);
		return { action: ErrorAction.Shutdown };
	}

	public closed(): CloseHandlerResult {
		LOGGER.info(`ARK (R ${this._version}) language client was closed unexpectedly (port ${this._port}).`);
		return { action: CloseAction.DoNotRestart, handled: true };
	}
}
