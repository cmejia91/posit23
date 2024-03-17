/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./topActionBarCustomFolderMenu';

// React.
import * as React from 'react';
import { KeyboardEvent, useRef } from 'react'; // eslint-disable-line no-duplicate-imports

// Other dependencies.
import { localize } from 'vs/nls';
import { useRegisterWithActionBar } from 'vs/platform/positronActionBar/browser/useRegisterWithActionBar';
import { usePositronTopActionBarContext } from 'vs/workbench/browser/parts/positronTopActionBar/positronTopActionBarContext';
import { showCustomFolderModalPopup } from 'vs/workbench/browser/parts/positronTopActionBar/customFolderModalPopup/customFolderModalPopup';

/**
 * Localized strings.
 */
const positronFolderMenu = localize('positronFolderMenu', "Folder Commands");

/**
 * TopActionBarCustonFolderMenu component.
 * @returns The rendered component.
 */
export const TopActionBarCustonFolderMenu = () => {
	// Context hooks.
	const positronTopActionBarContext = usePositronTopActionBarContext();

	// Reference hooks.
	const ref = useRef<HTMLDivElement>(undefined!);

	// Participate in roving tabindex.
	useRegisterWithActionBar([ref]);

	/**
	 * Shows the custom folder modal popup.
	 */
	const showPopup = () => {
		ref.current.setAttribute('aria-expanded', 'true');
		showCustomFolderModalPopup({
			...positronTopActionBarContext,
			...{
				container: positronTopActionBarContext.layoutService.mainContainer,
				anchor: ref.current
			}
		}).then(() => {
			ref.current.removeAttribute('aria-expanded');
		});
	};

	/**
	 * onKeyDown event handler.
	 */
	const keyDownHandler = (e: KeyboardEvent<HTMLDivElement>) => {
		switch (e.code) {
			case 'Space':
			case 'Enter':
				showPopup();
				break;
		}
	};

	/**
	 * onClick event handler.
	 */
	const clickHandler = () => {
		showPopup();
	};

	// Render.
	return (
		<div ref={ref} className='top-action-bar-custom-folder-menu' role='button' tabIndex={0} onKeyDown={keyDownHandler} onClick={clickHandler} aria-label={positronFolderMenu} aria-haspopup='menu'>
			<div className='left' aria-hidden='true'>
				<div className='label'>
					<div className={'action-bar-button-icon codicon codicon-folder'} />
					{positronTopActionBarContext.workspaceFolder &&
						<div className='label'>{positronTopActionBarContext.workspaceFolder ? positronTopActionBarContext.workspaceFolder.name : ''}</div>
					}

				</div>
			</div>
			<div className='right' aria-hidden='true'>
				<div className='chevron codicon codicon-chevron-down' />
			</div>
		</div>
	);
};
