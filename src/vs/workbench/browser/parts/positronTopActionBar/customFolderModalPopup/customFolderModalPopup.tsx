/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./customFolderModalPopup';

// React.
import * as React from 'react';

// Other dependencies.
import { ILabelService } from 'vs/platform/label/common/label';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IRecentlyOpened, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { PositronModalPopup } from 'vs/workbench/browser/positronComponents/positronModalPopup/positronModalPopup';
import { PositronModalReactRenderer } from 'vs/workbench/browser/positronModalReactRenderer/positronModalReactRenderer';
import { CustomFolderMenuItems } from 'vs/workbench/browser/parts/positronTopActionBar/customFolderModalPopup/customFolderMenuItems';

/**
 * CustomFolderModalPopupProps interface.
 */
interface CustomFolderModalPopupProps {
	commandService: ICommandService;
	contextKeyService: IContextKeyService;
	hostService: IHostService;
	keybindingService: IKeybindingService;
	labelService: ILabelService;
	layoutService: ILayoutService;
	workspacesService: IWorkspacesService;
	renderer: PositronModalReactRenderer;
	recentlyOpened: IRecentlyOpened;
	anchorElement: HTMLElement;
}

/**
 * The custom folder modal popup.
 * @param propsThe component properties.
 * @returns The rendered component.
 */
export const CustomFolderModalPopup = (props: CustomFolderModalPopupProps) => {
	// Render.
	return (
		<PositronModalPopup
			renderer={props.renderer}
			anchorElement={props.anchorElement}
			popupPosition='bottom'
			popupAlignment='right'
			width={'max-content'}
			minWidth={275}
			height={'min-content'}
			keyboardNavigationStyle='menu'
		>
			<CustomFolderMenuItems
				commandService={props.commandService}
				contextKeyService={props.contextKeyService}
				hostService={props.hostService}
				labelService={props.labelService}
				recentlyOpened={props.recentlyOpened}
				onMenuItemSelected={() => props.renderer.dispose()}
			/>
		</PositronModalPopup>
	);
};
