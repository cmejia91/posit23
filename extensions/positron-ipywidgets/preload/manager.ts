/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as base from '@jupyter-widgets/base';
import { ManagerBase } from '@jupyter-widgets/base-manager';
import { JSONObject } from '@lumino/coreutils';
import * as LuminoWidget from '@lumino/widgets';
import type * as WebviewMessage from '../../../src/vs/workbench/services/languageRuntime/common/positronIPyWidgetsWebviewMessages';
import { Comm } from './comm';
import { Disposable } from 'vscode-notebook-renderer/events';
import { Messaging } from '.';

// TODO: Should we support configurable CDN?
//       This is the default CDN in @jupyter-widgets/html-manager/libembed-amd.
const CDN = 'https://cdn.jsdelivr.net/npm/';

/**
 * Convert a module name and version to a CDN URL.
 *
 * @param moduleName The name of the module.
 * @param moduleVersion The version of the module.
 * @returns The CDN URL.
 */
function moduleNameToCDNUrl(moduleName: string, moduleVersion: string): string {
	// Adapted from @jupyter-widgets/html-manager
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
		fileName = moduleName.substring(index + 1);
		packageName = moduleName.substring(0, index);
	}
	return `${CDN}${packageName}@${moduleVersion}/dist/${fileName}`;
}

/**
 * A widget manager that interfaces with the Positron IPyWidgets service and renders to HTML.
 */
export class PositronWidgetManager extends ManagerBase implements base.IWidgetManager, Disposable {
	private _disposables: Disposable[] = [];

	readonly ready: Promise<void>;

	constructor(
		private readonly _messaging: Messaging,
	) {
		super();

		// Handle messages from the runtime.
		this._disposables.push(_messaging.onDidReceiveMessage(async (message) => {
			switch (message.type) {
				case 'comm_open':
					await this._handle_comm_open(message);
					break;
			}
		}));

		// Promise that resolves when the Positron IPyWidgets instance sends the initialize_result message.
		this.ready = new Promise<void>((resolve) => {
			console.log('Preload: Waiting for init message');
			const disposable = this._messaging.onDidReceiveMessage(message => {
				if (message.type === 'initialize_result') {
					// Append the stylesheet to the document head.
					const link = document.createElement('link');
					link.rel = 'stylesheet';
					link.href = message.stylesheet_href;
					document.head.appendChild(link);
					disposable.dispose();
					console.log('Preload: Positron IPyWidgets activated');
					resolve();
				}
			});
		});

		// Request initialization from the Positron IPyWidgets instance.
		this._messaging.postMessage({ type: 'initialize_request' });
	}

	private async _handle_comm_open(message: WebviewMessage.ICommOpenToWebview): Promise<void> {
		const comm = new Comm(message.comm_id, message.target_name, this._messaging);
		await this.handle_comm_open(
			comm,
			{
				content: {
					comm_id: message.comm_id,
					target_name: message.target_name,
					data: message.data as JSONObject,
				},
				metadata: message.metadata as JSONObject,
				// Stub the rest of the interface - these are not currently used by handle_comm_open.
				channel: 'iopub',
				header: {
					date: '',
					msg_id: '',
					msg_type: message.type,
					session: '',
					username: '',
					version: '',
				},
				parent_header: {},
			}
		);
	}

	/**
	 * Load a module containing IPyWidget widgets.
	 *
	 * @param moduleName The name of the module.
	 * @param moduleVersion The version of the module.
	 * @returns Promise that resolves with the loaded module.
	 */
	private async loadModule(moduleName: string, moduleVersion: string): Promise<any> {
		// Adapted from @jupyter-widgets/html-manager.

		// Get requirejs from the window object.
		const require = (window as any).requirejs;
		if (require === undefined) {
			throw new Error('Requirejs is needed, please ensure it is loaded on the page.');
		}

		try {
			// Try to load the module with requirejs.
			return await new Promise((resolve, reject) => require([moduleName], resolve, reject));
		} catch (err) {
			// We failed to load the module with requirejs, fall back to a CDN.
			const failedId = err.requireModules && err.requireModules[0];
			if (failedId) {
				// Undefine the failed module to allow requirejs to try again.
				require.undef(failedId);

				// Configure requirejs to load the module from the CDN.
				console.log(`Falling back to ${CDN} for ${moduleName}@${moduleVersion}`);
				const conf: { paths: Record<string, string> } = { paths: {} };
				conf.paths[moduleName] = moduleNameToCDNUrl(moduleName, moduleVersion);
				require.config(conf);

				// Try to load the module with requirejs again.
				return await new Promise((resolve, reject) => require([moduleName], resolve, reject));
			}
		}

		throw new Error(`Error loading module ${moduleName}@${moduleVersion}`);
	}

	/**
	 * Load a class and return a promise to the loaded object.
	 * @param className The name of the class.
	 * @param moduleName The name of the module.
	 * @param moduleVersion The version of the module.
	 * @returns Promise that resolves with the class.
	 */
	protected override async loadClass(className: string, moduleName: string, moduleVersion: string): Promise<typeof base.WidgetModel | typeof base.WidgetView> {
		const module = await this.loadModule(moduleName, moduleVersion);
		if (!module[className]) {
			throw new Error(`Class ${className} not found in module ${moduleName}@${moduleVersion}`);
		}
		return module[className];
	}

	/**
	 * Create a comm which can be used for communication for a widget.
	 *
	 * If the data/metadata is passed in, open the comm before returning (i.e.,
	 * send the comm_open message). If the data and metadata is undefined, we
	 * want to reconstruct a comm that already exists in the kernel, so do not
	 * open the comm by sending the comm_open message.
	 *
	 * @param comm_target_name Comm target name
	 * @param model_id The comm id
	 * @param data The initial data for the comm
	 * @param metadata The metadata in the open message
	 */
	protected override async _create_comm(
		comm_target_name: string,
		model_id?: string | undefined,
		data?: JSONObject | undefined,
		metadata?: JSONObject | undefined,
		_buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined
	): Promise<base.IClassicComm> {
		if (!model_id) {
			throw new Error('model_id is required to create a comm.');
		}

		const comm = new Comm(model_id, comm_target_name, this._messaging);

		// Notify the kernel about the comm.
		if (data || metadata) {
			this._messaging.postMessage({
				type: 'comm_open',
				comm_id: model_id,
				target_name: comm_target_name,
				data: data,
				metadata: metadata,
			});
		}
		return comm;
	}

	/**
	 * Get the currently-registered comms from the runtime.
	 */
	protected override _get_comm_info(): Promise<{}> {
		throw new Error('Method not implemented.');
	}

	/**
	 * Display a view in an HTML element.
	 *
	 * @param view The view to display.
	 * @param element The HTML element to display the view in.
	 * @returns Promise that resolves when the view is displayed.
	 */
	async display_view(view: base.DOMWidgetView, element: HTMLElement): Promise<void> {
		LuminoWidget.Widget.attach(view.luminoWidget, element);
	}

	async wait(): Promise<void> {
		// TODO: Should this block activation?
		// Wait for the ipywidgets service to send the initialization message.
		console.log('Preload: Waiting for init message');
		await new Promise<void>((resolve) => {
			const disposable = this._messaging.onDidReceiveMessage(message => {
				console.log('Preload: received message:', message);
				if (message.type === 'initialize_result') {
					// Append the stylesheet to the document head.
					const link = document.createElement('link');
					link.rel = 'stylesheet';
					link.href = message.stylesheet_href;
					document.head.appendChild(link);
					disposable.dispose();
					resolve();
				}
			});

			this._messaging.postMessage({ type: 'initialize_request' });
		});

		console.log('Preload: Positron IPyWidgets activated');

	}

	loadFromKernel(): Promise<void> {
		return this._loadFromKernel();
	}

	dispose(): void {
		for (const disposable of this._disposables) {
			disposable.dispose();
		}
		this._disposables = [];
	}
}
