/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, RunOnceScheduler } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorOption, IEditorMinimapOptions } from 'vs/editor/common/config/editorOptions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { IModelDeltaDecoration, MinimapPosition, MinimapSectionHeaderStyle, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { FindSectionHeaderOptions, SectionHeader } from 'vs/editor/common/services/findSectionHeaders';

export class SectionHeaderDetector extends Disposable implements IEditorContribution {

	public static readonly ID: string = 'editor.sectionHeaderDetector';

	private options: FindSectionHeaderOptions | undefined;
	private decorations = this.editor.createDecorationsCollection();
	private computeSectionHeaders: RunOnceScheduler;
	private computePromise: CancelablePromise<SectionHeader[]> | null;
	private currentOccurrences: { [decorationId: string]: SectionHeaderOccurrence };

	constructor(
		private readonly editor: ICodeEditor,
		@ILanguageConfigurationService private readonly languageConfigurationService: ILanguageConfigurationService,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
	) {
		super();

		this.options = this.createOptions(editor.getOption(EditorOption.minimap));
		this.computePromise = null;
		this.currentOccurrences = {};

		this._register(editor.onDidChangeModel((e) => {
			this.currentOccurrences = {};
			this.options = this.createOptions(editor.getOption(EditorOption.minimap));
			this.stop();
			this.computeSectionHeaders.schedule(0);
		}));

		this._register(editor.onDidChangeModelLanguage((e) => {
			this.currentOccurrences = {};
			this.options = this.createOptions(editor.getOption(EditorOption.minimap));
			this.stop();
			this.computeSectionHeaders.schedule(0);
		}));

		this._register(languageConfigurationService.onDidChange((e) => {
			const editorLanguageId = this.editor.getModel()?.getLanguageId();
			if (editorLanguageId && e.affects(editorLanguageId)) {
				this.currentOccurrences = {};
				this.options = this.createOptions(editor.getOption(EditorOption.minimap));
				this.stop();
				this.computeSectionHeaders.schedule(0);
			}
		}));

		this._register(editor.onDidChangeConfiguration(e => {
			if (this.options && !e.hasChanged(EditorOption.minimap)) {
				return;
			}

			this.options = this.createOptions(editor.getOption(EditorOption.minimap));

			// Remove any links (for the getting disabled case)
			this.updateDecorations([]);

			// Stop any computation (for the getting disabled case)
			this.stop();

			// Start computing (for the getting enabled case)
			this.computeSectionHeaders.schedule(0);
		}));

		this._register(this.editor.onDidChangeModelContent(e => {
			this.computeSectionHeaders.schedule();
		}));

		this.computeSectionHeaders = this._register(new RunOnceScheduler(() => {
			this.findSectionHeaders();
		}, 250));

		this.computeSectionHeaders.schedule(0);
	}

	private createOptions(minimap: Readonly<Required<IEditorMinimapOptions>>): FindSectionHeaderOptions | undefined {
		if (!minimap || !this.editor.hasModel()) {
			return undefined;
		}

		const languageId = this.editor.getModel().getLanguageId();
		if (!languageId) {
			return undefined;
		}

		const commentsConfiguration = this.languageConfigurationService.getLanguageConfiguration(languageId).comments;
		const foldingRules = this.languageConfigurationService.getLanguageConfiguration(languageId).foldingRules;

		if (!commentsConfiguration && !foldingRules?.markers) {
			return undefined;
		}

		return {
			foldingRules,
			findMarkSectionHeaders: minimap.showMarkSectionHeaders,
			findRegionSectionHeaders: minimap.showRegionSectionHeaders,
		};
	}

	private findSectionHeaders() {
		if (!this.editor.hasModel()
			|| (!this.options?.findMarkSectionHeaders && !this.options?.findRegionSectionHeaders)) {
			return;
		}

		const model = this.editor.getModel();
		if (model.isDisposed() || model.isTooLargeForSyncing()) {
			return;
		}

		const modelVersionId = model.getVersionId();
		this.editorWorkerService.findSectionHeaders(model.uri, this.options)
			.then((sectionHeaders) => {
				if (model.isDisposed() || model.getVersionId() !== modelVersionId) {
					// model changed in the meantime
					return;
				}
				this.updateDecorations(sectionHeaders);
			});
	}

	private updateDecorations(sectionHeaders: SectionHeader[]): void {

		const model = this.editor.getModel();
		if (model) {
			// Remove all section headers that should be in comments and are not in comments
			sectionHeaders = sectionHeaders.filter((sectionHeader) => {
				if (!sectionHeader.shouldBeInComments) {
					return true;
				}
				const validRange = model.validateRange(sectionHeader.range);
				const tokens = model.tokenization.getLineTokens(validRange.startLineNumber);
				const idx = tokens.findTokenIndexAtOffset(validRange.startColumn - 1);
				const tokenType = tokens.getStandardTokenType(idx);
				const languageId = tokens.getLanguageId(idx);
				return (languageId === model.getLanguageId() && tokenType === StandardTokenType.Comment);
			});
		}

		const oldDecorations = Object.values(this.currentOccurrences).map(occurrence => occurrence.decorationId);
		const newDecorations = sectionHeaders.map(sectionHeader => decoration(sectionHeader));

		this.editor.changeDecorations((changeAccessor) => {
			const decorations = changeAccessor.deltaDecorations(oldDecorations, newDecorations);

			this.currentOccurrences = {};
			for (let i = 0, len = decorations.length; i < len; i++) {
				const occurrence = { sectionHeader: sectionHeaders[i], decorationId: decorations[i] };
				this.currentOccurrences[occurrence.decorationId] = occurrence;
			}
		});
	}

	private stop(): void {
		this.computeSectionHeaders.cancel();
		if (this.computePromise) {
			this.computePromise.cancel();
			this.computePromise = null;
		}
	}

	public override dispose(): void {
		super.dispose();
		this.stop();
		this.decorations.clear();
	}

}

interface SectionHeaderOccurrence {
	readonly sectionHeader: SectionHeader;
	readonly decorationId: string;
}

function decoration(sectionHeader: SectionHeader): IModelDeltaDecoration {
	return {
		range: sectionHeader.range,
		options: ModelDecorationOptions.createDynamic({
			description: 'section-header',
			stickiness: TrackedRangeStickiness.GrowsOnlyWhenTypingAfter,
			collapseOnReplaceEdit: true,
			minimap: {
				color: undefined,
				position: MinimapPosition.Inline,
				sectionHeaderStyle: sectionHeader.hasSeparatorLine ? MinimapSectionHeaderStyle.Underlined : MinimapSectionHeaderStyle.Normal,
				sectionHeaderText: sectionHeader.text,
			},
		})
	};
}

registerEditorContribution(SectionHeaderDetector.ID, SectionHeaderDetector, EditorContributionInstantiation.AfterFirstRender);
