/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./positronTopActionBar';
import * as React from 'react';
import { ILabelService } from 'vs/platform/label/common/label';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { PositronActionBar } from 'vs/platform/positronActionBar/browser/positronActionBar';
import { ActionBarRegion } from 'vs/platform/positronActionBar/browser/components/actionBarRegion';
import { ActionBarSeparator } from 'vs/platform/positronActionBar/browser/components/actionBarSeparator';
import { PositronActionBarServices } from 'vs/platform/positronActionBar/browser/positronActionBarState';
import { ILanguageRuntimeService } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { ActionBarCommandButton } from 'vs/platform/positronActionBar/browser/components/actionBarCommandButton';
import { NavigateBackwardsAction, NavigateForwardAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { PositronActionBarContextProvider } from 'vs/platform/positronActionBar/browser/positronActionBarContext';
import { TopActionBarNewMenu } from 'vs/workbench/browser/parts/positronTopActionBar/components/topActionBarNewMenu';
import { TopActionBarOpenMenu } from 'vs/workbench/browser/parts/positronTopActionBar/components/topActionBarOpenMenu';
import { TopActionBarWorkspaceMenu } from 'vs/workbench/browser/parts/positronTopActionBar/components/topActionBarWorkspaceMenu';
import { PositronTopActionBarContextProvider } from 'vs/workbench/browser/parts/positronTopActionBar/positronTopActionBarContext';
import { TopActionBarCommandCenter } from 'vs/workbench/browser/parts/positronTopActionBar/components/topActionBarCommandCenter';

// Constants.
const kHorizontalPadding = 4;

/**
 * PositronTopActionBarServices interface. Defines the set of services that are required by the Positron top action bar.
 */
export interface PositronTopActionBarServices extends PositronActionBarServices {
	hostService: IHostService;
	labelService: ILabelService;
	layoutService: ILayoutService;
	quickInputService: IQuickInputService;
	workspaceContextService: IWorkspaceContextService;
	workspacesService: IWorkspacesService;
	languageRuntimeService: ILanguageRuntimeService;
}

/**
 * PositronTopActionBarProps interface.
 */
interface PositronTopActionBarProps extends PositronTopActionBarServices { }

/**
 * PositronTopActionBar component.
 * @param props A PositronTopActionBarProps that contains the component properties.
 * @returns The rendered component.
 */
export const PositronTopActionBar = (props: PositronTopActionBarProps) => {
	// Render.
	return (
		<PositronTopActionBarContextProvider {...props}>
			<PositronActionBarContextProvider {...props}>
				<PositronActionBar size='large' borderBottom={true} paddingLeft={kHorizontalPadding} paddingRight={kHorizontalPadding}>

					<ActionBarRegion region='left'>
						<TopActionBarNewMenu />
						<ActionBarSeparator />
						<TopActionBarOpenMenu />
						<ActionBarSeparator />
						<ActionBarCommandButton iconId='positron-save' commandId={'workbench.action.files.save'} />
						<ActionBarCommandButton iconId='positron-save-all' commandId={'workbench.action.files.saveFiles'} />
					</ActionBarRegion>

					<ActionBarRegion region='center'>
						<PositronActionBar size='large' borderBottom={false} paddingLeft={0} paddingRight={0}>
							<ActionBarRegion region='left' width={100} justify='right'>
								<ActionBarCommandButton iconId='positron-chevron-left' commandId={NavigateBackwardsAction.ID} />
								<ActionBarCommandButton iconId='positron-chevron-right' commandId={NavigateForwardAction.ID} />
							</ActionBarRegion>

							<ActionBarRegion region='center'>
								<TopActionBarCommandCenter />
							</ActionBarRegion>

							<ActionBarRegion region='right' width={100}>
							</ActionBarRegion>
						</PositronActionBar>
					</ActionBarRegion>

					<ActionBarRegion region='right'>
						<TopActionBarWorkspaceMenu />
					</ActionBarRegion>

				</PositronActionBar>
			</PositronActionBarContextProvider>
		</PositronTopActionBarContextProvider>
	);
};
