/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHmac } from 'crypto';
import { JupyterMessage } from './JupyterMessage';

export function serializeJupyterMessage(message: JupyterMessage, key: string): any[] {
	const payload: Array<Buffer> = [];

	// The delimiter separating the ZeroMQ socket identities from the message body
	payload.push(Buffer.from('<IDS|MSG>'));

	// The signature in HMAC-256
	const hmac = createHmac('sha256', key);
	hmac.update(Buffer.from(JSON.stringify(message.header)));
	hmac.update(Buffer.from(JSON.stringify(message.parent_header)));
	hmac.update(Buffer.from(JSON.stringify(message.metadata)));
	hmac.update(Buffer.from(JSON.stringify(message.content)));
	payload.push(Buffer.from(hmac.digest('hex')));

	// Payload contents
	payload.push(Buffer.from(JSON.stringify(message.header)));
	payload.push(Buffer.from(JSON.stringify(message.parent_header)));
	payload.push(Buffer.from(JSON.stringify(message.metadata)));
	payload.push(Buffer.from(JSON.stringify(message.content)));

	return payload;
}
