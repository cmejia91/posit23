/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./positronModalDialogs';
import * as React from 'react';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IPositronModalDialogsService } from 'vs/workbench/services/positronModalDialogs/browser/positronModalDialogs';
import { TestContent } from 'vs/base/browser/ui/positronModalDialog/components/testContent';
import { OKActionBar } from 'vs/base/browser/ui/positronModalDialog/components/okActionBar';
import { ContentArea } from 'vs/base/browser/ui/positronModalDialog/components/contentArea';
import { PositronModalDialogReactRenderer } from 'vs/base/browser/ui/positronModalDialog/positronModalDialogReactRenderer';
import { OKCancelActionBar } from 'vs/base/browser/ui/positronModalDialog/components/okCancelActionBar';
import { PositronModalDialog } from 'vs/base/browser/ui/positronModalDialog/positronModalDialog';

/**
 * PositronModalDialogs class.
 */
export class PositronModalDialogs implements IPositronModalDialogsService {

	declare readonly _serviceBrand: undefined;

	/**
	 * Initializes a new instance of the PositronModalDialogs class.
	 * @param layoutService The layout service.
	 */
	constructor(@ILayoutService private readonly layoutService: ILayoutService) { }

	/**
	 * Shows example modal dialog 1.
	 * @returns A Promise<void> that resolves when the example modal dialog is done.
	 */
	async showExampleModalDialog1(title: string): Promise<void> {
		// Return a promise that resolves when the example modal dialog is done.
		return new Promise<void>((resolve) => {
			// Create the modal dialog React renderer.
			const positronModalDialogReactRenderer = new PositronModalDialogReactRenderer(this.layoutService.container);

			// The accept handler.
			const acceptHandler = () => {
				positronModalDialogReactRenderer.destroy();
				resolve();
			};

			// The modal dialog component.
			const ModalDialog = () => {
				return (
					<PositronModalDialog title={title} width={400} height={300} accept={acceptHandler} cancel={acceptHandler}>
						<ContentArea>
							<TestContent message='Example' />
						</ContentArea>
						<OKActionBar accept={acceptHandler} />
					</PositronModalDialog>
				);
			};

			// Render the modal dialog component.
			positronModalDialogReactRenderer.render(<ModalDialog />);
		});
	}

	/**
	 * Shows example modal dialog 2.
	 * @returns A Promise<boolean> that resolves when the example modal dialog is done.
	 */
	async showExampleModalDialog2(title: string): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			// Create the modal dialog React renderer.
			const positronModalDialogReactRenderer = new PositronModalDialogReactRenderer(this.layoutService.container);

			// The accept handler.
			const acceptHandler = () => {
				positronModalDialogReactRenderer.destroy();
				resolve(true);
			};

			// The cancel handler.
			const cancelHandler = () => {
				positronModalDialogReactRenderer.destroy();
				resolve(false);
			};

			// The modal dialog component.
			const ModalDialog = () => {
				// Render.
				return (
					<PositronModalDialog title={title} width={400} height={300} accept={acceptHandler} cancel={cancelHandler}>
						<ContentArea>
							<TestContent message='Example' />
						</ContentArea>
						<OKCancelActionBar accept={acceptHandler} cancel={cancelHandler} />
					</PositronModalDialog>
				);
			};

			// Render the modal dialog component.
			positronModalDialogReactRenderer.render(<ModalDialog />);
		});
	}

	/**
	 * Shows a simple modal dialog prompt.
	 *
	 * @param title The title of the dialog
	 * @param message The message to display in the dialog
	 * @param okButtonTitle The title of the OK button (optional; defaults to 'OK')
	 * @param cancelButtonTitle The title of the Cancel button (optional; defaults to 'Cancel')
	 *
	 * @returns A promise that resolves to true if the user clicked OK, or false
	 *   if the user clicked Cancel (or closed the dialog)
	 */
	async showModalDialogPrompt(title: string,
		message: string,
		okButtonTitle?: string,
		cancelButtonTitle?: string): Promise<boolean> {
		return new Promise<boolean>((resolve) => {

			const positronModalDialogReactRenderer =
				new PositronModalDialogReactRenderer(this.layoutService.container);

			const acceptHandler = () => {
				positronModalDialogReactRenderer.destroy();
				resolve(true);
			};
			const cancelHandler = () => {
				positronModalDialogReactRenderer.destroy();
				resolve(false);
			};

			const ModalDialog = () => {
				return (
					<PositronModalDialog title={title} width={400} height={300} accept={acceptHandler} cancel={cancelHandler}>
						<ContentArea>
							{message}
						</ContentArea>
						<OKCancelActionBar
							okButtonTitle={okButtonTitle}
							cancelButtonTitle={cancelButtonTitle}
							accept={acceptHandler}
							cancel={cancelHandler} />
					</PositronModalDialog>
				);
			};

			positronModalDialogReactRenderer.render(<ModalDialog />);
		});
	}
}
