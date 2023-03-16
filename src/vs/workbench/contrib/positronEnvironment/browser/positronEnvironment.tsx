/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./positronEnvironment';
import * as React from 'react';
import { PropsWithChildren, useEffect, useState } from 'react'; // eslint-disable-line no-duplicate-imports
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IReactComponentContainer } from 'vs/base/browser/positronReactRenderer';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { ActionBars } from 'vs/workbench/contrib/positronEnvironment/browser/components/actionBars';
import { EnvironmentList } from 'vs/workbench/contrib/positronEnvironment/browser/components/environmentList';
import { PositronEnvironmentServices } from 'vs/workbench/contrib/positronEnvironment/browser/positronEnvironmentState';
import { PositronEnvironmentContextProvider } from 'vs/workbench/contrib/positronEnvironment/browser/positronEnvironmentContext';
import { IPositronEnvironmentService } from 'vs/workbench/services/positronEnvironment/common/interfaces/positronEnvironmentService';

/**
 * PositronEnvironmentProps interface.
 */
export interface PositronEnvironmentProps extends PositronEnvironmentServices {
	// Services.
	readonly commandService: ICommandService;
	readonly configurationService: IConfigurationService;
	readonly contextKeyService: IContextKeyService;
	readonly contextMenuService: IContextMenuService;
	readonly keybindingService: IKeybindingService;
	readonly layoutService: IWorkbenchLayoutService;
	readonly positronEnvironmentService: IPositronEnvironmentService;
	readonly reactComponentContainer: IReactComponentContainer;
}

/**
 * PositronEnvironment component.
 * @param props A PositronEnvironmentProps that contains the component properties.
 * @returns The rendered component.
 */
export const PositronEnvironment = (props: PropsWithChildren<PositronEnvironmentProps>) => {
	// Hooks.
	const [width, setWidth] = useState(props.reactComponentContainer.width);
	const [height, setHeight] = useState(props.reactComponentContainer.height);

	// Add IReactComponentContainer event handlers.
	useEffect(() => {
		// Create the disposable store for cleanup.
		const disposableStore = new DisposableStore();

		// Add the onSizeChanged event handler.
		disposableStore.add(props.reactComponentContainer.onSizeChanged(size => {
			setWidth(size.width);
			setHeight(size.height);
		}));

		// Add the onVisibilityChanged event handler.
		disposableStore.add(props.reactComponentContainer.onVisibilityChanged(visibility => {
			// TODO@softwarenerd - For the moment, doing nothing.
		}));

		// Return the cleanup function that will dispose of the event handlers.
		return () => disposableStore.dispose();
	}, []);

	// Render.
	return (
		<PositronEnvironmentContextProvider {...props}>
			<div className='positron-environment'>
				<ActionBars {...props} />
				<EnvironmentList width={width} height={height - 64} />
			</div>
		</PositronEnvironmentContextProvider>
	);
};
