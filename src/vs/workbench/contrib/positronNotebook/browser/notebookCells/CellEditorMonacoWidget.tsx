/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import * as React from 'react';
import * as DOM from 'vs/base/browser/dom';
import { EditorExtensionsRegistry, IEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';

import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { FloatingEditorClickMenu } from 'vs/workbench/browser/codeeditor';
import { CellEditorOptions } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellEditorOptions';
import { useNotebookInstance } from 'vs/workbench/contrib/positronNotebook/browser/NotebookInstanceProvider';
import { useServices } from 'vs/workbench/contrib/positronNotebook/browser/ServicesProvider';
import { IPositronNotebookCell } from 'vs/workbench/contrib/positronNotebook/browser/notebookCells/interfaces';
import { observeValue } from 'vs/workbench/contrib/positronNotebook/common/utils/observeValue';


/**
 *
 * @param opts.cell Cell to be shown and edited in the editor widget
 * @returns An editor widget for the cell
 */
export function CellEditorMonacoWidget({ cell }: { cell: IPositronNotebookCell }) {
	const { editorPartRef } = useCellEditorWidget(cell);
	return <div ref={editorPartRef} />;
}


/**
 * Create a cell editor widget for a cell.
 * @param cell Cell whose editor is to be created
 * @returns Refs to place the editor and the wrapping div
 */
export function useCellEditorWidget(cell: IPositronNotebookCell) {
	const services = useServices();
	const instance = useNotebookInstance();

	const sizeObservable = services.sizeObservable;

	// Grab the wrapping div for the editor. This is used for passing context key service
	const editorPartRef = React.useRef<HTMLDivElement>(null);
	// Grab a ref to the div that will hold the editor. This is needed to pass an element to the
	// editor creation function.


	// Create the editor
	React.useEffect(() => {
		if (!editorPartRef.current) {
			console.log('no editor part or container');
			return;
		}

		// We need to use a native dom element here instead of a react ref one because the elements
		// created by react's refs are not _true_ dom elements and thus calls like `refEl instanceof
		// HTMLElement` will return false. This is a problem when we hand the elements into the
		// editor widget as it expects a true dom element.
		const nativeContainer = DOM.$('.positron-monaco-editor-container');
		editorPartRef.current.appendChild(nativeContainer);

		const language = cell.cellModel.language;
		const editorContextKeyService = services.scopedContextKeyProviderCallback(editorPartRef.current);
		const editorInstaService = services.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService]));
		const editorOptions = new CellEditorOptions(instance.getBaseCellEditorOptions(language), instance.notebookOptions, services.configurationService);

		const editor = editorInstaService.createInstance(CodeEditorWidget, nativeContainer, {
			...editorOptions.getDefaultValue(),
			dimension: {
				width: 500,
				height: 200
			},
		}, {
			contributions: getNotebookEditorContributions()
		});


		editor.setValue(cell.getContent());


		/**
		 * Resize the editor widget to fill the width of its container and the height of its
		 * content.
		 * @param height Height to set. Defaults to checking content height.
		 */
		function resizeEditor(height: number = editor.getContentHeight()) {
			editor.layout({
				height,
				width: editorPartRef.current?.offsetWidth ?? 500
			});
		}

		// Request model for cell and pass to editor.
		cell.getTextEditorModel().then(model => {
			editor.setModel(model);
			resizeEditor();

			editor.onDidContentSizeChange(e => {
				if (!(e.contentHeightChanged || e.contentWidthChanged)) { return; }
				resizeEditor(e.contentHeight);
			});
		});

		// Keep the width up-to-date as the window resizes.
		const sizeObserver = observeValue(sizeObservable, {
			handleChange() {
				resizeEditor();
			}
		});

		services.logService.info('Positron Notebook | useCellEditorWidget() | Setting up editor widget');


		return () => {
			services.logService.info('Positron Notebook | useCellEditorWidget() | Disposing editor widget');
			editor.dispose();
			nativeContainer.remove();
			editorContextKeyService.dispose();
			sizeObserver();
		};
	}, [cell, instance, services, sizeObservable]);



	return { editorPartRef };

}


/**
 * Get the notebook options for the editor widget.
 * Taken directly from `getDefaultNotebookCreationOptions()` in notebookEditorWidget.ts
*/
function getNotebookEditorContributions(): IEditorContributionDescription[] {
	// Taken directly from `getDefaultNotebookCreationOptions()` in notebookEditorWidget.ts

	const skipContributions = [
		'editor.contrib.review',
		FloatingEditorClickMenu.ID,
		'editor.contrib.dirtydiff',
		'editor.contrib.testingOutputPeek',
		'editor.contrib.testingDecorations',
		'store.contrib.stickyScrollController',
		'editor.contrib.findController',
		'editor.contrib.emptyTextEditorHint'
	];

	// In the future we may want to be more selective about which contributions we include if our
	// feature set diverges more drastically from the standaard notebooks.
	return EditorExtensionsRegistry.getEditorContributions().filter(c => skipContributions.indexOf(c.id) === -1);
}
