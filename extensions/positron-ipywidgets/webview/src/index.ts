/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as base from '@jupyter-widgets/base';
import * as controls from '@jupyter-widgets/controls';
import * as LuminoWidget from '@lumino/widgets';
// import * as outputs from '@jupyter-widgets/jupyterlab-manager/lib/output';
import { ManagerBase } from '@jupyter-widgets/base-manager';
// TODO: Do we really need to depend on this?
import { JSONObject, JSONValue } from '@lumino/coreutils';

const vscode = acquireVsCodeApi();


interface ICommInfoReply {
	comms: { comm_id: string }[];
}

const comms = new Map<string, Comm>();

class Comm implements base.IClassicComm {
	private readonly _onMsgCallbacks: ((x: any) => void)[] = [];
	private readonly _onCloseCallbacks: ((x: any) => void)[] = [];

	constructor(
		readonly comm_id: string,
		readonly target_name: string,
	) { }

	open(data: JSONValue, callbacks?: base.ICallbacks | undefined, metadata?: JSONObject | undefined, buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): string {
		console.log('Comm.open', data, callbacks, metadata, buffers);
		// TODO: Move open logic here?
		return '';
	}

	send(data: any, callbacks?: base.ICallbacks | undefined, metadata?: JSONObject | undefined, buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): string {
		console.log('Comm.send', data, callbacks, metadata, buffers);
		vscode.postMessage({
			type: 'comm_msg',
			comm_id: this.comm_id,
			content: data,
		});
		// TODO: Handle callbacks?
		return '';
	}

	close(data?: JSONValue | undefined, callbacks?: base.ICallbacks | undefined, metadata?: JSONObject | undefined, buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): string {
		console.log('Comm.close', data, callbacks, metadata, buffers);
		vscode.postMessage({
			type: 'comm_close',
			content: {
				comm_id: this.comm_id,
			}
		});
		return '';
	}

	on_msg(callback: (x: any) => void): void {
		console.log('Comm.on_msg', callback);
		this._onMsgCallbacks.push(callback);
	}

	on_close(callback: (x: any) => void): void {
		console.log('Comm.on_close', callback);
		this._onCloseCallbacks.push(callback);
	}

	handle_msg(message: JSONObject): void {
		console.log('Comm.handle_msg', message);
		for (const callback of this._onMsgCallbacks) {
			callback(message);
		}
	}

	handle_close(message: JSONObject): void {
		console.log('Comm.handle_close', message);
		for (const callback of this._onCloseCallbacks) {
			callback(message);
		}
	}
}

// TODO: Does everything need to be protected?
class HTMLManager extends ManagerBase {
	// TODO: Can we make a very simple RPC mechanism?
	private commInfoPromise: Promise<string[]> | undefined;
	private resolveCommInfoPromise: ((value: string[] | PromiseLike<string[]>) => void) | undefined;

	// IWidgetManager interface

	protected override loadClass(className: string, moduleName: string, moduleVersion: string): Promise<typeof base.WidgetModel | typeof base.WidgetView> {
		console.log('loadClass', className, moduleName, moduleVersion);
		if (moduleName === '@jupyter-widgets/base') {
			return Promise.resolve((base as any)[className]);
		}
		if (moduleName === '@jupyter-widgets/controls') {
			return Promise.resolve((controls as any)[className]);
		}
		// TODO: Find a usecase for this
		// if (moduleName === '@jupyter-widgets/outputs') {
		// 	return Promise.resolve((outputs as any)[className]);
		// }
		// TODO: We don't actually "register" anything... How does Jupyter Lab do this?
		throw new Error(`No version of module ${moduleName} is registered`);
	}

	protected override async _create_comm(comm_target_name: string, model_id?: string | undefined, data?: JSONObject | undefined, metadata?: JSONObject | undefined, buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): Promise<base.IClassicComm> {
		if (!model_id) {
			// TODO: Supporting creating a comm from the frontend
			throw new Error('model_id is required');
		}
		vscode.postMessage(
			{
				type: 'comm_open',
				// TODO: need content?
				content: {
					comm_id: model_id,
					target_name: comm_target_name,
					data,
					metadata,
					buffers
				}
			}
		);
		const comm = new Comm(model_id, comm_target_name);
		comms.set(model_id, comm);
		return comm;
	}

	protected override _get_comm_info(): Promise<{}> {
		console.log('_get_comm_info');
		if (this.commInfoPromise) {
			return this.commInfoPromise;
		}

		this.commInfoPromise = new Promise<string[]>((resolve, reject) => {
			this.resolveCommInfoPromise = resolve;
			setTimeout(() => reject(new Error('Timeout waiting for comm_info_reply')), 5000);
		});

		vscode.postMessage({ type: 'comm_info_request' });

		return this.commInfoPromise;
	}

	// New methods

	async display_view(
		view: Promise<base.DOMWidgetView> | base.DOMWidgetView,
		el: HTMLElement
	): Promise<void> {
		let v: base.DOMWidgetView;
		try {
			v = await view;
		} catch (error) {
			const msg = `Could not create a view for ${view}`;
			console.error(msg);
			const ModelCls = base.createErrorWidgetModel(error, msg);
			const errorModel = new ModelCls();
			v = new base.ErrorWidgetView({
				model: errorModel,
			});
			v.render();
		}

		LuminoWidget.Widget.attach(v.luminoWidget, el);
		// TODO: Do we need to maintain a _viewList?
		// this._viewList.add(v);
		// v.once('remove', () => {
		// 	this._viewList.delete(v);
		// });
	}

	onCommInfoReply(message: ICommInfoReply) {
		if (!this.commInfoPromise) {
			throw new Error('Unexpected comm_info_reply');
		}
		// TODO: Should we make the webview container send exactly what's needed for get_comm_info (comm_ids)?
		// TODO: Should we implement a "kernel", or is that too much overhead?
		this.resolveCommInfoPromise!(message.comms.map((comm) => comm.comm_id));
	}

	async loadFromKernel(): Promise<void> {
		await super._loadFromKernel();
	}
}

const manager = new HTMLManager();


window.addEventListener('load', () => {
	// TODO: Is there a better way for us to control what gets rendered than passing via HTML?
	//  Can we directly use the data from the display message?
	manager.loadFromKernel().then(async () => {
		const element = document.documentElement;
		const tags = element.querySelectorAll(
			'script[type="application/vnd.jupyter.widget-view+json"]'
		);
		await Promise.all(
			Array.from(tags).map(async (viewtag) => {
				const widgetViewObject = JSON.parse(viewtag.innerHTML);
				// TODO: Validate view?
				// const valid = view_validate(widgetViewObject);
				// if (!valid) {
				// 	throw new Error(`View state has errors: ${view_validate.errors}`);
				// }
				const model_id: string = widgetViewObject.model_id;
				const model = await manager.get_model(model_id);
				if (model !== undefined && viewtag.parentElement !== null) {
					const prev = viewtag.previousElementSibling;
					if (
						prev &&
						prev.tagName === 'img' &&
						prev.classList.contains('jupyter-widget')
					) {
						viewtag.parentElement.removeChild(prev);
					}
					const widgetTag = document.createElement('div');
					widgetTag.className = 'widget-subarea';
					viewtag.parentElement.insertBefore(widgetTag, viewtag);
					const view = await manager.create_view(model);
					manager.display_view(view, widgetTag);
				}
			})
		);
		vscode.postMessage({ type: 'render_complete' });
	}).catch((error) => {
		console.error('Error rendering widgets:', error);
	});
});

window.addEventListener('message', (event) => {
	const message = event.data;
	if (message?.type === 'comm_info_reply') {
		// TODO: error handling?
		manager.onCommInfoReply(message);
	} else if (message?.type === 'comm_msg') {
		const comm = comms.get(message.comm_id);
		if (!comm) {
			throw new Error(`Comm not found ${message.comm_id}`);
		}
		comm.handle_msg(message);
	} else if (message?.type === 'comm_close') {
		const comm = comms.get(message.comm_id);
		if (!comm) {
			throw new Error(`Comm not found ${message.comm_id}`);
		}
		comm.handle_close(message);
	} else {
		console.info('Unhandled message in webview', message);
	}
});
