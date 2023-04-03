/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IRuntimeClientInstance, RuntimeClientState } from 'vs/workbench/services/languageRuntime/common/languageRuntimeClientInstance';
import { Event, Emitter } from 'vs/base/common/event';
import { DeferredPromise } from 'vs/base/common/async';

/**
 * The possible states for the plot client instance
 */
export enum PlotClientState {
	/** The plot client has never rendered a plot */
	Unrendered = 'unrendered',

	/** The plot client is currently rendering a plot */
	Rendering = 'rendering',

	/** The plot client has rendered a plot */
	Rendered = 'rendered',

	/** The plot client is closed (disconnected); it cannot render any further plots */
	Closed = 'closed',
}

/**
 * The possible types of messages that can be sent to the language runtime as
 * requests to the plot backend.
 */
export enum PlotClientMessageTypeInput {
	/** A request to render the plot at a specific size */
	Render = 'render',
}

/**
 * The possible types of messages that can be sent from the plot backend.
 */
export enum PlotClientMessageTypeOutput {
	/** Rendered plot output */
	Image = 'image',

	/** A processing error */
	Error = 'error',
}

/**
 * A message used to send data to the language runtime plot client.
 */
export interface IPlotClientMessageInput {
	msg_type: PlotClientMessageTypeInput;
}

/**
 * A message used to request that a plot render at a specific size.
 */
export interface IPlotClientMessageRender extends IPlotClientMessageInput {
	/** The plot height, in pixels */
	height: number;

	/** The plot width, in pixels */
	width: number;

	/**
	 * The pixel ratio of the display device; typically 1 for standard displays,
	 * 2 for retina/high DPI displays, etc.
	 */
	pixel_ratio: number;
}

/**
 * A message used to receive data from the language runtime plot client.
 */
export interface IPlotClientMessageOutput {
	msg_type: PlotClientMessageTypeOutput;
}

/**
 * A message used to receive rendered plot output.
 */
export interface IPlotClientMessageImage extends IPlotClientMessageOutput {
	/**
	 * The data for the plot image, as a base64-encoded string. We need to send
	 * the plot data as a string because the underlying image file exists only
	 * on the machine running the language runtime process.
	 */
	data: string;

	/**
	 * The MIME type of the image data, e.g. `image/png`. This is used to
	 * determine how to display the image in the UI.
	 */
	mime_type: string;
}

/**
 * A message used to deliver a plot rendering error.
 */
export interface IPlotClientMessageError extends IPlotClientMessageOutput {
	message: string;
}

/**
 * An instance of a plot client widget generated by a language runtime. A plot can be rendered
 * by calling the `render` method, which returns a promise that resolves to the rendered plot.
 */
export class PlotClientInstance extends Disposable {
	/**
	 * The runtime-supplied ID for this client instance.
	 */
	public readonly id: string;

	/**
	 * The pending render request, if any.
	 */
	private _pendingRender?: DeferredPromise<IPlotClientMessageImage>;

	/**
	 * Event that fires when the plot is closed on the runtime side, typically
	 * because the runtime exited and doesn't preserve plot state.
	 */
	onDidClose: Event<void>;
	private readonly _closeEmitter = new Emitter<void>();

	/**
	 * Event that fires when the state of the plot client changes.
	 */
	onDidChangeState: Event<PlotClientState>;
	private readonly _stateEmitter = new Emitter<PlotClientState>();

	constructor(
		private readonly _client: IRuntimeClientInstance<IPlotClientMessageInput, IPlotClientMessageOutput>) {
		super();

		// Store the unique ID for this plot instance
		this.id = _client.getClientId();

		// Connect close emitter event
		this.onDidClose = this._closeEmitter.event;
		_client.onDidChangeClientState((state) => {
			if (state === RuntimeClientState.Closed) {
				this._closeEmitter.fire();
			}
			this._stateEmitter.fire(PlotClientState.Closed);
		});

		// Connect the state emitter event
		this.onDidChangeState = this._stateEmitter.event;

		// Register the client instance with the runtime, so that when this instance is disposed,
		// the runtime will also dispose the client.
		this._register(_client);
	}

	/**
	 * Requests that the plot be rendered at a specific size.
	 *
	 * @param height The plot height, in pixels
	 * @param width The plot width, in pixels
	 * @param pixel_ratio The device pixel ratio (e.g. 1 for standard displays, 2 for retina displays)
	 * @returns A promise that resolves to a rendered image, or rejects with an error.
	 */
	public render(height: number, width: number, pixel_ratio: number): Promise<IPlotClientMessageImage> {
		// If there is already a render request in flight, cancel it; this
		// request supercedes it.
		if (this._pendingRender && !this._pendingRender.isSettled) {
			this._pendingRender.cancel();
			this._pendingRender = undefined;
		}

		this._stateEmitter.fire(PlotClientState.Rendering);

		// Create a new deferred promise to track the render request
		const dp = new DeferredPromise<IPlotClientMessageImage>();
		const request: IPlotClientMessageRender = {
			msg_type: PlotClientMessageTypeInput.Render,
			height,
			width,
			pixel_ratio
		};
		this._pendingRender = dp;

		// Perform the RPC request and resolve the promise when the response is received
		this._client.performRpc(request).then((response) => {
			if (response.msg_type === PlotClientMessageTypeOutput.Image) {
				dp.complete(response as IPlotClientMessageImage);
				this._stateEmitter.fire(PlotClientState.Rendered);
			} else if (response.msg_type === PlotClientMessageTypeOutput.Error) {
				const err = response as IPlotClientMessageError;
				dp.error(new Error(`Failed to render plot: ${err.message}`));

				// TODO: Do we want to have a separate state for this case, or
				// return to the unrendered state?
			}
		});

		// Return the deferred promise to the caller
		return dp.p;
	}
}
