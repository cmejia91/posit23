/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./dataGridRowHeader';

// React.
import * as React from 'react';
import { MouseEvent } from 'react'; // eslint-disable-line no-duplicate-imports

// Other dependencies.
import { isMacintosh } from 'vs/base/common/platform';
import { positronClassNames } from 'vs/base/common/positronUtilities';
import { selectionType } from 'vs/workbench/browser/positronDataGrid/utilities/mouseUtilities';
import { RowSelectionState } from 'vs/workbench/browser/positronDataGrid/classes/dataGridInstance';
import { VerticalSplitter } from 'vs/base/browser/ui/positronComponents/splitters/verticalSplitter';
import { HorizontalSplitter } from 'vs/base/browser/ui/positronComponents/splitters/horizontalSplitter';
import { usePositronDataGridContext } from 'vs/workbench/browser/positronDataGrid/positronDataGridContext';

/**
 * DataGridRowHeaderProps interface.
 */
interface DataGridRowHeaderProps {
	rowIndex: number;
	top: number;
}

/**
 * DataGridRowHeader component.
 * @param props A DataGridRowHeaderProps that contains the component properties.
 * @returns The rendered component.
 */
export const DataGridRowHeader = (props: DataGridRowHeaderProps) => {
	// Context hooks.
	const context = usePositronDataGridContext();

	/**
	 * MouseDown handler.
	 * @param e A MouseEvent<HTMLElement> that describes a user interaction with the mouse.
	 * @returns A Promise<void> that resolves when the operation is complete.
	 */
	const mouseDownHandler = (e: MouseEvent<HTMLElement>) => {
		// Ignore mouse events with meta / ctrl key.
		if (isMacintosh ? e.metaKey : e.ctrlKey) {
			return;
		}

		// Consume the event.
		e.stopPropagation();

		// If selection is enabled, process selection.
		if (context.instance.selection) {
			// Mouse select the row.
			context.instance.mouseSelectRow(props.rowIndex, selectionType(e));
		}
	};

	// Get the row selection state.
	const rowSelectionState = context.instance.rowSelectionState(props.rowIndex);

	// Render.
	return (
		<div
			className={
				positronClassNames(
					'data-grid-row-header',
					{ 'selected': rowSelectionState & RowSelectionState.Selected }
				)
			}
			style={{
				top: props.top,
				height: context.instance.getRowHeight(props.rowIndex)
			}}
			onMouseDown={mouseDownHandler}
		>
			<div
				className={
					positronClassNames(
						'data-grid-row-header-border-overlay',
						{ 'selected': rowSelectionState & RowSelectionState.Selected },
						{ 'selected-top': rowSelectionState & RowSelectionState.SelectedTop },
						{ 'selected-bottom': rowSelectionState & RowSelectionState.SelectedBottom }
					)
				}
			/>
			<div className='content'>
				{context.instance.rowHeader(props.rowIndex)}
			</div>
			<VerticalSplitter
				onBeginResize={() => ({
					minimumWidth: 20,
					maximumWidth: 400,
					startingWidth: context.instance.rowHeadersWidth
				})}
				onResize={async width =>
					await context.instance.setRowHeadersWidth(width)
				}
			/>
			{context.instance.rowResize &&
				<HorizontalSplitter
					onBeginResize={() => ({
						minimumHeight: context.instance.minimumRowHeight,
						maximumHeight: 90,
						startingHeight: context.instance.getRowHeight(props.rowIndex)
					})}
					onResize={async height =>
						await context.instance.setRowHeight(props.rowIndex, height)
					}
				/>
			}
		</div>
	);
};
