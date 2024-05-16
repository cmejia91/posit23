/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ISerializableView, IViewSize } from 'vs/base/browser/ui/grid/gridview';
import { IStringDictionary } from 'vs/base/common/collections';
import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { IWorkbenchLayoutService, PanelAlignment, Parts } from 'vs/workbench/services/layout/browser/layoutService';

export type KnownPositronLayoutParts = Parts.PANEL_PART | Parts.SIDEBAR_PART | Parts.AUXILIARYBAR_PART;

export type CustomPositronLayoutDescription = Record<
	KnownPositronLayoutParts,
	{
		width?: number;
		height?: number;
		hidden: boolean;
		alignment?: PanelAlignment;
		viewContainers?: {
			id: string;
			views: string[];
		}[];
	}
>;

export type PartLayoutDescription = CustomPositronLayoutDescription[KnownPositronLayoutParts];


export type PartViewInfo = {
	partView: ISerializableView;
	currentSize: IViewSize;
	alignment?: PanelAlignment;
	hidden: boolean;
	hideFn: (hidden: boolean, skipLayout?: boolean | undefined) => void;
};


const partToViewContainerLocation: Record<KnownPositronLayoutParts, ViewContainerLocation> = {
	[Parts.PANEL_PART]: ViewContainerLocation.Panel,
	[Parts.SIDEBAR_PART]: ViewContainerLocation.Sidebar,
	[Parts.AUXILIARYBAR_PART]: ViewContainerLocation.AuxiliaryBar,
};

/**
 * Convert our custom layout description to the `IViewsCustomizations` format that the
 * `viewDescriptorService` uses for its internal state.
 * @param layout Positron custom layout description
 * @returns Simplified view info in the form of viewContainerLocations and
 * viewDescriptorCustomizations. See `IViewsCustomizations` for more info.
 */
export function layoutDescriptionToViewInfo(layout: CustomPositronLayoutDescription) {
	const viewContainerLocations = new Map<string, ViewContainerLocation>();
	const viewDescriptorCustomizations = new Map<string, string>();

	for (const [part, info] of Object.entries(layout)) {
		const viewContainers = info.viewContainers;
		if (!viewContainers) { continue; }
		const viewContainerLocation = partToViewContainerLocation[part as KnownPositronLayoutParts];

		for (const viewContainer of viewContainers) {
			viewContainerLocations.set(viewContainer.id, viewContainerLocation);

			for (const viewId of viewContainer.views) {
				viewDescriptorCustomizations.set(viewId, viewContainer.id);
			}
		}
	}

	return {
		viewContainerLocations,
		viewDescriptorCustomizations,
	};
}


export function viewLocationsToViewOrder(viewLocations: IStringDictionary<string>) {
	const viewOrder: IStringDictionary<string[]> = {};
	for (const viewId in viewLocations) {
		const containerId = viewLocations[viewId];
		if (!viewOrder[containerId]) {
			viewOrder[containerId] = [];
		}
		viewOrder[containerId].push(viewId);
	}
	return viewOrder;
}

/**
 * Convenience function to load a custom layout and views from a descriptor.
 * @param description Description of the custom layout and views
 * @param accessor Services accessor
 */
export function loadCustomPositronLayout(description: CustomPositronLayoutDescription, accessor: ServicesAccessor) {
	accessor.get(IWorkbenchLayoutService).enterCustomLayout(description);
	accessor.get(IViewDescriptorService).loadCustomViewDescriptor(description);
}

// export function createPositronCustomLayoutDescriptor(accessor: ServicesAccessor): CustomPositronLayoutDescription {
// 	const views = accessor.get(IViewDescriptorService).dumpViewCustomizations();
// 	const layoutService = accessor.get(IWorkbenchLayoutService);

// 	const getPartLayout = (part: KnownPositronLayoutParts) => {
// 		const { currentSize, hidden } = layoutService.getPartViewInfo(part);
// 		return { width: currentSize.width, height: currentSize.height, hidden };
// 	};

// 	return {
// 		[Parts.SIDEBAR_PART]: getPartLayout(Parts.SIDEBAR_PART),
// 		[Parts.PANEL_PART]: getPartLayout(Parts.PANEL_PART),
// 		[Parts.AUXILIARYBAR_PART]: getPartLayout(Parts.AUXILIARYBAR_PART),
// 	};
// }


type LayoutPick = IQuickPickItem & { layoutDescriptor: CustomPositronLayoutDescription };
export const positronCustomLayoutOptions: LayoutPick[] = [
	{
		id: 'fourPaneDS',
		label: localize('choseLayout.fourPaneDS', 'Four Pane Data Science'),
		layoutDescriptor: {
			[Parts.SIDEBAR_PART]: {
				'width': 150,
				'hidden': true,
			},
			[Parts.PANEL_PART]: {
				'height': 400,
				'hidden': false,
				'alignment': 'center',
				viewContainers: [
					{
						id: 'workbench.panel.positronSessions',
						views: ['workbench.panel.positronConsole']
					},
					{
						id: 'workbench.views.service.panel.f732882e-ffdb-495b-b500-31b109474b78',
						views: ['connections']
					}
				]
			},
			[Parts.AUXILIARYBAR_PART]: {
				'width': 700,
				'hidden': false,
			}
		},
	},
	{
		id: 'plot-console-variables',
		label: localize('choseLayout.plotConsoleVariables', 'Plot, Console, Variables'),
		layoutDescriptor: {
			[Parts.PANEL_PART]: { hidden: true, alignment: 'center' },
			[Parts.SIDEBAR_PART]: { hidden: true },
			[Parts.AUXILIARYBAR_PART]: {
				hidden: false,
				viewContainers: [
					{
						id: 'workbench.panel.positronSession',
						views: [
							'workbench.panel.positronPlots',
							'workbench.panel.positronConsole',
							'workbench.panel.positronVariables'
						]
					},
					{
						id: 'terminal',
						views: ['terminal']
					}
				]
			},
		},
	},
	// {
	// 	id: 'sideBySideDS',
	// 	label: localize('choseLayout.sideBySideDS', 'Side by Side Data Science'),
	// 	layoutDescriptor: {
	// 		layout: {
	// 			[Parts.PANEL_PART]: {
	// 				hidden: true,
	// 				alignment: 'center',
	// 				viewContainers: [
	// 					{
	// 						id: 'workbench.panel.positronSessions',
	// 						views: ['workbench.panel.positronConsole']
	// 					}
	// 				]
	// 			 },
	// 			[Parts.SIDEBAR_PART]: { hidden: true },
	// 			[Parts.AUXILIARYBAR_PART]: { hidden: false },
	// 		},
	// 		views: {
	// 			'viewContainerLocations': {
	// 				'workbench.view.extension.positron-connections': 1,
	// 				'workbench.panel.positronSessions': 1
	// 			},
	// 			viewOrder: {
	// 				'workbench.view.explorer': [
	// 					'connections'

	// 				],
	// 				'workbench.panel.positronSessions': [
	// 					'workbench.panel.positronConsole',
	// 				]
	// 			},
	// 		}
	// 	},
	// },

	// {
	// 	id: 'heathen',
	// 	label: localize('choseLayout.heathenLayout', 'Heathen Layout'),
	// 	layoutDescriptor: {
	// 		'layout': {
	// 			'workbench.parts.sidebar': {
	// 				'hidden': true
	// 			},
	// 			'workbench.parts.panel': {
	// 				'height': 734,
	// 				'hidden': false,
	// 				alignment: 'center'
	// 			},
	// 			'workbench.parts.auxiliarybar': {
	// 				'hidden': true
	// 			}
	// 		},
	// 		'views': {
	// 			'viewContainerLocations': {
	// 				'workbench.view.extension.positron-connections': 1,
	// 				'workbench.panel.positronSessions': 1,
	// 			},
	// 			viewOrder: {
	// 				'workbench.panel.positronSessions': [
	// 					'workbench.panel.positronConsole',
	// 					'workbench.panel.positronVariables',
	// 					'terminal'
	// 				],
	// 				'workbench.view.explorer': [
	// 					'connections'
	// 				]
	// 			},
	// 		}
	// 	},
	// }
];
