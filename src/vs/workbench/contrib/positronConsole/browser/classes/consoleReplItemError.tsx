/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { ConsoleReplItem } from 'vs/workbench/contrib/positronConsole/browser/classes/consoleReplItem';
import { ConsoleReplError, ConsoleReplErrorProps } from 'vs/workbench/contrib/positronConsole/browser/components/consoleReplError';

/**
 * ConsoleReplItemErrorProps interface.
 */
export interface ConsoleReplItemErrorProps extends ConsoleReplErrorProps {
	key: string;
}

/**
 * ConsoleReplItemError class.
 */
export class ConsoleReplItemError implements ConsoleReplItem {
	//#region Constructor

	/**
	 * Constructor.
	 * @param _props A ConsoleReplItemErrorProps the contains the console REPL item props.
	 */
	constructor(private readonly _props: ConsoleReplItemErrorProps) {
	}

	//#endregion Constructor

	//#region ConsoleReplItem Implementation

	get element(): JSX.Element {
		return <ConsoleReplError {...this._props} />;
	}

	//#endregion ConsoleReplItem Implementation
}
