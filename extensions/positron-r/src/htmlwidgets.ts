/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as positron from 'positron';
import * as path from 'path';
import { Uri } from 'vscode';

export interface RHtmlDependency {
	all_files: boolean; // eslint-disable-line
	head: string | null;
	meta: string | null;
	name: string | null;
	script: string | string[] | null;
	src: {
		file: string;
	};
	stylesheet: string | null;
	version: string | null;
}


export interface RHtmlWidget {
	dependencies: RHtmlDependency[];
	head: string;
	html: string;
}

function arrayify(src: string | string[] | null): string[] {
	if (src === null) {
		return [];
	} else if (Array.isArray(src)) {
		return src;
	} else {
		return [src];
	}
}

export function previewHtmlWidget(widget: RHtmlWidget) {

	let html = '';
	const roots: Uri[] = [];
	widget.dependencies.forEach((dep) => {
		if (dep.src.file) {
			roots.push(Uri.file(dep.src.file));
		}
	});

	const options: positron.PreviewOptions = {
		enableForms: true,
		enableScripts: true,
		localResourceRoots: roots
	};

	const preview = positron.window.createPreviewPanel(
		'positron.r.htmlwidget',
		'R HTML Widget',
		false,
		options);

	widget.dependencies.forEach((dep) => {
		if (dep.src.file) {
			arrayify(dep.script).forEach((script) => {
				const scriptUri = preview.webview.asWebviewUri(Uri.file(path.join(dep.src.file, script!)));
				html += `<script src="${scriptUri}"></script>`;
			});
			arrayify(dep.stylesheet).forEach((stylesheet) => {
				const styleUri = preview.webview.asWebviewUri(Uri.file(path.join(dep.src.file, stylesheet)));
				html += `<link rel="stylesheet" src="${styleUri}"></link>`;
			});
		}
	});
	preview.webview.html = html + widget.html;
}
