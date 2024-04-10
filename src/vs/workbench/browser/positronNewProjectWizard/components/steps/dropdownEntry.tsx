/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./dropdownEntry';

// React.
import * as React from 'react';

/**
 * DropdownEntryProps interface.
 */
interface DropdownEntryProps {
	icon?: string;
	title: string;
	subtitle: string;
	group?: string;
}

/**
 * DropdownEntry component.
 * @param props The dropdown entry props.
 * @returns The rendered component
 */
export const DropdownEntry = (props: DropdownEntryProps) => {
	// Render.
	return (
		<div className='dropdown-entry'>
			{props.icon ? <div className='dropdown-entry-icon'>{props.icon}</div> : null}
			<div className='dropdown-entry-title'>
				{props.title}
			</div>
			<div className='dropdown-entry-subtitle'>
				{props.subtitle}
			</div>
			{props.group ? <div className='dropdown-entry-group'>{props.group}</div> : null}
		</div>
	);
};
