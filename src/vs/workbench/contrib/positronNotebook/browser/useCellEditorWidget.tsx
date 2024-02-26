/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import * as React from 'react';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellEditorOptions } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellEditorOptions';
import { useContextKeyServiceProvider } from 'vs/workbench/contrib/positronNotebook/browser/ContextKeyServiceProvider';
import { useServices } from 'vs/workbench/contrib/positronNotebook/browser/ServicesProvider';
import { useDisposableStore } from './useDisposableStore';
import * as DOM from 'vs/base/browser/dom';

/**
 * Create a cell editor widget for a cell.
 * @param cell Cell whose editor is to be created
 * @returns Refs to place the editor and the wrapping div
 */
export function useCellEditorWidget(cell: ICellViewModel) {
	const services = useServices();
	const templateDisposables = useDisposableStore();

	// Grab the wrapping div for the editor. This is used for passing context key service
	// TODO: Understand this better.
	const editorPartRef = React.useRef<HTMLDivElement>(null);
	// Grab a ref to the div that will hold the editor. This is needed to pass an element to the
	// editor creation function.
	const editorContainerRef = React.useRef<HTMLDivElement>(null);

	const contextKeyServiceProvider = useContextKeyServiceProvider();

	// Create the editor
	React.useEffect(() => {
		if (!editorPartRef.current || !editorContainerRef.current) {
			console.log('no editor part or container');
			return;
		}

		const language = cell.language;
		const editorContextKeyService = templateDisposables.add(contextKeyServiceProvider(editorPartRef.current));
		const editorInstaService = services.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService]));
		const editorOptions = new CellEditorOptions(services.notebookWidget.getBaseCellEditorOptions(language), services.notebookWidget.notebookOptions, services.configurationService);
		const editorContributions = services.notebookWidget.creationOptions?.cellEditorContributions ?? [];

		const editor = editorInstaService.createInstance(CodeEditorWidget, editorContainerRef.current, {
			...editorOptions.getDefaultValue(),
			dimension: {
				width: 500,
				height: 200
			},
		}, {
			contributions: editorContributions
		});


		editor.setValue(cell.getText());


		/**
		 * Resize the editor widget to fill the width of its container and the height of its
		 * content.
		 * @param height Height to set. Defaults to checking content height.
		 */
		function resizeEditor(height: number = editor.getContentHeight()) {
			editor.layout({
				height,
				width: editorContainerRef.current?.offsetWidth ?? 500
			});
		}

		// Request model for cell and pass to editor.
		services.textModelResolverService.createModelReference(cell.uri).then(modelRef => {
			editor.setModel(modelRef.object.textEditorModel);
			resizeEditor();

			editor.onDidContentSizeChange(e => {
				if (!(e.contentHeightChanged || e.contentWidthChanged)) { return; }
				resizeEditor(e.contentHeight);
			});
		});


		// Keep the width up-to-date as the window resizes.
		const activeWindow = DOM.getActiveWindow();

		// Need to define here so we can remove the event listener in cleanup.
		function updateWidthOnResize() { resizeEditor(); }
		activeWindow.addEventListener('resize', updateWidthOnResize);

		return () => {
			editor.dispose();
			activeWindow.removeEventListener('resize', updateWidthOnResize);
		};
	}, [cell, contextKeyServiceProvider, services.configurationService, services.instantiationService, services.notebookWidget, services.textModelResolverService, templateDisposables]);

	return { editorPartRef, editorContainerRef };

}


