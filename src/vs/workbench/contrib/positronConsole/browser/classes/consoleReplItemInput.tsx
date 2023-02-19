/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { ConsoleReplItem } from 'vs/workbench/contrib/positronConsole/browser/classes/consoleReplItem';
import { ConsoleReplInput, ConsoleReplInputProps } from 'vs/workbench/contrib/positronConsole/browser/components/consoleReplInput';

/**
 * ConsoleReplItemInputProps interface.
 */
export interface ConsoleReplItemInputProps extends ConsoleReplInputProps {
	key: string;
}

/**
 * ConsoleReplItemInput class.
 */
export class ConsoleReplItemInput implements ConsoleReplItem {
	//#region Constructor

	/**
	 * Constructor.
	 * @param _props A ConsoleReplItemInputProps the contains the console REPL item props.
	 */
	constructor(private readonly _props: ConsoleReplItemInputProps) {
	}

	//#endregion Constructor

	//#region ConsoleReplItem Implementation

	get element(): JSX.Element {
		return <ConsoleReplInput {...this._props} />;
	}

	//#endregion ConsoleReplItem Implementation
}
