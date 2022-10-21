/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit, PBC.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/css/positronTopBar';
const React = require('react');
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TopBarButton } from 'vs/workbench/browser/parts/positronTopBar/components/topBarButton/topBarButton';
import { TopBarRegion } from 'vs/workbench/browser/parts/positronTopBar/components/topBarRegion/topBarRegion';
import { PositronTopBarContextProvider } from 'vs/workbench/browser/parts/positronTopBar/positronTopBarContext';
import { TopBarSeparator } from 'vs/workbench/browser/parts/positronTopBar/components/topBarSeparator/topBarSeparator';
import { TopBarCommandButton } from 'vs/workbench/browser/parts/positronTopBar/components/topBarCommandButton/topBarCommandButton';
import { TopBarCommandCenter } from 'vs/workbench/browser/parts/positronTopBar/components/topBarCommandCenter/topBarCommandCenter';

/**
 * PositronTopBarServices interface. Defines the set of services that are required by the Positron top bar.
 */
export interface PositronTopBarServices {
	configurationService: IConfigurationService;
	quickInputService: IQuickInputService;
	commandService: ICommandService;
}

/**
 * PositronTopBarProps interface.
 */
interface PositronTopBarProps extends PositronTopBarServices {
	testValue: string; // For now, as a tracer...
}

/**
 * PositronTopBar component.
 * @param props A PositronTopBarProps that contains the component properties.
 * @returns The component.
 */
export const PositronTopBar = (props: PositronTopBarProps) => {
	// Render.
	return (
		<PositronTopBarContextProvider {...props}>
			<div className='positron-top-bar'>
				<TopBarRegion align='left'>
					<TopBarButton iconClassName='new-file-icon' dropDown={true} tooltip='New file' />
					<TopBarSeparator />
					<TopBarButton iconClassName='new-project-icon' tooltip='New project' />
					<TopBarSeparator />
					<TopBarButton iconClassName='open-file-icon' dropDown={true} tooltip='Open file' />
					<TopBarSeparator />
					<TopBarCommandButton id='workbench.action.files.save' iconClassName='save-icon' />
					<TopBarCommandButton id='workbench.action.files.saveFiles' iconClassName='save-all-icon' />
				</TopBarRegion>

				<TopBarRegion align='center'>
					<TopBarCommandButton id='workbench.action.navigateBack' iconClassName='back-icon' />
					<TopBarCommandButton id='workbench.action.navigateForward' iconClassName='forward-icon' />
					<TopBarCommandCenter {...props} />
				</TopBarRegion>

				<TopBarRegion align='right'>
					<TopBarButton iconClassName='print-icon' />
				</TopBarRegion>
			</div>
		</PositronTopBarContextProvider>
	);
};
