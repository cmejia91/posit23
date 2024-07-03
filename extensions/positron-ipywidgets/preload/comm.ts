/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as base from '@jupyter-widgets/base';
import { IIOPubMessage, IOPubMessageType } from '@jupyterlab/services/lib/kernel/messages';
import { JSONObject, JSONValue, UUID } from '@lumino/coreutils';
import { KernelPreloadContext } from '.';
import type { IRuntimeCommMessage, IWidgetCommMessage } from '../../../src/vs/workbench/contrib/positronIPyWidgets/browser/types.d.ts';

/**
 * An IClassicComm that sends/receives messages the notebook  Positron runtime session.
 */
export class Comm implements base.IClassicComm {
	private _on_msg: ((x: any) => void) | undefined;
	private _on_close: ((x: any) => void) | undefined;
	private _callbacks = new Map<string, base.ICallbacks>();

	constructor(
		readonly comm_id: string,
		readonly target_name: string,
		private readonly context: KernelPreloadContext,
	) {
		context.onDidReceiveKernelMessage((message: any) => {
			switch (message.type) {
				case 'comm_msg':
					this.handle_msg(message);
					break;
				case 'comm_close':
					this.handle_close(message);
					break;
			}
		});

	}

	open(_data: JSONValue, _callbacks?: base.ICallbacks | undefined, _metadata?: JSONObject | undefined, _buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): string {
		throw new Error('Method not implemented.');
	}

	send(data: any, callbacks?: base.ICallbacks | undefined, metadata?: JSONObject | undefined, buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): string {
		const msgId = UUID.uuid4();
		console.log('Comm.send', data, callbacks, metadata, buffers, msgId);
		// This seems to be the only requirement so far:
		// 1. Call callbacks.iopub.status with a msg = { content: { execution_state: string } } when
		//   the 'idle' message is received.
		// Raise on unhandled callbacks?
		this.set_callbacks(msgId, callbacks);
		// This should return a string msgId. If this initiated an RPC call, the response should contain parent_header.msg_id with the same value.
		const message: IWidgetCommMessage = {
			type: 'comm_msg',
			comm_id: this.comm_id,
			msg_id: msgId,
			content: data,
		};
		this.context.postKernelMessage(message);
		return msgId;
	}

	close(data?: JSONValue | undefined, callbacks?: base.ICallbacks | undefined, metadata?: JSONObject | undefined, buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined): string {
		console.log('Comm.close', data, callbacks, metadata, buffers);
		if (callbacks) {
			throw new Error('Callbacks not supported in close');
		}
		this.context.postKernelMessage({
			type: 'comm_close',
			content: {
				comm_id: this.comm_id,
			}
		});
		return '';
	}

	on_msg(callback: (x: any) => void): void {
		console.log('Comm.on_msg', callback);
		this._on_msg = callback;
	}

	on_close(callback: (x: any) => void): void {
		console.log('Comm.on_close', callback);
		this._on_close = callback;
	}

	set_callbacks(msgId: string, callbacks: base.ICallbacks | undefined): void {
		// TODO: How are we supposed to handle multiple calls to set_callbacks?

		// if (this._callbacks !== undefined) {
		// 	throw new Error('Callbacks already set');
		// }

		// List of all possible callbacks supported by the shim:
		//
		// callbacks.shell.reply
		// callbacks.input
		// callbacks.iopub.status
		//  assumes msg.header.msg_type === 'status'
		// callbacks.iopub.clear_output
		//  assumes msg.header.msg_type === 'clear_output'
		// callbacks.iopub.output
		//  assumes msg.header.msg_type in ['display_data', 'execute_result', 'stream', 'error']
		//
		// But so far I've only seen callbacks.iopub.status being used by widgets.

		if (callbacks?.shell?.reply) {
			throw new Error('Unimplemented callbacks.shell.reply');
		}
		if (callbacks?.input) {
			throw new Error('Unimplemented callbacks.input');
		}
		if (callbacks?.iopub?.clear_output) {
			throw new Error('Unimplemented callbacks.iopub.clear_output');
		}
		if (callbacks?.iopub?.output) {
			throw new Error('Unimplemented callbacks.iopub.output');
		}
		if (callbacks?.iopub?.status) {
			if (this._callbacks.has(msgId)) {
				throw new Error(`Callbacks already set for message id ${msgId}`);
			}
			this._callbacks.set(msgId, { iopub: { status: callbacks.iopub.status } });
		}
	}

	// TODO: Use any type?
	handle_msg(message: IRuntimeCommMessage): void {
		console.log('Comm.handle_msg', message);
		this._on_msg?.(message);

		// TODO: Maybe this needs to happen on the next tick so that the callbacks are done? Try remove this
		// TODO: Is this correct? Simulate an 'idle' message so that callers know the RPC call is done.
		//  I think it's safe since we know that this method is only called at the end of an RPC call,
		//  which I _think_ happens on idle?
		// setTimeout(() => {
		// TODO: Currently this also fires when the kernel initiates the update...
		//  In that case, I'm not sure if the iopub.status callback set earlier should fire.
		const msgId = (message as any)?.parent_header?.msg_id as string;
		if (msgId) {
			// It's an RPC response, call callbacks.
			const callbacks = this._callbacks.get(msgId);
			if (callbacks) {
				const statusMessage = { content: { execution_state: 'idle' } } as IIOPubMessage<IOPubMessageType>;
				callbacks.iopub?.status?.(statusMessage);
			}
		}
		// }, 0);
	}

	handle_close(message: any): void {
		console.log('Comm.handle_close', message);
		this._on_close?.(message);
	}
}
