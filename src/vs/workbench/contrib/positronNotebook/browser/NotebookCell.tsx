/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import 'vs/css!./NotebookCell';

import * as React from 'react';
import { PositronButton } from 'vs/base/browser/ui/positronComponents/positronButton';
import { VSBuffer } from 'vs/base/common/buffer';
import { NotebookCellOutputTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellOutputTextModel';
import { ICellOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { PositronNotebookCell } from 'vs/workbench/contrib/positronNotebook/browser/PositronNotebookCell';
import { parseOutputData } from 'vs/workbench/contrib/positronNotebook/browser/getOutputContents';
import { useObservedValue } from 'vs/workbench/contrib/positronNotebook/browser/useObservedValue';
import { useCellEditorWidget } from './useCellEditorWidget';
import { localize } from 'vs/nls';

/**
 * Logic for running a cell and handling its output.
 * @param opts.cell The `PositronNotebookCell` to render
 */
export function NotebookCell(opts: {
	cell: PositronNotebookCell;
}) {

	const { editorPartRef, editorContainerRef } = useCellEditorWidget(opts);

	const executionStatus = useObservedValue(opts.cell.executionStatus);
	const outputContents = useObservedValue(opts.cell.outputs);

	const isRunning = executionStatus === 'running';
	return (
		<div className={`positron-notebook-cell ${executionStatus}`}
			data-status={executionStatus}
		>
			<div className='action-bar'>
				<PositronButton
					className='action-button'
					ariaLabel={isRunning ? localize('stopExecution', 'Stop execution') : localize('runCell', 'Run cell')}
					onPressed={() => opts.cell.run()} >
					<div className={`button-icon codicon ${isRunning ? 'codicon-primitive-square' : 'codicon-run'}`} />
				</PositronButton>
				<PositronButton
					className='action-button'
					ariaLabel={localize('deleteCell', 'Delete cell')}
					onPressed={() => opts.cell.delete()}
				>
					<div className='button-icon codicon codicon-trash' />
				</PositronButton>
			</div>
			<div className='cell-contents'>
				<div ref={editorPartRef}>
					<div ref={editorContainerRef} className='positron-monaco-editor-container'></div>
				</div>
				<div className='positron-notebook-cell-outputs'>
					{
						outputContents?.map((output) =>
							<NotebookCellOutput key={output.outputId} cellOutput={output} />)
					}
				</div>
			</div>
		</div >
	);
}



function NotebookCellOutput({ cellOutput }: { cellOutput: ICellOutput }) {

	const { outputs } = cellOutput;

	if (!(cellOutput instanceof NotebookCellOutputTextModel)) {
		return <div>Cant handle output type yet: OutputId: ${cellOutput.outputId}</div>;
	}

	return <>
		{
			outputs.map(({ data, mime }, i) => <CellOutputContents key={i} data={data} mime={mime} />)
		}
	</>;
}


function CellOutputContents(output: { data: VSBuffer; mime: string }) {

	const parsed = parseOutputData(output);

	switch (parsed.type) {
		case 'stdout':
			return <div className='notebook-stdout'>{parsed.content}</div>;
		case 'stderr':
			return <div className='notebook-stderr'>{parsed.content}</div>;
		case 'interupt':
			return <div className='notebook-error'>Cell execution stopped due to keyboard interupt.</div>;
		case 'text':
			return <div className='notebook-text'>{parsed.content}</div>;
		case 'image':
			return <img src={parsed.dataUrl} alt='output image' />;
		case 'unknown':
			return <div className='unknown-mime-type'>Cant handle mime type &quot;{output.mime}&quot; yet</div>;
	}

}

