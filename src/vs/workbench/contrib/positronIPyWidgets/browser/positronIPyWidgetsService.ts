/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/
// TODO: Should we move this to workbench/services/positronIPyWidgets/browser/positronIPyWidgetsService.ts?

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { LanguageRuntimeSessionMode } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
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
import { IRuntimeCommMessage, IWidgetCommMessage } from './types';
import { RuntimeClientState } from 'vs/workbench/services/languageRuntime/common/languageRuntimeClientInstance';

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

	private readonly _clients = new Map<string, WidgetClientInstance>();

	/**
	 * @param _session The language runtime session.
	 * @param _editor The notebook editor.
	 * @param _extensionService The extension service.
	 * @param _logService The log service.
	 */
	constructor(
		private readonly _session: ILanguageRuntimeSession,
		private readonly _editor: INotebookEditor,
		private readonly _extensionService: IExtensionService,
		_logService: ILogService,
	) {
		super();

		const frontend = new WidgetsFrontend(_editor, _logService);

		// Handle the creation of new IPyWidget client instances.
		this._register(this._session.onDidCreateClientInstance(({ client, message }) => {
			if (client.getClientType() !== RuntimeClientType.IPyWidget) {
				return;
			}

			// Notify the widget frontend that a new client instance was created.
			// TODO: Move this into WidgetClientInstance constructor?
			frontend.createClient(client.getClientId(), message.data, message.metadata);

			// TODO: Can there be a race condition here somehow?
			// TODO: Maybe we should move this above the postMessage.
			const instance = new WidgetClientInstance(client, this._editor);
			this._clients.set(client.getClientId(), instance);
		}));

		// Handle messages from widget frontends (i.e. the ipywidgets notebook preload script).
		this._register(frontend.onDidReceiveMessage(async (message) => {
			console.log('SEND comm_msg:', message.comm_id, message.content);
			const content = message.content;
			const client = this._clients.get(message.comm_id);
			if (!client) {
				throw new Error(`Client not found for comm_id: ${message.comm_id}`);
			}
			// TODO: Maybe it's better to separate these in the preload? Is that possible?
			if (['request_states', 'update'].includes(content?.method)) {
				const output = await client.performRpc(content, 5000);
				console.log('RECV comm_msg:', output);
				const reply: IRuntimeCommMessage = {
					type: 'comm_msg',
					comm_id: message.comm_id,
					parent_header: { msg_id: message.msg_id },
					content: { data: output }
				};
				this._editor.postMessage(reply);
			} else {
				client.sendMessage(content);
			}
		}));

		this._extensionService.getExtension('vscode.positron-ipywidgets').then((extension) => {
			if (!extension) {
				throw new Error('positron-ipywidgets extension not found');
			}
			const styleUri = asWebviewUri(
				extension.extensionLocation.with({
					path: extension.extensionLocation.path + '/preload-out/index.css'
				}));
			this._editor.postMessage({ type: 'append_stylesheet', href: styleUri.toString() });
		});
	}

}

class WidgetClientInstance extends Disposable {
	private readonly comm: PositronWidgetComm;

	constructor(
		private readonly client: IRuntimeClientInstance<any, any>,
		private readonly editor: INotebookEditor,
	) {
		super();

		this.comm = new PositronWidgetComm(client);

		this._register(this.comm.onDidUpdate((event) => {
			console.log('PositronWidgetComm.onDidUpdate:', event);
			// TODO: Continue here. Uncomment below and comment out the onDidReceiveData further down.
			//       Continue refactoring stuff to this class and the PositronWidgetComm class.
			//       Then remove what we don't need from the previous ipywidgets implementation.
			// this.editor.postMessage({
			// 	type: 'comm_msg',
			// 	comm_id: this.client.getClientId(),
			// 	content: { data: event }
			// } as IRuntimeCommMessage);
		}));

		this._register(this.comm.onDidClose(() => {
			console.log('PositronWidgetComm.onDidClose');
		}));

		// Forward client messages to the editor.
		client.onDidReceiveData(data => {
			console.log('RECV comm_msg:', data);

			if (data?.method === 'update') {
				const message: IRuntimeCommMessage = {
					type: 'comm_msg',
					comm_id: this.client.getClientId(),
					content: { data }
				};
				this.editor.postMessage(message);
			} else {
				console.error(`Unhandled message for comm ${this.client.getClientId()}: ${JSON.stringify(data)}`);
			}
		});

		// const stateChangeEvent = Event.fromObservable(client.clientState);
		// // TODO: Dispose!
		// stateChangeEvent(state => {
		// 	console.log('client.clientState changed:', state);
		// 	if (state === RuntimeClientState.Closed && this._clients.has(comm_id)) {
		// 		this._clients.delete(comm_id);
		// 		this.editor.postMessage({ type: 'comm_close', comm_id });
		// 	}
		// });

	}

	// TODO: Better abstraction
	async performRpc(content: any, timeout: number): Promise<any> {
		return this.client.performRpc(content, timeout);
	}

	sendMessage(content: any) {
		this.client.sendMessage(content);
	}
}

interface UpdateEvent {
	method: 'update';
	// TODO: Need buffer_paths?
	buffer_paths: string[];
	state: any;
}

// TODO: I'm not sure if we need this class... Maybe we only use it in other services
//       since its code generated.
class PositronWidgetComm extends Disposable {
	private readonly _closeEmitter = new Emitter<void>();
	private readonly _updateEmitter = new Emitter<UpdateEvent>();

	onDidClose = this._closeEmitter.event;
	onDidUpdate = this._updateEmitter.event;

	constructor(
		private readonly instance: IRuntimeClientInstance<any, any>,
	) {
		super();
		this._register(instance);
		this._register(instance.onDidReceiveData((data) => {
			if (data?.method === 'update') {
				this._updateEmitter.fire(data);
			} else {
				console.error(`Unhandled message for comm ${this.instance.getClientId()}: ${JSON.stringify(data)}`);
			}
		}));

		const stateChangeEvent = Event.fromObservable(instance.clientState);
		this._register(stateChangeEvent(state => {
			// If the client is closed, emit the close event.
			if (state === RuntimeClientState.Closed) {
				this._closeEmitter.fire();
			}
		}));

		this.onDidClose = this._closeEmitter.event;
	}

	/**
	 * Provides access to the ID of the client instance.
	 */
	get clientId(): string {
		return this.instance.getClientId();
	}
}

class WidgetsFrontend extends Disposable {
	private readonly _messageEmitter = new Emitter<IWidgetCommMessage>();

	onDidReceiveMessage = this._messageEmitter.event;

	constructor(
		private readonly _editor: INotebookEditor,
		private readonly _logService: ILogService,
	) {
		super();

		this._register(this._editor.onDidReceiveMessage(async (event) => {
			const message = event.message as IWidgetCommMessage;
			switch (message.type) {
				case 'comm_msg':
					this._messageEmitter.fire(message);
					break;
				default:
					this._logService.warn(`Unhandled message for notebook:`, this._editor.textModel?.uri);
					break;
			}
		}));

		// TODO: Should this class forward messages to the frontend? Or should its owner do that?
		//       The parent class could be an "adapter"?
		//       Maybe the WidgetClientInstance should actually notifiy the frontend on its own creation?

	}

	// TODO: Should type be a param?
	createClient(id: string, params: any, metadata: any) {
		this._editor.postMessage({
			type: 'comm_open',
			comm_id: id,
			target_name: RuntimeClientType.IPyWidget,
			content: { data: params },
			metadata,
		});
	}
}
