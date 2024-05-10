/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ISerializableView, IViewSize } from 'vs/base/browser/ui/grid/gridview';
import { IStringDictionary } from 'vs/base/common/collections';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';


// Copied from src/vs/workbench/services/views/browser/viewDescriptorService.ts to
// avoid exporting the interface and creating more diffs
interface IViewsCustomizations {
	viewContainerLocations: IStringDictionary<ViewContainerLocation>;
	viewLocations: IStringDictionary<string>;
	viewContainerBadgeEnablementStates: IStringDictionary<boolean>;
}

export type PartLayoutDescription = {
	width?: number;
	height?: number;
	hidden: boolean;
};


export interface CustomPositronLayoutDescription {
	[Parts.PANEL_PART]: PartLayoutDescription;
	[Parts.SIDEBAR_PART]: PartLayoutDescription;
	[Parts.AUXILIARYBAR_PART]: PartLayoutDescription;
}

export type PartViewInfo = {
	partView: ISerializableView;
	currentSize: IViewSize;
	hidden: boolean;
	hideFn: (hidden: boolean, skipLayout?: boolean | undefined) => void;
};

export type KnownPositronLayoutParts = keyof CustomPositronLayoutDescription;

export interface PositronCustomLayoutDescriptor {
	layout: CustomPositronLayoutDescription;
	views: IViewsCustomizations;
}

/**
 * Convenience function to load a custom layout and views from a descriptor.
 * @param description Description of the custom layout and views
 * @param accessor Services accessor
 */
export function loadCustomPositronLayout(description: PositronCustomLayoutDescriptor, accessor: ServicesAccessor) {
	accessor.get(IWorkbenchLayoutService).enterCustomLayout(description.layout);
	accessor.get(IViewDescriptorService).loadCustomViewDescriptor(description.views);
}

export function createPositronCustomLayoutDescriptor(accessor: ServicesAccessor): PositronCustomLayoutDescriptor {
	const views = accessor.get(IViewDescriptorService).dumpViewCustomizations();
	const layoutService = accessor.get(IWorkbenchLayoutService);

	const getPartLayout = (part: KnownPositronLayoutParts) => {
		const { currentSize, hidden } = layoutService.getPartViewInfo(part);
		return { width: currentSize.width, height: currentSize.height, hidden };
	};

	return {
		layout: {
			[Parts.SIDEBAR_PART]: getPartLayout(Parts.SIDEBAR_PART),
			[Parts.PANEL_PART]: getPartLayout(Parts.PANEL_PART),
			[Parts.AUXILIARYBAR_PART]: getPartLayout(Parts.AUXILIARYBAR_PART),
		},
		views
	};
}

export const fourPaneDS: PositronCustomLayoutDescriptor =
{
	layout: {
		[Parts.PANEL_PART]: { hidden: false },
		[Parts.SIDEBAR_PART]: { hidden: false, width: 250 },
		[Parts.AUXILIARYBAR_PART]: { hidden: false },
	},
	views: {
		'viewContainerLocations': {
			'workbench.view.extension.positron-connections': 1,
			'workbench.panel.positronSessions': 1
		},
		'viewLocations': {
			'connections': 'workbench.view.explorer',
			'workbench.panel.positronConsole': 'workbench.panel.positronVariables'
		},
		'viewContainerBadgeEnablementStates': {}
	}
};

export const sideBySideDS: PositronCustomLayoutDescriptor =
{
	layout: {
		[Parts.PANEL_PART]: { hidden: true },
		[Parts.SIDEBAR_PART]: { hidden: true },
		[Parts.AUXILIARYBAR_PART]: { hidden: false },
	},
	views: {
		'viewContainerLocations': {
			'workbench.view.extension.positron-connections': 1,
			'workbench.panel.positronSessions': 1,
			'workbench.views.service.panel.d54dbb97-967d-4598-a183-f19c8cfc8a3a': 1
		},
		'viewLocations': {
			'connections': 'workbench.views.service.panel.d54dbb97-967d-4598-a183-f19c8cfc8a3a',
			'workbench.panel.positronConsole': 'workbench.panel.positronVariables'
		},
		'viewContainerBadgeEnablementStates': {}
	}
};

