/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IOverlayWebview } from 'vs/workbench/contrib/webview/browser/webview';
import { ILanguageRuntimeMessageOutput } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { ILanguageRuntimeSession } from 'vs/workbench/services/runtimeSession/common/runtimeSessionService';
import { Event } from 'vs/base/common/event';

export const POSITRON_NOTEBOOK_OUTPUT_WEBVIEW_SERVICE_ID = 'positronNotebookOutputWebview';

export const IPositronNotebookOutputWebviewService =
	createDecorator<IPositronNotebookOutputWebviewService>(
		POSITRON_NOTEBOOK_OUTPUT_WEBVIEW_SERVICE_ID);

export interface INotebookOutputWebview {
	/** The ID of the notebook output */
	id: string;

	/** The ID of the runtime session that emitted (and owns) the output */
	sessionId: string;

	/** The webview containing the output's content */
	webview: IOverlayWebview;

	/** Fired when the content completes rendering */
	onDidRender: Event<void>;

	/**
	 * Optional method to render the output in the webview rather than doing so
	 * directly in the HTML content
	 */
	render?(): void;
}

export interface IPositronNotebookOutputWebviewService {

	// Required for dependency injection
	readonly _serviceBrand: undefined;

	/**
	 * Create a new notebook output webview from an output message.
	 *
	 * @param runtime The runtime that emitted the output
	 * @param output The message containing the contents to be rendered in the webview.
	 * @param viewType The view type of the notebook e.g 'jupyter-notebook', if known. Used to
	 *  select the required notebook preload scripts for the webview.
	 * @returns A promise that resolves to the new webview, or undefined if the
	 *   output does not have a suitable renderer.
	 */
	createNotebookOutputWebview(
		runtime: ILanguageRuntimeSession,
		output: ILanguageRuntimeMessageOutput,
		viewType?: string,
	): Promise<INotebookOutputWebview | undefined>;
}

