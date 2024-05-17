/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ISerializableView, IViewSize } from 'vs/base/browser/ui/grid/gridview';
import { IStringDictionary } from 'vs/base/common/collections';
import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { CustomPositronLayoutDescription, KnownPositronLayoutParts } from 'vs/workbench/common/positronCustomViews';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { IWorkbenchLayoutService, PanelAlignment, Parts } from 'vs/workbench/services/layout/browser/layoutService';


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

			if (!viewContainer.views) { continue; }
			for (const view of viewContainer.views) {
				viewDescriptorCustomizations.set(view.id, viewContainer.id);
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
 * Mapping of the layout part to what size we want to resize with the `size` parameter of the layout
 * description. E.g. the panel is resized by changing its height.
 */
export const viewPartToResizeDimension: Record<KnownPositronLayoutParts, 'width' | 'height'> = {
	[Parts.PANEL_PART]: 'height',
	[Parts.SIDEBAR_PART]: 'width',
	[Parts.AUXILIARYBAR_PART]: 'width',
};

/**
 * Convenience function to load a custom layout and views from a descriptor.
 * @param description Description of the custom layout and views
 * @param accessor Services accessor
 */
export function loadCustomPositronLayout(description: CustomPositronLayoutDescription, accessor: ServicesAccessor) {
	accessor.get(IWorkbenchLayoutService).enterCustomLayout(description);
	accessor.get(IViewDescriptorService).loadCustomViewDescriptor(description);
}

// Currently not in use because the layout description format is in flux and so it's hard to keep
// this synced.
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
				size: 200,
				hidden: false,
			},
			[Parts.PANEL_PART]: {
				size: '40%',
				hidden: false,
				alignment: 'center',
				viewContainers: [
					{
						id: 'workbench.panel.positronConsole',
						opened: true,
					},
					{
						id: 'terminal',
					},
				]
			},
			[Parts.AUXILIARYBAR_PART]: {
				size: 500, // Use pixel sizes for auxiliary bar to allow editor to take up the rest of the space
				hidden: false,
				viewContainers: [
					{
						id: 'workbench.panel.positronSession',
						opened: true,
						views: [
							{
								id: 'workbench.panel.positronVariables',
							},
							{
								id: 'workbench.panel.positronPlots',
							},
						]
					},
				]
			}
		},
	},
	{
		id: 'side-by-side',
		label: localize('choseLayout.sideBySide', 'Side-by-side Data Science'),
		layoutDescriptor: {
			[Parts.PANEL_PART]: {
				hidden: true,
				alignment: 'center'
			},
			[Parts.SIDEBAR_PART]: {
				hidden: true
			},
			[Parts.AUXILIARYBAR_PART]: {
				hidden: false,
				size: '50%',
				viewContainers: [
					{
						id: 'workbench.panel.positronSession',
						opened: true,
						views: [
							{
								id: 'workbench.panel.positronConsole',
							},
							{
								id: 'workbench.panel.positronVariables',
							},
							{
								id: 'workbench.panel.positronPlots',
								collapsed: true,
							},
						]
					},
				]
			},
		},
	},
];
