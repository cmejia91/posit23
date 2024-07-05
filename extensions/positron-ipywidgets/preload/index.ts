/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as base from '@jupyter-widgets/base';
import * as controls from '@jupyter-widgets/controls';
import * as LuminoWidget from '@lumino/widgets';
import * as output from '@jupyter-widgets/output';
import { ManagerBase } from '@jupyter-widgets/base-manager';
// TODO: Do we really need to depend on this?
import { JSONObject } from '@lumino/coreutils';
import { Disposable, VSCodeEvent } from 'vscode-notebook-renderer/events';
import { Comm } from './comm';

import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fortawesome/fontawesome-free/css/v4-shims.min.css';
import '@lumino/widgets/style/index.css';
import '@jupyter-widgets/base/css/index.css';
import '@jupyter-widgets/controls/css/widgets.css'; // This imports labvariables and widgets-base
import { IAppendStylesheetMessage, IIPyWidgetsMessage, IIPyWidgetsMessaging } from '../../../src/vs/workbench/contrib/positronIPyWidgets/browser/types';

const CDN = 'https://cdn.jsdelivr.net/npm/';

export interface KernelPreloadContext {
	readonly onDidReceiveKernelMessage: VSCodeEvent<unknown>;
	postKernelMessage(data: unknown): void;
}

// TODO: Look into services.KernelMessage.ICommOpenMsg
interface ICommOpen {
	comm_id: string;
	target_name: string;
	content: { data: JSONObject };
	metadata: JSONObject;
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
	constructor(private readonly messaging: IIPyWidgetsMessaging) {
		super();

		messaging.onDidReceiveMessage((message) => {
			// TODO: Validate the message?
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

	protected override async _create_comm(_comm_target_name: string, _model_id?: string | undefined, _data?: JSONObject | undefined, _metadata?: JSONObject | undefined, _buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): Promise<base.IClassicComm> {
		throw new Error('Method not implemented.');
	}

	protected override _get_comm_info(): Promise<{}> {
		throw new Error('Method not implemented.');
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

	async onCommOpen(message: ICommOpen) {
		const comm = new Comm(message.comm_id, message.target_name, this.messaging);
		// TODO: Fix type...
		await this.handle_comm_open(comm, message as any);
		console.log('Opened comm:', comm);
	}
}

class Messaging implements IIPyWidgetsMessaging {
	constructor(private readonly _context: KernelPreloadContext) { }

	postMessage(message: IIPyWidgetsMessage | IAppendStylesheetMessage): void {
		this._context.postKernelMessage(message);
	}

	onDidReceiveMessage(listener: (e: IIPyWidgetsMessage) => any): Disposable {
		return this._context.onDidReceiveKernelMessage(listener as any);
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

	const messaging = new Messaging(context);

	// TODO: Should we await this and timeout?
	messaging.onDidReceiveMessage(message => {
		console.log('Kernel received message:', message);
		if (message.type === 'append_stylesheet') {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = message.href;
			document.head.appendChild(link);
		}
	});

	const manager = new HTMLManager(messaging);
	(window as any).positronIPyWidgetManager = manager;
}
