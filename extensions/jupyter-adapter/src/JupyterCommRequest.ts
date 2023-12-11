/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { JupyterMessageSpec } from './JupyterMessageSpec';

/**
 * Represents an rpc_request from the kernel. This is an StdIn extension.
 *
 * @link https://jupyter-client.readthedocs.io/en/stable/messaging.html#messages-on-the-stdin-router-dealer-channel
 */
export interface JupyterCommRequest extends JupyterMessageSpec {
	id: string,
	method: string,
	params: any,
}
