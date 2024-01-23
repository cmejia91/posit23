/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDataColumn } from 'vs/base/browser/ui/dataGrid/interfaces/dataColumn';

/**
 * SelectionState enumeration.
 */
export enum SelectionState {
	None = 0,
	Selected = 1,
	FirstSelected = 2,
	LastSelected = 4
}

/**
 * MouseSelectionType enumeration.
 */
export enum MouseSelectionType {
	Single = 'single',
	Range = 'range',
	Multi = 'multi'
}

/**
 * IDataGridInstance interface.
 */
export interface IDataGridInstance {
	/**
	 * Gets the number of columns.
	 */
	readonly columns: number;

	/**
	 * Gets the number of rows.
	 */
	readonly rows: number;

	/**
	 * Gets or sets the first column index.
	 */
	readonly firstColumnIndex: number;

	/**
	 * Gets or sets the first row index.
	 */
	readonly firstRowIndex: number;

	/**
	 * Gets the cursor column index.
	 */
	readonly cursorColumnIndex: number;

	/**
	 * Gets the cursor row.
	 */
	readonly cursorRowIndex: number;

	/**
	 * Sets the width of a column.
	 * @param columnIndex The column index.
	 * @param width The width.
	 */
	setColumnWidth(columnIndex: number, width: number): void;

	/**
	 * Sets the screen position.
	 * @param firstColumnIndex The first column index.
	 * @param firstRowIndex The first row index.
	 */
	setScreenPosition(firstColumnIndex: number, firstRowIndex: number): void;

	/**
	 * Sets the first column index.
	 * @param firstColumnIndex The first column index.
	 */
	setFirstColumn(firstColumnIndex: number): void;

	/**
	 * Sets the first row index.
	 * @param firstRowIndex The first row.
	 */
	setFirstRow(firstRowIndex: number): void;

	/**
	 * Sets the cursor position.
	 * @param cursorColumnIndex The cursor column index.
	 * @param cursorRowIndex The cursor row index.
	 */
	setCursorPosition(cursorColumnIndex: number, cursorRowIndex: number): void;

	/**
	 * Sets the cursor column index.
	 * @param cursorColumnIndex The cursor column index.
	 */
	setCursorColumn(cursorColumnIndex: number): void;

	/**
	 * Sets the cursor row index.
	 * @param cursorRowIndex The cursor row index.
	 */
	setCursorRow(cursorRowIndex: number): void;

	/**
	 * Clears selection.
	 */
	clearSelection(): void;

	/**
	 * Selects all.
	 */
	selectAll(): void;

	/**
	 * Selects a column.
	 * @param columnIndex The column index.
	 */
	selectColumn(columnIndex: number): void;

	/**
	 * Mouse selects a column.
	 * @param columnIndex The column index.
	 * @param mouseSelectionType The mouse selection type.
	 */
	mouseSelectColumn(columnIndex: number, mouseSelectionType: MouseSelectionType): void;

	/**
	 * Selects a row.
	 * @param rowIndex The row index.
	 */
	selectRow(rowIndex: number): void;

	/**
	 * Mouse selects a row.
	 * @param rowIndex The row index.
	 * @param mouseSelectionType The mouse selection mode.
	 */
	mouseSelectRow(rowIndex: number, mouseSelectionType: MouseSelectionType): void;

	/**
	 * Extends selection left.
	 */
	extendSelectionLeft(): void;

	/**
	 * Extends selection right.
	 */
	extendSelectionRight(): void;

	/**
	 * Extends selection up.
	 */
	extendSelectionUp(): void;

	/**
	 * Extends selection down.
	 */
	extendSelectionDown(): void;

	/**
	 * Gets the column selection state.
	 * @param columnIndex The column index.
	 * @returns A SelectionState that represents the column selection state.
	 */
	columnSelectionState(columnIndex: SelectionState): SelectionState;

	/**
	 * Gets the row selection state.
	 * @param rowIndex The row index.
	 * @returns A SelectionState that represents the row selection state.
	 */
	rowSelectionState(rowIndex: SelectionState): SelectionState;

	/**
	 * Gets a column.
	 * @param columnIndex The column index.
	 * @returns The IPositronDataColumn.
	 */
	column(columnIndex: number): IDataColumn;

	/**
	 * Gets a cell.
	 * @param columnIndex The column index.
	 * @param row The row index.
	 * @returns The cell.
	 */
	cell(columnIndex: number, rowIndex: number,): string | undefined;

	/**
	 * The onDidUpdate event.
	 */
	readonly onDidUpdate: Event<void>;
}
