/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IOverlayWebview } from 'vs/workbench/contrib/webview/browser/webview';
import { ILanguageRuntime, ILanguageRuntimeMessageOutput } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';

export const POSITRON_NOTEBOOK_OUTPUT_WEBVIEW_SERVICE_ID = 'positronNotebookOutputWebview';

export const IPositronNotebookOutputWebviewService =
	createDecorator<IPositronNotebookOutputWebviewService>(
		POSITRON_NOTEBOOK_OUTPUT_WEBVIEW_SERVICE_ID);

export interface INotebookOutputWebview {
	id: string;
	webview: IOverlayWebview;
}

export interface IPositronNotebookOutputWebviewService {

	createNotebookOutputWebview(
		runtime: ILanguageRuntime,
		output: ILanguageRuntimeMessageOutput): Promise<INotebookOutputWebview | undefined>;

	readonly _serviceBrand: undefined;
}

