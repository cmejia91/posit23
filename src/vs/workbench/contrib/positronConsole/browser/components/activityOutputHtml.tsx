/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./activityOutputHtml';
import * as React from 'react';
import { ActivityItemOutputHtml } from 'vs/workbench/services/positronConsole/common/classes/activityItemOutputHtml';
import { HtmlNode, parseHtml } from 'vs/base/common/htmlParser';

// ActivityOutputHtml interface.
export interface ActivityOutputHtmlProps {
	activityItemOutputHtml: ActivityItemOutputHtml;
}

/**
 * Renders HTML to React elements.
 * @param html A string of untrusted HTML.
 * @returns A React element containing the rendered HTML.
 */
const renderHtml = (html: string): React.ReactElement => {

	// Parse the HTML into a tree of nodes.
	const parsedContent = parseHtml(html);

	// Render the nodes into React elements.
	const renderNode = (node: HtmlNode): React.ReactElement | undefined => {
		if (node.type === 'text') {
			// Create <span> elements to host the text content.
			if (node.content && node.content.trim().length > 0) {
				return React.createElement('span', {}, node.content);
			}
			// Text nodes with no content (or only whitespae content) are
			// currently ignored.
			return undefined;
		} else if (node.type === 'tag' && node.children) {
			// Call the renderer recursively to render the children, if any.
			const children = node.children.map(renderNode);
			// Create a React element for the tag and its children.
			return React.createElement(node.name!, node.attrs, children);
		} else {
			// Create a React element for the tag.
			return React.createElement(node.name!, node.attrs);
		}
	};

	// Render all the nodes.
	const renderedNodes = parsedContent.map(renderNode);

	return <div>{renderedNodes}</div>;
};

/**
 * ActivityOutputHtml component.
 * @param props An ActivityErrorMessageProps that contains the component properties.
 * @returns The rendered component.
 */
export const ActivityOutputHtml = (props: ActivityOutputHtmlProps) => {

	// Render the raw HTML in the div
	return (
		<div className='activity-output-html'>
			{renderHtml(props.activityItemOutputHtml.html)}
		</div>
	);
};
