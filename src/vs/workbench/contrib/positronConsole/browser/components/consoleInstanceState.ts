/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { useStateRef } from 'vs/base/browser/ui/react/useStateRef';

/**
 * ConsoleInstanceState interface.
 */
export interface ConsoleInstanceState {
	getScrollLocked(): boolean;
	setScrollLocked(value: boolean): void;
}

/**
 * The useConsoleInstanceState custom hook.
 * @returns The hook.
 */
export const useConsoleInstanceState = (): ConsoleInstanceState => {
	// Hooks.
	const [, setScrollLocked, scrollLockedRef] = useStateRef(false);

	// Return the console instance state.
	return {
		getScrollLocked: () => scrollLockedRef.current,
		setScrollLocked: setScrollLocked
	};
};
