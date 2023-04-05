/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { PlotClientInstance } from 'vs/workbench/services/languageRuntime/common/languageRuntimePlotClient';
import { Event } from 'vs/base/common/event';
import { StaticPlotClient } from 'vs/workbench/services/positronPlots/common/staticPlotClient';

export const POSITRON_PLOTS_VIEW_ID = 'workbench.panel.positronPlots';

export const POSITRON_PLOTS_SERVICE_ID = 'positronPlotsService';

export const IPositronPlotsService = createDecorator<IPositronPlotsService>(POSITRON_PLOTS_SERVICE_ID);

export type PositronPlotClient = PlotClientInstance | StaticPlotClient;

/**
 * IPositronPlotsService interface.
 */
export interface IPositronPlotsService {
	readonly _serviceBrand: undefined;

	/**
	 * Gets the individual Positron plot instances.
	 */
	readonly positronPlotInstances: PositronPlotClient[];

	/**
	 * Notifies subscribers when a new Positron plot instance is created.
	 */
	readonly onDidEmitPlot: Event<PositronPlotClient>;

	/**
	 * Notifies subscribers when a Positron plot instance is selected. The ID
	 * of the selected plot is the event payload.
	 */
	readonly onDidSelectPlot: Event<string>;

	/**
	 * Selects the plot at the specified index.
	 *
	 * @param index The ID of the plot to select.
	 */
	selectPlot(id: string): void;

	/**
	 * Placeholder for service initialization.
	 */
	initialize(): void;
}
