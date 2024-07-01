/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { JupyterMessageSpec } from './JupyterMessageSpec';

/**
 * Represents an execute_reply from the Jupyter kernel to the front end.
 *
 * @link https://jupyter-client.readthedocs.io/en/stable/messaging.html#request-reply
 */
export interface JupyterExecuteReply extends JupyterMessageSpec {
	/** The status of the execution */
	status: 'ok' | 'error';

	/** Execution counter, monotonically increasing */
	execution_count: number;  // eslint-disable-line

	/** Results for user expressions */
	user_expressions: Map<string, any>;  // eslint-disable-line
}
