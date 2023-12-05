/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./actionBar';
import * as React from 'react';
import { useEffect } from 'react'; // eslint-disable-line no-duplicate-imports
import { IsDevelopmentContext } from 'vs/platform/contextkey/common/contextkeys';
import { IReactComponentContainer } from 'vs/base/browser/positronReactRenderer';
import { PositronActionBar } from 'vs/platform/positronActionBar/browser/positronActionBar';
import { ActionBarRegion } from 'vs/platform/positronActionBar/browser/components/actionBarRegion';
import { ActionBarButton } from 'vs/platform/positronActionBar/browser/components/actionBarButton';
import { PositronActionBarContextProvider } from 'vs/platform/positronActionBar/browser/positronActionBarContext';
import { usePositronDataToolContext } from 'vs/workbench/contrib/positronDataTool/browser/positronDataToolContext';

/**
 * Constants.
 */
const kPaddingLeft = 8;
const kPaddingRight = 8;

/**
 * ActionBarProps interface.
 */
interface ActionBarProps {
	readonly reactComponentContainer: IReactComponentContainer;
}

/**
 * ActionBar component.
 * @param props An ActionBarProps that contains the component properties.
 * @returns The rendered component.
 */
export const ActionBar = (props: ActionBarProps) => {
	// Context hooks.
	const positronDataToolContext = usePositronDataToolContext();

	// Constants.
	const showDeveloperUI = IsDevelopmentContext.getValue(positronDataToolContext.contextKeyService);

	// State hooks.

	// Main useEffect hook.
	useEffect(() => {
	}, []);

	// Render.
	return (
		<PositronActionBarContextProvider {...positronDataToolContext}>
			<div className='action-bar'>
				<PositronActionBar
					size='small'
					borderBottom={true}
					paddingLeft={kPaddingLeft}
					paddingRight={kPaddingRight}
				>
					<ActionBarRegion location='left'>
						<ActionBarButton
							disabled={false}
							iconId='positron-left-arrow'
							tooltip='Test tooltip'
							ariaLabel='Text label'
							onClick={() => console.log('HERE')}
						/>
						<ActionBarButton
							iconId='positron-right-arrow'
							tooltip='Test tooltip'
							ariaLabel='Text label'
							onClick={() => console.log('HERE')}
						/>
					</ActionBarRegion>
					<ActionBarRegion location='right'>
						{showDeveloperUI &&
							<ActionBarButton
								iconId='positron-clear-pane'
								align='right'
								tooltip='Test tooltip'
								ariaLabel='Text label'
								onClick={() => console.log('HERE')}
							/>
						}
					</ActionBarRegion>
				</PositronActionBar>
			</div>
		</PositronActionBarContextProvider>
	);
};
