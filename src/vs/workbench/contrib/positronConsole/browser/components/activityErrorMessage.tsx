/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./activityErrorMessage';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react'; // eslint-disable-line no-duplicate-imports
import { localize } from 'vs/nls';
import { PositronButton } from 'vs/base/browser/ui/positronComponents/button/positronButton';
import { OutputLines } from 'vs/workbench/contrib/positronConsole/browser/components/outputLines';
import { ActivityItemErrorMessage } from 'vs/workbench/services/positronConsole/browser/classes/activityItemErrorMessage';

// ActivityErrorProps interface.
export interface ActivityErrorMessageProps {
	activityItemErrorMessage: ActivityItemErrorMessage;
}

/**
 * ActivityErrorMessage component.
 * @param props An ActivityErrorMessageProps that contains the component properties.
 * @returns The rendered component.
 */
export const ActivityErrorMessage = (props: ActivityErrorMessageProps) => {
	// Reference hooks.
	const activityErrorMessageRef = useRef<HTMLDivElement>(undefined!);

	// State hooks.
	const [showTraceback, setShowTraceback] = useState(false);

	// Traceback useEffect.
	useEffect(() => {
		// Ensure that the component is scrolled into view when traceback is showing.
		if (showTraceback) {
			activityErrorMessageRef.current?.scrollIntoView({ behavior: 'auto' });
		}
	}, [showTraceback]);

	/**
	 * Traceback component.
	 * @returns The rendered component.
	 */
	const Traceback = () => {
		/**
		 * onClick handler.
		 */
		const pressedHandler = () => {
			// Toggle show traceback.
			setShowTraceback(!showTraceback);
		};

		// Render.
		return (
			<div className='traceback'>
				<PositronButton className='toggle-traceback' onPressed={pressedHandler}>
					{showTraceback ?
						<>
							<div className='expansion-indicator codicon codicon-positron-triangle-down'></div>
							<div className='link-text'>{localize('positronHideTraceback', "Hide Traceback")}</div>

						</> :
						<>
							<div className='expansion-indicator codicon codicon-positron-triangle-right'></div>
							<div className='link-text'>{localize('positronShowTraceback', "Show Traceback")}</div>
						</>
					}
				</PositronButton>
				{showTraceback &&
					<div className='traceback-lines'>
						<div />
						<div>
							<OutputLines outputLines={props.activityItemErrorMessage.tracebackOutputLines} />
						</div>
					</div>
				}
			</div>
		);
	};

	// Render.
	return (
		<div ref={activityErrorMessageRef} className='activity-error-message'>
			<div className='error-bar'></div>
			<div className='error-information'>
				{props.activityItemErrorMessage.messageOutputLines.length > 0 &&
					<OutputLines outputLines={props.activityItemErrorMessage.messageOutputLines} />
				}
				{props.activityItemErrorMessage.tracebackOutputLines.length > 0 &&
					<Traceback />
				}
			</div>
		</div>
	);
};
