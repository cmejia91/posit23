/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { ChatTreeItem } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatRendererContent } from 'vs/workbench/contrib/chat/common/chatViewModel';

export interface IChatContentPart extends IDisposable {
	domNode: HTMLElement;

	/**
	 * Returns true if the other content is equivalent to what is already rendered in this content part.
	 * Returns false if a rerender is needed.
	 * followingContent is all the content that will be rendered after this content part (to support progress messages' behavior).
	 */
	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean;
}

export interface IChatContentPartRenderContext {
	element: ChatTreeItem;
	index: number;
	content: ReadonlyArray<IChatRendererContent>;
	preceedingContentParts: ReadonlyArray<IChatContentPart>;
}
