/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { JupyterKernel } from './JupyterKernel';
import { JupyterMessagePacket } from './JupyterMessagePacket';
import { JupyterSockets } from './JupyterSockets';
import { JupyterMessageSpec } from './JupyterMessageSpec';
import { uuidv4 } from './utils';

/**
 * Represents a generic Jupyter RPC request/response pair; generic over the
 * request (T) and response (U) types.
 */
export class JupyterRpc<T extends JupyterMessageSpec, U extends JupyterMessageSpec> {
	public id: string;
	constructor(
		readonly requestType: string,
		readonly request: T,
		readonly responseType: string,
		readonly responseCallback: (response: U) => void,
	) {
		// Generate a unique ID for this request
		this.id = uuidv4();
	}

	/**
	 * Send the request to the given kernel.
	 *
	 * @param k The kernel to send the request to
	 */
	public send(k: JupyterKernel) {
		const packet: JupyterMessagePacket = {
			type: 'jupyter-message',
			msgId: this.id,
			msgType: this.requestType,
			originId: '',
			message: this.request,
			when: new Date().toISOString(),
			socket: JupyterSockets.shell
		};
		k.sendMessage(packet);
	}

	/**
	 * Process a response to this request.
	 *
	 * @param response The response to the request
	 */
	public recv(response: U) {
		this.responseCallback(response);
	}
}

