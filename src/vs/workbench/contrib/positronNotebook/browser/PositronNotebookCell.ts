/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns
import { marked } from 'marked';

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ISettableObservable, observableValue } from 'vs/base/common/observableInternal/base';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { CellKind, ICellOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IPositronNotebookInstance } from 'vs/workbench/contrib/positronNotebook/browser/PositronNotebookInstance';
import { ExecutionStatus, IPositronNotebookCodeCell, IPositronNotebookGeneralCell, IPositronNotebookMarkupCell } from 'vs/workbench/contrib/positronNotebook/browser/notebookCells/interfaces';


abstract class PositronNotebookCellGeneral extends Disposable implements IPositronNotebookGeneralCell {
	kind!: CellKind;

	// Not marked as private so we can access it in subclasses
	_disposableStore = new DisposableStore();

	constructor(
		public cellModel: NotebookCellTextModel,
		public _instance: IPositronNotebookInstance,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
	) {
		super();
	}

	get uri(): URI {
		return this.cellModel.uri;
	}

	get viewModel(): ICellViewModel {

		const notebookViewModel = this._instance.viewModel;
		if (!notebookViewModel) {
			throw new Error('Notebook view model not found');
		}

		const viewCells = notebookViewModel.viewCells;

		const cell = viewCells.find(cell => cell.uri.toString() === this.cellModel.uri.toString());

		if (cell) {
			return cell;
		}

		throw new Error('Cell view model not found');
	}

	getContent(): string {
		return this.cellModel.getValue();
	}

	async getTextEditorModel(): Promise<ITextModel> {
		const modelRef = await this.textModelResolverService.createModelReference(this.uri);
		return modelRef.object.textEditorModel;
	}

	delete(): void {
		this._instance.deleteCell(this);
	}

	override dispose(): void {
		this._disposableStore.dispose();
		super.dispose();
	}
}


class PositronNotebookCodeCell extends PositronNotebookCellGeneral implements IPositronNotebookCodeCell {
	override kind: CellKind.Code = CellKind.Code;
	executionStatus: ISettableObservable<ExecutionStatus, void>;
	outputs: ISettableObservable<ICellOutput[], void>;


	constructor(
		cellModel: NotebookCellTextModel,
		instance: IPositronNotebookInstance,
		textModelResolverService: ITextModelService,
	) {
		super(cellModel, instance, textModelResolverService);

		this.executionStatus = observableValue<ExecutionStatus, void>('cellExecutionStatus', 'idle');
		this.outputs = observableValue<ICellOutput[], void>('cellOutputs', this.cellModel.outputs);

		// Listen for changes to the cell outputs and update the observable
		this._register(
			this.cellModel.onDidChangeOutputs(() => {
				// By unpacking the array and repacking we make sure that
				// the React component will rerender when the outputs change. Probably not
				// great to have this leak here.
				this.outputs.set([...this.cellModel.outputs], undefined);
			})
		);
	}

	run(): void {
		this._instance.runCells([this]);
	}
}




class PositronNotebookMarkupCell extends PositronNotebookCellGeneral implements IPositronNotebookMarkupCell {

	renderedHtml: ISettableObservable<string | undefined> = observableValue<string | undefined, void>('renderedHTML', undefined);
	editorShown: ISettableObservable<boolean> = observableValue<boolean, void>('editorShown', false);
	override kind: CellKind.Markup = CellKind.Markup;

	constructor(
		cellModel: NotebookCellTextModel,
		instance: IPositronNotebookInstance,
		textModelResolverService: ITextModelService,
	) {
		super(cellModel, instance, textModelResolverService);

		// Render the markdown content and update the observable when the cell content changes
		this._disposableStore.add(this.cellModel.onDidChangeContent(() => {
			this._renderContent();
		}));

		this._renderContent();
	}

	private _renderContent(): void {
		const renderedHtml = marked(this.getContent());
		if (typeof renderedHtml !== 'string') {
			throw new Error('Notebooks do not support async markdown rendering yet.');
		}
		this.renderedHtml.set(renderedHtml, undefined);
	}

	showEditor(): void {
		this.editorShown.set(true, undefined);
	}
	hideEditor(): void {
		this.editorShown.set(false, undefined);
	}
	toggleEditor(): void {
		this.editorShown.set(!this.editorShown.get(), undefined);
	}
}

/**
 * Instantiate a notebook cell based on the cell's kind
 * @param cell Text model for the cell
 * @param instance The containing Positron notebook instance that this cell resides in.
 * @param instantiationService The instantiation service to use to create the cell
 * @returns The instantiated notebook cell of the correct type.
 */
export function createNotebookCell(cell: NotebookCellTextModel, instance: IPositronNotebookInstance, instantiationService: IInstantiationService) {
	if (cell.cellKind === CellKind.Code) {
		return instantiationService.createInstance(PositronNotebookCodeCell, cell, instance);
	} else {
		return instantiationService.createInstance(PositronNotebookMarkupCell, cell, instance);
	}
}



