/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivationFunction } from 'vscode-notebook-renderer';

export const activate: ActivationFunction = async (_context) => {
	// Preloads are loaded before renderers activate.
	const manager = (window as any).positronIPyWidgetManager;

	return {
		async renderOutputItem(outputItem, element, _signal) {
			const view = outputItem.json();

			// TODO: Do we need to get _all_ widget state on render?
			//       Should this happen in the preload?
			await manager.loadFromKernel();

			const model = await manager.get_model(view.model_id);
			// TODO: Raise an error if undefined?
			if (model !== undefined) {
				const view = await manager.create_view(model);
				manager.display_view(view, element);
			}
		},
	};
};
