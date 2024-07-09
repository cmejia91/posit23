/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/
// TODO: Should we move this to workbench/services/positronIPyWidgets/browser/positronIPyWidgetsService.ts?

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { LanguageRuntimeSessionMode, RuntimeOutputKind } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { ILanguageRuntimeSession, IRuntimeClientInstance, IRuntimeSessionService, RuntimeClientType } from 'vs/workbench/services/runtimeSession/common/runtimeSessionService';
import { Emitter, Event } from 'vs/base/common/event';
import { IPositronIPyWidgetsService } from 'vs/workbench/services/positronIPyWidgets/common/positronIPyWidgetsService';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { INotebookWebviewMessage } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { isEqual } from 'vs/base/common/resources';
import { ILogService } from 'vs/platform/log/common/log';
import { asWebviewUri } from 'vs/workbench/contrib/webview/common/webview';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ICommOpen, IIPyWidgetsMessage, IIPyWidgetsMessaging as IIPyWidgetsWebviewMessaging, IReady } from '../../../services/languageRuntime/common/positronIPyWidgetsMessaging';
import { IPositronNotebookOutputWebviewService } from 'vs/workbench/contrib/positronOutputWebview/browser/notebookOutputWebviewService';
import { WebviewPlotClient } from 'vs/workbench/contrib/positronPlots/browser/webviewPlotClient';
import { IPyWidgetClientInstance } from 'vs/workbench/services/languageRuntime/common/languageRuntimeIPyWidgetClient';

/**
 * The PositronIPyWidgetsService is responsible for managing IPyWidgetsInstances.
 */
export class PositronIPyWidgetsService extends Disposable implements IPositronIPyWidgetsService {
	/** Needed for service branding in dependency injector. */
	declare readonly _serviceBrand: undefined;

	// TODO: Rename to "_iPyWidgetsNotebookInstancesBySessionId"?
	private readonly _iPyWidgetsInstancesBySessionId = new Map<string, IPyWidgetsInstance>();

	// TODO: Rename to "_iPyWidgetsConsoleInstancesBySessionId"?
	private readonly _iPyWidgetsInstancesByMessageId = new Map<string, IPyWidgetsInstance>();

	/** The emitter for the onDidCreatePlot event */
	private readonly _onDidCreatePlot = new Emitter<WebviewPlotClient>();

	constructor(
		@IRuntimeSessionService private _runtimeSessionService: IRuntimeSessionService,
		@INotebookEditorService private _notebookEditorService: INotebookEditorService,
		@IPositronNotebookOutputWebviewService private _notebookOutputWebviewService: IPositronNotebookOutputWebviewService,
		@ILogService private _logService: ILogService,
		@IExtensionService private _extensionService: IExtensionService,
	) {
		super();

		// Start ipywidgets instances for existing sessions.
		this._runtimeSessionService.activeSessions.forEach(session => {
			this.attachSession(session);
		});

		// Start ipywidgets instances for new sessions.
		// TODO: Should we listen to onWillStartSession instead?
		this._register(this._runtimeSessionService.onDidStartRuntime((session) => {
			this.attachSession(session);
		}));
	}

	private attachSession(session: ILanguageRuntimeSession) {
		if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Console) {
			const disposableStore = new DisposableStore();

			disposableStore.add(session.onDidReceiveRuntimeMessageOutput(async (message) => {
				if (message.kind === RuntimeOutputKind.IPyWidget) {
					console.log(message);
					const webview = await this._notebookOutputWebviewService.createNotebookOutputWebview(
						session, message);
					if (webview) {
						// TODO: Could/should we combine IPyWidgetsMessaging with IPyWidgetsInstance?
						const iPyWidgetsInstance = new IPyWidgetsInstance(
							session,
							webview,
							this._extensionService,
							this._logService,
						);
						disposableStore.add(iPyWidgetsInstance);
						// TODO: Is this the right key? How do we remove this when the webview/comm is closed?
						this._iPyWidgetsInstancesByMessageId.set(
							message.id,
							iPyWidgetsInstance
						);
						const client = new WebviewPlotClient(webview, message);
						this._onDidCreatePlot.fire(client);
					}
				}
			}));

			disposableStore.add(session.onDidEndSession((e) => {
				disposableStore.dispose();
			}));
		} else if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Notebook) {
			// Find the session's notebook editor by its notebook URI.
			const notebookEditor = this._notebookEditorService.listNotebookEditors().find(
				(editor) => isEqual(session.metadata.notebookUri, editor.textModel?.uri));

			if (!notebookEditor) {
				this._logService.error(`Could not find a notebook editor for session '${session.sessionId}'`);
				return;
			}

			// We found a matching notebook editor, start an ipywidgets instance.
			this._logService.debug(`Found an existing notebook editor for session '${session.sessionId}, starting ipywidgets instance`);
			const iPyWidgetsInstance = new IPyWidgetsInstance(
				session,
				notebookEditor,
				this._extensionService,
				this._logService,
			);
			this._iPyWidgetsInstancesBySessionId.set(
				session.sessionId,
				iPyWidgetsInstance
			);

			const disposableStore = new DisposableStore();
			disposableStore.add(iPyWidgetsInstance);

			// TODO: Does this ever fire?
			// Dispose the instance when the model changes.
			disposableStore.add(notebookEditor.onDidChangeModel((e) => {
				if (isEqual(session.metadata.notebookUri, e?.uri)) {
					return;
				}
				this._logService.debug(`Editor model changed for session '${session.sessionId}, disposing ipywidgets instance`);
				this._iPyWidgetsInstancesBySessionId.delete(session.sessionId);
				disposableStore.dispose();
			}));

			// Clean up when the notebook editor is removed.
			disposableStore.add(this._notebookEditorService.onDidRemoveNotebookEditor((e) => {
				if (e !== notebookEditor) {
					return;
				}
				this._logService.debug(`Notebook editor removed for session '${session.sessionId}, disposing ipywidgets instance`);
				this._iPyWidgetsInstancesBySessionId.delete(session.sessionId);
				disposableStore.dispose();
			}));
		}
	}

	onDidCreatePlot: Event<WebviewPlotClient> = this._onDidCreatePlot.event;

	/**
	 * Placeholder for service initialization.
	 */
	initialize() {
	}
}

class IPyWidgetsInstance extends Disposable {

	private readonly _clients = new Map<string, IPyWidgetClientInstance>();

	private readonly _messaging: IIPyWidgetsWebviewMessaging;

	/**
	 * @param session The language runtime session.
	 * @param editor The notebook editor.
	 * @param _extensionService The extension service.
	 * @param _logService The log service.
	 */
	constructor(
		private readonly _session: ILanguageRuntimeSession,
		notebookMessaging: INotebookWebviewMessaging,
		private readonly _extensionService: IExtensionService,
		private readonly _logService: ILogService,
	) {
		super();

		// Create the typed webview messaging interface.
		this._messaging = new IPyWidgetsWebviewMessaging(notebookMessaging);

		// Configure existing widget clients.
		_session.listClients(RuntimeClientType.IPyWidget).then((clients) => {
			for (const client of clients) {
				this.createClient(client);
			}
		});

		// Forward comm_open messages from the runtime to the notebook editor.
		this._register(_session.onDidCreateClientInstance(({ client, message }) => {
			if (client.getClientType() === RuntimeClientType.IPyWidget ||
				client.getClientType() === RuntimeClientType.IPyWidgetControl) {

				this.createClient(client);

				// Notify the notebook editor about the new client instance.
				this._messaging.postMessage({
					type: 'comm_open',
					comm_id: client.getClientId(),
					target_name: client.getClientType(),
					data: message.data,
					metadata: message.metadata,
				});
			}
		}));

		// Forward comm_open messages from the notebook editor to the runtime.
		this._register(this._messaging.onDidReceiveMessage(async (message) => {
			switch (message.type) {
				case 'ready': {
					this.handleWebviewReady();
					break;
				}
				case 'comm_open':
					this.handleWebviewCommOpen(message);
					break;
			}
		}));
	}

	private createClient(client: IRuntimeClientInstance<any, any>) {
		let rpcMethods: string[];
		if (client.getClientType() === RuntimeClientType.IPyWidget) {
			rpcMethods = ['update'];
		} else if (client.getClientType() === RuntimeClientType.IPyWidgetControl) {
			rpcMethods = ['request_states'];
		} else {
			throw new Error(`Unexpected client type: ${client.getClientType()}`);
		}

		const ipywidgetsClient = new IPyWidgetClientInstance(
			client,
			this._messaging,
			this._logService,
			rpcMethods,
		);

		this._register(ipywidgetsClient.onDidClose(() => {
			this._clients.delete(client.getClientId());
		}));

		this._clients.set(client.getClientId(), ipywidgetsClient);
	}

	private handleWebviewReady() {
		// Notify the editor to append the bundled widgets stylesheet.
		this._extensionService.getExtension('vscode.positron-ipywidgets').then((extension) => {
			if (!extension) {
				throw new Error('positron-ipywidgets extension not found');
			}
			const styleUri = asWebviewUri(
				extension.extensionLocation.with({
					path: extension.extensionLocation.path + '/preload-out/index.css'
				}));
			this._messaging.postMessage({ type: 'append_stylesheet', href: styleUri.toString() });
		});
	}

	private async handleWebviewCommOpen(message: ICommOpen) {
		if (message.target_name === RuntimeClientType.IPyWidgetControl) {
			const client = await this._session.createClient(
				RuntimeClientType.IPyWidgetControl, message.data, message.metadata, message.comm_id);
			this.createClient(client);
		}
	}
}

interface INotebookWebviewMessaging {
	postMessage(message: any): void;
	onDidReceiveMessage: Event<INotebookWebviewMessage>;
}

class IPyWidgetsWebviewMessaging extends Disposable implements IIPyWidgetsWebviewMessaging {
	private readonly _messageEmitter = new Emitter<IIPyWidgetsMessage>();

	onDidReceiveMessage = this._messageEmitter.event;

	constructor(private readonly _messaging: INotebookWebviewMessaging) {
		super();

		this._register(_messaging.onDidReceiveMessage((event) => {
			this._messageEmitter.fire(event.message as IIPyWidgetsMessage);
		}));
	}

	postMessage(message: IIPyWidgetsMessage) {
		this._messaging.postMessage(message);
	}
}
