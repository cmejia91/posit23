/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivationFunction } from 'vscode-notebook-renderer';
import { IWidgetManager, DOMWidgetView } from '@jupyter-widgets/base';

interface IPositronWidgetManager extends IWidgetManager {
	display_view(view: DOMWidgetView, el: HTMLElement): Promise<void>;
}

export const activate: ActivationFunction = async (_context) => {
	// Get the widget manager defined in the corresponding notebook preload script (../preload/).
	// Preloads are loaded before renderers, so it should be available.
	const manager: IPositronWidgetManager = (window as any).positronIPyWidgetManager;

	return {
		async renderOutputItem(outputItem, element, _signal) {
			const widgetData = outputItem.json();

			if (!manager.has_model(widgetData.model_id)) {
				throw new Error(`Widget model with ID ${widgetData.model_id} not found`);
			}

			const model = await manager.get_model(widgetData.model_id);
			const view = await manager.create_view(model);
			manager.display_view(view, element);
		},
	};
};
