/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/
// TODO: Should we move this to workbench/services/positronIPyWidgets/browser/positronIPyWidgetsService.ts?

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ILanguageRuntimeMessageOutput, LanguageRuntimeSessionMode, PositronOutputLocation, RuntimeOutputKind } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { ILanguageRuntimeSession, IRuntimeClientInstance, IRuntimeSessionService, RuntimeClientType } from 'vs/workbench/services/runtimeSession/common/runtimeSessionService';
import { Emitter, Event } from 'vs/base/common/event';
import { generateUuid } from 'vs/base/common/uuid';
import { IPositronIPyWidgetsService, IPositronIPyWidgetMetadata, IPyWidgetHtmlData } from 'vs/workbench/services/positronIPyWidgets/common/positronIPyWidgetsService';
import { IPyWidgetClientInstance, DisplayWidgetEvent } from 'vs/workbench/services/languageRuntime/common/languageRuntimeIPyWidgetClient';
import { IPositronNotebookOutputWebviewService } from 'vs/workbench/contrib/positronOutputWebview/browser/notebookOutputWebviewService';
import { WidgetPlotClient } from 'vs/workbench/contrib/positronPlots/browser/widgetPlotClient';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { isEqual } from 'vs/base/common/resources';
import { RuntimeClientState } from 'vs/workbench/services/languageRuntime/common/languageRuntimeClientInstance';
import { ILogService } from 'vs/platform/log/common/log';
import { asWebviewUri } from 'vs/workbench/contrib/webview/common/webview';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export interface IPositronIPyWidgetCommOpenData {
	state: {
		// required widget properties
		_model_module: string;
		_model_module_version: string;
		_model_name: string;
		_view_module: string;
		_view_module_version: string;
		_view_name: string;
		_view_count: number;
		// additional properties depending on the widget
		[key: string]: any;
	};
	buffer_paths: string[];
}
export class PositronIPyWidgetsService extends Disposable implements IPositronIPyWidgetsService {
	/** Needed for service branding in dependency injector. */
	declare readonly _serviceBrand: undefined;

	/** The list of IPyWidgets. */
	private readonly _widgets = new Map<string, IPyWidgetClientInstance>();

	private readonly _positronIPyWidgetsInstancesBySessionId = new Map<string, PositronIPyWidgetsInstance>();

	/** The emitter for the onDidCreatePlot event */
	private readonly _onDidCreatePlot = new Emitter<WidgetPlotClient>();

	/** Creates the Positron plots service instance */
	constructor(
		@IRuntimeSessionService private _runtimeSessionService: IRuntimeSessionService,
		@IPositronNotebookOutputWebviewService private _notebookOutputWebviewService: IPositronNotebookOutputWebviewService,
		@INotebookEditorService private _notebookEditorService: INotebookEditorService,
		@ILogService private _logService: ILogService,
		@IInstantiationService private _instantiationService: IInstantiationService,
	) {
		super();

		// Register for language runtime service startups
		this._register(this._runtimeSessionService.onDidStartRuntime((session) => {
			this.attachRuntime(session);
		}));
	}

	private registerIPyWidgetClient(widgetClient: IPyWidgetClientInstance,
		runtime: ILanguageRuntimeSession) {
		// Add to our list of widgets
		this._widgets.set(widgetClient.id, widgetClient);

		// Raise the plot if it's updated by the runtime
		widgetClient.onDidEmitDisplay((event) => {
			this.handleDisplayEvent(event, runtime);
		});

		// Listen for the widget client to be disposed (i.e. by the plots service via the
		// widgetPlotClient) and make sure to remove it fully from the widget service
		widgetClient.onDidDispose(() => {
			this._widgets.delete(widgetClient.id);
		});

		this._register(widgetClient);
	}

	private attachRuntime(runtime: ILanguageRuntimeSession) {
		// Get the list of existing widget clients; these are expected in the
		// case of reconnecting to a running language runtime
		runtime.listClients(RuntimeClientType.IPyWidget).then(clients => {
			const widgetClients: Array<IPyWidgetClientInstance> = [];
			clients.forEach((client) => {
				if (client.getClientType() === RuntimeClientType.IPyWidget) {
					if (this.hasWidget(runtime.runtimeMetadata.runtimeId, client.getClientId())) {
						return;
					}
				} else {
					console.warn(
						`Unexpected client type ${client.getClientType()} ` +
						`(expected ${RuntimeClientType.IPyWidget})`);
				}
			});

			widgetClients.forEach((client) => {
				this.registerIPyWidgetClient(client, runtime);
			});
		});

		this._register(runtime.onDidCreateClientInstance((event) => {
			if (event.client.getClientType() === RuntimeClientType.IPyWidget) {
				const clientId = event.client.getClientId();

				// Check to see if we we already have a widget client for this
				// client ID. If so, we don't need to do anything.
				if (this.hasWidget(runtime.runtimeMetadata.runtimeId, clientId)) {
					return;
				}

				const data = event.message.data as IPositronIPyWidgetCommOpenData;

				// Create the metadata object
				const metadata: IPositronIPyWidgetMetadata = {
					id: clientId,
					runtime_id: runtime.runtimeMetadata.runtimeId,
					widget_state: {
						model_name: data.state._model_name,
						model_module: data.state._model_module,
						model_module_version: data.state._model_module_version,
						state: data.state
					}
				};

				// Register the widget client and update the list of primary widgets
				const widgetClient = new IPyWidgetClientInstance(event.client, metadata);
				this.registerIPyWidgetClient(widgetClient, runtime);
			}
		}));

		// If this is a notebook session, try to create a new PositronIPyWidgetsInstance.
		if (runtime.metadata.sessionMode === LanguageRuntimeSessionMode.Notebook) {
			// Find the notebook editor for this session.
			const notebookEditor = this._notebookEditorService.listNotebookEditors().find(
				(editor) => isEqual(runtime.metadata.notebookUri, editor.textModel?.uri));

			if (!notebookEditor) {
				this._logService.error(`Could not find a notebook editor for session '${runtime.metadata.sessionId}'`);
			} else {
				// If we found a matching notebook editor, start a PositronIPyWidgetsInstance.
				this._logService.debug(`Found an existing notebook editor for session '${runtime.metadata.sessionId}, starting ipywidgets instance`);
				this.startPositronIPyWidgetsInstance(runtime, notebookEditor);
			}
		}
	}

	private startPositronIPyWidgetsInstance(session: ILanguageRuntimeSession, notebookEditor: INotebookEditor) {
		const positronIPyWidgetsInstance = this._instantiationService.createInstance(
			PositronIPyWidgetsInstance,
			session,
			notebookEditor);
		this._positronIPyWidgetsInstancesBySessionId.set(session.metadata.sessionId, positronIPyWidgetsInstance);

		const disposableStore = new DisposableStore();

		// TODO: Does this ever fire?
		// Dispose the instance when the model changes.
		disposableStore.add(notebookEditor.onDidChangeModel((e) => {
			if (!isEqual(session.metadata.notebookUri, e?.uri)) {
				this._logService.debug(`Editor model changed for session '${session.metadata.sessionId}, disposing ipywidgets instance`);
				this._positronIPyWidgetsInstancesBySessionId.delete(session.metadata.sessionId);
				positronIPyWidgetsInstance.dispose();
				disposableStore.dispose();
			}
		}));

		// Clean up when the notebook editor is removed.
		disposableStore.add(this._notebookEditorService.onDidRemoveNotebookEditor((e) => {
			if (e === notebookEditor) {
				this._logService.debug(`Notebook editor removed for session '${session.metadata.sessionId}, disposing ipywidgets instance`);
				this._positronIPyWidgetsInstancesBySessionId.delete(session.metadata.sessionId);
				positronIPyWidgetsInstance.dispose();
				disposableStore.dispose();
			}
		}));
	}

	private async handleDisplayEvent(event: DisplayWidgetEvent, runtime: ILanguageRuntimeSession) {
		const primaryWidgets = event.view_ids;

		// Combine our existing list of widgets into a single WidgetPlotClient
		const htmlData = new IPyWidgetHtmlData(this.positronWidgetInstances);

		primaryWidgets.forEach(widgetId => {
			htmlData.addWidgetView(widgetId);
		});

		// None of these required fields get used except for data, so we generate a random id and
		// provide reasonable placeholders for the rest
		const widgetMessage = {
			id: generateUuid(),
			type: 'output',
			event_clock: 0,
			parent_id: '',
			when: new Date().toISOString(),
			output_location: PositronOutputLocation.Plot,
			kind: RuntimeOutputKind.IPyWidget,
			data: htmlData.data,
		} as ILanguageRuntimeMessageOutput;

		const webview = await this._notebookOutputWebviewService.createNotebookOutputWebview(
			runtime, widgetMessage);
		if (webview) {
			const widgetViewIds = Array.from(primaryWidgets);
			const managedWidgets = widgetViewIds.flatMap((widgetId: string) => {
				const widget = this._widgets.get(widgetId)!;
				const dependentWidgets = widget.dependencies.map((dependentWidgetId: string) => {
					return this._widgets.get(dependentWidgetId)!;
				});
				return [widget, ...dependentWidgets];
			});
			const plotClient = new WidgetPlotClient(webview, widgetMessage, managedWidgets);
			this._onDidCreatePlot.fire(plotClient);
		}
	}

	/**
	 * Checks to see whether the service has a widget with the given ID and runtime ID.
	 *
	 * @param runtimeId The runtime ID that generated the widget.
	 * @param widgetId The widget's unique ID.
	 */
	private hasWidget(runtimeId: string, widgetId: string): boolean {
		return (
			this._widgets.has(widgetId) &&
			this._widgets.get(widgetId)!.metadata.runtime_id === runtimeId
		);
	}

	onDidCreatePlot: Event<WidgetPlotClient> = this._onDidCreatePlot.event;

	// Gets the individual widget client instances.
	get positronWidgetInstances(): IPyWidgetClientInstance[] {
		return Array.from(this._widgets.values());
	}

	/**
	 * Placeholder for service initialization.
	 */
	initialize() {
	}
}

class PositronIPyWidgetsInstance extends Disposable {

	private readonly _clients = new Map<string, IRuntimeClientInstance<any, any>>();

	/**
	 * Constructor.
	 *
	 * @param _session The language runtime session.
	 */
	constructor(
		private _session: ILanguageRuntimeSession,
		private _editor: INotebookEditor,
		@IExtensionService private _extensionService: IExtensionService,
	) {
		// Call the base class's constructor.
		super();

		// Attach to the runtime.
		this.attachRuntime();
	}

	/**
	 * Attaches to a runtime.
	 */
	private attachRuntime() {
		this._register(this._editor.onDidReceiveMessage(async (event) => {
			// TODO: Add types...
			const message = event.message as any;
			switch (message.type) {
				case 'comm_info_request':
					await this.handleCommInfoRequest();
					break;
				case 'comm_open':
					this.handleCommOpen(message);
					break;
				case 'comm_msg': {
					this.handleCommMsg(message);
					break;
				}
				default:
					console.warn('Unhandled message:', message);
					break;
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

	private async handleCommInfoRequest() {
		console.log('SEND comm_info_request');

		const clients = await this._session.listClients(RuntimeClientType.IPyWidget);
		const comms = clients.map(client => ({ comm_id: client.getClientId() }));

		console.log('RECV comm_info_reply');
		this._editor.postMessage({ data: { type: 'comm_info_reply', comms } });
	}

	// TODO: Types...
	private async handleCommOpen(message: any) {
		const { comm_id, target_name, metadata } = message.content;
		console.log('SEND comm_open', comm_id, target_name, metadata);

		if (this._clients.has(comm_id)) {
			return;
		}

		let client = this._session.clientInstances.find(
			client => client.getClientType() === target_name &&
				client.getClientId() === comm_id);

		// TODO: Should we allow creating jupyter.widget comms?
		if (!client) {
			// TODO: Support creating a comm from the frontend
			// TODO: Should we create the client elsewhere?
			let runtimeClientType: RuntimeClientType;
			switch (target_name as string) {
				case 'jupyter.widget':
					runtimeClientType = RuntimeClientType.IPyWidget;
					break;
				case 'jupyter.widget.control':
					runtimeClientType = RuntimeClientType.IPyWidgetControl;
					break;
				default:
					throw new Error(`Unknown target_name: ${target_name}`);
			}
			client = await this._session.createClient<any, any>(
				runtimeClientType,
				{},
				metadata,
			);
		}

		// TODO: Will we only add these once?
		client.onDidReceiveData(data => {
			// Handle an update from the runtime
			console.log('RECV comm_msg:', data);

			if (data?.method === 'update') {
				this._editor.postMessage({ type: 'comm_msg', comm_id, content: { data } });
			} else {
				console.error(`Unhandled message for comm ${comm_id}: ${JSON.stringify(data)}`);
			}
		});

		const stateChangeEvent = Event.fromObservable(client.clientState);
		// TODO: Dispose!
		stateChangeEvent(state => {
			console.log('client.clientState changed:', state);
			if (state === RuntimeClientState.Closed && this._clients.has(comm_id)) {
				this._clients.delete(comm_id);
				this._editor.postMessage({ type: 'comm_close', comm_id });
			}
		});

		// TODO: This is writing the comm_id passed from the preload script, not the actual comm_id
		//       that the session knows about...

		this._clients.set(comm_id, client);
	}

	private async handleCommMsg(message: any) {
		const { comm_id, msg_id } = message;
		const content = message.content;
		console.log('SEND comm_msg:', content);
		const client = this._clients.get(comm_id);
		if (!client) {
			throw new Error(`Client not found for comm_id: ${comm_id}`);
		}
		// TODO: Maybe it's better to separate these in the preload? Is that possible?
		if (['request_states', 'update'].includes(content?.method)) {
			const output = await client.performRpc(content, 5000);
			// TODO: Do we need the buffers attribute too (not buffer_paths)?
			console.log('RECV comm_msg:', output);
			this._editor.postMessage({
				type: 'comm_msg',
				comm_id: comm_id,
				parent_header: { msg_id },
				content: { data: output }
			});
			// TODO: Is this correct? Simulate a idle state here so ipywidgets knows that the RPC call is done
			// webview.postMessage({ type: 'state', state: 'idle' });
			// } else {
			// 	// TODO: Why doesn't performRpc work for this?
			// 	client.sendMessage(message);
			// }
		} else {
			client.sendMessage(content);
		}
	}

}
