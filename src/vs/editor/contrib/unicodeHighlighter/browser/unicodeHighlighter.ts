/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { CharCode } from 'vs/base/common/charCode';
import { Codicon } from 'vs/base/common/codicons';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { InvisibleCharacters, isBasicASCII } from 'vs/base/common/strings';
import 'vs/css!./unicodeHighlighter';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { InUntrustedWorkspace, inUntrustedWorkspace, EditorOption, InternalUnicodeHighlightOptions, unicodeHighlightConfigKeys } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDecoration, IModelDeltaDecoration, ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { UnicodeHighlighterOptions, UnicodeHighlighterReason, UnicodeHighlighterReasonKind, UnicodeTextModelHighlighter } from 'vs/editor/common/services/unicodeTextModelHighlighter';
import { IEditorWorkerService, IUnicodeHighlightsResult } from 'vs/editor/common/services/editorWorker';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { isModelDecorationInComment, isModelDecorationInString, isModelDecorationVisible } from 'vs/editor/common/viewModel/viewModelDecorations';
import { HoverAnchor, HoverAnchorType, HoverParticipantRegistry, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverParts } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { MarkdownHover, renderMarkdownHovers } from 'vs/editor/contrib/hover/browser/markdownHoverParticipant';
import { BannerController } from 'vs/editor/contrib/unicodeHighlighter/browser/bannerController';
import * as nls from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';

export const warningIcon = registerIcon('extensions-warning-message', Codicon.warning, nls.localize('warningIcon', 'Icon shown with a warning message in the extensions editor.'));

export class UnicodeHighlighter extends Disposable implements IEditorContribution {
	public static readonly ID = 'editor.contrib.unicodeHighlighter';

	private _highlighter: DocumentUnicodeHighlighter | ViewportUnicodeHighlighter | null = null;
	private _options: InternalUnicodeHighlightOptions;

	private readonly _bannerController: BannerController;
	private _bannerClosed: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustService: IWorkspaceTrustManagementService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._bannerController = this._register(instantiationService.createInstance(BannerController, _editor));

		this._register(this._editor.onDidChangeModel(() => {
			this._bannerClosed = false;
			this._updateHighlighter();
		}));

		this._options = _editor.getOption(EditorOption.unicodeHighlighting);

		this._register(_workspaceTrustService.onDidChangeTrust(e => {
			this._updateHighlighter();
		}));

		this._register(_editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.unicodeHighlighting)) {
				this._options = _editor.getOption(EditorOption.unicodeHighlighting);
				this._updateHighlighter();
			}
		}));

		this._updateHighlighter();
	}

	public override dispose(): void {
		if (this._highlighter) {
			this._highlighter.dispose();
			this._highlighter = null;
		}
		super.dispose();
	}

	private readonly _updateState = (state: IUnicodeHighlightsResult | null): void => {
		if (state && state.hasMore) {
			if (this._bannerClosed) {
				return;
			}

			// This document contains many non-basic ASCII characters.
			const max = Math.max(state.ambiguousCharacterCount, state.nonBasicAsciiCharacterCount, state.invisibleCharacterCount);

			let data;
			if (state.nonBasicAsciiCharacterCount >= max) {
				data = {
					message: nls.localize('unicodeHighlighting.thisDocumentHasManyNonBasicAsciiUnicodeCharacters', 'This document contains many non-basic ASCII unicode characters'),
					command: new DisableHighlightingOfNonBasicAsciiCharactersAction(),
				};
			} else if (state.ambiguousCharacterCount >= max) {
				data = {
					message: nls.localize('unicodeHighlighting.thisDocumentHasManyAmbiguousUnicodeCharacters', 'This document contains many ambiguous unicode characters'),
					command: new DisableHighlightingOfAmbiguousCharactersAction(),
				};
			} else if (state.invisibleCharacterCount >= max) {
				data = {
					message: nls.localize('unicodeHighlighting.thisDocumentHasManyInvisibleUnicodeCharacters', 'This document contains many invisible unicode characters'),
					command: new DisableHighlightingOfInvisibleCharactersAction(),
				};
			} else {
				throw new Error('Unreachable');
			}

			this._bannerController.show({
				id: 'unicodeHighlightBanner',
				message: data.message,
				icon: warningIcon,
				actions: [
					{
						label: data.command.shortLabel,
						href: `command:${data.command.id}`
					}
				],
				onClose: () => {
					this._bannerClosed = true;
				},
			});
		} else {
			this._bannerController.hide();
		}
	};

	private _updateHighlighter(): void {
		this._updateState(null);

		if (this._highlighter) {
			this._highlighter.dispose();
			this._highlighter = null;
		}
		if (!this._editor.hasModel()) {
			return;
		}
		const options = resolveOptions(this._workspaceTrustService.isWorkspaceTrusted(), this._options);

		if (
			[
				options.nonBasicASCII,
				options.ambiguousCharacters,
				options.invisibleCharacters,
			].every((option) => option === false)
		) {
			// Don't do anything if the feature is fully disabled
			return;
		}

		const highlightOptions: UnicodeHighlighterOptions = {
			nonBasicASCII: options.nonBasicASCII,
			ambiguousCharacters: options.ambiguousCharacters,
			invisibleCharacters: options.invisibleCharacters,
			includeComments: options.includeComments,
			includeStrings: options.includeStrings,
			allowedCodePoints: Object.keys(options.allowedCharacters).map(c => c.codePointAt(0)!),
			allowedLocales: Object.keys(options.allowedLocales).map(locale => {
				if (locale === '_os') {
					const osLocale = new Intl.NumberFormat().resolvedOptions().locale;
					return osLocale;
				} else if (locale === '_vscode') {
					return platform.language;
				}
				return locale;
			}),
		};

		if (this._editorWorkerService.canComputeUnicodeHighlights(this._editor.getModel().uri)) {
			this._highlighter = new DocumentUnicodeHighlighter(this._editor, highlightOptions, this._updateState, this._editorWorkerService);
		} else {
			this._highlighter = new ViewportUnicodeHighlighter(this._editor, highlightOptions, this._updateState);
		}
	}

	public getDecorationInfo(decoration: IModelDecoration): UnicodeHighlighterDecorationInfo | null {
		if (this._highlighter) {
			return this._highlighter.getDecorationInfo(decoration);
		}
		return null;
	}
}

export interface UnicodeHighlighterDecorationInfo {
	reason: UnicodeHighlighterReason;
	inComment: boolean;
	inString: boolean;
}

type Resolve<T> =
	T extends InUntrustedWorkspace ? never
	: T extends 'auto' ? never : T;

type ResolvedOptions = { [TKey in keyof InternalUnicodeHighlightOptions]: Resolve<InternalUnicodeHighlightOptions[TKey]> };

function resolveOptions(trusted: boolean, options: InternalUnicodeHighlightOptions): ResolvedOptions {
	return {
		nonBasicASCII: options.nonBasicASCII === inUntrustedWorkspace ? !trusted : options.nonBasicASCII,
		ambiguousCharacters: options.ambiguousCharacters,
		invisibleCharacters: options.invisibleCharacters,
		includeComments: options.includeComments === inUntrustedWorkspace ? !trusted : options.includeComments,
		includeStrings: options.includeStrings === inUntrustedWorkspace ? !trusted : options.includeStrings,
		allowedCharacters: options.allowedCharacters,
		allowedLocales: options.allowedLocales,
	};
}

class DocumentUnicodeHighlighter extends Disposable {
	private readonly _model: ITextModel = this._editor.getModel();
	private readonly _updateSoon: RunOnceScheduler;
	private _decorations = this._editor.createDecorationsCollection();

	constructor(
		private readonly _editor: IActiveCodeEditor,
		private readonly _options: UnicodeHighlighterOptions,
		private readonly _updateState: (state: IUnicodeHighlightsResult | null) => void,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) {
		super();
		this._updateSoon = this._register(new RunOnceScheduler(() => this._update(), 250));

		this._register(this._editor.onDidChangeModelContent(() => {
			this._updateSoon.schedule();
		}));

		this._updateSoon.schedule();
	}

	public override dispose() {
		this._decorations.clear();
		super.dispose();
	}

	private _update(): void {
		if (this._model.isDisposed()) {
			return;
		}

		if (!this._model.mightContainNonBasicASCII()) {
			this._decorations.clear();
			return;
		}

		const modelVersionId = this._model.getVersionId();
		this._editorWorkerService
			.computedUnicodeHighlights(this._model.uri, this._options)
			.then((info) => {
				if (this._model.isDisposed()) {
					return;
				}
				if (this._model.getVersionId() !== modelVersionId) {
					// model changed in the meantime
					return;
				}
				this._updateState(info);

				const decorations: IModelDeltaDecoration[] = [];
				if (!info.hasMore) {
					// Don't show decoration if there are too many.
					// In this case, a banner is shown.
					for (const range of info.ranges) {
						decorations.push({
							range: range,
							options: Decorations.instance.getDecorationFromOptions(this._options),
						});
					}
				}
				this._decorations.set(decorations);
			});
	}

	public getDecorationInfo(decoration: IModelDecoration): UnicodeHighlighterDecorationInfo | null {
		if (!this._decorations.has(decoration)) {
			return null;
		}
		const model = this._editor.getModel();
		if (
			!isModelDecorationVisible(model, decoration)
		) {
			return null;
		}
		const text = model.getValueInRange(decoration.range);
		return {
			reason: computeReason(text, this._options)!,
			inComment: isModelDecorationInComment(model, decoration),
			inString: isModelDecorationInString(model, decoration),
		};
	}
}

class ViewportUnicodeHighlighter extends Disposable {

	private readonly _model: ITextModel = this._editor.getModel();
	private readonly _updateSoon: RunOnceScheduler;
	private readonly _decorations = this._editor.createDecorationsCollection();

	constructor(
		private readonly _editor: IActiveCodeEditor,
		private readonly _options: UnicodeHighlighterOptions,
		private readonly _updateState: (state: IUnicodeHighlightsResult | null) => void,
	) {
		super();

		this._updateSoon = this._register(new RunOnceScheduler(() => this._update(), 250));

		this._register(this._editor.onDidLayoutChange(() => {
			this._updateSoon.schedule();
		}));
		this._register(this._editor.onDidScrollChange(() => {
			this._updateSoon.schedule();
		}));
		this._register(this._editor.onDidChangeHiddenAreas(() => {
			this._updateSoon.schedule();
		}));
		this._register(this._editor.onDidChangeModelContent(() => {
			this._updateSoon.schedule();
		}));

		this._updateSoon.schedule();
	}

	public override dispose() {
		this._decorations.clear();
		super.dispose();
	}

	private _update(): void {
		if (this._model.isDisposed()) {
			return;
		}

		if (!this._model.mightContainNonBasicASCII()) {
			this._decorations.clear();
			return;
		}

		const ranges = this._editor.getVisibleRanges();
		const decorations: IModelDeltaDecoration[] = [];
		const totalResult: IUnicodeHighlightsResult = {
			ranges: [],
			ambiguousCharacterCount: 0,
			invisibleCharacterCount: 0,
			nonBasicAsciiCharacterCount: 0,
			hasMore: false,
		};
		for (const range of ranges) {
			const result = UnicodeTextModelHighlighter.computeUnicodeHighlights(this._model, this._options, range);
			for (const r of result.ranges) {
				totalResult.ranges.push(r);
			}
			totalResult.ambiguousCharacterCount += totalResult.ambiguousCharacterCount;
			totalResult.invisibleCharacterCount += totalResult.invisibleCharacterCount;
			totalResult.nonBasicAsciiCharacterCount += totalResult.nonBasicAsciiCharacterCount;
			totalResult.hasMore = totalResult.hasMore || result.hasMore;
		}

		if (!totalResult.hasMore) {
			// Don't show decorations if there are too many.
			// A banner will be shown instead.
			for (const range of totalResult.ranges) {
				decorations.push({ range, options: Decorations.instance.getDecorationFromOptions(this._options) });
			}
		}
		this._updateState(totalResult);

		this._decorations.set(decorations);
	}

	public getDecorationInfo(decoration: IModelDecoration): UnicodeHighlighterDecorationInfo | null {
		if (!this._decorations.has(decoration)) {
			return null;
		}
		const model = this._editor.getModel();
		const text = model.getValueInRange(decoration.range);
		if (!isModelDecorationVisible(model, decoration)) {
			return null;
		}
		return {
			reason: computeReason(text, this._options)!,
			inComment: isModelDecorationInComment(model, decoration),
			inString: isModelDecorationInString(model, decoration),
		};
	}
}

export class UnicodeHighlighterHover implements IHoverPart {
	constructor(
		public readonly owner: IEditorHoverParticipant<UnicodeHighlighterHover>,
		public readonly range: Range,
		public readonly decoration: IModelDecoration
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}
}

const configureUnicodeHighlightOptionsStr = nls.localize('unicodeHighlight.configureUnicodeHighlightOptions', 'Configure Unicode Highlight Options');

export class UnicodeHighlighterHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	public readonly hoverOrdinal: number = 5;

	constructor(
		private readonly _editor: ICodeEditor,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
	}

	computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): MarkdownHover[] {
		if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
			return [];
		}

		const model = this._editor.getModel();

		const unicodeHighlighter = this._editor.getContribution<UnicodeHighlighter>(UnicodeHighlighter.ID);
		if (!unicodeHighlighter) {
			return [];
		}

		const result: MarkdownHover[] = [];
		const existedReason = new Set<string>();
		let index = 300;
		for (const d of lineDecorations) {

			const highlightInfo = unicodeHighlighter.getDecorationInfo(d);
			if (!highlightInfo) {
				continue;
			}
			const char = model.getValueInRange(d.range);
			// text refers to a single character.
			const codePoint = char.codePointAt(0)!;

			const codePointStr = formatCodePointMarkdown(codePoint);

			let reason: string;
			switch (highlightInfo.reason.kind) {
				case UnicodeHighlighterReasonKind.Ambiguous: {
					if (isBasicASCII(highlightInfo.reason.confusableWith)) {
						reason = nls.localize(
							'unicodeHighlight.characterIsAmbiguousASCII',
							'The character {0} could be confused with the ASCII character {1}, which is more common in source code.',
							codePointStr,
							formatCodePointMarkdown(highlightInfo.reason.confusableWith.codePointAt(0)!)
						);
					} else {
						reason = nls.localize(
							'unicodeHighlight.characterIsAmbiguous',
							'The character {0} could be confused with the character {1}, which is more common in source code.',
							codePointStr,
							formatCodePointMarkdown(highlightInfo.reason.confusableWith.codePointAt(0)!)
						);
					}
					break;
				}

				case UnicodeHighlighterReasonKind.Invisible:
					reason = nls.localize(
						'unicodeHighlight.characterIsInvisible',
						'The character {0} is invisible.',
						codePointStr
					);
					break;

				case UnicodeHighlighterReasonKind.NonBasicAscii:
					reason = nls.localize(
						'unicodeHighlight.characterIsNonBasicAscii',
						'The character {0} is not a basic ASCII character.',
						codePointStr
					);
					break;
			}

			if (existedReason.has(reason)) {
				continue;
			}
			existedReason.add(reason);

			const adjustSettingsArgs: ShowExcludeOptionsArgs = {
				codePoint: codePoint,
				reason: highlightInfo.reason,
				inComment: highlightInfo.inComment,
				inString: highlightInfo.inString,
			};

			const adjustSettings = nls.localize('unicodeHighlight.adjustSettings', 'Adjust settings');
			const uri = `command:${ShowExcludeOptions.ID}?${encodeURIComponent(JSON.stringify(adjustSettingsArgs))}`;
			const markdown = new MarkdownString('', true)
				.appendMarkdown(reason)
				.appendText(' ')
				.appendLink(uri, adjustSettings, configureUnicodeHighlightOptionsStr);
			result.push(new MarkdownHover(this, d.range, [markdown], false, index++));
		}
		return result;
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: MarkdownHover[]): IRenderedHoverParts<MarkdownHover> {
		return renderMarkdownHovers(context, hoverParts, this._editor, this._languageService, this._openerService);
	}

	public getAccessibleContent(hoverPart: MarkdownHover): string {
		return hoverPart.contents.map(c => c.value).join('\n');
	}
}

function codePointToHex(codePoint: number): string {
	return `U+${codePoint.toString(16).padStart(4, '0')}`;
}

function formatCodePointMarkdown(codePoint: number) {
	let value = `\`${codePointToHex(codePoint)}\``;
	if (!InvisibleCharacters.isInvisibleCharacter(codePoint)) {
		// Don't render any control characters or any invisible characters, as they cannot be seen anyways.
		value += ` "${`${renderCodePointAsInlineCode(codePoint)}`}"`;
	}
	return value;
}

function renderCodePointAsInlineCode(codePoint: number): string {
	if (codePoint === CharCode.BackTick) {
		return '`` ` ``';
	}
	return '`' + String.fromCodePoint(codePoint) + '`';
}

function computeReason(char: string, options: UnicodeHighlighterOptions): UnicodeHighlighterReason | null {
	return UnicodeTextModelHighlighter.computeUnicodeHighlightReason(char, options);
}

class Decorations {
	public static readonly instance = new Decorations();

	private readonly map = new Map<string, ModelDecorationOptions>();

	getDecorationFromOptions(options: UnicodeHighlighterOptions): ModelDecorationOptions {
		return this.getDecoration(!options.includeComments, !options.includeStrings);
	}

	private getDecoration(hideInComments: boolean, hideInStrings: boolean): ModelDecorationOptions {
		const key = `${hideInComments}${hideInStrings}`;
		let options = this.map.get(key);
		if (!options) {
			options = ModelDecorationOptions.createDynamic({
				description: 'unicode-highlight',
				stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				className: 'unicode-highlight',
				showIfCollapsed: true,
				overviewRuler: null,
				minimap: null,
				hideInCommentTokens: hideInComments,
				hideInStringTokens: hideInStrings,
			});
			this.map.set(key, options);
		}
		return options;
	}
}

interface IDisableUnicodeHighlightAction {
	shortLabel: string;
}

export class DisableHighlightingInCommentsAction extends EditorAction implements IDisableUnicodeHighlightAction {
	public static ID = 'editor.action.unicodeHighlight.disableHighlightingInComments';
	public readonly shortLabel = nls.localize('unicodeHighlight.disableHighlightingInComments.shortLabel', 'Disable Highlight In Comments');
	constructor() {
		super({
			id: DisableHighlightingOfAmbiguousCharactersAction.ID,
			label: nls.localize('action.unicodeHighlight.disableHighlightingInComments', 'Disable highlighting of characters in comments'),
			alias: 'Disable highlighting of characters in comments',
			precondition: undefined
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor, args: any): Promise<void> {
		const configurationService = accessor?.get(IConfigurationService);
		if (configurationService) {
			this.runAction(configurationService);
		}
	}

	public async runAction(configurationService: IConfigurationService): Promise<void> {
		await configurationService.updateValue(unicodeHighlightConfigKeys.includeComments, false, ConfigurationTarget.USER);
	}
}

export class DisableHighlightingInStringsAction extends EditorAction implements IDisableUnicodeHighlightAction {
	public static ID = 'editor.action.unicodeHighlight.disableHighlightingInStrings';
	public readonly shortLabel = nls.localize('unicodeHighlight.disableHighlightingInStrings.shortLabel', 'Disable Highlight In Strings');
	constructor() {
		super({
			id: DisableHighlightingOfAmbiguousCharactersAction.ID,
			label: nls.localize('action.unicodeHighlight.disableHighlightingInStrings', 'Disable highlighting of characters in strings'),
			alias: 'Disable highlighting of characters in strings',
			precondition: undefined
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor, args: any): Promise<void> {
		const configurationService = accessor?.get(IConfigurationService);
		if (configurationService) {
			this.runAction(configurationService);
		}
	}

	public async runAction(configurationService: IConfigurationService): Promise<void> {
		await configurationService.updateValue(unicodeHighlightConfigKeys.includeStrings, false, ConfigurationTarget.USER);
	}
}

export class DisableHighlightingOfAmbiguousCharactersAction extends EditorAction implements IDisableUnicodeHighlightAction {
	public static ID = 'editor.action.unicodeHighlight.disableHighlightingOfAmbiguousCharacters';
	public readonly shortLabel = nls.localize('unicodeHighlight.disableHighlightingOfAmbiguousCharacters.shortLabel', 'Disable Ambiguous Highlight');
	constructor() {
		super({
			id: DisableHighlightingOfAmbiguousCharactersAction.ID,
			label: nls.localize('action.unicodeHighlight.disableHighlightingOfAmbiguousCharacters', 'Disable highlighting of ambiguous characters'),
			alias: 'Disable highlighting of ambiguous characters',
			precondition: undefined
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor, args: any): Promise<void> {
		const configurationService = accessor?.get(IConfigurationService);
		if (configurationService) {
			this.runAction(configurationService);
		}
	}

	public async runAction(configurationService: IConfigurationService): Promise<void> {
		await configurationService.updateValue(unicodeHighlightConfigKeys.ambiguousCharacters, false, ConfigurationTarget.USER);
	}
}

export class DisableHighlightingOfInvisibleCharactersAction extends EditorAction implements IDisableUnicodeHighlightAction {
	public static ID = 'editor.action.unicodeHighlight.disableHighlightingOfInvisibleCharacters';
	public readonly shortLabel = nls.localize('unicodeHighlight.disableHighlightingOfInvisibleCharacters.shortLabel', 'Disable Invisible Highlight');
	constructor() {
		super({
			id: DisableHighlightingOfInvisibleCharactersAction.ID,
			label: nls.localize('action.unicodeHighlight.disableHighlightingOfInvisibleCharacters', 'Disable highlighting of invisible characters'),
			alias: 'Disable highlighting of invisible characters',
			precondition: undefined
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor, args: any): Promise<void> {
		const configurationService = accessor?.get(IConfigurationService);
		if (configurationService) {
			this.runAction(configurationService);
		}
	}

	public async runAction(configurationService: IConfigurationService): Promise<void> {
		await configurationService.updateValue(unicodeHighlightConfigKeys.invisibleCharacters, false, ConfigurationTarget.USER);
	}
}

export class DisableHighlightingOfNonBasicAsciiCharactersAction extends EditorAction implements IDisableUnicodeHighlightAction {
	public static ID = 'editor.action.unicodeHighlight.disableHighlightingOfNonBasicAsciiCharacters';
	public readonly shortLabel = nls.localize('unicodeHighlight.disableHighlightingOfNonBasicAsciiCharacters.shortLabel', 'Disable Non ASCII Highlight');
	constructor() {
		super({
			id: DisableHighlightingOfNonBasicAsciiCharactersAction.ID,
			label: nls.localize('action.unicodeHighlight.disableHighlightingOfNonBasicAsciiCharacters', 'Disable highlighting of non basic ASCII characters'),
			alias: 'Disable highlighting of non basic ASCII characters',
			precondition: undefined
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor, args: any): Promise<void> {
		const configurationService = accessor?.get(IConfigurationService);
		if (configurationService) {
			this.runAction(configurationService);
		}
	}

	public async runAction(configurationService: IConfigurationService): Promise<void> {
		await configurationService.updateValue(unicodeHighlightConfigKeys.nonBasicASCII, false, ConfigurationTarget.USER);
	}
}

interface ShowExcludeOptionsArgs {
	codePoint: number;
	reason: UnicodeHighlighterReason;
	inComment: boolean;
	inString: boolean;
}

export class ShowExcludeOptions extends EditorAction {
	public static ID = 'editor.action.unicodeHighlight.showExcludeOptions';
	constructor() {
		super({
			id: ShowExcludeOptions.ID,
			label: nls.localize('action.unicodeHighlight.showExcludeOptions', "Show Exclude Options"),
			alias: 'Show Exclude Options',
			precondition: undefined
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor, args: any): Promise<void> {
		const { codePoint, reason, inString, inComment } = args as ShowExcludeOptionsArgs;

		const char = String.fromCodePoint(codePoint);

		const quickPickService = accessor!.get(IQuickInputService);
		const configurationService = accessor!.get(IConfigurationService);

		interface ExtendedOptions extends IQuickPickItem {
			run(): Promise<void>;
		}

		function getExcludeCharFromBeingHighlightedLabel(codePoint: number) {
			if (InvisibleCharacters.isInvisibleCharacter(codePoint)) {
				return nls.localize('unicodeHighlight.excludeInvisibleCharFromBeingHighlighted', 'Exclude {0} (invisible character) from being highlighted', codePointToHex(codePoint));
			}
			return nls.localize('unicodeHighlight.excludeCharFromBeingHighlighted', 'Exclude {0} from being highlighted', `${codePointToHex(codePoint)} "${char}"`);
		}

		const options: ExtendedOptions[] = [];

		if (reason.kind === UnicodeHighlighterReasonKind.Ambiguous) {
			for (const locale of reason.notAmbiguousInLocales) {
				options.push({
					label: nls.localize("unicodeHighlight.allowCommonCharactersInLanguage", "Allow unicode characters that are more common in the language \"{0}\".", locale),
					run: async () => {
						excludeLocaleFromBeingHighlighted(configurationService, [locale]);
					},
				});
			}
		}

		options.push(
			{
				label: getExcludeCharFromBeingHighlightedLabel(codePoint),
				run: () => excludeCharFromBeingHighlighted(configurationService, [codePoint])
			}
		);

		if (inComment) {
			const action = new DisableHighlightingInCommentsAction();
			options.push({ label: action.label, run: async () => action.runAction(configurationService) });
		} else if (inString) {
			const action = new DisableHighlightingInStringsAction();
			options.push({ label: action.label, run: async () => action.runAction(configurationService) });
		}

		if (reason.kind === UnicodeHighlighterReasonKind.Ambiguous) {
			const action = new DisableHighlightingOfAmbiguousCharactersAction();
			options.push({ label: action.label, run: async () => action.runAction(configurationService) });
		} else if (reason.kind === UnicodeHighlighterReasonKind.Invisible) {
			const action = new DisableHighlightingOfInvisibleCharactersAction();
			options.push({ label: action.label, run: async () => action.runAction(configurationService) });
		}
		else if (reason.kind === UnicodeHighlighterReasonKind.NonBasicAscii) {
			const action = new DisableHighlightingOfNonBasicAsciiCharactersAction();
			options.push({ label: action.label, run: async () => action.runAction(configurationService) });
		} else {
			expectNever(reason);
		}

		const result = await quickPickService.pick(
			options,
			{ title: configureUnicodeHighlightOptionsStr }
		);

		if (result) {
			await result.run();
		}
	}
}

async function excludeCharFromBeingHighlighted(configurationService: IConfigurationService, charCodes: number[]) {
	const existingValue = configurationService.getValue(unicodeHighlightConfigKeys.allowedCharacters);

	let value: Record<string, boolean>;
	if ((typeof existingValue === 'object') && existingValue) {
		value = existingValue as any;
	} else {
		value = {};
	}

	for (const charCode of charCodes) {
		value[String.fromCodePoint(charCode)] = true;
	}

	await configurationService.updateValue(unicodeHighlightConfigKeys.allowedCharacters, value, ConfigurationTarget.USER);
}

async function excludeLocaleFromBeingHighlighted(configurationService: IConfigurationService, locales: string[]) {
	const existingValue = configurationService.inspect(unicodeHighlightConfigKeys.allowedLocales).user?.value;

	let value: Record<string, boolean>;
	if ((typeof existingValue === 'object') && existingValue) {
		// Copy value, as the existing value is read only
		value = Object.assign({}, existingValue as any);
	} else {
		value = {};
	}

	for (const locale of locales) {
		value[locale] = true;
	}

	await configurationService.updateValue(unicodeHighlightConfigKeys.allowedLocales, value, ConfigurationTarget.USER);
}

function expectNever(value: never) {
	throw new Error(`Unexpected value: ${value}`);
}

registerEditorAction(DisableHighlightingOfAmbiguousCharactersAction);
registerEditorAction(DisableHighlightingOfInvisibleCharactersAction);
registerEditorAction(DisableHighlightingOfNonBasicAsciiCharactersAction);
registerEditorAction(ShowExcludeOptions);
registerEditorContribution(UnicodeHighlighter.ID, UnicodeHighlighter, EditorContributionInstantiation.AfterFirstRender);
HoverParticipantRegistry.register(UnicodeHighlighterHoverParticipant);
