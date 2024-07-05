/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as base from '@jupyter-widgets/base';
import * as controls from '@jupyter-widgets/controls';
import * as output from '@jupyter-widgets/output';
import { Disposable, VSCodeEvent } from 'vscode-notebook-renderer/events';
import { IIPyWidgetsMessage, IIPyWidgetsMessaging } from '../../../src/vs/workbench/contrib/positronIPyWidgets/browser/positronIPyWidgetsMessaging';
import { PositronWidgetManager } from './manager';

// Import CSS files required by the bundled widget packages.
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fortawesome/fontawesome-free/css/v4-shims.min.css';
import '@jupyter-widgets/base/css/index.css';
import '@jupyter-widgets/controls/css/widgets.css';
import '@lumino/widgets/style/index.css';

/**
 * Context provided to the preload script's activate function.
 */
interface KernelPreloadContext {
	/**
	 * Event that fires when a message is received from the main thread.
	 */
	readonly onDidReceiveKernelMessage: VSCodeEvent<unknown>;

	/**
	 * Send a message to the main thread.
	 *
	 * @param data The message to send to the main thread.
	 */
	postKernelMessage(data: unknown): void;
}


/**
 * Typed messaging interface between the preload script and the main thread Positron IPyWidgets service.
 */
class Messaging implements IIPyWidgetsMessaging {
	constructor(private readonly _context: KernelPreloadContext) { }

	/**
	 * Send a message to the main thread.
	 *
	 * @param message The message to send to the main thread.
	 */
	postMessage(message: IIPyWidgetsMessage): void {
		this._context.postKernelMessage(message);
	}

	/**
	 * Register a listener for messages from the main thread.
	 *
	 * @param listener The listener to register.
	 * @returns A disposable that can be used to unregister the listener.
	 */
	onDidReceiveMessage(listener: (e: IIPyWidgetsMessage) => any): Disposable {
		return this._context.onDidReceiveKernelMessage(listener as any);
	}
}

export async function activate(context: KernelPreloadContext): Promise<void> {
	// We bundle the main Jupyter widget packages together with this preload script.
	// However, we still need to define them as AMD modules since if a third party module
	// depends on them it will try to load them with requirejs.
	const define = (window as any).define;
	if (define === undefined) {
		throw new Error('Requirejs is needed, please ensure it is loaded on the page.');
	}
	define('@jupyter-widgets/base', () => base);
	define('@jupyter-widgets/controls', () => controls);
	define('@jupyter-widgets/output', () => output);

	// Define the typed notebook preload messaging interface.
	const messaging = new Messaging(context);

	// Wait for the main thread to send the bundled stylesheet URI, then append it to the document.
	const disposable = messaging.onDidReceiveMessage(message => {
		if (message.type === 'append_stylesheet') {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = message.href;
			document.head.appendChild(link);
			disposable.dispose();
		}
	});

	// Attach the widget manager to the window object so it can be accessed by the notebook renderer.
	const manager = new PositronWidgetManager(messaging);
	(window as any).positronIPyWidgetManager = manager;
}
