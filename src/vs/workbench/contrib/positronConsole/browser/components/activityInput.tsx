/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./activityInput';
import * as React from 'react';
import { useState } from 'react'; // eslint-disable-line no-duplicate-imports
import { DisposableStore } from 'vs/base/common/lifecycle';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { positronClassNames } from 'vs/base/common/positronUtilities';
import { OutputRun } from 'vs/workbench/contrib/positronConsole/browser/components/outputRun';
import { ActivityItemInput } from 'vs/workbench/services/positronConsole/common/classes/activityItemInput';

// ActivityInputProps interface.
export interface ActivityInputProps {
	fontInfo: FontInfo;
	activityItemInput: ActivityItemInput;
}

/**
 * ActivityInput component.
 * @param props An ActivityInputProps that contains the component properties.
 * @returns The rendered component.
 */
export const ActivityInput = (props: ActivityInputProps) => {
	// Hooks.
	const [executing, setExecuting] = useState(props.activityItemInput.executing);
	const [codeOutputLines, setCodeOutputLines] = useState(props.activityItemInput.codeOutputLines);

	// Main useEffect.
	React.useEffect(() => {
		// Create the disposable store for cleanup.
		const disposableStore = new DisposableStore();

		// Listen for the changes to the activity item input.
		disposableStore.add(props.activityItemInput.onChanged(() => {
			setExecuting(props.activityItemInput.executing);
			setCodeOutputLines(props.activityItemInput.codeOutputLines);
		}));

		// Return the cleanup function that will dispose of the disposables.
		return () => disposableStore.dispose();
	}, []);

	// Calculate the prompt width.
	const promptWidth = Math.ceil(
		(props.activityItemInput.inputPrompt.length + 1) *
		props.fontInfo.typicalHalfwidthCharacterWidth
	);

	// Generate the class names.
	const classNames = positronClassNames(
		'activity-input',
		{ 'executing': executing }
	);

	// Render.
	return (
		<div className={classNames}>
			{executing && <div className='progress-bar' />}
			{codeOutputLines.map((outputLine, index) =>
				<div key={outputLine.id}>
					<span style={{ width: promptWidth }}>
						{(index === 0 ?
							props.activityItemInput.inputPrompt :
							props.activityItemInput.continuationPrompt) + ' '
						}
					</span>
					{outputLine.outputRuns.map(outputRun =>
						<OutputRun key={outputRun.id} outputRun={outputRun} />
					)}
				</div>
			)}
		</div>
	);
};
