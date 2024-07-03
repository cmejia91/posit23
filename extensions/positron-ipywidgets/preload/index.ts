/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as base from '@jupyter-widgets/base';
import * as controls from '@jupyter-widgets/controls';
import { IIOPubMessage, IOPubMessageType } from '@jupyterlab/services/lib/kernel/messages';
import * as LuminoWidget from '@lumino/widgets';
import * as output from '@jupyter-widgets/output';
import { ManagerBase } from '@jupyter-widgets/base-manager';
// TODO: Do we really need to depend on this?
import { JSONObject, JSONValue, UUID } from '@lumino/coreutils';
import { VSCodeEvent } from 'vscode-notebook-renderer/events';

import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fortawesome/fontawesome-free/css/v4-shims.min.css';
import '@lumino/widgets/style/index.css';
import '@jupyter-widgets/base/css/index.css';
import '@jupyter-widgets/controls/css/widgets.css'; // This imports labvariables and widgets-base

const CDN = 'https://cdn.jsdelivr.net/npm/';

interface KernelPreloadContext {
	readonly onDidReceiveKernelMessage: VSCodeEvent<unknown>;
	postKernelMessage(data: unknown): void;
}

interface ICommInfoReply {
	comms: { comm_id: string }[];
}

// TODO: Look into services.KernelMessage.ICommOpenMsg
interface ICommOpen {
	comm_id: string;
	target_name: string;
	content: { data: JSONObject };
	metadata: JSONObject;
}

// TODO: implement Kernel.IComm instead, and use the shim to convert to IClassicComm. Then we don't have to implement callbacks, I think?
class Comm implements base.IClassicComm {
	private _on_msg: ((x: any) => void) | undefined;
	private _on_close: ((x: any) => void) | undefined;
	private _callbacks = new Map<string, base.ICallbacks>();

	constructor(
		readonly comm_id: string,
		readonly target_name: string,
		private readonly context: KernelPreloadContext,
	) {
		context.onDidReceiveKernelMessage((message: any) => {
			switch (message.type) {
				case 'comm_msg':
					this.handle_msg(message);
					break;
				case 'comm_close':
					this.handle_close(message);
					break;
			}
		});

	}

	open(_data: JSONValue, _callbacks?: base.ICallbacks | undefined, _metadata?: JSONObject | undefined, _buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): string {
		throw new Error('Method not implemented.');
	}

	send(data: any, callbacks?: base.ICallbacks | undefined, metadata?: JSONObject | undefined, buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): string {
		const msgId = UUID.uuid4();
		console.log('Comm.send', data, callbacks, metadata, buffers, msgId);
		// This seems to be the only requirement so far:
		// 1. Call callbacks.iopub.status with a msg = { content: { execution_state: string } } when
		//   the 'idle' message is received.
		// Raise on unhandled callbacks?
		this.set_callbacks(msgId, callbacks);
		// This should return a string msgId. If this initiated an RPC call, the response should contain parent_header.msg_id with the same value.
		this.context.postKernelMessage({
			type: 'comm_msg',
			comm_id: this.comm_id,
			msg_id: msgId,
			content: data,
		});
		return msgId;
	}

	close(data?: JSONValue | undefined, callbacks?: base.ICallbacks | undefined, metadata?: JSONObject | undefined, buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): string {
		console.log('Comm.close', data, callbacks, metadata, buffers);
		if (callbacks) {
			throw new Error('Callbacks not supported in close');
		}
		this.context.postKernelMessage({
			type: 'comm_close',
			content: {
				comm_id: this.comm_id,
			}
		});
		return '';
	}

	on_msg(callback: (x: any) => void): void {
		console.log('Comm.on_msg', callback);
		this._on_msg = callback;
	}

	on_close(callback: (x: any) => void): void {
		console.log('Comm.on_close', callback);
		this._on_close = callback;
	}

	set_callbacks(msgId: string, callbacks: base.ICallbacks | undefined): void {
		// TODO: How are we supposed to handle multiple calls to set_callbacks?

		// if (this._callbacks !== undefined) {
		// 	throw new Error('Callbacks already set');
		// }

		// List of all possible callbacks supported by the shim:
		//
		// callbacks.shell.reply
		// callbacks.input
		// callbacks.iopub.status
		//  assumes msg.header.msg_type === 'status'
		// callbacks.iopub.clear_output
		//  assumes msg.header.msg_type === 'clear_output'
		// callbacks.iopub.output
		//  assumes msg.header.msg_type in ['display_data', 'execute_result', 'stream', 'error']
		//
		// But so far I've only seen callbacks.iopub.status being used by widgets.

		if (callbacks?.shell?.reply) {
			throw new Error('Unimplemented callbacks.shell.reply');
		}
		if (callbacks?.input) {
			throw new Error('Unimplemented callbacks.input');
		}
		if (callbacks?.iopub?.clear_output) {
			throw new Error('Unimplemented callbacks.iopub.clear_output');
		}
		if (callbacks?.iopub?.output) {
			throw new Error('Unimplemented callbacks.iopub.output');
		}
		if (callbacks?.iopub?.status) {
			if (this._callbacks.has(msgId)) {
				throw new Error(`Callbacks already set for message id ${msgId}`);
			}
			this._callbacks.set(msgId, { iopub: { status: callbacks.iopub.status } });
		}
	}

	// TODO: Use any type?
	handle_msg(message: JSONObject): void {
		console.log('Comm.handle_msg', message);
		this._on_msg?.(message);

		// TODO: Maybe this needs to happen on the next tick so that the callbacks are done? Try remove this
		// TODO: Is this correct? Simulate an 'idle' message so that callers know the RPC call is done.
		//  I think it's safe since we know that this method is only called at the end of an RPC call,
		//  which I _think_ happens on idle?
		// setTimeout(() => {
		// TODO: Currently this also fires when the kernel initiates the update...
		//  In that case, I'm not sure if the iopub.status callback set earlier should fire.
		const msgId = (message as any)?.parent_header?.msg_id as string;
		if (msgId) {
			// It's an RPC response, call callbacks.
			const callbacks = this._callbacks.get(msgId);
			if (callbacks) {
				const statusMessage = { content: { execution_state: 'idle' } } as IIOPubMessage<IOPubMessageType>;
				callbacks.iopub?.status?.(statusMessage);
			}
		}
		// }, 0);
	}

	handle_close(message: JSONObject): void {
		console.log('Comm.handle_close', message);
		this._on_close?.(message);
	}
}

// Adapted from @jupyter-widgets/html-manager
function moduleNameToCDNUrl(moduleName: string, moduleVersion: string): string {
	let packageName = moduleName;
	let fileName = 'index'; // default filename
	// if a '/' is present, like 'foo/bar', packageName is changed to 'foo', and path to 'bar'
	// We first find the first '/'
	let index = moduleName.indexOf('/');
	if (index !== -1 && moduleName[0] === '@') {
		// if we have a namespace, it's a different story
		// @foo/bar/baz should translate to @foo/bar and baz
		// so we find the 2nd '/'
		index = moduleName.indexOf('/', index + 1);
	}
	if (index !== -1) {
		fileName = moduleName.substr(index + 1);
		packageName = moduleName.substr(0, index);
	}
	return `${CDN}${packageName}@${moduleVersion}/dist/${fileName}`;
}

// TODO: Does everything need to be protected?
class HTMLManager extends ManagerBase {
	// TODO: Can we make a very simple RPC mechanism?
	private commInfoPromise: Promise<string[]> | undefined;
	private resolveCommInfoPromise: ((value: string[] | PromiseLike<string[]>) => void) | undefined;

	constructor(private readonly context: KernelPreloadContext) {
		super();

		// TODO: Validate the message?
		context.onDidReceiveKernelMessage((message: any) => {
			// if (
			// 	typeof event === 'object' &&
			// 	event &&
			// 	'type' in event &&
			// 	event.type === IPyWidgetMessages.IPyWidgets_Reply_Widget_Version &&
			// 	'payload' in event &&
			// 	typeof event.payload === 'number'
			// ) {
			// }
			switch (message.type) {
				case 'comm_info_reply':
					this.onCommInfoReply(message);
					break;
				case 'comm_open':
					this.onCommOpen(message);
					break;
			}
		});
	}

	// IWidgetManager interface

	private async loadModule(moduleName: string, moduleVersion: string): Promise<any> {
		// Adapted from @jupyter-widgets/html-manager.

		// Get requirejs from the window object.
		// TODO: Who loads it first?
		const require = (window as any).requirejs;
		if (require === undefined) {
			throw new Error('Requirejs is needed, please ensure it is loaded on the page.');
		}

		try {
			// Try to load the module with requirejs.
			return await new Promise((resolve, reject) => require([moduleName], resolve, reject));
		} catch (err) {
			// We failed to load the module with requirejs, fall back to a CDN.
			// TODO: Do we need this check? Do we need to undef?
			const failedId = err.requireModules && err.requireModules[0];
			if (failedId) {
				require.undef(failedId);
				console.log(`Falling back to ${CDN} for ${moduleName}@${moduleVersion}`);
				const conf: { paths: { [key: string]: string } } = { paths: {} };
				conf.paths[moduleName] = moduleNameToCDNUrl(moduleName, moduleVersion);
				require.config(conf);
				return await new Promise((resolve, reject) => require([moduleName], resolve, reject));
			}
		}

		throw new Error(`Error loading module ${moduleName}@${moduleVersion}`);
	}

	protected override async loadClass(className: string, moduleName: string, moduleVersion: string): Promise<typeof base.WidgetModel | typeof base.WidgetView> {
		// Adapted from @jupyter-widgets/html-manager.
		console.log('loadClass', className, moduleName, moduleVersion);
		const module = await this.loadModule(moduleName, moduleVersion);
		if (!module[className]) {
			throw new Error(`Class ${className} not found in module ${moduleName}@${moduleVersion}`);
		}
		return module[className];
	}

	protected override async _create_comm(comm_target_name: string, model_id?: string | undefined, data?: JSONObject | undefined, metadata?: JSONObject | undefined, buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): Promise<base.IClassicComm> {
		if (!model_id) {
			// TODO: Supporting creating a comm from the frontend
			throw new Error('model_id is required');
		}
		this.context.postKernelMessage(
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
		const comm = new Comm(model_id, comm_target_name, this.context);
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

		this.context.postKernelMessage({ type: 'comm_info_request' });

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

	async onCommOpen(message: ICommOpen) {
		const comm = new Comm(message.comm_id, message.target_name, this.context);
		// TODO: Fix type...
		await this.handle_comm_open(comm, message as any);
		console.log('Opened comm:', comm);
	}
}

export async function activate(context: KernelPreloadContext): Promise<void> {
	// We bundle the main widgets packages with the preload script.
	// However, we still need to define them as AMD modules since if a third party module
	// depends on them it will try to load them with requirejs.
	const define = (window as any).define;
	if (define === undefined) {
		throw new Error('Requirejs is needed, please ensure it is loaded on the page.');
	}
	define('@jupyter-widgets/base', () => base);
	define('@jupyter-widgets/controls', () => controls);
	define('@jupyter-widgets/output', () => output);

	// TODO: Should we await this and timeout?
	context.onDidReceiveKernelMessage((message: any) => {
		console.log('Kernel received message:', message);
		if (message.type === 'append_stylesheet') {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = message.href;
			document.head.appendChild(link);
		}
	});

	const manager = new HTMLManager(context);
	(window as any).positronIPyWidgetManager = manager;
}
