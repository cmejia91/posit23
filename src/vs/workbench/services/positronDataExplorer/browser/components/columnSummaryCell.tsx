/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./columnSummaryCell';

// React.
import * as React from 'react';

// Other dependencies.
import { ProfileNumber } from 'vs/workbench/services/positronDataExplorer/browser/components/profileNumber';
import { ProfileString } from 'vs/workbench/services/positronDataExplorer/browser/components/profileString';
import { ColumnSchema, ColumnDisplayType } from 'vs/workbench/services/languageRuntime/common/positronDataExplorerComm';
import { TableSummaryDataGridInstance } from 'vs/workbench/services/positronDataExplorer/browser/tableSummaryDataGridInstance';

/**
 * ColumnSummaryCellProps interface.
 */
interface ColumnSummaryCellProps {
	instance: TableSummaryDataGridInstance;
	columnSchema: ColumnSchema;
	columnIndex: number;
	onDoubleClick: () => void;
}

/**
 * ColumnSummaryCell component.
 * @param props A ColumnSummaryCellProps that contains the component properties.
 * @returns The rendered component.
 */
export const ColumnSummaryCell = (props: ColumnSummaryCellProps) => {
	/**
	 * Returns the data type icon for the column schema.
	 * @returns The data type icon.
	 */
	const dataTypeIcon = () => {
		// Determine the alignment based on type.
		switch (props.columnSchema.type_display) {
			case ColumnDisplayType.Number:
				return 'codicon-positron-data-type-number';

			case ColumnDisplayType.Boolean:
				return 'codicon-positron-data-type-boolean';

			case ColumnDisplayType.String:
				return 'codicon-positron-data-type-string';

			case ColumnDisplayType.Date:
				return 'codicon-positron-data-type-date';

			case ColumnDisplayType.Datetime:
				return 'codicon-positron-data-type-date-time';

			case ColumnDisplayType.Time:
				return 'codicon-positron-data-type-time';

			case ColumnDisplayType.Array:
				return 'codicon-positron-data-type-array';

			case ColumnDisplayType.Struct:
				return 'codicon-positron-data-type-struct';

			case ColumnDisplayType.Unknown:
				return 'codicon-positron-data-type-unknown';

			// This shouldn't ever happen.
			default:
				return 'codicon-question';
		}
	};

	/**
	 * Returns the profile component for the column.
	 * @returns The profile component.
	 */
	const profile = () => {
		// Hack just to get things working
		props.instance.computeColumnSummaryStats(props.columnIndex);
		// Determine the alignment based on type.
		switch (props.columnSchema.type_display) {
			case ColumnDisplayType.Number:
				return <ProfileNumber
					instance={props.instance}
					columnIndex={props.columnIndex}
				/>;

			case ColumnDisplayType.Boolean:
				return null;

			case ColumnDisplayType.String:
				return <ProfileString />;

			case ColumnDisplayType.Date:
				return null;

			case ColumnDisplayType.Datetime:
				return null;

			case ColumnDisplayType.Time:
				return null;

			case ColumnDisplayType.Array:
				return null;

			case ColumnDisplayType.Struct:
				return null;

			case ColumnDisplayType.Unknown:
				return null;

			// This shouldn't ever happen.
			default:
				return null;
		}
	};

	// Get the expanded state of the column.
	const expanded = props.instance.isColumnExpanded(props.columnIndex);

	// Render.
	return (
		<div
			className='column-summary'
			onDoubleClick={props.onDoubleClick}
		>
			{props.columnIndex === props.instance.cursorRowIndex &&
				<div className='cursor-background' />
			}
			<div className='basic-info'>
				<div
					className='expand-collapse-button'
					onClick={() =>
						props.instance.toggleExpandColumn(props.columnIndex)
					}
				>
					{expanded ?
						<div className={`expand-collapse-icon codicon codicon-chevron-down`} /> :
						<div className={`expand-collapse-icon codicon codicon-chevron-right`} />
					}
				</div>

				<div className={`data-type-icon codicon ${dataTypeIcon()}`}></div>
				<div className='column-name'>
					{props.columnSchema.column_name}
				</div>
				<div className='missing-values'>
					{props.instance.getColumnNullPercent(props.columnIndex)}%
				</div>

			</div>
			{expanded &&
				<div className='profile-info'>
					{profile()}
				</div>
			}
		</div>
	);
};
