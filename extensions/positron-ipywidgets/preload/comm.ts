/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as base from '@jupyter-widgets/base';
import { JSONObject, JSONValue, UUID } from '@lumino/coreutils';
import { Disposable } from 'vscode-notebook-renderer/events';
import type { IIPyWidgetsMessaging, ICommMessage, ICommClose } from '../../../src/vs/workbench/services/languageRuntime/common/positronIPyWidgetsMessaging';
import { KernelMessage } from '@jupyterlab/services';

/**
 * An IClassicComm that interfaces with the main thread Positron IPyWidgets service.
 */
export class Comm implements base.IClassicComm, Disposable {
	private _disposables: Disposable[] = [];
	private _on_msg: ((x: KernelMessage.ICommMsgMsg) => void) | undefined;
	private _on_close: ((x: KernelMessage.ICommCloseMsg) => void) | undefined;
	private _callbacks = new Map<string, base.ICallbacks>();

	/**
	 * @param comm_id The ID of the comm.
	 * @param target_name The target name of the comm.
	 * @param messaging The messaging interface used to communicate with the main thread.
	 */
	constructor(
		readonly comm_id: string,
		readonly target_name: string,
		private readonly messaging: IIPyWidgetsMessaging,
	) {
		// Handle messages from the runtime.
		this._disposables.push(messaging.onDidReceiveMessage(message => {
			switch (message.type) {
				case 'comm_msg':
					this.handle_msg(message);
					break;
				case 'comm_close':
					this.handle_close(message);
					break;
			}
		}));
	}

	/**
	 * Open a sibling comm in the runtime.
	 */
	open(
		_data: JSONValue,
		_callbacks?: base.ICallbacks,
		_metadata?: JSONObject,
		_buffers?: ArrayBuffer[] | ArrayBufferView[]
	): string {
		throw new Error('Method not implemented.');
	}

	/**
	 * Send a message to the sibling comm in the runtime.
	 *
	 * @param data The data to send.
	 * @param callbacks Callbacks to handle the response.
	 * @param metadata Metadata to send with the message - not currently used.
	 * @param buffers Buffers to send with the message - not currently used.
	 * @returns The message ID.
	 */
	send(
		data: any,
		callbacks?: base.ICallbacks,
		metadata?: JSONObject,
		buffers?: ArrayBuffer[] | ArrayBufferView[]
	): string {

		// Callbacks are used to handle responses from the runtime.
		// We currently only support the iopub.status callback since it's needed by widget libraries.
		// (The iopub.status callback is called in the handle_msg method.)
		// An error will be thrown if any other callback is received.

		if (callbacks?.shell?.reply) {
			throw new Error('Callback shell.reply not implemented');
		}

		if (callbacks?.input) {
			throw new Error('Callback input not implemented');
		}

		if (callbacks?.iopub?.clear_output) {
			throw new Error('Callback iopub.clear_output not implemented');
		}

		if (callbacks?.iopub?.output) {
			throw new Error('Callback iopub.output not implemented');
		}

		const msgId = UUID.uuid4();

		if (callbacks?.iopub?.status) {
			if (this._callbacks.has(msgId)) {
				throw new Error(`Callbacks already set for message id ${msgId}`);
			}
			this._callbacks.set(msgId, { iopub: { status: callbacks.iopub.status } });
		}

		console.log('Comm.send', this.comm_id, data, callbacks, metadata, buffers, msgId);

		this.messaging.postMessage({
			type: 'comm_msg',
			comm_id: this.comm_id,
			msg_id: msgId,
			data: data,
		});

		return msgId;
	}

	close(data?: JSONValue | undefined, callbacks?: base.ICallbacks | undefined, metadata?: JSONObject | undefined, buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): string {
		console.log('Comm.close', data, callbacks, metadata, buffers);
		if (callbacks) {
			throw new Error('Callbacks not supported in close');
		}
		this.messaging.postMessage({
			type: 'comm_close',
			comm_id: this.comm_id,
		});
		return '';
	}

	/**
	 * Register a message handler.
	 *
	 * @param callback Callback, which is given a message.
	 */
	on_msg(callback: (x: any) => void): void {
		console.log('Comm.on_msg', callback);
		this._on_msg = callback;
	}

	/**
	 * Register a handler for when the comm is closed by the backend.
	 *
	 * @param callback Callback, which is given a message.
	 */
	on_close(callback: (x: any) => void): void {
		console.log('Comm.on_close', callback);
		this._on_close = callback;
	}

	/**
	 * Handle a message from the runtime.
	 *
	 * @param message The message.
	 */
	private handle_msg(message: ICommMessage): void {
		console.log('Comm.handle_msg', message);
		this._on_msg?.({
			content: {
				comm_id: this.comm_id,
				data: message.data,
			},
			// Stub the rest of the interface - these are not currently used by widget libraries.
			channel: 'iopub',
			header: {
				date: '',
				msg_id: message.msg_id ?? '',
				msg_type: message.type,
				session: '',
				username: '',
				version: '',
			},
			parent_header: {
				// msg_id: message.msg_id
			},
			metadata: {},
		});

		// Simulate an 'idle' status message after an RPC response is received from the runtime.
		const msgId = message.msg_id;
		if (msgId) {
			// It's an RPC response, call the callbacks.
			const callbacks = this._callbacks.get(msgId);
			if (callbacks) {
				// Call the iopub.status callback with a stubbed 'idle' status message.
				callbacks.iopub?.status?.({
					content: {
						execution_state: 'idle'
					},
					// Stub the rest of the interface - these are not currently used by widget libraries.
					channel: 'iopub',
					header: {
						date: '',
						msg_id: msgId,
						msg_type: 'status',
						session: '',
						username: '',
						version: '',
					},
					parent_header: {},
					metadata: {},
				});
			}
		}
	}

	/**
	 * Handle a close message from the runtime.
	 *
	 * @param message The close message.
	 */
	private handle_close(message: ICommClose): void {
		console.log('Comm.handle_close', message);
		this._on_close?.({
			content: {
				comm_id: this.comm_id,
				data: {},
			},
			channel: 'shell',
			header: {
				date: '',
				msg_id: '',
				msg_type: 'comm_close',
				session: '',
				username: '',
				version: '',
			},
			parent_header: {},
			metadata: {},
		});
	}

	dispose(): void {
		for (const disposable of this._disposables) {
			disposable.dispose();
		}
		this._disposables = [];
	}
}
