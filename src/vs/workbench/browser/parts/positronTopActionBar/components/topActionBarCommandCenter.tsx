/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./topActionBarCommandCenter';
import * as React from 'react';
import { MouseEvent } from 'react'; // eslint-disable-line no-duplicate-imports
import { AnythingQuickAccessProviderRunOptions } from 'vs/platform/quickinput/common/quickAccess';
import { usePositronTopActionBarContext } from 'vs/workbench/browser/parts/positronTopActionBar/positronTopActionBarContext';

/**
 * TopActionBarCommandCenter component.
 * @returns The rendered component.
 */
export const TopActionBarCommandCenter = () => {
	// Hooks.
	const positronTopActionBarContext = usePositronTopActionBarContext();

	// Ckick handler.
	const clickHandler = (e: MouseEvent<HTMLElement>) => {
		// Consume the event.
		e.preventDefault();
		e.stopPropagation();

		// Show the quick access menu.
		positronTopActionBarContext.quickInputService.quickAccess.show(undefined, {
			providerOptions: {
				includeHelp: true,
			} as AnythingQuickAccessProviderRunOptions
		});
	};

	// DropDownCkick handler.
	const dropDownClickHandler = (e: MouseEvent<HTMLButtonElement>) => {
		// Consume the event.
		e.preventDefault();
		e.stopPropagation();

		// Show the quick access menu.
		positronTopActionBarContext.quickInputService.quickAccess.show('?');
	};

	// Render.
	return (
		<div className='top-action-bar-command-center' onClick={(e) => clickHandler(e)}>
			<div className='left'>
				<div className='codicon codicon-positron-search' />
			</div>
			<div className='center'>
				<button className='search' onClick={(e) => clickHandler(e)}>
					<div className='action-bar-button-text'>Search</div>
				</button>
			</div>
			<div className='right'>
				<button className='drop-down' onClick={(e) => dropDownClickHandler(e)}>
					<div className='icon codicon codicon-positron-chevron-down' />
				</button>
			</div>
		</div>
	);
};
