/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/
// TODO: Should we move this to workbench/services/positronIPyWidgets/browser/positronIPyWidgetsService.ts?

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ILanguageRuntimeMessageCommOpen, LanguageRuntimeSessionMode } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { ILanguageRuntimeSession, IRuntimeClientInstance, IRuntimeSessionService, RuntimeClientType } from 'vs/workbench/services/runtimeSession/common/runtimeSessionService';
import { Emitter, Event } from 'vs/base/common/event';
import { IPositronIPyWidgetsService } from 'vs/workbench/services/positronIPyWidgets/common/positronIPyWidgetsService';
import { WidgetPlotClient } from 'vs/workbench/contrib/positronPlots/browser/widgetPlotClient';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { isEqual } from 'vs/base/common/resources';
import { ILogService } from 'vs/platform/log/common/log';
import { asWebviewUri } from 'vs/workbench/contrib/webview/common/webview';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IAppendStylesheetMessage, IIPyWidgetsMessage, IIPyWidgetsMessaging } from './types';
import { RuntimeClientState } from 'vs/workbench/services/languageRuntime/common/languageRuntimeClientInstance';

/**
 * The PositronIPyWidgetsService is responsible for managing IPyWidgetsInstances.
 */
export class PositronIPyWidgetsService extends Disposable implements IPositronIPyWidgetsService {
	/** Needed for service branding in dependency injector. */
	declare readonly _serviceBrand: undefined;

	private readonly _iPyWidgetsInstancesBySessionId = new Map<string, IPyWidgetsInstance>();

	/** The emitter for the onDidCreatePlot event */
	private readonly _onDidCreatePlot = new Emitter<WidgetPlotClient>();

	constructor(
		@IRuntimeSessionService private _runtimeSessionService: IRuntimeSessionService,
		@INotebookEditorService private _notebookEditorService: INotebookEditorService,
		@ILogService private _logService: ILogService,
		@IExtensionService private _extensionService: IExtensionService,
	) {
		super();

		// Start ipywidgets instances for existing sessions.
		this._runtimeSessionService.activeSessions.forEach(session => {
			this.startIPyWidgetsInstance(session);
		});

		// Start ipywidgets instances for new sessions.
		// TODO: Should we listen to onWillStartSession instead?
		this._register(this._runtimeSessionService.onDidStartRuntime((session) => {
			this.startIPyWidgetsInstance(session);
		}));
	}

	private startIPyWidgetsInstance(session: ILanguageRuntimeSession) {
		// We currently only handle notebook sessions.
		// TODO: Support console sessions too.
		if (session.metadata.sessionMode !== LanguageRuntimeSessionMode.Notebook) {
			return;
		}

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

		// TODO: Does this ever fire?
		// Dispose the instance when the model changes.
		disposableStore.add(notebookEditor.onDidChangeModel((e) => {
			if (isEqual(session.metadata.notebookUri, e?.uri)) {
				return;
			}
			this._logService.debug(`Editor model changed for session '${session.sessionId}, disposing ipywidgets instance`);
			this._iPyWidgetsInstancesBySessionId.delete(session.sessionId);
			iPyWidgetsInstance.dispose();
			disposableStore.dispose();
		}));

		// Clean up when the notebook editor is removed.
		disposableStore.add(this._notebookEditorService.onDidRemoveNotebookEditor((e) => {
			if (e !== notebookEditor) {
				return;
			}
			this._logService.debug(`Notebook editor removed for session '${session.sessionId}, disposing ipywidgets instance`);
			this._iPyWidgetsInstancesBySessionId.delete(session.sessionId);
			iPyWidgetsInstance.dispose();
			disposableStore.dispose();
		}));
	}

	onDidCreatePlot: Event<WidgetPlotClient> = this._onDidCreatePlot.event;

	/**
	 * Placeholder for service initialization.
	 */
	initialize() {
	}
}

class IPyWidgetsInstance extends Disposable {

	private readonly _clients = new Map<string, IPyWidgetsClientInstance>();

	/**
	 * @param _session The language runtime session.
	 * @param _editor The notebook editor.
	 * @param _extensionService The extension service.
	 * @param _logService The log service.
	 */
	constructor(
		_session: ILanguageRuntimeSession,
		private readonly _editor: INotebookEditor,
		private readonly _extensionService: IExtensionService,
		_logService: ILogService,
	) {
		super();

		const messaging = new IPyWidgetsMessaging(_editor);

		// Handle the creation of new client instances.
		this._register(_session.onDidCreateClientInstance(({ client, message }) => {
			if (client.getClientType() !== RuntimeClientType.IPyWidget) {
				return;
			}

			const ipywidgetsClient = new IPyWidgetsClientInstance(
				message,
				client,
				this._editor,
				messaging,
				_logService,
			);

			this._register(ipywidgetsClient.onDidClose(() => {
				this._clients.delete(client.getClientId());
			}));

			this._clients.set(client.getClientId(), ipywidgetsClient);
		}));

		this._extensionService.getExtension('vscode.positron-ipywidgets').then((extension) => {
			if (!extension) {
				throw new Error('positron-ipywidgets extension not found');
			}
			const styleUri = asWebviewUri(
				extension.extensionLocation.with({
					path: extension.extensionLocation.path + '/preload-out/index.css'
				}));
			messaging.postMessage({ type: 'append_stylesheet', href: styleUri.toString() });
		});
	}

}

class IPyWidgetsClientInstance extends Disposable {
	private readonly _closeEmitter = new Emitter<void>();

	onDidClose = this._closeEmitter.event;

	constructor(
		message: ILanguageRuntimeMessageCommOpen,
		private readonly _client: IRuntimeClientInstance<any, any>,
		// TODO: Add typed messaging.onDidReceiveMessage event
		private readonly _editor: INotebookEditor,
		private readonly _messaging: IPyWidgetsMessaging,
		private readonly _logService: ILogService,
	) {
		super();

		// Forward messages from the notebook editor to the client.
		this._register(_messaging.onDidReceiveMessage(async (message) => {
			if (message.comm_id !== this._client.getClientId()) {
				return;
			}
			switch (message.type) {
				case 'comm_msg': {
					// TODO: Must be a better way to distinguish RPCs from fire-and-forget messages
					// TODO: Type assertion needed?
					if (['request_states', 'update'].includes(message.content.method!)) {
						// TODO: Type assertion needed?
						await this.performRpc(message.content, 5000, message.msg_id!);
					} else {
						this._client.sendMessage(message);
					}
					break;
				}
				default:
					this._logService.warn(
						`Unhandled message from notebook '${this._editor.textModel?.uri}' ` +
						`for client ${this._client.getClientId()}: ${JSON.stringify(message)}`
					);
					break;
			}
		}));

		// Forward messages from the client to the notebook editor.
		this._register(_client.onDidReceiveData(data => {
			this._logService.debug('RECV comm_msg:', data);

			switch (data.method) {
				case 'update':
					this._messaging.postMessage({
						type: 'comm_msg',
						comm_id: this._client.getClientId(),
						content: { data }
					});
					break;
				default:
					this._logService.warn(
						`Unhandled message from client ${this._client.getClientId()} ` +
						`for notebook ${this._editor.textModel?.uri}: ${JSON.stringify(data)}`
					);
					break;
			}
		}));

		/**
		 * If the client is closed, emit the close event.
		 */
		const stateChangeEvent = Event.fromObservable(_client.clientState);
		this._register(stateChangeEvent(state => {
			// If the client is closed, emit the close event.
			if (state === RuntimeClientState.Closed) {
				this._closeEmitter.fire();
			}
		}));

		// Notify the notebook editor about the new client instance.
		this._messaging.postMessage({
			type: 'comm_open',
			comm_id: this._client.getClientId(),
			target_name: this._client.getClientType(),
			content: { data: message.data },
			metadata: message.metadata,
		});

	}

	private async performRpc(request: any, timeout: number, msgId: string): Promise<void> {
		// TODO: Maybe performRpc should allow us to pass a msgId?
		//       Or maybe we can use our own msgIds in this layer?
		// Perform the RPC with the client.
		const output = await this._client.performRpc(request, timeout);

		// Forward the output to the notebook editor.
		this._logService.info('RECV comm_msg:', output);
		this._messaging.postMessage({
			type: 'comm_msg',
			comm_id: this._client.getClientId(),
			parent_header: { msg_id: msgId },
			content: { data: output }
		});
	}
}

// TODO: Should this be a "messaging" class with a single typed postMessage method,
//       or should it have a method per type e.g. appendStylesheet(href: string)?
class IPyWidgetsMessaging extends Disposable implements IIPyWidgetsMessaging {
	private readonly _messageEmitter = new Emitter<IIPyWidgetsMessage>();

	onDidReceiveMessage = this._messageEmitter.event;

	constructor(
		private readonly _editor: INotebookEditor,
	) {
		super();

		this._register(_editor.onDidReceiveMessage((event) => {
			this._messageEmitter.fire(event.message as IIPyWidgetsMessage);
		}));
	}

	postMessage(message: IIPyWidgetsMessage | IAppendStylesheetMessage) {
		this._editor.postMessage(message);
	}
}
