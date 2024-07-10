/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IRuntimeClientInstance, RuntimeClientState } from 'vs/workbench/services/languageRuntime/common/languageRuntimeClientInstance';
import { FromWebviewMessage, ICommMessageFromWebview, ToWebviewMessage } from 'vs/workbench/services/languageRuntime/common/positronIPyWidgetsWebviewMessages';
import { ILogService } from 'vs/platform/log/common/log';

/**
 * Interface for communicating with an IPyWidgets webview.
 */
export interface IIPyWidgetsWebviewMessaging {
	onDidReceiveMessage: Event<FromWebviewMessage>;
	postMessage(message: ToWebviewMessage): void;
}

/**
 * An IPyWidgetClientInstance is responsible for routing messages to/from an IPyWidgets webview and a runtime client.
*/
export class IPyWidgetClientInstance extends Disposable {
	private readonly _closeEmitter = new Emitter<void>();

	/** Emitted when the runtime client is closed. */
	onDidClose = this._closeEmitter.event;

	/**
	 * @param _client The wrapped runtime client instance.
	 * @param _messaging The IPyWidgets webview messaging interface.
	 * @param _logService The log service.
	 * @param _rpcMethods A list of methods that should be treated as RPCs. Other methods will be
	 *   sent as fire-and-forget messages.
	 */
	constructor(
		private readonly _client: IRuntimeClientInstance<any, any>,
		private readonly _messaging: IIPyWidgetsWebviewMessaging,
		private readonly _logService: ILogService,
		private readonly _rpcMethods: string[],
	) {
		super();

		// Forward messages from the webview to the runtime client.
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
						`Unhandled message from webview for client ${this._client.getClientId()}: `
						+ JSON.stringify(message)
					);
					break;
			}
		}));

		// Forward messages from the runtime client to the webview.
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
						`Unhandled message from client ${this._client.getClientId()} for webview: `
						+ JSON.stringify(data)
					);
					break;
			}
		}));

		// When the client is closed, notify the webview and emit the close event.
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

	private async handleCommMessage(message: ICommMessageFromWebview) {
		const data = message.data as any;
		if (
			data.method !== undefined &&
			this._rpcMethods.includes(data.method)) {
			// It's a known RPC request, perform the RPC with the client.
			const reply = await this._client.performRpc(data, 5000);

			// Forward the output to the webview.
			this._logService.debug('RECV comm_msg:', reply);
			this._messaging.postMessage({
				type: 'comm_msg',
				comm_id: this._client.getClientId(),
				data: reply,
				request_msg_id: message.msg_id,
			});
		} else {
			// It's not a known RPC request, send a fire-and-forget message to the client.
			this._client.sendMessage(message.data);
		}
	}
}
