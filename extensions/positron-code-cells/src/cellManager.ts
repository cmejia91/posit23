/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as positron from 'positron';
import * as vscode from 'vscode';
import { newCell, parseCells } from './parser';

export interface ICell {
	range: vscode.Range;
}

// Provides a set of commands for interacting with Jupyter-like cells in a vscode.TextEditor
export class CellManager {
	cells: ICell[];

	constructor(private editor: vscode.TextEditor) {
		this.cells = [];
		this.parseCells();
	}

	private parseCells(): void {
		this.cells = parseCells(this.editor.document);
	}

	private getCurrentCellIndex(line?: number): number {
		const cursor = line !== undefined ? new vscode.Position(line, 0) : this.editor.selection.active;
		return this.cells.findIndex(cell => cell.range.contains(cursor));
	}

	public getCurrentCell(line?: number): ICell | undefined {
		return this.cells[this.getCurrentCellIndex(line)];
	}

	public getPreviousCell(line?: number): ICell | undefined {
		return this.cells[this.getCurrentCellIndex(line) - 1];
	}

	public getNextCell(line?: number): ICell | undefined {
		return this.cells[this.getCurrentCellIndex(line) + 1];
	}

	public runCell(cell: ICell): void {
		// Skip the cell marker
		// TODO: Support multiline cell markers?
		const range = new vscode.Range(cell.range.start.line + 1, 0, cell.range.end.line, cell.range.end.character);
		const text = this.editor.document.getText(range);
		positron.runtime.executeCode(this.editor.document.languageId, text, true);
	}

	public runCurrentCell(line?: number): void {
		const cell = this.getCurrentCell(line);
		if (cell) {
			this.runCell(cell);
		}
	}

	public runCurrentAdvance(line?: number): void {
		this.runCurrentCell(line);
		this.goToNextCell(line);
	}

	public runPreviousCell(line?: number): void {
		const cell = this.getPreviousCell(line);
		if (cell) {
			this.runCell(cell);
			this.goToPreviousCell(line);
		}
	}

	public runNextCell(line?: number): void {
		const cell = this.getNextCell(line);
		if (cell) {
			this.runCell(cell);
			this.goToNextCell(line);
		}
	}

	public runCellsAbove(line?: number): void {
		const end = this.getCurrentCellIndex(line);
		for (const cell of this.cells.slice(0, end)) {
			this.runCell(cell);
		}
	}

	public runCellsBelow(line?: number): void {
		const start = this.getCurrentCellIndex(line) + 1;
		for (const cell of this.cells.slice(start)) {
			this.runCell(cell);
		}
	}

	public runAllCells(): void {
		for (const cell of this.cells) {
			this.runCell(cell);
		}
	}

	private goToCell(cell: ICell): void {
		// Skip the cell marker
		// TODO: Support multiline cell markers?
		const cursor = new vscode.Position(cell.range.start.line + 1, 0);
		this.editor.selection = new vscode.Selection(cursor, cursor);
		this.editor.revealRange(cell.range);
	}

	public goToPreviousCell(line?: number): void {
		const cell = this.getPreviousCell(line);
		if (cell) {
			this.goToCell(cell);
		}
	}

	public goToNextCell(line?: number): void {
		const cell = this.getNextCell(line);
		if (cell) {
			this.goToCell(cell);
		}
	}

	public async insertCodeCell(line?: number): Promise<void> {
		const location = this.getCurrentCell(line)?.range.end ?? this.editor.selection.active;
		await this.editor.edit(editBuilder => { editBuilder.insert(location, newCell()); });
		this.goToNextCell(location.line);
	}

	public static fromActiveTextEditor(): CellManager | undefined {
		const editor = vscode.window.activeTextEditor;
		return editor && new CellManager(editor);
	}
}
