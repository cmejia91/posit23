/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ColumnSchema } from 'vs/workbench/services/languageRuntime/common/positronDataToolComm';
import { IPositronDataToolColumn } from 'vs/workbench/services/positronDataTool/browser/interfaces/positronDataToolColumn';

/**
* PositronDataToolInstance class.
*/
export class PositronDataToolColumn implements IPositronDataToolColumn {
	//#region Private Properties

	/**
	 * Gets the identifier.
	 */
	private readonly _identifier: string;

	/**
	 * Gets the column schema.
	 */
	private readonly _columnSchema: ColumnSchema;

	/**
	 * Gets or sets the width.
	 */
	private _width: number;

	/**
	 * Gets or sets the layout width.
	 */
	private _layoutWidth: number = 0;

	//#endregion Private Properties

	//#region Constructor & Dispose

	/**
	 * Constructor.
	 * @param identifier The identifier of the column.
	 * @param columnSchema The column schema of the column.
	 */
	constructor(identifier: string, columnSchema: ColumnSchema) {
		// Initialize.
		this._identifier = identifier;		// TODO: Should be part of ColumnSchema...
		this._columnSchema = columnSchema;

		// Initialize the width (eventually, this will be set based on the column schema).
		this._width = 190;
	}

	//#endregion Constructor & Dispose

	//#region IPositronDataColumn Implementation

	/**
	 * Gets the identifier.
	 */
	get identifier() {
		return this._identifier;
	}

	get codicon() {
		// Temporary until updates happen to the comms for Data Tool.
		if (this.columnSchema.type_name.includes('bool')) {
			return 'positron-data-type-boolean';
		}
		if (this.columnSchema.type_name.includes('date')) {
			return 'positron-data-type-date-time';
		}
		if (this.columnSchema.type_name.includes('int')) {
			return 'positron-data-type-number';
		}
		if (this.columnSchema.type_name.includes('float')) {
			return 'positron-data-type-number';
		}
		if (this.columnSchema.type_name.includes('str')) {
			return 'positron-data-type-string';
		}

		return undefined;
	}

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
	 * Gets the width.
	 */
	get width() {
		return this._width;
	}

	/**
	 * Sets the width.
	 */
	set width(width: number) {
		this._width = width;
	}

	/**
	 * Gets the layout width.
	 */
	get layoutWidth() {
		return this._layoutWidth;
	}

	/**
	 * Sets the width.
	 */
	set layoutWidth(layoutWidth: number) {
		this._layoutWidth = layoutWidth;
	}

	//#endregion IPositronDataColumn Implementation

	//#region IPositronDataToolColumn Implementation

	/**
	 * Gets the column schema.
	 */
	get columnSchema() {
		return this._columnSchema;
	}

	//#endregion IPositronDataToolColumn Implementation
}
