/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DataColumnAlignment } from 'vs/base/browser/ui/positronDataGrid/interfaces/dataColumn';
import { ColumnSchema, ColumnSchemaTypeDisplay } from 'vs/workbench/services/languageRuntime/common/positronDataExplorerComm';
import { IPositronDataExplorerColumn } from 'vs/workbench/services/positronDataExplorer/browser/interfaces/positronDataExplorerColumn';

/**
 * PositronDataExplorerColumn class.
 */
export class PositronDataExplorerColumn implements IPositronDataExplorerColumn {
	//#region Private Properties

	/**
	 * Gets the column schema.
	 */
	private readonly _columnSchema: ColumnSchema;

	//#endregion Private Properties

	//#region Constructor & Dispose

	/**
	 * Constructor.
	 * @param columnSchema The column schema of the column.
	 */
	constructor(columnSchema: ColumnSchema) {
		// Initialize.
		this._columnSchema = columnSchema;
	}

	//#endregion Constructor & Dispose

	//#region IPositronDataExplorerColumn Implementation

	/**
	 * Gets the column schema.
	 */
	get columnSchema() {
		return this._columnSchema;
	}

	//#endregion IPositronDataExplorerColumn Implementation

	//#region IDataColumn Implementation

	/**
	 * Gets the name.
	 */
	get name() {
		return this._columnSchema.column_name;
	}

	/**
	 * Gets the description.
	 */
	get description() {
		return this._columnSchema.type_name;
	}

	/**
	 * Gets the alignment.
	 */
	get alignment() {
		// Determine the alignment based on type.
		switch (this.columnSchema.type_display) {
			case ColumnSchemaTypeDisplay.Number:
				return DataColumnAlignment.Right;

			case ColumnSchemaTypeDisplay.Boolean:
				return DataColumnAlignment.Left;

			case ColumnSchemaTypeDisplay.String:
				return DataColumnAlignment.Left;

			case ColumnSchemaTypeDisplay.Date:
				return DataColumnAlignment.Right;

			case ColumnSchemaTypeDisplay.Datetime:
				return DataColumnAlignment.Right;

			case ColumnSchemaTypeDisplay.Time:
				return DataColumnAlignment.Right;

			case ColumnSchemaTypeDisplay.Array:
				return DataColumnAlignment.Left;

			case ColumnSchemaTypeDisplay.Struct:
				return DataColumnAlignment.Left;

			case ColumnSchemaTypeDisplay.Unknown:
				return DataColumnAlignment.Right;
		}
	}

	//#endregion IDataColumn Implementation
}
