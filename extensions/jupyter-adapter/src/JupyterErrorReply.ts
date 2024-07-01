/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { JupyterMessageSpec } from './JupyterMessageSpec';

/**
 * Returned by many Jupyter methods when they fail.
 *
 * @link https://jupyter-client.readthedocs.io/en/stable/messaging.html#execution-errors
 */
export interface JupyterErrorReply extends JupyterMessageSpec {
	/** The name of the exception that caused the error, if any */
	ename: string;

	/** A description of the error, if any */
	evalue: string;

	/** A list of traceback frames for the error, if any */
	traceback: Array<string>;
}
