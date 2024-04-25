/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import 'vs/css!./NotebookCellWrapper';

import * as React from 'react';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IPositronNotebookCell } from 'vs/workbench/contrib/positronNotebook/browser/notebookCells/interfaces';
import { useObservedValue } from 'vs/workbench/contrib/positronNotebook/browser/useObservedValue';

export function NotebookCellWrapper({ cell, children }: { cell: IPositronNotebookCell; children: React.ReactNode }) {
	const selected = useObservedValue(cell.selected);
	const editing = useObservedValue(cell.editing);
	const cellRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (cellRef.current) {
			cell.attachContainer(cellRef.current);
		}
	}, [cell, cellRef]);

	const selectionClass = editing ? 'editing' : selected ? 'selected' : 'unselected';
	return <div
		className={`positron-notebook-cell positron-notebook-${cell.kind === CellKind.Code ? 'code' : 'markdown'}-cell ${selectionClass}`}
		ref={cellRef}
		tabIndex={0}
		// onFocus={cell.select}
		onClick={(e) => {
			const clickTarget = e.nativeEvent.target as HTMLElement;
			// If any of the element or its parents have the class
			// 'positron-cell-editor-monaco-widget' then don't run the select code as the editor
			// widget itself handles that logic
			const childOfEditor = clickTarget.closest('.positron-cell-editor-monaco-widget');
			if (childOfEditor) {
				return;
			}
			cell.select();
		}}
	>
		{children}
	</div>;
}
