/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./actionBars';

// React.
import * as React from 'react';
import { PropsWithChildren, useEffect, useState } from 'react'; // eslint-disable-line no-duplicate-imports

// Other dependencies.
import { localize } from 'vs/nls';
import { PositronActionBar } from 'vs/platform/positronActionBar/browser/positronActionBar';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { ActionBarRegion } from 'vs/platform/positronActionBar/browser/components/actionBarRegion';
import { ActionBarButton } from 'vs/platform/positronActionBar/browser/components/actionBarButton';
import { ActionBarFilter } from 'vs/platform/positronActionBar/browser/components/actionBarFilter';
import { ActionBarSeparator } from 'vs/platform/positronActionBar/browser/components/actionBarSeparator';
import { SortingMenuButton } from 'vs/workbench/contrib/positronVariables/browser/components/sortingMenuButton';
import { GroupingMenuButton } from 'vs/workbench/contrib/positronVariables/browser/components/groupingMenuButton';
import { PositronVariablesServices } from 'vs/workbench/contrib/positronVariables/browser/positronVariablesState';
import { PositronActionBarContextProvider } from 'vs/platform/positronActionBar/browser/positronActionBarContext';
import { usePositronVariablesContext } from 'vs/workbench/contrib/positronVariables/browser/positronVariablesContext';
import { PositronModalReactRenderer } from 'vs/workbench/browser/positronModalReactRenderer/positronModalReactRenderer';
import { VariablesInstanceMenuButton } from 'vs/workbench/contrib/positronVariables/browser/components/variablesInstanceMenuButton';
import { DeleteAllVariablesModalDialog } from 'vs/workbench/contrib/positronVariables/browser/modalDialogs/deleteAllVariablesModalDialog';

// Constants.
const kSecondaryActionBarGap = 4;
const kPaddingLeft = 8;
const kPaddingRight = 8;
const kFilterTimeout = 800;

/**
 * Localized strings.
 */
const positronRefreshObjects = localize('positronRefreshObjects', "Refresh objects");
const positronDeleteAllObjects = localize('positronDeleteAllObjects', "Delete all objects");

/**
 * ActionBarsProps interface.
 */
export interface ActionBarsProps extends PositronVariablesServices {
	readonly layoutService: IWorkbenchLayoutService;
}

/**
 * ActionBars component.
 * @param props An ActionBarsProps that contains the component properties.
 * @returns The rendered component.
 */
export const ActionBars = (props: PropsWithChildren<ActionBarsProps>) => {
	// Context hooks.
	const positronVariablesContext = usePositronVariablesContext();

	// State hooks.
	const [filterText, setFilterText] = useState('');

	// Find text change handler.
	useEffect(() => {
		if (filterText === '') {
			positronVariablesContext.activePositronVariablesInstance?.setFilterText('');
			return;
		} else {
			// Start the filter timeout.
			const filterTimeout = setTimeout(() => {
				positronVariablesContext.activePositronVariablesInstance?.setFilterText(
					filterText
				);
			}, kFilterTimeout);

			// Clear the find timeout.
			return () => clearTimeout(filterTimeout);
		}
	}, [filterText, positronVariablesContext.activePositronVariablesInstance]);

	/**
	 * Delete all objects event handler.
	 */
	const deleteAllObjectsHandler = async () => {
		// Create the renderer.
		const renderer = new PositronModalReactRenderer({
			keybindingService: props.keybindingService,
			layoutService: props.layoutService,
			container: props.layoutService.activeContainer
		});

		// Show the delete all variables modal dialog.
		renderer.render(
			<DeleteAllVariablesModalDialog
				renderer={renderer}
				deleteAllVariablesAction={async deleteAllVariablesResult =>
					positronVariablesContext.activePositronVariablesInstance?.requestClear(
						deleteAllVariablesResult.includeHiddenObjects
					)
				}
			/>
		);
	};

	/**
	 * Refresh objects event handler
	 */
	const refreshObjectsHandler = () => {
		positronVariablesContext.activePositronVariablesInstance?.requestRefresh();
	};

	// If there are no instances, return null.
	// TODO@softwarenerd - Render something specific for this case. TBD.
	if (positronVariablesContext.positronVariablesInstances.length === 0) {
		return null;
	}

	// Render.
	return (
		<PositronActionBarContextProvider {...props}>
			<div className='action-bars'>
				<PositronActionBar
					size='small'
					borderTop={true}
					borderBottom={true}
					paddingLeft={kPaddingLeft}
					paddingRight={kPaddingRight}
				>
					<ActionBarRegion location='left'>
						<GroupingMenuButton />
						<SortingMenuButton />
						{/* Disabled for Private Alpha <ActionBarButton iconId='positron-import-data' text='Import Dataset' dropDown={true} /> */}
					</ActionBarRegion>
					<ActionBarRegion location='right'>
						<ActionBarButton
							align='right'
							iconId='positron-refresh'
							tooltip={positronRefreshObjects}
							ariaLabel={positronRefreshObjects}
							onPressed={refreshObjectsHandler}
						/>
						<ActionBarSeparator />
						<ActionBarButton
							align='right'
							iconId='clear-all'
							tooltip={positronDeleteAllObjects}
							ariaLabel={positronDeleteAllObjects}
							onPressed={deleteAllObjectsHandler}
						/>
					</ActionBarRegion>
				</PositronActionBar>
				<PositronActionBar
					size='small'
					borderBottom={true}
					gap={kSecondaryActionBarGap}
					paddingLeft={kPaddingLeft}
					paddingRight={kPaddingRight}
				>
					<ActionBarRegion location='left'>
						<VariablesInstanceMenuButton />
					</ActionBarRegion>
					<ActionBarRegion location='right'>
						<ActionBarFilter
							width={150}
							initialFilterText={filterText}
							onFilterTextChanged={filterText => setFilterText(filterText)} />
					</ActionBarRegion>
				</PositronActionBar>
			</div>
		</PositronActionBarContextProvider>
	);
};
