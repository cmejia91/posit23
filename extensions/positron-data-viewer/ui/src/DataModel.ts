/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DataColumn, DataSet, DataViewerMessage, DataViewerMessageData } from './positron-data-viewer';

/**
 * A fragment of data, arranged by column.
 */
export interface DataFragment {
	/**
	 * The row index of the first row in the fragment.
	 */
	rowStart: number;

	/**
	 * The row index of the last row in the fragment.
	 */
	rowEnd: number;

	/**
	 * The rows of data, arranged by column.
	 */
	columns: Array<DataColumn>;
}
export class DataModel {
	/**
	 * Create a new DataModel instance. The DataModel class represents the data model behind a
	 * DataPanel. It is responsible for loading fragments from the data set as necessary to populate
	 * the DataPanel.
	 *
	 * @param dataSet The data contained by the data model
	 * @param rowStart The row index of the first row in the currently rendered data.
	 * @param renderedRows A list of the rowStart indices that have been rendered so far in the panel.
	 */
	// All properties must be readonly, since we never want to modify the data model state in place
	// It can only be modified by passing a new data model to the DataPanel's updater function
	constructor(
		public readonly dataSet: DataSet,
		public readonly rowStart = 0,
		public readonly renderedRows = [0]
	) {
	}

	/**
	 *
	 * @param start The row index of the first row in the fragment.
	 * @param size The number of rows in the fragment.
	 * @returns The fragment of data.
	 */
	loadDataFragment(start: number, size: number): DataFragment {
		const columns = this.dataSet.columns.map((column: DataColumn) => {
			return {
				...column,
				data: column.data.slice(start, start + size)
			};
		});
		return {
			rowStart: start,
			rowEnd: Math.min(start + size - 1, this.rowCount - 1),
			columns: columns
		};
	}

	/**
	 *
	 * @param newFragment A new DataFragment to be appended to the data model
	 * @returns A new data model, which combines this data model plus the new fragment.
	 */
	appendFragment(newFragment: DataFragment): DataModel {
		const updatedRenderedRows = this.renderedRows.slice();
		if (!this.renderedRows.includes(newFragment.rowStart)) {
			updatedRenderedRows.push(newFragment.rowStart);
			updatedRenderedRows.sort();
		}

		const columns = this.dataSet.columns.map((column: DataColumn, index: number) => {
			return {
				...column,
				data: column.data.concat(newFragment.columns[index].data)
			};
		});
		const updatedDataModel = new DataModel({
			...this.dataSet,
			columns: columns
		},
			this.rowStart,
			updatedRenderedRows
		);
		return updatedDataModel;
	}

	/**
	 *
	 * @param event The message event received from the runtime
	 * @returns Either the original data model, or a new data model that includes the message's data
	 */
	handleDataMessage(event: any): DataModel {
		const message = event.data as DataViewerMessage;
		if (message.msg_type === 'receive_rows' && !this.renderedRows.includes(message.start_row)) {
			const dataMessage = message as DataViewerMessageData;

			const incrementalData: DataFragment = {
				rowStart: dataMessage.start_row,
				rowEnd: dataMessage.start_row + dataMessage.fetch_size - 1,
				columns: dataMessage.data.columns
			};
			return this.appendFragment(incrementalData);
		}
		return this;
	}

	/**
	 * A unique identifier for the data model, used to cache the data query.
	 */
	get id(): String {
		return `
		Rendered rows: ${this.renderedRows}
		Dataset: ${this.dataSet.id}
		`;
	}

	/**
	 * The set of columns in the data set.
	 */
	get columns(): Array<DataColumn> {
		return this.dataSet.columns;
	}

	/**
	 * The number of rows in the data set that the UI has received and rendered so far.
	 */
	get loadedRowCount(): number {
		if (this.columns.length > 0) {
			// Check the row count of the actual data
			return this.columns[0].data.length;
		}
		return 0;
	}

	/**
	 * The total number of rows in the data set.
	 */
	get rowCount(): number {
		if (this.dataSet.rowCount) {
			// Use the complete row count if known
			return this.dataSet.rowCount;
		}
		return this.loadedRowCount;
	}
}
