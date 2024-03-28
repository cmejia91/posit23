/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import 'vs/css!./Markdown';

import * as React from 'react';
import { renderHtml } from 'vs/base/browser/renderHtml';
import { DeferredImage } from './DeferredImage';
import { useServices } from 'vs/workbench/contrib/positronNotebook/browser/ServicesProvider';

/**
 * Component that render markdown content from a string.
 * @param content: Markdown content to render in string form
 * @returns React element containing the rendered markdown.
 */
export function Markdown({ content }: { content: string }) {

	const renderedHtml = useMarkdown(content);

	switch (renderedHtml.status) {
		case 'error':
			return <div>Error rendering markdown: {renderedHtml.errorMsg}</div>;
		case 'rendering':
			return <div>Rendering markdown...</div>;
		case 'success':
			return <div className='positron-markdown-rendered'>{renderedHtml.nodes}</div>;
	}
}

type MarkdownRenderResults = {
	status: 'rendering';
} | {
	status: 'success';
	nodes: React.ReactElement;
} | {
	status: 'error';
	errorMsg: string;
};

function useMarkdown(content: string): MarkdownRenderResults {

	const services = useServices();
	const [renderedHtml, setRenderedHtml] = React.useState<MarkdownRenderResults>({
		status: 'rendering'
	});

	React.useEffect(() => {
		services.commandService.executeCommand(
			'markdown.api.render',
			content
		).then((html: string) => {
			setRenderedHtml(
				{
					status: 'success',
					nodes: renderHtml(html, {
						componentOverrides: {
							img: DeferredImage,
							a: ExternalLink,
						}
					})
				});
		})
			.catch((error: Error) => {
				setRenderedHtml({
					status: 'error',
					errorMsg: error.message
				});
			}
			);
	}, [content, services.commandService]);

	return renderedHtml;
}

// eslint-disable-next-line react/prop-types
function ExternalLink({ href = 'no-source', ...props }: React.ComponentPropsWithoutRef<'a'>) {
	const services = useServices();

	return <a
		{...props}
		href={href}
		onClick={(e) => {
			e.preventDefault();
			services.openerService.open(href);
		}}
	/>;
}
