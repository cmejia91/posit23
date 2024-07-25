/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { arrayFromIndexRange } from 'vs/workbench/services/positronDataExplorer/common/utils';
import { DataExplorerClientInstance } from 'vs/workbench/services/languageRuntime/common/languageRuntimeDataExplorerClient';
import { ColumnProfileType, ColumnSchema, ColumnSummaryStats } from 'vs/workbench/services/languageRuntime/common/positronDataExplorerComm';

/**
 * Constants.
 */
const OVERSCAN_FACTOR = 3;

/**
 * UpdateDescriptor interface.
 */
interface UpdateDescriptor {
	firstColumnIndex: number;
	visibleColumns: number;
}

/**
 * TableSummaryCache class.
 */
export class TableSummaryCache extends Disposable {
	//#region Private Properties

	/**
	 * Gets or sets a value which indicates whether an update is in progress.
	 */
	private _updating = false;

	/**
	 * Gets or sets the pending update descriptor.
	 */
	private _pendingUpdateDescriptor?: UpdateDescriptor;

	/**
	 * Gets or sets the columns.
	 */
	private _columns = 0;

	/**
	 * Gets or sets the rows.
	 */
	private _rows = 0;

	/**
	 * Gets the column schema cache.
	 */
	private readonly _columnSchemaCache = new Map<number, ColumnSchema>();

	/**
	 * Gets the column null count cache.
	 */
	private readonly _columnNullCountCache = new Map<number, number>();

	/**
	 * Gets the column summary stats cache.
	 */
	private readonly _columnSummaryStatsCache = new Map<number, ColumnSummaryStats>();

	/**
	 * The onDidUpdateCache event emitter.
	 */
	protected readonly _onDidUpdateCache = this._register(new Emitter<void>);

	//#endregion Private Properties

	//#region Constructor & Dispose

	/**
	 * Constructor.
	 * @param _dataExplorerClientInstance The data explorer client instance.
	 */
	constructor(private readonly _dataExplorerClientInstance: DataExplorerClientInstance) {
		// Call the base class's constructor.
		super();

		// Add the onDidSchemaUpdate event handler.
		this._register(this._dataExplorerClientInstance.onDidSchemaUpdate(async () => {
			// Clear the column schema cache, row label cache, and data cell cache.
			this._columnSchemaCache.clear();
			this.invalidateCache();
		}));

		// Add the onDidDataUpdate event handler.
		this._register(this._dataExplorerClientInstance.onDidDataUpdate(async () => {
			this.invalidateCache();
		}));
	}

	//#endregion Constructor & Dispose

	//#region Public Properties

	/**
	 * Gets the columns.
	 */
	get columns() {
		return this._columns;
	}

	/**
	 * Gets the rows.
	 */
	get rows() {
		return this._rows;
	}

	//#endregion Public Properties

	//#region Public Events

	/**
	 * onDidUpdateCache event.
	 */
	readonly onDidUpdateCache = this._onDidUpdateCache.event;

	//#endregion Public Events

	//#region Public Methods

	/**
	 * Invalidates the cache.
	 */
	invalidateCache() {
		this._columnNullCountCache.clear();
		this._columnSummaryStatsCache.clear();

		// On an update event, table shape may have changed
		this._dataExplorerClientInstance.updateBackendState();
	}

	/**
	 * Updates the cache.
	 * @param updateDescriptor The update descriptor.
	 */
	async updateCache(updateDescriptor: UpdateDescriptor): Promise<void> {
		// Update the cache.
		await this.doUpdate(updateDescriptor);

		// Fire the onDidUpdateCache event.
		this._onDidUpdateCache.fire();
	}

	/**
	 * Gets the column schema for the specified column index.
	 * @param columnIndex The column index.
	 * @returns The column schema for the specified column index.
	 */
	getColumnSchema(columnIndex: number) {
		return this._columnSchemaCache.get(columnIndex);
	}

	/**
	 * Gets the null count for the specified column index.
	 * @param columnIndex The column index.
	 * @returns The number of nulls in the specified column index.
	 */
	getColumnNullCount(columnIndex: number) {
		return this._columnNullCountCache.get(columnIndex);
	}

	/**
	 * Gets the cached summary stats for the specified column index.
	 * @param columnIndex The column index.
	 * @returns ColumnSummaryStats in the specified column index.
	 */
	getColumnSummaryStats(columnIndex: number) {
		return this._columnSummaryStatsCache.get(columnIndex);
	}

	async cacheColumnSummaryStats(columnIndices: Array<number>) {
		// Filter out summary stats that are already cached
		columnIndices = columnIndices.filter(columnIndex =>
			!this._columnSummaryStatsCache.has(columnIndex)
		);

		// Request the profiles
		const results = await this._dataExplorerClientInstance.getColumnProfiles(
			columnIndices.map(column_index => {
				return {
					column_index,
					profile_type: ColumnProfileType.SummaryStats
				};
			})
		);

		// Update the column schema cache, overwriting any entries we already have cached.
		for (let i = 0; i < results.length; i++) {
			const stats = results[i].summary_stats;
			if (stats !== undefined) {
				this._columnSummaryStatsCache.set(columnIndices[i], stats);
			}
		}
	}

	//#endregion Public Methods

	//#region Private Methods

	/**
	 * Updates the cache.
	 * @param updateDescriptor The update descriptor.
	 */
	private async doUpdate(updateDescriptor: UpdateDescriptor): Promise<void> {
		// If a cache update is already in progress, set the pending update descriptor and return.
		// This allows cache updates that are happening in rapid succession to overwrite one another
		// so that only the last one gets processed. (For example, this happens when a user drags a
		// scrollbar rapidly.)
		if (this._updating) {
			this._pendingUpdateDescriptor = updateDescriptor;
			return;
		}

		// Set the updating flag.
		this._updating = true;

		// Destructure the update descriptor.
		const {
			firstColumnIndex,
			visibleColumns
		} = updateDescriptor;

		// Get the size of the data.
		const tableState = await this._dataExplorerClientInstance.getBackendState();
		this._columns = tableState.table_shape.num_columns;
		this._rows = tableState.table_shape.num_rows;

		// Set the start column index and the end column index of the columns to cache.
		const startColumnIndex = Math.max(
			firstColumnIndex - (visibleColumns * OVERSCAN_FACTOR),
			0
		);
		const endColumnIndex = Math.min(
			startColumnIndex + visibleColumns + (visibleColumns * OVERSCAN_FACTOR * 2),
			this._columns - 1
		);

		// Build an array of the column indices to cache.
		const columnIndices = arrayFromIndexRange(startColumnIndex, endColumnIndex);

		// Build an array of the column schema indices that need to be cached.
		const columnSchemaIndices = columnIndices.filter(columnIndex =>
			!this._columnSchemaCache.has(columnIndex)
		);

		// Initialize the cache updated flag.
		let cacheUpdated = false;

		// If there are column schema indices that need to be cached, cache them.
		if (columnSchemaIndices.length) {
			// Get the schema.
			const tableSchema = await this._dataExplorerClientInstance.getSchema(
				columnSchemaIndices[0],
				columnSchemaIndices[columnSchemaIndices.length - 1] - columnSchemaIndices[0] + 1
			);

			// Update the column schema cache, overwriting any entries we already have cached.
			for (let i = 0; i < tableSchema.columns.length; i++) {
				// Get the column schema and compute the column index.
				const columnSchema = tableSchema.columns[i];
				const columnIndex = columnSchemaIndices[0] + i;

				// Update the column schema cache.
				this._columnSchemaCache.set(columnIndex, columnSchema);
			}

			// Update the cache updated flag.
			cacheUpdated = true;
		}

		// Build an array of the column schema indices that need to be cached.
		const columnNullCountIndices = columnIndices.filter(columnIndex =>
			!this._columnNullCountCache.has(columnIndex)
		);

		// If there are null counts that need to be cached, cache them.
		if (columnNullCountIndices.length) {
			// Request the profiles
			const results = await this._dataExplorerClientInstance.getColumnProfiles(
				columnNullCountIndices.map(column_index => {
					return {
						column_index,
						profile_type: ColumnProfileType.NullCount
					};
				})
			);

			// Update the column schema cache, overwriting any entries we already have cached.
			for (let i = 0; i < results.length; i++) {
				this._columnNullCountCache.set(columnNullCountIndices[i], results[i].null_count!);
			}

			// Update the cache updated flag.
			cacheUpdated = true;
		}

		// If the cache was updated, fire the onDidUpdateCache event.
		if (cacheUpdated) {
			this._onDidUpdateCache.fire();
		}

		// Clear the updating flag.
		this._updating = false;

		// If there is a pending update descriptor, update the cache for it.
		if (this._pendingUpdateDescriptor) {
			// Get the pending update descriptor and clear it.
			const pendingUpdateDescriptor = this._pendingUpdateDescriptor;
			this._pendingUpdateDescriptor = undefined;

			// Update the cache for the pending update descriptor.
			await this.updateCache(pendingUpdateDescriptor);
		}
	}

	//#endregion Private Methods
}
