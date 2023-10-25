/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useEffect, useState } from 'react'; // eslint-disable-line no-duplicate-imports
import { PlotClientInstance } from 'vs/workbench/services/languageRuntime/common/languageRuntimePlotClient';

/**
 * DynamicPlotThumbnailProps interface.
 */
interface DynamicPlotThumbnailProps {
	plotClient: PlotClientInstance;
}

/**
 * DynamicPlotThumbnail component. This component renders a thumbnail of a plot instance.
 *
 * @param props A DynamicPlotThumbnailProps that contains the component properties.
 * @returns The rendered component.
 */
export const DynamicPlotThumbnail = (props: DynamicPlotThumbnailProps) => {

	const [uri, setUri] = useState('');

	useEffect(() => {
		// If the plot is already rendered, show the URI; otherwise, wait for
		// the plot to render.
		if (props.plotClient.lastRender) {
			setUri(props.plotClient.lastRender.uri);
		}

		// When the plot is rendered, update the URI. This can happen multiple times if the plot
		// is resized.
		props.plotClient.onDidCompleteRender((result) => {
			setUri(result.uri);
		});
	});

	// If the plot is not yet rendered yet (no URI), show a placeholder;
	// otherwise, show the rendered plot.
	//
	// Consider: we probably want a more explicit loading state; as written we
	// will show the old URI until the new one is ready.
	if (uri) {
		return <img src={uri} alt={'Plot ' + props.plotClient.id} />;
	} else {
		return <div className='plot-thumbnail-placeholder'></div>;
	}
};
