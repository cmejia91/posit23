/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./activityOutputHtml';
import * as React from 'react';
import { ActivityItemOutputHtml } from 'vs/workbench/services/positronConsole/common/classes/activityItemOutputHtml';
import parse from 'react-html-parser';

// ActivityOutputHtml interface.
export interface ActivityOutputHtmlProps {
	activityItemOutputHtml: ActivityItemOutputHtml;
}

/**
 * ActivityOutputHtml component.
 * @param props An ActivityErrorMessageProps that contains the component properties.
 * @returns The rendered component.
 */
export const ActivityOutputHtml = (props: ActivityOutputHtmlProps) => {

	// Render the raw HTML in the div
	return (
		<div className='activity-output-html'>
			{parse(props.activityItemOutputHtml.html)}
		</div>
	);
};
