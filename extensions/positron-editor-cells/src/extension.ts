/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as positron from 'positron';
import * as vscode from 'vscode';
import { initializeLogging } from './logging';
import { CodeLensProvider, generateCellRangesFromDocument } from './codeLenseProvider';

function runCurrentCell(line?: number): void {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !(line || editor.selection)) {
		return;
	}

	const cellRanges = generateCellRangesFromDocument(editor.document);
	const position = line ? new vscode.Position(line, 0) : editor.selection.start;
	const i = cellRanges.findIndex(cellRange => cellRange.range.contains(position));
	const cellRange = cellRanges[i];

	const text = editor.document.getText(cellRange.range);
	positron.runtime.executeCode(editor.document.languageId, text, true);
}

function goToNextCell(line?: number): boolean {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !(line || editor.selection)) {
		return false;
	}

	const cellRanges = generateCellRangesFromDocument(editor.document);
	const position = line ? new vscode.Position(line, 0) : editor.selection.start;
	const i = cellRanges.findIndex(cellRange => cellRange.range.contains(position));
	if (i < cellRanges.length - 1) {
		const nextCellRange = cellRanges[i + 1];
		// Skip the cell marker
		const position = new vscode.Position(nextCellRange.range.start.line + 1, 0);
		editor.selection = new vscode.Selection(position, position);
		editor.revealRange(nextCellRange.range);
		return true;
	}

	return false;
}

function goToPreviousCell(line?: number): boolean {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !(line || editor.selection)) {
		return false;
	}

	const cellRanges = generateCellRangesFromDocument(editor.document);
	const position = line ? new vscode.Position(line, 0) : editor.selection.start;
	const i = cellRanges.findIndex(cellRange => cellRange.range.contains(position));
	if (i > 0) {
		const previousCellRange = cellRanges[i - 1];
		// Skip the cell marker
		const position = new vscode.Position(previousCellRange.range.start.line + 1, 0);
		editor.selection = new vscode.Selection(position, position);
		editor.revealRange(previousCellRange.range);
		return true;
	}

	return false;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	initializeLogging();

	const codelensProvider = new CodeLensProvider();

	vscode.languages.registerCodeLensProvider('*', codelensProvider);

	context.subscriptions.push(
		vscode.commands.registerCommand('positron-editor-cells.runCurrentCell', runCurrentCell),

		vscode.commands.registerCommand('positron-editor-cells.runCurrentAdvance', () => {
			runCurrentCell();
			goToNextCell();
			// TODO: Should this create a new cell if it's in the last?
		}),

		vscode.commands.registerCommand('positron-editor-cells.runNextCell', (line?: number) => {
			if (goToNextCell(line)) {
				runCurrentCell();
			}
		}),

		vscode.commands.registerCommand('positron-editor-cells.runPreviousCell', (line?: number) => {
			if (goToPreviousCell(line)) {
				runCurrentCell();
			}
		}),

		vscode.commands.registerCommand('positron-editor-cells.runAllCells', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return;
			}

			const cellRanges = generateCellRangesFromDocument(editor.document);
			for (const cellRange of cellRanges) {
				const text = editor.document.getText(cellRange.range);
				positron.runtime.executeCode(editor.document.languageId, text, true);
			}
		}),

		vscode.commands.registerCommand('positron-editor-cells.runCellsAbove', (line?: number) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !(line || editor.selection)) {
				return;
			}

			const position = line ? new vscode.Position(line, 0) : editor.selection.start;
			const cellRanges = generateCellRangesFromDocument(editor.document);
			const i = cellRanges.findIndex(cellRange => cellRange.range.contains(position));
			for (const cellRange of cellRanges.slice(0, i)) {
				const text = editor.document.getText(cellRange.range);
				positron.runtime.executeCode(editor.document.languageId, text, true);
			}
		}),

		vscode.commands.registerCommand('positron-editor-cells.runCellsBelow', (line?: number) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !(line || editor.selection)) {
				return;
			}

			const position = line ? new vscode.Position(line, 0) : editor.selection.start;
			const cellRanges = generateCellRangesFromDocument(editor.document);
			const i = cellRanges.findIndex(cellRange => cellRange.range.contains(position));
			for (const cellRange of cellRanges.slice(i + 1)) {
				const text = editor.document.getText(cellRange.range);
				positron.runtime.executeCode(editor.document.languageId, text, true);
			}
		}),

		vscode.commands.registerCommand('positron-editor-cells.goToPreviousCell', goToPreviousCell),

		vscode.commands.registerCommand('positron-editor-cells.goToNextCell', goToNextCell),
	);

	let timeout: NodeJS.Timer | undefined = undefined;

	const activeCellDecorationType = vscode.window.createTextEditorDecorationType({
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
		const activeCellRanges: vscode.Range[] = [];
		for (const cellRange of cellRanges) {
			// If the cursor is in the cellRange, then highlight it
			if (activeEditor.selection.active.line >= cellRange.range.start.line &&
				activeEditor.selection.active.line <= cellRange.range.end.line) {
				activeCellRanges.push(cellRange.range);
				break;
			}
		}
		activeEditor.setDecorations(activeCellDecorationType, activeCellRanges);
	}

	function triggerUpdateDecorations(throttle = false) {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		if (throttle) {
			timeout = setTimeout(updateDecorations, 250);
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

	vscode.window.onDidChangeTextEditorSelection(event => {
		if (activeEditor && event.textEditor === activeEditor) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	vscode.languages.registerFoldingRangeProvider('*', {
		provideFoldingRanges: (document) =>
			generateCellRangesFromDocument(document).map((cellRange) =>
				new vscode.FoldingRange(cellRange.range.start.line, cellRange.range.end.line)
			)
	});
}
