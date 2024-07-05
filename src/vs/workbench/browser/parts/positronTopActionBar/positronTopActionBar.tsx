/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./positronTopActionBar';

// React.
import * as React from 'react';
import { useEffect, useState } from 'react'; // eslint-disable-line no-duplicate-imports

// Other dependencies.
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ILabelService } from 'vs/platform/label/common/label';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { CommandCenter } from 'vs/platform/commandCenter/common/commandCenter';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { PositronActionBar } from 'vs/platform/positronActionBar/browser/positronActionBar';
import { ActionBarRegion } from 'vs/platform/positronActionBar/browser/components/actionBarRegion';
import { ActionBarSeparator } from 'vs/platform/positronActionBar/browser/components/actionBarSeparator';
import { PositronActionBarServices } from 'vs/platform/positronActionBar/browser/positronActionBarState';
import { IRuntimeSessionService } from 'vs/workbench/services/runtimeSession/common/runtimeSessionService';
import { IRuntimeStartupService } from 'vs/workbench/services/runtimeStartup/common/runtimeStartupService';
import { ActionBarCommandButton } from 'vs/platform/positronActionBar/browser/components/actionBarCommandButton';
import { NavigateBackwardsAction, NavigateForwardAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { PositronActionBarContextProvider } from 'vs/platform/positronActionBar/browser/positronActionBarContext';
import { TopActionBarNewMenu } from 'vs/workbench/browser/parts/positronTopActionBar/components/topActionBarNewMenu';
import { TopActionBarOpenMenu } from 'vs/workbench/browser/parts/positronTopActionBar/components/topActionBarOpenMenu';
import { IPositronTopActionBarService } from 'vs/workbench/services/positronTopActionBar/browser/positronTopActionBarService';
import { TopActionBarCommandCenter } from 'vs/workbench/browser/parts/positronTopActionBar/components/topActionBarCommandCenter';
import { PositronTopActionBarContextProvider } from 'vs/workbench/browser/parts/positronTopActionBar/positronTopActionBarContext';
import { TopActionBarCustonFolderMenu } from 'vs/workbench/browser/parts/positronTopActionBar/components/topActionBarCustomFolderMenu';
import { ILanguageRuntimeMetadata, ILanguageRuntimeService } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { TopActionBarInterpretersManager } from 'vs/workbench/browser/parts/positronTopActionBar/components/topActionBarInterpretersManager';
import { SAVE_ALL_COMMAND_ID, SAVE_FILE_COMMAND_ID } from 'vs/workbench/contrib/files/browser/fileConstants';

// Constants.
const kHorizontalPadding = 4;
const kCenterUIBreak = 600;
const kFulllCenterUIBreak = 765;
const SAVE = SAVE_FILE_COMMAND_ID;
const SAVE_ALL = SAVE_ALL_COMMAND_ID;
const NAV_BACK = NavigateBackwardsAction.ID;
const NAV_FORWARD = NavigateForwardAction.ID;

/**
 * IPositronTopActionBarContainer interface.
 */
export interface IPositronTopActionBarContainer {
	/**
	 * Gets the width.
	 */
	readonly width: number;

	/**
	 * onWidthChanged event.
	 */
	readonly onWidthChanged: Event<number>;
}

/**
 * PositronTopActionBarServices interface. Defines the set of services that are required by the
 * Positron top action bar.
 */
export interface PositronTopActionBarServices extends PositronActionBarServices {
	configurationService: IConfigurationService;
	hostService: IHostService;
	labelService: ILabelService;
	languageRuntimeService: ILanguageRuntimeService;
	layoutService: ILayoutService;
	positronTopActionBarService: IPositronTopActionBarService;
	quickInputService: IQuickInputService;
	runtimeStartupService: IRuntimeStartupService;
	runtimeSessionService: IRuntimeSessionService;
	workspaceContextService: IWorkspaceContextService;
	workspacesService: IWorkspacesService;
}

/**
 * PositronTopActionBarProps interface.
 */
interface PositronTopActionBarProps extends PositronTopActionBarServices {
	positronTopActionBarContainer: IPositronTopActionBarContainer;
}

/**
 * PositronTopActionBar component.
 * @param props A PositronTopActionBarProps that contains the component properties.
 * @returns The rendered component.
 */
export const PositronTopActionBar = (props: PositronTopActionBarProps) => {
	// State hooks.
	const [showCenterUI, setShowCenterUI] = useState(
		props.positronTopActionBarContainer.width > kCenterUIBreak
	);
	const [showFullCenterUI, setShowFullCenterUI] = useState(
		props.positronTopActionBarContainer.width > kFulllCenterUIBreak
	);

	// Main useEffect.
	useEffect(() => {
		// Create the disposable store for cleanup.
		const disposableStore = new DisposableStore();

		// Add the width changed event handler.
		disposableStore.add(props.positronTopActionBarContainer.onWidthChanged(width => {
			setShowCenterUI(width > kCenterUIBreak);
			setShowFullCenterUI(width > kFulllCenterUIBreak);
		}));

		// Return the cleanup function that will dispose of the disposables.
		return () => disposableStore.dispose();
	}, [props.positronTopActionBarContainer]);

	/**
	 * startRuntime event handler.
	 * @param runtimeToStart An ILanguageRuntime representing the runtime to start.
	 */
	const startRuntimeHandler = async (runtimeToStart: ILanguageRuntimeMetadata): Promise<void> => {
		return props.runtimeSessionService.selectRuntime(runtimeToStart.runtimeId,
			`User-requested startup from the Positron top action bar`);
	};

	/**
	 * activateRuntime event handler.
	 * @param runtime An ILanguageRuntime representing the runtime to activate.
	 */
	const activateRuntimeHandler = async (runtime: ILanguageRuntimeMetadata): Promise<void> => {
		// See if there's a session active for the runtime.
		const session =
			props.runtimeSessionService.getConsoleSessionForRuntime(runtime.runtimeId);

		if (session) {
			// The session is already active, so just set it as the foreground session.
			props.runtimeSessionService.foregroundSession = session;
		} else {
			// The session is not active; start a new session for the runtime.
			await startRuntimeHandler(runtime);
		}
	};

	// Render.
	return (
		<PositronTopActionBarContextProvider {...props}>
			<PositronActionBarContextProvider {...props}>

				<PositronActionBar
					size='large'
					borderBottom={true}
					paddingLeft={kHorizontalPadding}
					paddingRight={kHorizontalPadding}
				>
					<ActionBarRegion location='left'>
						<TopActionBarNewMenu />
						<ActionBarSeparator />
						<TopActionBarOpenMenu />
						<ActionBarSeparator />
						<ActionBarCommandButton
							iconId='positron-save'
							commandId={SAVE}
							ariaLabel={CommandCenter.title(SAVE)}
						/>
						<ActionBarCommandButton
							iconId='positron-save-all'
							commandId={SAVE_ALL}
							ariaLabel={CommandCenter.title(SAVE_ALL)}
						/>
					</ActionBarRegion>

					{showCenterUI && (
						<ActionBarRegion location='center'>

							<PositronActionBar size='large' nestedActionBar={true}>
								{showFullCenterUI && (
									<ActionBarRegion width={60} location='left' justify='right'>
										<ActionBarCommandButton
											iconId='chevron-left'
											commandId={NAV_BACK}
											ariaLabel={CommandCenter.title(NAV_BACK)}
										/>
										<ActionBarCommandButton
											iconId='chevron-right'
											commandId={NAV_FORWARD}
											ariaLabel={CommandCenter.title(NAV_FORWARD)}
										/>
									</ActionBarRegion>
								)}
								<ActionBarRegion location='center'>
									<TopActionBarCommandCenter />
								</ActionBarRegion>
								{showFullCenterUI && (
									<ActionBarRegion width={60} location='right' justify='left' />
								)}
							</PositronActionBar>

						</ActionBarRegion>
					)}

					<ActionBarRegion location='right'>
						<TopActionBarInterpretersManager
							onStartRuntime={startRuntimeHandler}
							onActivateRuntime={activateRuntimeHandler}
						/>
						{showCenterUI && (
							<TopActionBarCustonFolderMenu />
						)}
					</ActionBarRegion>

				</PositronActionBar>

			</PositronActionBarContextProvider>
		</PositronTopActionBarContextProvider>
	);
};
