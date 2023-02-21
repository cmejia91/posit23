/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { ConsoleReplItem } from 'vs/workbench/contrib/positronConsole/browser/classes/consoleReplItem';
import { ConsoleReplOutput, ConsoleReplOutputProps } from 'vs/workbench/contrib/positronConsole/browser/components/consoleReplOutput';

/**
 * ConsoleReplItemOutputProps interface.
 */
export interface ConsoleReplItemOutputProps extends ConsoleReplOutputProps {
	key: string;
}

/**
 * ConsoleReplItemOutput class.
 */
export class ConsoleReplItemOutput implements ConsoleReplItem {
	//#region Constructor

	/**
	 * Constructor.
	 * @param _props A ConsoleReplItemOutputProps the contains the console REPL item props.
	 */
	constructor(private readonly _props: ConsoleReplItemOutputProps) {
	}

	//#endregion Constructor

	//#region ConsoleReplItem Implementation

	get element(): JSX.Element {
		return <ConsoleReplOutput {...this._props} />;
	}

	//#endregion ConsoleReplItem Implementation
}
