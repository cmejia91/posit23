/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./columnHeader';
import * as React from 'react';
import { usePositronDataToolContext } from 'vs/workbench/contrib/positronDataTool/browser/positronDataToolContext';

/**
 * ColumnHeaderProps interface.
 */
interface ColumnHeaderProps {
	index: number;
}

/**
 * ColumnHeader component.
 * @param props A ColumnHeaderProps that contains the component properties.
 * @returns The rendered component.
 */
export const ColumnHeader = (props: ColumnHeaderProps) => {
	// Context hooks.
	const context = usePositronDataToolContext();

	// Render.
	return (
		<div className='column-header'>
			<div className='title'>{context.instance.columns[props.index].columnSchema.name}</div>
		</div>
	);
};
