/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as base from '@jupyter-widgets/base';
import { ManagerBase } from '@jupyter-widgets/base-manager';
import { JSONObject } from '@lumino/coreutils';
import * as LuminoWidget from '@lumino/widgets';
import { IIPyWidgetsMessaging, ICommOpen } from '../../../src/vs/workbench/contrib/positronIPyWidgets/browser/positronIPyWidgetsMessaging';
import { Comm } from './comm';
import { Disposable } from 'vscode-notebook-renderer/events';

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

	constructor(
		private readonly messaging: IIPyWidgetsMessaging
	) {
		super();

		// Handle messages from the runtime.
		this._disposables.push(messaging.onDidReceiveMessage(async (message) => {
			switch (message.type) {
				case 'comm_open':
					await this._handle_comm_open(message);
					break;
			}
		}));
	}

	private async _handle_comm_open(message: ICommOpen): Promise<void> {
		const comm = new Comm(message.comm_id, message.target_name, this.messaging);
		await this.handle_comm_open(
			comm,
			{
				...message,
				channel: 'shell',
				// Stub the rest of the interface - these are not currently used by handle_comm_open.
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
	 * Load a widget model or view class from a module.
	 *
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
	 * Create a new comm in the runtime.
	 */
	protected override async _create_comm(_comm_target_name: string, _model_id?: string | undefined, _data?: JSONObject | undefined, _metadata?: JSONObject | undefined, _buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): Promise<base.IClassicComm> {
		throw new Error('Method not implemented.');
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

	dispose(): void {
		for (const disposable of this._disposables) {
			disposable.dispose();
		}
		this._disposables = [];
	}
}
