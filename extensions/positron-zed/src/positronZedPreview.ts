/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import path = require('path');
import fs = require('fs');

import * as vscode from 'vscode';
import * as positron from 'positron';

export class ZedPreview {
	constructor(
		private readonly context: vscode.ExtensionContext,
		readonly panel: positron.PreviewPanel) {
		panel.webview.html = this.getPreviewContents();

		panel.onDidChangeViewState(() => {
			this.panel.webview.postMessage(
				`onDidChangeViewState: ${this.panel.active}`);
		});
	}

	public addRecentCommand(command: string): void {
		// Send the command as a message to the webview.
		// The webview will add it to the list of recently executed commands.
		this.panel.webview.postMessage(`Executed '${command}'`);
	}

	private getPreviewContents(): string {
		// Get the contents of the preview.html file from the extension's resources folder
		// and return it as a string.
		const previewHtmlPath = path.join(this.context.extensionPath,
			'resources',
			'preview.html');
		const previewContents = fs.readFileSync(previewHtmlPath, 'utf8');
		return previewContents;
	}
}
