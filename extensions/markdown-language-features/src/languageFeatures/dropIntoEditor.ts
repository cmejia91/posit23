/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as URI from 'vscode-uri';
import { Schemes } from '../util/schemes';

const imageFileExtensions = new Set<string>([
	'.bmp',
	'.gif',
	'.ico',
	'.jpe',
	'.jpeg',
	'.jpg',
	'.png',
	'.psd',
	'.svg',
	'.tga',
	'.tif',
	'.tiff',
	'.webp',
]);

export function registerDropIntoEditorSupport(selector: vscode.DocumentSelector) {
	return vscode.languages.registerDocumentDropEditProvider(selector, new class implements vscode.DocumentDropEditProvider {
		async provideDocumentDropEdits(document: vscode.TextDocument, _position: vscode.Position, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentDropEdit | undefined> {
			const enabled = vscode.workspace.getConfiguration('markdown', document).get('editor.drop.enabled', true);
			if (!enabled) {
				return undefined;
			}

			const snippet = await tryGetUriListSnippet(document, dataTransfer, token);
			return snippet ? new vscode.DocumentDropEdit(snippet) : undefined;
		}
	});
}

export async function tryGetUriListSnippet(document: vscode.TextDocument, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.SnippetString | undefined> {
	const urlList = await dataTransfer.get('text/uri-list')?.asString();
	if (!urlList || token.isCancellationRequested) {
		return undefined;
	}

	const uris: vscode.Uri[] = [];
	for (const resource of urlList.split('\n')) {
		try {
			uris.push(vscode.Uri.parse(resource));
		} catch {
			// noop
		}
	}

	if (!uris.length) {
		return;
	}

	const docUri = getParentDocumentUri(document);

	const snippet = new vscode.SnippetString();
	uris.forEach((uri, i) => {
		const mdPath = docUri.scheme === uri.scheme && docUri.authority === uri.authority
			? encodeURI(path.relative(URI.Utils.dirname(docUri).fsPath, uri.fsPath).replace(/\\/g, '/'))
			: uri.toString(false);

		const ext = URI.Utils.extname(uri).toLowerCase();
		snippet.appendText(imageFileExtensions.has(ext) ? '![' : '[');
		snippet.appendTabstop();
		snippet.appendText(`](${mdPath})`);

		if (i <= uris.length - 1 && uris.length > 1) {
			snippet.appendText(' ');
		}
	});

	return snippet;
}

function getParentDocumentUri(document: vscode.TextDocument): vscode.Uri {
	if (document.uri.scheme === Schemes.notebookCell) {
		for (const notebook of vscode.workspace.notebookDocuments) {
			for (const cell of notebook.getCells()) {
				if (cell.document === document) {
					return notebook.uri;
				}
			}
		}
	}

	return document.uri;
}
