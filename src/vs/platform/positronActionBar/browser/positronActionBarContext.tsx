/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { PropsWithChildren, createContext, useContext } from 'react'; // eslint-disable-line no-duplicate-imports
import { PositronActionBarServices, PositronActionBarState, usePositronActionBarState } from 'vs/platform/positronActionBar/browser/positronActionBarState';

/**
 * Create the Positron action bar context.
 */
const PositronActionBarContext = createContext<PositronActionBarState>(undefined!);

/**
 * Export the PositronActionBarContextProvider provider
 */
export const PositronActionBarContextProvider = (props: PropsWithChildren<PositronActionBarServices>) => {
	// Hooks.
	const positronActionBarState = usePositronActionBarState(props);

	// Render.
	return (
		<PositronActionBarContext.Provider value={positronActionBarState}>
			{props.children}
		</PositronActionBarContext.Provider>
	);
};

/**
 * Export usePositronActionBarContext to simplify using the Positron action bar context object.
 */
export const usePositronActionBarContext = () => useContext(PositronActionBarContext);
