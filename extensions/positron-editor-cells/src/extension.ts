/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as positron from 'positron';
import * as vscode from 'vscode';
import { initializeLogging } from './logging';
import { CodeLensProvider, generateCellRangesFromDocument } from './codeLenseProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	initializeLogging();

	const codelensProvider = new CodeLensProvider();

	vscode.languages.registerCodeLensProvider('*', codelensProvider);

	context.subscriptions.push(
		vscode.commands.registerCommand('positron-editor-cells.runCell', (range: vscode.Range) => {
			const document = vscode.window.activeTextEditor?.document!;

			// Skip the cell marker
			// TODO: Should we do this? Should this happen in the code lens provider?
			const newRange = new vscode.Range(range.start.line + 1, 0, range.end.line, range.end.character);
			// TODO: Should we trim?
			const text = document.getText(newRange).trim();

			positron.runtime.executeCode(document.languageId, text, true);
		})
	);

	let timeout: NodeJS.Timer | undefined = undefined;

	const cellDecorationType = vscode.window.createTextEditorDecorationType({
		light: {
			backgroundColor: '#E1E1E166'
		},
		dark: {
			backgroundColor: '#40404066'
		},
		isWholeLine: true,
	});

	let activeEditor = vscode.window.activeTextEditor;

	function updateDecorations() {
		if (!activeEditor) {
			return;
		}
		const cellRanges = generateCellRangesFromDocument(activeEditor.document);
		const cells: vscode.DecorationOptions[] = [];
		for (const cellRange of cellRanges) {
			// const rangeTop = new vscode.Range(cellRange.range.start, cellRange.range.start);
			const decoration = { range: cellRange.range };
			cells.push(decoration);
		}
		activeEditor.setDecorations(cellDecorationType, cells);
	}

	function triggerUpdateDecorations(throttle = false) {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		if (throttle) {
			timeout = setTimeout(updateDecorations, 500);
		} else {
			updateDecorations();
		}
	}

	if (activeEditor) {
		triggerUpdateDecorations();
	}

	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
			triggerUpdateDecorations(true);
		}
	}, null, context.subscriptions);


}
