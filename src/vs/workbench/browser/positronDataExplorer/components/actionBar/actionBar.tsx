/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./actionBar';

// React.
import * as React from 'react';

// Other dependencies.
import { localize } from 'vs/nls';
import { PositronActionBar } from 'vs/platform/positronActionBar/browser/positronActionBar';
import { ActionBarRegion } from 'vs/platform/positronActionBar/browser/components/actionBarRegion';
import { ActionBarButton } from 'vs/platform/positronActionBar/browser/components/actionBarButton';
import { PositronActionBarContextProvider } from 'vs/platform/positronActionBar/browser/positronActionBarContext';
import { usePositronDataExplorerContext } from 'vs/workbench/browser/positronDataExplorer/positronDataExplorerContext';
import { LayoutMenuButton } from 'vs/workbench/browser/positronDataExplorer/components/actionBar/components/layoutMenuButton';

/**
 * Constants.
 */
const kPaddingLeft = 8;
const kPaddingRight = 8;

/**
 * Localized strings.
 */
const clearSortButtonTitle = localize('positron.clearSortButtonLabel', "Clear Sorting");
const clearSortButtonDescription = localize('positron.clearSortButtonDescription', "Clear sorting");

/**
 * ActionBar component.
 * @returns The rendered component.
 */
export const ActionBar = () => {
	// Context hooks.
	const context = usePositronDataExplorerContext();

	// Render.
	return (
		<PositronActionBarContextProvider {...context}>
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
							iconId='positron-clear-sorting'
							text={clearSortButtonTitle}
							tooltip={clearSortButtonDescription}
							ariaLabel={clearSortButtonDescription}
							onPressed={async () =>
								await context.instance.tableDataDataGridInstance.clearColumnSortKeys()
							}
						/>
					</ActionBarRegion>
					<ActionBarRegion location='right'>
						<LayoutMenuButton />
					</ActionBarRegion>
				</PositronActionBar>
			</div>
		</PositronActionBarContextProvider>
	);
};
