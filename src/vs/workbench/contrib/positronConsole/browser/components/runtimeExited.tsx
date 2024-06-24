/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./runtimeExited';
import * as React from 'react';
import { OutputLines } from 'vs/workbench/contrib/positronConsole/browser/components/outputLines';
import { RuntimeItemExited } from 'vs/workbench/services/positronConsole/browser/classes/runtimeItemExited';

// RuntimeExitedProps interface.
export interface RuntimeExitedProps {
	runtimeItemExited: RuntimeItemExited;
}

/**
 * RuntimeExited component.
 * @param props A RuntimeExitedProps that contains the component properties.
 * @returns The rendered component.
 */
export const RuntimeExited = (props: RuntimeExitedProps) => {

	// Render.
	return (
		<div className='runtime-exited'>
			<OutputLines outputLines={props.runtimeItemExited.outputLines} />
		</div>
	);
};
