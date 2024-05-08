/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/


import { Code } from '../code';

const COLUMN_HEADERS = '.data-explorer-panel .column-2 .data-grid-column-headers';
const HEADER_TITLES = '.data-grid-column-header .title-description .title';
const DATA_GRID_ROWS = '.data-explorer-panel .column-2 .data-grid-rows';
const DATA_GRID_ROW = '.data-grid-row';
const CELL_TEXT = '.data-grid-row-cell .content .text';

export interface CellData {
	[key: string]: string;
}

export class PositronDataExplorer {

	constructor(private code: Code) { }

	async getDataExplorerTableData(): Promise<object[]> {

		const columnHeaders = this.code.driver.getLocator(COLUMN_HEADERS);
		await columnHeaders.waitFor({ state: 'attached' });
		const dataGridRows = this.code.driver.getLocator(DATA_GRID_ROWS);
		dataGridRows.waitFor({ state: 'attached' });


		const headers = columnHeaders.locator(HEADER_TITLES);
		const headerContents = await headers.all();
		const headerNames: string[] = [];

		for (const headerContent of headerContents) {
			const header = await headerContent.innerText();
			headerNames.push(header);
		}

		await dataGridRows.waitFor({ state: 'attached' });

		const rows = dataGridRows.locator(DATA_GRID_ROW);
		const rowContents = await rows.all();

		const tableData: object[] = [];

		for (const rowContent of rowContents) {
			const cells = rowContent.locator(CELL_TEXT);
			const cellContents = await cells.all();
			const rowData: CellData = {};
			let columnIndex = 0;

			for (const cellContent of cellContents) {
				const innerText = await cellContent.innerText();
				rowData[headerNames[columnIndex]] = innerText;
				columnIndex++;
			}

			tableData.push(rowData);
		}

		return tableData;
	}
}
