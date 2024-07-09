/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IRuntimeClientInstance, RuntimeClientState } from 'vs/workbench/services/languageRuntime/common/languageRuntimeClientInstance';
import { ICommMessage, IIPyWidgetsMessaging } from 'vs/workbench/services/languageRuntime/common/positronIPyWidgetsMessaging';
import { ILogService } from 'vs/platform/log/common/log';

export class IPyWidgetClientInstance extends Disposable {
	private readonly _closeEmitter = new Emitter<void>();

	onDidClose = this._closeEmitter.event;

	constructor(
		private readonly _client: IRuntimeClientInstance<any, any>,
		private readonly _messaging: IIPyWidgetsMessaging,
		private readonly _logService: ILogService,
		private readonly _rpcMethods: string[],
	) {
		super();

		// Forward messages from the notebook editor to the client.
		this._register(_messaging.onDidReceiveMessage(async (message) => {
			// Only handle messages for this client.
			if (!('comm_id' in message) || message.comm_id !== this._client.getClientId()) {
				return;
			}

			switch (message.type) {
				case 'comm_msg':
					this.handleCommMessage(message);
					break;
				default:
					this._logService.warn(
						`Unhandled message from notebook for client ${this._client.getClientId()}: `
						+ JSON.stringify(message)
					);
					break;
			}
		}));

		// Forward messages from the client to the notebook editor.
		this._register(_client.onDidReceiveData(data => {
			this._logService.debug('RECV comm_msg:', data);

			switch (data.method) {
				case 'update':
					this._messaging.postMessage({
						type: 'comm_msg',
						comm_id: this._client.getClientId(),
						data: data,
					});
					break;
				default:
					this._logService.warn(
						`Unhandled message from client ${this._client.getClientId()} for notebook: `
						+ JSON.stringify(data)
					);
					break;
			}
		}));

		// If the client is closed, emit the close event.
		const stateChangeEvent = Event.fromObservable(_client.clientState);
		this._register(stateChangeEvent(state => {
			if (state === RuntimeClientState.Closed) {
				this._messaging.postMessage({
					type: 'comm_close',
					comm_id: this._client.getClientId(),
				});
				this._closeEmitter.fire();
			}
		}));
	}

	private async handleCommMessage(message: ICommMessage) {
		// TODO: If we do separate messages for FromWebview and ToWebview we could simplify this.
		const msgId = message.msg_id;
		const method = message.data.method;
		if (
			msgId !== undefined &&
			method !== undefined &&
			this._rpcMethods.includes(method)) {
			// It's a known RPC request, perform the RPC with the client.
			const reply = await this._client.performRpc(message.data, 5000);

			// Forward the output to the notebook editor.
			this._logService.debug('RECV comm_msg:', reply);
			this._messaging.postMessage({
				type: 'comm_msg',
				comm_id: this._client.getClientId(),
				data: reply,
				msg_id: msgId,
			});
		} else {
			// Send a fire-and-forget message to the client.
			this._client.sendMessage(message);
		}
	}
}
