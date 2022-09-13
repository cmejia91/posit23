/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { windowOpenNoOpener } from 'vs/base/browser/dom';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { AbstractCodeEditorService } from 'vs/editor/browser/services/abstractCodeEditorService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IRange } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class StandaloneCodeEditorService extends AbstractCodeEditorService {

	private readonly _editorIsOpen: IContextKey<boolean>;
	private _activeCodeEditor: ICodeEditor | null;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
	) {
		super(themeService);
		this.onCodeEditorAdd(() => this._checkContextKey());
		this.onCodeEditorRemove(() => this._checkContextKey());
		this._editorIsOpen = contextKeyService.createKey('editorIsOpen', false);
		this._activeCodeEditor = null;

		this.registerCodeEditorOpenHandler(async (input, source, sideBySide) => {
			if (!source) {
				return null;
			}
			return this.doOpenEditor(source, input);
		});
	}

	private _checkContextKey(): void {
		let hasCodeEditor = false;
		for (const editor of this.listCodeEditors()) {
			if (!editor.isSimpleWidget) {
				hasCodeEditor = true;
				break;
			}
		}
		this._editorIsOpen.set(hasCodeEditor);
	}

	public setActiveCodeEditor(activeCodeEditor: ICodeEditor | null): void {
		this._activeCodeEditor = activeCodeEditor;
	}

	public getActiveCodeEditor(): ICodeEditor | null {
		return this._activeCodeEditor;
	}


	private doOpenEditor(editor: ICodeEditor, input: ITextResourceEditorInput): ICodeEditor | null {
		const model = this.findModel(editor, input.resource);
		if (!model) {
			if (input.resource) {

				const schema = input.resource.scheme;
				if (schema === Schemas.http || schema === Schemas.https) {
					// This is a fully qualified http or https URL
					windowOpenNoOpener(input.resource.toString());
					return editor;
				}
			}
			return null;
		}

		const selection = <IRange>(input.options ? input.options.selection : null);
		if (selection) {
			if (typeof selection.endLineNumber === 'number' && typeof selection.endColumn === 'number') {
				editor.setSelection(selection);
				editor.revealRangeInCenter(selection, ScrollType.Immediate);
			} else {
				const pos = {
					lineNumber: selection.startLineNumber,
					column: selection.startColumn
				};
				editor.setPosition(pos);
				editor.revealPositionInCenter(pos, ScrollType.Immediate);
			}
		}

		return editor;
	}

	private findModel(editor: ICodeEditor, resource: URI): ITextModel | null {
		const model = editor.getModel();
		if (model && model.uri.toString() !== resource.toString()) {
			return null;
		}

		return model;
	}
}

registerSingleton(ICodeEditorService, StandaloneCodeEditorService, false);
