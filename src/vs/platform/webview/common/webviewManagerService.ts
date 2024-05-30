/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

// --- Start Positron ---
import { VSBuffer } from 'vs/base/common/buffer';
// --- End Positron ---

export const IWebviewManagerService = createDecorator<IWebviewManagerService>('webviewManagerService');

export interface WebviewWebContentsId {
	readonly webContentsId: number;
}

export interface WebviewWindowId {
	readonly windowId: number;
}

// --- Start Positron ---
export interface WebviewRectangle {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}
// --- End Positron ---

export interface FindInFrameOptions {
	readonly forward?: boolean;
	readonly findNext?: boolean;
	readonly matchCase?: boolean;
}

export interface FoundInFrameResult {
	readonly requestId: number;
	readonly activeMatchOrdinal: number;
	readonly matches: number;
	readonly selectionArea: any;
	readonly finalUpdate: boolean;
}

export interface IWebviewManagerService {
	_serviceBrand: unknown;

	onFoundInFrame: Event<FoundInFrameResult>;

	setIgnoreMenuShortcuts(id: WebviewWebContentsId | WebviewWindowId, enabled: boolean): Promise<void>;

	findInFrame(windowId: WebviewWindowId, frameName: string, text: string, options: FindInFrameOptions): Promise<void>;

	stopFindInFrame(windowId: WebviewWindowId, frameName: string, options: { keepSelection?: boolean }): Promise<void>;

	// --- Start Positron ---
	captureContentsAsPng(windowId: WebviewWindowId, area?: WebviewRectangle): Promise<VSBuffer | undefined>;

	executeJavaScript(windowId: WebviewWindowId, script: string): Promise<any>;
	// --- End Positron ---
}
