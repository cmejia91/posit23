/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { JupyterMessageSpec } from './JupyterMessageSpec';

/**
 * Represents an execute_input message on the iopub channel
 *
 * @link https://jupyter-client.readthedocs.io/en/stable/messaging.html#code-inputs
 */
export interface JupyterExecuteInput extends JupyterMessageSpec {
	/** The code to be executed */
	code: string;

	/** The count of executions */
	execution_count: number;  // eslint-disable-line
}
