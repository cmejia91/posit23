/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./positronColumnSplitter';
import * as React from 'react';
import * as DOM from 'vs/base/browser/dom';
import { isMacintosh } from 'vs/base/common/platform';

/**
 * PositronColumnSplitterResizeParams interface. This defines the parameters of a resize operation.
 * When invert is true, the mouse delta is subtracted from the starting width instead of being added
 * to it, which inverts the resize operation.
 */
export interface PositronColumnSplitterResizeParams {
	minimumWidth: number;
	maximumWidth: number;
	startingWidth: number;
	invert?: boolean;
}

/**
 * PositronColumnSplitter component.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const PositronColumnSplitter = (props: {
	onBeginResize: () => PositronColumnSplitterResizeParams;
	onResize: (width: number) => void;
}) => {
	/**
	 * onPointerDown handler.
	 * @param e A PointerEvent that describes a user interaction with the pointer.
	 */
	const pointerDownHandler = (e: React.PointerEvent<HTMLDivElement>) => {
		// Ignore events we don't process.
		if (e.pointerType === 'mouse' && e.buttons !== 1) {
			return;
		}

		// Consume the event.
		e.preventDefault();
		e.stopPropagation();

		// Setup the resize state.
		const resizeParams = props.onBeginResize();
		const target = DOM.getWindow(e.currentTarget).document.body;
		const clientX = e.clientX;
		const styleSheet = DOM.createStyleSheet(target);

		/**
		 * pointermove event handler.
		 * @param e A PointerEvent that describes a user interaction with the pointer.
		 */
		const pointerMoveHandler = (e: PointerEvent) => {
			// Consume the event.
			e.preventDefault();
			e.stopPropagation();

			// Calculate the new width.
			let newWidth = calculateNewWidth(e);

			// Adjust the new width to be within limits and set the cursor accordingly.
			let cursor: string;
			if (newWidth < resizeParams.minimumWidth) {
				cursor = 'e-resize';
				newWidth = resizeParams.minimumWidth;
			} else if (newWidth > resizeParams.maximumWidth) {
				cursor = 'w-resize';
				newWidth = resizeParams.maximumWidth;
			} else {
				cursor = isMacintosh ? 'col-resize' : 'ew-resize';
			}

			// Update the style sheet's text content with the desired cursor. This is a clever
			// technique adopted from src/vs/base/browser/ui/sash/sash.ts.
			styleSheet.textContent = `* { cursor: ${cursor} !important; }`;

			// Call the onResize callback.
			props.onResize(newWidth);
		};

		/**
		 * lostpointercapture event handler.
		 * @param e A PointerEvent that describes a user interaction with the pointer.
		 */
		const lostPointerCaptureHandler = (e: PointerEvent) => {
			// Remove our pointer event handlers.
			target.removeEventListener('pointermove', pointerMoveHandler);
			target.removeEventListener('lostpointercapture', lostPointerCaptureHandler);

			// Calculate the new width.
			let newWidth = calculateNewWidth(e);

			// Adjust the new width to be within limits.
			if (newWidth < resizeParams.minimumWidth) {
				newWidth = resizeParams.minimumWidth;
			} else if (newWidth > resizeParams.maximumWidth) {
				newWidth = resizeParams.maximumWidth;
			}

			// Remove the style sheet.
			target.removeChild(styleSheet);

			// Call the onEndResize callback.
			props.onResize(newWidth);
		};

		/**
		 * Calculates the new width based on a GlobalPointerEvent.
		 * @param e The GlobalPointerEvent.
		 * @returns The new width.
		 */
		const calculateNewWidth = (e: PointerEvent) => {
			// Calculate the delta.
			const delta = Math.trunc(e.clientX - clientX);

			// Calculate the new width.
			return !resizeParams.invert ?
				resizeParams.startingWidth + delta :
				resizeParams.startingWidth - delta;
		};

		// Set the capture target of future pointer events to be the current target and add our
		// pointer event handlers.
		target.setPointerCapture(e.pointerId);
		target.addEventListener('pointermove', pointerMoveHandler);
		target.addEventListener('lostpointercapture', lostPointerCaptureHandler);
	};

	// Render.
	return (
		<div className='positron-column-splitter'>
			<div className='sizer' onPointerDown={pointerDownHandler} />
		</div>
	);
};
