/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivationFunction } from 'vscode-notebook-renderer';
import { IWidgetManager, DOMWidgetView } from '@jupyter-widgets/base';

interface IPositronWidgetManager extends IWidgetManager {
	display_view(view: DOMWidgetView, element: HTMLElement): Promise<void>;
	loadFromKernel(): Promise<void>;
}

export const activate: ActivationFunction = async (_context) => {
	// Get the widget manager defined in the corresponding notebook preload script (../preload/).
	// Preloads are loaded before renderers, so it should be available.
	const manager: IPositronWidgetManager = (window as any).positronIPyWidgetManager;

	return {
		async renderOutputItem(outputItem, element, _signal) {
			const widgetData = outputItem.json();

			// TODO: Await for kernel connected message or something here?
			// await manager.waitForKernel();
			console.log('Renderer: rendering output item', widgetData, element);

			// Check if the widget's comm exists in the manager.
			if (!manager.has_model(widgetData.model_id)) {
				// Try to load all widget comms from the kernel.
				console.log('Renderer: widget not found, loading from kernel');
				await manager.loadFromKernel();

				// Check if the widget's comm was loaded from the kernel.
				if (!manager.has_model(widgetData.model_id)) {
					await manager.loadFromKernel();
					throw new Error(`Widget model with ID ${widgetData.model_id} not found`);
				}
			}

			// Render the widget view in the element.
			const model = await manager.get_model(widgetData.model_id);
			const view = await manager.create_view(model);
			manager.display_view(view, element);

			console.log('Renderer: done!');
		},
	};
};
