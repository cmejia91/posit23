/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { INotebookWebviewMessage } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { FromWebviewMessage } from 'vs/workbench/contrib/notebook/browser/view/renderers/webviewMessages';
import { INotebookOutputWebview } from 'vs/workbench/contrib/positronOutputWebview/browser/notebookOutputWebviewService';
import { IOverlayWebview, } from 'vs/workbench/contrib/webview/browser/webview';

// Message sent by the webview when the widget has finished rendering; used to
// coordinate thumbnail generation.
export const RENDER_COMPLETE = 'render_complete';

/**
 * A notebook output webview wraps a webview that contains rendered HTML content
 * from notebooks (including raw HTML or the Notebook Renderer API).
 */
export class NotebookOutputWebview extends Disposable implements INotebookOutputWebview {

	private readonly _onDidRender = new Emitter<void>;
	private readonly _onDidReceiveMessage = new Emitter<INotebookWebviewMessage>();

	/**
	 * Create a new notebook output webview.
	 *
	 * @param id A unique ID for this webview; typically the ID of the message
	 *   that created it.
	 * @param runtimeId The ID of the runtime that owns this webview.
	 * @param webview The underlying webview.
	 */
	constructor(
		readonly id: string,
		readonly sessionId: string,
		readonly webview: IOverlayWebview) {
		super();

		this.onDidRender = this._onDidRender.event;
		this.onDidReceiveMessage = this._onDidReceiveMessage.event;
		this._register(this._onDidRender);
		this._register(this._onDidReceiveMessage);

		this._register(webview.onMessage(e => {
			if (e.message === RENDER_COMPLETE) {
				this._onDidRender.fire();
			}

			const data: FromWebviewMessage | { readonly __vscode_notebook_message: undefined } = e.message;

			if (!data.__vscode_notebook_message) {
				return;
			}

			switch (data.type) {
				// TODO: Handle logRendererDebugMessage?
				// TODO: Is this message type needed or should we send RENDER_COMPLETE as above?
				case 'positronRenderComplete':
					this._onDidRender.fire();
					break;
				case 'customKernelMessage':
					this._onDidReceiveMessage.fire({ message: data.message });
					break;
			}

		}));
	}

	onDidRender: Event<void>;
	onDidReceiveMessage: Event<INotebookWebviewMessage>;

	postMessage(message: unknown): void {
		this.webview.postMessage({
			__vscode_notebook_message: true,
			type: 'customKernelMessage',
			message
		});
	}

	public override dispose(): void {
		this.webview.dispose();
		super.dispose();
	}
}
