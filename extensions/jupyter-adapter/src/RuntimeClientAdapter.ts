/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as positron from 'positron';
import * as vscode from 'vscode';
import { JupyterKernel } from './JupyterKernel';

import { JupyterMessagePacket } from './JupyterMessagePacket';
import { JupyterCommMsg } from './JupyterCommMsg';
import { JupyterCommClose } from './JupyterCommClose';
import { PromiseHandles, delay } from './utils';

/**
 * Adapts a Positron Language Runtime client widget to a Jupyter kernel.
 */
export class RuntimeClientAdapter {

	// Event emitter for state changes
	private readonly _state: vscode.EventEmitter<positron.RuntimeClientState>;
	private _currentState: positron.RuntimeClientState;
	private _disposables: vscode.Disposable[] = [];
	onDidChangeClientState: vscode.Event<positron.RuntimeClientState>;

	constructor(
		private readonly _id: string,
		private readonly _type: positron.RuntimeClientType,
		private readonly _params: object,
		private readonly _kernel: JupyterKernel,
		private readonly _server_comm: boolean) {

		// Wire event handlers for state changes
		this._currentState = positron.RuntimeClientState.Uninitialized;
		this._state = new vscode.EventEmitter<positron.RuntimeClientState>();
		this.onDidChangeClientState = this._state.event;
		this._disposables.push(this.onDidChangeClientState((e) => {
			this._currentState = e;
		}));

		// Listen to messages from the kernel so we can sort out the ones
		// that are for this comm channel.
		this.onMessage = this.onMessage.bind(this);
		this._kernel.addListener('message', this.onMessage);

		// Bind to status stream from kernel
		this.onStatus = this.onStatus.bind(this);
		this._kernel.addListener('status', this.onStatus);
	}

	/**
	 * Opens the communications channel between the client and the runtime.
	 */
	public async open(): Promise<void> {
		// Ask the kernel to open a comm channel for us
		this._state.fire(positron.RuntimeClientState.Opening);
		this._kernel.openComm(this._type, this._id, this._params);

		const out = new PromiseHandles<void>();
		let connected = false;

		const handler = this.onDidChangeClientState(state => {
			if (state === positron.RuntimeClientState.Connected) {
				out.resolve();
				handler.dispose();
				connected = true;
			}
		});

		await Promise.race([
			out.promise,
			delay(20000),
		]);

		if (!connected) {
			const err = `Timeout while connecting to comm ${this._id}`;
			this._kernel.log(err);
			out.reject(new Error(err));
		}

		return out.promise;
	}

	/**
	 * Returns the unique ID of this runtime client.
	 */
	public getId(): string {
		return this._id;
	}

	/**
	 * Gets the current state of the runtime client.
	 */
	public getClientState(): positron.RuntimeClientState {
		return this._currentState;
	}

	/**
	 * Returns the client ID
	 */
	public getClientId(): string {
		return this._id;
	}

	/**
	 * Returns the type of the client
	 */
	public getClientType(): positron.RuntimeClientType {
		return this._type;
	}

	/**
	 * Closes the communications channel between the client and the runtime.
	 */
	public close() {
		this._state.fire(positron.RuntimeClientState.Closing);
		this._kernel.closeComm(this._id);
	}

	/**
	 * Handles a Jupyter message. If the message is a comm message for this
	 * comm channel, it is forwarded to the client.
	 *
	 * @param msg The message received from the kernel.
	 */
	private onMessage(msg: JupyterMessagePacket) {
		const message = msg.message;
		switch (msg.msgType) {
			case 'comm_open':
				// If not a server comm, resolve immediately. If a
				// server comm, we'll resolve when we get the
				// notification message from the server indicating
				// that it's ready to accept connections.
				if (!this._server_comm) {
					this._state.fire(positron.RuntimeClientState.Connected);
				}
				break;
			case 'comm_msg':
				this.onCommMsg(msg, message as JupyterCommMsg);
				break;
			case 'comm_close':
				this.onCommClose(msg, message as JupyterCommClose);
				break;
		}
		// Ignore other message types
	}

	/**
	 * Responds to a change in the kernel status.
	 *
	 * @param status The new kernel status
	 */
	onStatus(status: positron.RuntimeState) {
		// If the kernel exits while we are connected, we are now closed
		if (status === positron.RuntimeState.Exited &&
			this._currentState === positron.RuntimeClientState.Connected) {
			this._state.fire(positron.RuntimeClientState.Closed);
		}
	}

	/**
	 * Process a comm_msg message from the kernel. This usually represents
	 * an event from the server that should be forwarded to the client, or
	 * a response to a request from the client.
	 *
	 * @param _msg The raw message packet received from the kernel.
	 * @param message The contents of the message received from the kernel.
	 */
	private onCommMsg(_msg: JupyterMessagePacket, message: JupyterCommMsg) {
		// Ignore messages targeted at other comm channels
		if (message.comm_id !== this._id) {
			return;
		}

		if (this._currentState === positron.RuntimeClientState.Opening) {
			this._state.fire(positron.RuntimeClientState.Connected);

			// Swallow server init message
			if (this._server_comm && message.data.msg_type === 'server_started') {
				return;
			}

			// Otherwise fall through, though this shouldn't happen: if
			// not a server comm, we normally switch to a connected state
			// earlier, before receiving any messages.
		}

		// TODO: forward message to client
	}

	/**
	 * Process a comm_close message from the kernel. This should be
	 * somewhat rare, because most channel closures should be initiated
	 * by the client.
	 *
	 * @param _msg The raw message packet received from the kernel.
	 * @param message The contents of the message received from the kernel.
	 */
	private onCommClose(_msg: JupyterMessagePacket, message: JupyterCommClose) {
		// Ignore messages targeted at other comm channels
		if (message.comm_id !== this._id) {
			return;
		}
		// Update the current state to closed
		this._state.fire(positron.RuntimeClientState.Closed);
	}

	/**
	 * Disposes of the runtime client by closing the comm channel.
	 */
	async dispose() {
		this._kernel.removeListener('message', this.onMessage);
		this._kernel.removeListener('status', this.onStatus);

		// If the comm channel is still open, close it from our end.
		if (this.getClientState() === positron.RuntimeClientState.Connected) {
			this._state.fire(positron.RuntimeClientState.Closing);
			await this._kernel.closeComm(this._id);
		}
	}
}
