/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { PositronDataToolColumn } from 'vs/workbench/services/positronDataTool/browser/positronDataToolColumn';
import { PositronDataToolLayout } from 'vs/workbench/services/positronDataTool/browser/interfaces/positronDataToolService';
import { IPositronDataToolInstance } from 'vs/workbench/services/positronDataTool/browser/interfaces/positronDataToolInstance';
import { PositronDataToolDataGridInstance } from 'vs/workbench/services/positronDataTool/browser/positronDataToolDataGridInstance';

/**
* PositronDataToolInstance class.
*/
export class PositronDataToolInstance extends Disposable implements IPositronDataToolInstance {
	//#region Private Properties

	/**
	 * Gets the identifier.
	 */
	private readonly _identifier: string;

	/**
	 * Gets or sets the layout.
	 */
	private _layout = PositronDataToolLayout.ColumnsLeft;

	/**
	 * Gets or sets the columns width percent.
	 */
	private _columnsWidthPercent = 0.25;

	/**
	 * Gets or sets the columns scroll offset.
	 */
	private _columnsScrollOffset = 0;

	/**
	 * The PositronDataToolDataGridInstance.
	 */
	private _positronDataToolDataGridInstance = new PositronDataToolDataGridInstance();

	/**
	 * The onDidChangeLayout event emitter.
	 */
	private readonly _onDidChangeLayoutEmitter = this._register(new Emitter<PositronDataToolLayout>);

	/**
	 * The onDidChangeColumnsWidthPercent event emitter.
	 */
	private readonly _onDidChangeColumnsWidthPercentEmitter = this._register(new Emitter<number>);

	/**
	 * The onDidChangeColumnsScrollOffset event emitter.
	 */
	private readonly _onDidChangeColumnsScrollOffsetEmitter = this._register(new Emitter<number>);

	//#endregion Private Properties

	//#region Constructor & Dispose

	/**
	 * Constructor.
	 * @param identifier The identifier.
	 */
	constructor(identifier: string) {
		// Call the base class's constructor.
		super();

		// Initialize.
		this._identifier = identifier;

		// Create the dummy columns. 1_000_000
		const columns: PositronDataToolColumn[] = [];
		for (let i = 0; i < 100; i++) {
			columns.push(new PositronDataToolColumn(
				`col${i}`,
				{
					name: `Column ${i + 1}`,
					type_name: 'number'
				}
			));
		}

		// Set the column.
		this._positronDataToolDataGridInstance.setColumns(columns);
	}

	//#endregion Constructor & Dispose

	//#region IPositronDataToolInstance Implementation

	/**
	 * Gets the identifier.
	 */
	get identifier() {
		return this._identifier;
	}

	/**
	 * Gets the layout.
	 */
	get layout() {
		return this._layout;
	}

	/**
	 * Sets the layout.
	 */
	set layout(layout: PositronDataToolLayout) {
		this._layout = layout;
		this._onDidChangeLayoutEmitter.fire(this._layout);
	}

	/**
	 * Gets the columns width percent.
	 */
	get columnsWidthPercent() {
		return this._columnsWidthPercent;
	}

	/**
	 * Sets the columns width percent.
	 */
	set columnsWidthPercent(columnsWidthPercent: number) {
		this._columnsWidthPercent = columnsWidthPercent;
		this._onDidChangeColumnsWidthPercentEmitter.fire(this._columnsWidthPercent);
	}

	/**
	 * Gets the columns scroll offset.
	 */
	get columnsScrollOffset() {
		return this._columnsScrollOffset;
	}

	/**
	 * Sets the columns scroll offset.
	 */
	set columnsScrollOffset(columnsScrollOffset: number) {
		this._columnsScrollOffset = columnsScrollOffset;
		this._onDidChangeColumnsScrollOffsetEmitter.fire(this._columnsScrollOffset);
	}

	/**
	 * Gets the
	 */
	get positronDataGridInstance() {
		return this._positronDataToolDataGridInstance;
	}

	/**
	 * onDidChangeLayout event.
	 */
	readonly onDidChangeLayout = this._onDidChangeLayoutEmitter.event;

	/**
	 * onDidChangeColumnsWidthPercent event.
	 */
	readonly onDidChangeColumnsWidthPercent = this._onDidChangeColumnsWidthPercentEmitter.event;

	/**
	 * onDidChangeColumnsScrollOffset event.
	 */
	readonly onDidChangeColumnsScrollOffset = this._onDidChangeColumnsScrollOffsetEmitter.event;

	//#endregion IPositronDataToolInstance Implementation
}
