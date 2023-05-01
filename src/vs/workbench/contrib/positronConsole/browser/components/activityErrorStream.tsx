/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./activityErrorStream';
import * as React from 'react';
import { OutputLines } from 'vs/workbench/contrib/positronConsole/browser/components/outputLines';
import { ActivityItemErrorStream } from 'vs/workbench/services/positronConsole/common/classes/activityItemErrorStream';

// ActivityErrorStreamProps interface.
export interface ActivityErrorStreamProps {
	activityItemErrorStream: ActivityItemErrorStream;
}

/**
 * ActivityErrorStream component.
 * @param activityItemErrorStream The ActivityItemErrorStream to render.
 * @returns The rendered component.
 */
export const ActivityErrorStream = ({ activityItemErrorStream }: ActivityErrorStreamProps) => {
	// Render.
	return (
		<div className='activity-error-stream'>
			<OutputLines outputLines={activityItemErrorStream.outputLines} />
		</div>
	);
};
