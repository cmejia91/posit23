/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useEffect } from 'react'; // eslint-disable-line no-duplicate-imports
import { WebviewPlotClient } from 'vs/workbench/contrib/positronPlots/browser/webviewPlotClient';

/**
 * WebviewPlotInstanceProps interface.
 */
interface WebviewPlotInstanceProps {
	plotClient: WebviewPlotClient;
}

/**
 * WebviewPlotInstance component. This component renders a webview as a plot in
 * the Plots pane.
 *
 * @param props A WebviewPlotInstanceProps that contains the component properties.
 * @returns The rendered component.
 */
export const WebviewPlotInstance = (props: WebviewPlotInstanceProps) => {
	const webviewRef = React.useRef<HTMLDivElement>(null);

	useEffect(() => {
		const webview = props.plotClient.webview.webview;
		webview.claim(this, undefined);
		if (webviewRef.current) {
			webview.layoutWebviewOverElement(webviewRef.current);
		}
		return () => {
			webview.release(this);
		};
	});

	// The DOM we render is just a single div that the webview will be
	// positioned over.
	return (
		<div className='plot-instance' ref={webviewRef}>
		</div>
	);
};
