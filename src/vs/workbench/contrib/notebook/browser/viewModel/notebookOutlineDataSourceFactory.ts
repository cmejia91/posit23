/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ReferenceCollection, type IReference } from 'vs/base/common/lifecycle';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import type { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookCellOutlineDataSource } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineDataSource';

class NotebookCellOutlineDataSourceReferenceCollection extends ReferenceCollection<NotebookCellOutlineDataSource> {
	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
	}
	protected override createReferencedObject(_key: string, editor: INotebookEditor): NotebookCellOutlineDataSource {
		return this.instantiationService.createInstance(NotebookCellOutlineDataSource, editor);
	}
	protected override destroyReferencedObject(_key: string, object: NotebookCellOutlineDataSource): void {
		object.dispose();
	}
}

export const INotebookCellOutlineDataSourceFactory = createDecorator<INotebookCellOutlineDataSourceFactory>('INotebookCellOutlineDataSourceFactory');

export interface INotebookCellOutlineDataSourceFactory {
	getOrCreate(editor: INotebookEditor): IReference<NotebookCellOutlineDataSource>;
}

export class NotebookCellOutlineDataSourceFactory implements INotebookCellOutlineDataSourceFactory {
	private readonly _data: NotebookCellOutlineDataSourceReferenceCollection;
	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		this._data = instantiationService.createInstance(NotebookCellOutlineDataSourceReferenceCollection);
	}

	getOrCreate(editor: INotebookEditor): IReference<NotebookCellOutlineDataSource> {
		return this._data.acquire(editor.getId(), editor);
	}
}
