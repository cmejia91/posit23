/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RStudio, PBC.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./modalDialogs';
const React = require('react');
import * as _ from 'react';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IModalDialogsService } from 'vs/platform/modalDialogs/common/modalDialogs';
import { ModalDialogComponent } from 'vs/base/browser/ui/modalDialogComponent/modalDialogComponent';
import { ReactRenderer } from 'vs/base/browser/ui/modalDialogComponent/reactRenderer';
import { TestComponent } from 'vs/base/browser/ui/testComponent/testComponent';
import { SimpleTitleBarComponent } from 'vs/base/browser/ui/modalDialogComponent/components/simpleTitleBarComponent';
import { OKActionBarComponent } from 'vs/base/browser/ui/modalDialogComponent/components/okActionBarComponent';
import { OKCancelActionBarComponent } from 'vs/base/browser/ui/modalDialogComponent/components/okCancelActionBarComponent';
import { ContentAreaComponent } from 'vs/base/browser/ui/modalDialogComponent/components/contentAreaComponent';

/**
 * ModalDialogs class.
 */
export class ModalDialogs implements IModalDialogsService {

	declare readonly _serviceBrand: undefined;

	/**
	 * Initializes a new instance of the ModalDialogs class.
	 * @param layoutService The layout service.
	 */
	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
	) {
	}

	/**
	 * Shows an example modal dialog.
	 * @returns A Promise<void> that resolves when the example modal display dialog is done.
	 */
	async showExampleModalDisplayDialog(title: string): Promise<void> {
		// Return a promise that resolves when the example modal display dialog is done.
		return new Promise<void>((resolve) => {
			// Create the react renderer that will be used to render the example modal display dialog component.
			const reactRenderer = new ReactRenderer(this.layoutService.container);

			// The accept handler.
			const acceptHandler = () => {
				reactRenderer.destroy();
				resolve();
			};

			// Create example modal display dialog component.
			const ExampleModalDialogComponent = () => {
				return (
					<ModalDialogComponent enter={acceptHandler} escape={acceptHandler}>
						<SimpleTitleBarComponent title={title} />
						<ContentAreaComponent>
							<TestComponent message='Example' />
						</ContentAreaComponent>
						<OKActionBarComponent ok={acceptHandler} />
					</ModalDialogComponent>
				);
			};

			// Render the example modal display dialog component.
			reactRenderer.render(<ExampleModalDialogComponent />);
		});
	}

	/**
	 * Shows an example modal dialog.
	 * @returns A Promise<boolean> that resolves when the example modal dialog is done.
	 */
	async showExampleModalDialog(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			// Create the react renderer thar will be used to render the example modal dialog component.
			const reactRenderer = new ReactRenderer(this.layoutService.container);

			// The accept handler.
			const acceptHandler = (result: boolean) => {
				reactRenderer.destroy();
				resolve(result);
			};

			// Create example modal dialog component.
			const ExampleModalDialogComponent = () => {
				// Render.
				return (
					<ModalDialogComponent enter={() => acceptHandler(true)} escape={() => acceptHandler(false)}>
						<SimpleTitleBarComponent title='Example Modal Dialog' />
						<ContentAreaComponent>
							<TestComponent message='Example' />
						</ContentAreaComponent>
						<OKCancelActionBarComponent ok={() => acceptHandler(true)} cancel={() => acceptHandler(false)} />
					</ModalDialogComponent>
				);
			};

			// Render the example modal dialog component.
			reactRenderer.render(<ExampleModalDialogComponent />);
		});
	}
}
