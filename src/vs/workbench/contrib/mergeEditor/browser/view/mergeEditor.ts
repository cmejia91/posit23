/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, reset } from 'vs/base/browser/dom';
import { Grid, GridNodeDescriptor, IView, SerializableGrid } from 'vs/base/browser/ui/grid/grid';
import { Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Color } from 'vs/base/common/color';
import { BugIndicatingError, onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, autorunWithStore, IObservable, IReader, observableFromEvent, observableValue, transaction } from 'vs/base/common/observable';
import { basename, isEqual } from 'vs/base/common/resources';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/mergeEditor';
import { ICodeEditor, IViewZoneChangeAccessor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IEditorOptions as ICodeEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ICodeEditorViewState, ScrollType } from 'vs/editor/common/editorCommon';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions, ITextEditorOptions, ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { AbstractTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputWithOptions, IEditorOpenContext, IResourceMergeEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { applyTextEditorOptions } from 'vs/workbench/common/editor/editorOptions';
import { readTransientState, writeTransientState } from 'vs/workbench/contrib/codeEditor/browser/toggleWordWrap';
import { MergeEditorInput } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { IMergeEditorInputModel } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInputModel';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';
import { deepMerge, PersistentStore, thenIfNotDisposed } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { BaseCodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/baseCodeEditorView';
import { ScrollSynchronizer } from 'vs/workbench/contrib/mergeEditor/browser/view/scrollSynchronizer';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';
import { ViewZoneComputer } from 'vs/workbench/contrib/mergeEditor/browser/view/viewZones';
import { ctxIsMergeEditor, ctxMergeBaseUri, ctxMergeEditorLayout, ctxMergeEditorShowBase, ctxMergeEditorShowBaseAtTop, ctxMergeEditorShowNonConflictingChanges, ctxMergeResultUri, MergeEditorLayoutKind } from 'vs/workbench/contrib/mergeEditor/common/mergeEditor';
import { settingsSashBorder } from 'vs/workbench/contrib/preferences/common/settingsEditorColorRegistry';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorResolverService, MergeEditorInputFactoryFunction, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import './colors';
import { InputCodeEditorView } from './editors/inputCodeEditorView';
import { ResultCodeEditorView } from './editors/resultCodeEditorView';

export class MergeEditor extends AbstractTextEditor<IMergeEditorViewState> {

	static readonly ID = 'mergeEditor';

	private readonly _sessionDisposables = new DisposableStore();
	private readonly _viewModel = observableValue<MergeEditorViewModel | undefined>('viewModel', undefined);

	public get viewModel(): IObservable<MergeEditorViewModel | undefined> {
		return this._viewModel;
	}

	private rootHtmlElement: HTMLElement | undefined;
	private readonly _grid = this._register(new MutableDisposable<Grid<IView>>());
	private readonly input1View = this._register(this.instantiationService.createInstance(InputCodeEditorView, 1, this._viewModel));
	private readonly baseView = observableValue<BaseCodeEditorView | undefined>('baseView', undefined);
	private readonly baseViewOptions = observableValue<Readonly<ICodeEditorOptions> | undefined>('baseViewOptions', undefined);
	private readonly input2View = this._register(this.instantiationService.createInstance(InputCodeEditorView, 2, this._viewModel));

	private readonly inputResultView = this._register(this.instantiationService.createInstance(ResultCodeEditorView, this._viewModel));
	private readonly _layoutMode = this.instantiationService.createInstance(MergeEditorLayoutStore);
	private readonly _layoutModeObs = observableValue('layoutMode', this._layoutMode.value);
	private readonly _ctxIsMergeEditor: IContextKey<boolean> = ctxIsMergeEditor.bindTo(this.contextKeyService);
	private readonly _ctxUsesColumnLayout: IContextKey<string> = ctxMergeEditorLayout.bindTo(this.contextKeyService);
	private readonly _ctxShowBase: IContextKey<boolean> = ctxMergeEditorShowBase.bindTo(this.contextKeyService);
	private readonly _ctxShowBaseAtTop = ctxMergeEditorShowBaseAtTop.bindTo(this.contextKeyService);
	private readonly _ctxResultUri: IContextKey<string> = ctxMergeResultUri.bindTo(this.contextKeyService);
	private readonly _ctxBaseUri: IContextKey<string> = ctxMergeBaseUri.bindTo(this.contextKeyService);
	private readonly _ctxShowNonConflictingChanges: IContextKey<boolean> = ctxMergeEditorShowNonConflictingChanges.bindTo(this.contextKeyService);
	private readonly _inputModel = observableValue<IMergeEditorInputModel | undefined>('inputModel', undefined);
	public get inputModel(): IObservable<IMergeEditorInputModel | undefined> {
		return this._inputModel;
	}
	public get model(): MergeEditorModel | undefined {
		return this.inputModel.get()?.model;
	}

	private get inputsWritable(): boolean {
		return !!this._configurationService.getValue<boolean>('mergeEditor.writableInputs');
	}

	private readonly viewZoneComputer = new ViewZoneComputer(
		this.input1View.editor,
		this.input2View.editor,
		this.inputResultView.editor,
	);

	protected readonly codeLensesVisible = observableFromEvent<boolean>(
		this.configurationService.onDidChangeConfiguration,
		() => /** @description codeLensesVisible */ this.configurationService.getValue('mergeEditor.showCodeLenses') ?? true
	);

	private readonly scrollSynchronizer = this._register(new ScrollSynchronizer(this._viewModel, this.input1View, this.input2View, this.baseView, this.inputResultView, this._layoutModeObs));

	constructor(
		@IInstantiationService instantiation: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IFileService fileService: IFileService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(MergeEditor.ID, telemetryService, instantiation, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService, fileService);
	}

	override dispose(): void {
		this._sessionDisposables.dispose();
		this._ctxIsMergeEditor.reset();
		this._ctxUsesColumnLayout.reset();
		this._ctxShowNonConflictingChanges.reset();
		super.dispose();
	}

	// #region layout constraints

	private readonly _onDidChangeSizeConstraints = new Emitter<void>();
	override readonly onDidChangeSizeConstraints: Event<void> = this._onDidChangeSizeConstraints.event;

	override get minimumWidth() {
		return this._layoutMode.value.kind === 'mixed'
			? this.input1View.view.minimumWidth + this.input2View.view.minimumWidth
			: this.input1View.view.minimumWidth + this.input2View.view.minimumWidth + this.inputResultView.view.minimumWidth;
	}

	// #endregion

	override getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return localize('mergeEditor', "Text Merge Editor");
	}

	protected createEditorControl(parent: HTMLElement, initialOptions: ICodeEditorOptions): void {
		this.rootHtmlElement = parent;
		parent.classList.add('merge-editor');
		this.applyLayout(this._layoutMode.value);
		this.applyOptions(initialOptions);
	}

	protected updateEditorControlOptions(options: ICodeEditorOptions): void {
		this.applyOptions(options);
	}

	private applyOptions(options: ICodeEditorOptions): void {
		const inputOptions: ICodeEditorOptions = deepMerge<ICodeEditorOptions>(options, {
			minimap: { enabled: false },
			glyphMargin: false,
			lineNumbersMinChars: 2,
			readOnly: !this.inputsWritable
		});

		this.input1View.updateOptions(inputOptions);
		this.input2View.updateOptions(inputOptions);
		this.baseViewOptions.set(this.input2View.editor.getRawOptions(), undefined);
		this.inputResultView.updateOptions(options);
	}

	protected getMainControl(): ICodeEditor | undefined {
		return this.inputResultView.editor;
	}

	layout(dimension: Dimension): void {
		this._grid.value?.layout(dimension.width, dimension.height);
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		if (!(input instanceof MergeEditorInput)) {
			throw new BugIndicatingError('ONLY MergeEditorInput is supported');
		}
		await super.setInput(input, options, context, token);

		this._sessionDisposables.clear();
		transaction(tx => {
			this._viewModel.set(undefined, tx);
			this._inputModel.set(undefined, tx);
		});

		const inputModel = await input.resolve();
		const model = inputModel.model;

		const viewModel = new MergeEditorViewModel(model, this.input1View, this.input2View, this.inputResultView, this.baseView, this.showNonConflictingChanges);
		transaction(tx => {
			this._viewModel.set(viewModel, tx);
			this._inputModel.set(inputModel, tx);
		});
		this._sessionDisposables.add(viewModel);

		// Set/unset context keys based on input
		this._ctxResultUri.set(inputModel.resultUri.toString());
		this._ctxBaseUri.set(model.base.uri.toString());
		this._sessionDisposables.add(toDisposable(() => {
			this._ctxBaseUri.reset();
			this._ctxResultUri.reset();
		}));


		// Set the view zones before restoring view state!
		// Otherwise scrolling will be off
		this._sessionDisposables.add(autorunWithStore((reader, store) => {
			const baseView = this.baseView.read(reader);

			this.inputResultView.editor.changeViewZones(resultViewZoneAccessor => {
				const layout = this._layoutModeObs.read(reader);
				const shouldAlignResult = layout.kind === 'columns';
				const shouldAlignBase = layout.kind === 'mixed' && !layout.showBaseAtTop;

				this.input1View.editor.changeViewZones(input1ViewZoneAccessor => {
					this.input2View.editor.changeViewZones(input2ViewZoneAccessor => {
						if (baseView) {
							baseView.editor.changeViewZones(baseViewZoneAccessor => {
								store.add(this.setViewZones(reader,
									viewModel,
									this.input1View.editor,
									input1ViewZoneAccessor,
									this.input2View.editor,
									input2ViewZoneAccessor,
									baseView.editor,
									baseViewZoneAccessor,
									shouldAlignBase,
									this.inputResultView.editor,
									resultViewZoneAccessor,
									shouldAlignResult
								));
							});
						} else {
							store.add(this.setViewZones(reader,
								viewModel,
								this.input1View.editor,
								input1ViewZoneAccessor,
								this.input2View.editor,
								input2ViewZoneAccessor,
								undefined,
								undefined,
								false,
								this.inputResultView.editor,
								resultViewZoneAccessor,
								shouldAlignResult
							));
						}
					});
				});
			});

			this.scrollSynchronizer.updateScrolling();
		}, 'update alignment view zones'));

		const viewState = this.loadEditorViewState(input, context);
		if (viewState) {
			this._applyViewState(viewState);
		} else {
			this._sessionDisposables.add(thenIfNotDisposed(model.onInitialized, () => {
				const firstConflict = model.modifiedBaseRanges.get().find(r => r.isConflicting);
				if (!firstConflict) {
					return;
				}
				this.input1View.editor.revealLineInCenter(firstConflict.input1Range.startLineNumber);
				transaction(tx => {
					/** @description setActiveModifiedBaseRange */
					viewModel.setActiveModifiedBaseRange(firstConflict, tx);
				});
			}));
		}

		// word wrap special case - sync transient state from result model to input[1|2] models
		const mirrorWordWrapTransientState = () => {
			const state = readTransientState(model.resultTextModel, this._codeEditorService);
			writeTransientState(model.input2.textModel, state, this._codeEditorService);
			writeTransientState(model.input1.textModel, state, this._codeEditorService);
		};
		this._sessionDisposables.add(this._codeEditorService.onDidChangeTransientModelProperty(candidate => {
			if (candidate === this.inputResultView.editor.getModel()) {
				mirrorWordWrapTransientState();
			}
		}));
		mirrorWordWrapTransientState();

		// detect when base, input1, and input2 become empty and replace THIS editor with its result editor
		// TODO@jrieken@hediet this needs a better/cleaner solution
		// https://github.com/microsoft/vscode/issues/155940
		const that = this;
		this._sessionDisposables.add(new class {

			private readonly _disposable = new DisposableStore();

			constructor() {
				for (const model of this.baseInput1Input2()) {
					this._disposable.add(model.onDidChangeContent(() => this._checkBaseInput1Input2AllEmpty()));
				}
			}

			dispose() {
				this._disposable.dispose();
			}

			private *baseInput1Input2() {
				yield model.base;
				yield model.input1.textModel;
				yield model.input2.textModel;
			}

			private _checkBaseInput1Input2AllEmpty() {
				for (const model of this.baseInput1Input2()) {
					if (model.getValueLength() > 0) {
						return;
					}
				}
				// all empty -> replace this editor with a normal editor for result
				that.editorService.replaceEditors(
					[{ editor: input, replacement: { resource: input.result, options: { preserveFocus: true } }, forceReplaceDirty: true }],
					that.group ?? that.editorGroupService.activeGroup
				);
			}
		});
	}

	private setViewZones(
		reader: IReader,
		viewModel: MergeEditorViewModel,
		input1Editor: ICodeEditor,
		input1ViewZoneAccessor: IViewZoneChangeAccessor,
		input2Editor: ICodeEditor,
		input2ViewZoneAccessor: IViewZoneChangeAccessor,
		baseEditor: ICodeEditor | undefined,
		baseViewZoneAccessor: IViewZoneChangeAccessor | undefined,
		shouldAlignBase: boolean,
		resultEditor: ICodeEditor,
		resultViewZoneAccessor: IViewZoneChangeAccessor,
		shouldAlignResult: boolean,
	): IDisposable {
		const input1ViewZoneIds: string[] = [];
		const input2ViewZoneIds: string[] = [];
		const baseViewZoneIds: string[] = [];
		const resultViewZoneIds: string[] = [];

		const viewZones = this.viewZoneComputer.computeViewZones(reader, viewModel, {
			codeLensesVisible: this.codeLensesVisible.read(reader),
			showNonConflictingChanges: this.showNonConflictingChanges.read(reader),
			shouldAlignBase,
			shouldAlignResult,
		});

		const disposableStore = new DisposableStore();

		if (baseViewZoneAccessor) {
			for (const v of viewZones.baseViewZones) {
				v.create(baseViewZoneAccessor, baseViewZoneIds, disposableStore);
			}
		}

		for (const v of viewZones.resultViewZones) {
			v.create(resultViewZoneAccessor, resultViewZoneIds, disposableStore);
		}

		for (const v of viewZones.input1ViewZones) {
			v.create(input1ViewZoneAccessor, input1ViewZoneIds, disposableStore);
		}

		for (const v of viewZones.input2ViewZones) {
			v.create(input2ViewZoneAccessor, input2ViewZoneIds, disposableStore);
		}

		disposableStore.add({
			dispose: () => {
				input1Editor.changeViewZones(a => {
					for (const zone of input1ViewZoneIds) {
						a.removeZone(zone);
					}
				});
				input2Editor.changeViewZones(a => {
					for (const zone of input2ViewZoneIds) {
						a.removeZone(zone);
					}
				});
				baseEditor?.changeViewZones(a => {
					for (const zone of baseViewZoneIds) {
						a.removeZone(zone);
					}
				});
				resultEditor.changeViewZones(a => {
					for (const zone of resultViewZoneIds) {
						a.removeZone(zone);
					}
				});
			}
		});

		return disposableStore;
	}

	override setOptions(options: ITextEditorOptions | undefined): void {
		super.setOptions(options);

		if (options) {
			applyTextEditorOptions(options, this.inputResultView.editor, ScrollType.Smooth);
		}
	}

	override clearInput(): void {
		super.clearInput();

		this._sessionDisposables.clear();

		for (const { editor } of [this.input1View, this.input2View, this.inputResultView]) {
			editor.setModel(null);
		}
	}

	override focus(): void {
		(this.getControl() ?? this.inputResultView.editor).focus();
	}

	override hasFocus(): boolean {
		for (const { editor } of [this.input1View, this.input2View, this.inputResultView]) {
			if (editor.hasTextFocus()) {
				return true;
			}
		}
		return super.hasFocus();
	}

	protected override setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		super.setEditorVisible(visible, group);

		for (const { editor } of [this.input1View, this.input2View, this.inputResultView]) {
			if (visible) {
				editor.onVisible();
			} else {
				editor.onHide();
			}
		}

		this._ctxIsMergeEditor.set(visible);
	}

	// ---- interact with "outside world" via`getControl`, `scopedContextKeyService`: we only expose the result-editor keep the others internal

	override getControl(): ICodeEditor | undefined {
		return this.inputResultView.editor;
	}

	override get scopedContextKeyService(): IContextKeyService | undefined {
		const control = this.getControl();
		return control?.invokeWithinContext(accessor => accessor.get(IContextKeyService));
	}

	// --- layout

	public toggleBase(): void {
		this.setLayout({
			...this._layoutMode.value,
			showBase: !this._layoutMode.value.showBase
		});
	}

	public toggleShowBaseTop(): void {
		const showBaseTop = this._layoutMode.value.showBase && this._layoutMode.value.showBaseAtTop;
		this.setLayout({
			...this._layoutMode.value,
			showBaseAtTop: true,
			showBase: !showBaseTop,
		});
	}

	public toggleShowBaseCenter(): void {
		const showBaseCenter = this._layoutMode.value.showBase && !this._layoutMode.value.showBaseAtTop;
		this.setLayout({
			...this._layoutMode.value,
			showBaseAtTop: false,
			showBase: !showBaseCenter,
		});
	}

	public setLayoutKind(kind: MergeEditorLayoutKind): void {
		this.setLayout({
			...this._layoutMode.value,
			kind
		});
	}

	public setLayout(newLayout: IMergeEditorLayout): void {
		const value = this._layoutMode.value;
		if (JSON.stringify(value) === JSON.stringify(newLayout)) {
			return;
		}
		this.applyLayout(newLayout);
	}

	private readonly baseViewDisposables = this._register(new DisposableStore());

	private applyLayout(layout: IMergeEditorLayout): void {
		transaction(tx => {
			/** @description applyLayout */

			if (layout.showBase && !this.baseView.get()) {
				this.baseViewDisposables.clear();
				const baseView = this.baseViewDisposables.add(
					this.instantiationService.createInstance(
						BaseCodeEditorView,
						this.viewModel
					)
				);
				this.baseViewDisposables.add(autorun('Update base view options', reader => {
					const options = this.baseViewOptions.read(reader);
					if (options) {
						baseView.updateOptions(options);
					}
				}));
				this.baseView.set(baseView, tx);
			} else if (!layout.showBase && this.baseView.get()) {
				this.baseView.set(undefined, tx);
				this.baseViewDisposables.clear();
			}

			if (layout.kind === 'mixed') {
				this.setGrid([
					layout.showBaseAtTop && layout.showBase ? {
						size: 38,
						data: this.baseView.get()!.view
					} : undefined,
					{
						size: 38,
						groups: [
							{ data: this.input1View.view },
							!layout.showBaseAtTop && layout.showBase ? { data: this.baseView.get()!.view } : undefined,
							{ data: this.input2View.view }
						].filter(isDefined)
					},
					{
						size: 62,
						data: this.inputResultView.view
					},
				].filter(isDefined));
			} else if (layout.kind === 'columns') {
				this.setGrid([
					layout.showBase ? {
						size: 40,
						data: this.baseView.get()!.view
					} : undefined,
					{
						size: 60,
						groups: [{ data: this.input1View.view }, { data: this.inputResultView.view }, { data: this.input2View.view }]
					},
				].filter(isDefined));
			}

			this._layoutMode.value = layout;
			this._ctxUsesColumnLayout.set(layout.kind);
			this._ctxShowBase.set(layout.showBase);
			this._ctxShowBaseAtTop.set(layout.showBaseAtTop);
			this._onDidChangeSizeConstraints.fire();
			this._layoutModeObs.set(layout, tx);
		});
	}

	private setGrid(descriptor: GridNodeDescriptor<any>[]) {
		let width = -1;
		let height = -1;
		if (this._grid.value) {
			width = this._grid.value.width;
			height = this._grid.value.height;
		}
		this._grid.value = SerializableGrid.from<any>({
			orientation: Orientation.VERTICAL,
			size: 100,
			groups: descriptor,
		}, {
			styles: { separatorBorder: this.theme.getColor(settingsSashBorder) ?? Color.transparent },
			proportionalLayout: true
		});

		reset(this.rootHtmlElement!, this._grid.value.element);
		// Only call layout after the elements have been added to the DOM,
		// so that they have a defined size.
		if (width !== -1) {
			this._grid.value.layout(width, height);
		}
	}

	private _applyViewState(state: IMergeEditorViewState | undefined) {
		if (!state) {
			return;
		}
		this.inputResultView.editor.restoreViewState(state);
		if (state.input1State) {
			this.input1View.editor.restoreViewState(state.input1State);
		}
		if (state.input2State) {
			this.input2View.editor.restoreViewState(state.input2State);
		}
		if (state.focusIndex >= 0) {
			[this.input1View.editor, this.input2View.editor, this.inputResultView.editor][state.focusIndex].focus();
		}
	}

	protected computeEditorViewState(resource: URI): IMergeEditorViewState | undefined {
		if (!isEqual(this.inputModel.get()?.resultUri, resource)) {
			return undefined;
		}
		const result = this.inputResultView.editor.saveViewState();
		if (!result) {
			return undefined;
		}
		const input1State = this.input1View.editor.saveViewState() ?? undefined;
		const input2State = this.input2View.editor.saveViewState() ?? undefined;
		const focusIndex = [this.input1View.editor, this.input2View.editor, this.inputResultView.editor].findIndex(editor => editor.hasWidgetFocus());
		return { ...result, input1State, input2State, focusIndex };
	}


	protected tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof MergeEditorInput;
	}

	private readonly showNonConflictingChangesStore = this.instantiationService.createInstance(PersistentStore<boolean>, 'mergeEditor/showNonConflictingChanges');
	private readonly showNonConflictingChanges = observableValue('showNonConflictingChanges', this.showNonConflictingChangesStore.get() ?? false);

	public toggleShowNonConflictingChanges(): void {
		this.showNonConflictingChanges.set(!this.showNonConflictingChanges.get(), undefined);
		this.showNonConflictingChangesStore.set(this.showNonConflictingChanges.get());
		this._ctxShowNonConflictingChanges.set(this.showNonConflictingChanges.get());
	}
}

export interface IMergeEditorLayout {
	readonly kind: MergeEditorLayoutKind;
	readonly showBase: boolean;
	readonly showBaseAtTop: boolean;
}

// TODO use PersistentStore
class MergeEditorLayoutStore {
	private static readonly _key = 'mergeEditor/layout';
	private _value: IMergeEditorLayout = { kind: 'mixed', showBase: false, showBaseAtTop: true };

	constructor(@IStorageService private _storageService: IStorageService) {
		const value = _storageService.get(MergeEditorLayoutStore._key, StorageScope.PROFILE, 'mixed');

		if (value === 'mixed' || value === 'columns') {
			this._value = { kind: value, showBase: false, showBaseAtTop: true };
		} else if (value) {
			try {
				this._value = JSON.parse(value);
			} catch (e) {
				onUnexpectedError(e);
			}
		}
	}

	get value() {
		return this._value;
	}

	set value(value: IMergeEditorLayout) {
		if (this._value !== value) {
			this._value = value;
			this._storageService.store(MergeEditorLayoutStore._key, JSON.stringify(this._value), StorageScope.PROFILE, StorageTarget.USER);
		}
	}
}

export class MergeEditorOpenHandlerContribution extends Disposable {

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
	) {
		super();
		this._store.add(codeEditorService.registerCodeEditorOpenHandler(this.openCodeEditorFromMergeEditor.bind(this)));
	}

	private async openCodeEditorFromMergeEditor(input: ITextResourceEditorInput, _source: ICodeEditor | null, sideBySide?: boolean | undefined): Promise<ICodeEditor | null> {
		const activePane = this._editorService.activeEditorPane;
		if (!sideBySide
			&& input.options
			&& activePane instanceof MergeEditor
			&& activePane.getControl()
			&& activePane.input instanceof MergeEditorInput
			&& isEqual(input.resource, activePane.input.result)
		) {
			// Special: stay inside the merge editor when it is active and when the input
			// targets the result editor of the merge editor.
			const targetEditor = <ICodeEditor>activePane.getControl()!;
			applyTextEditorOptions(input.options, targetEditor, ScrollType.Smooth);
			return targetEditor;
		}

		// cannot handle this
		return null;
	}
}

export class MergeEditorResolverContribution extends Disposable {

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const mergeEditorInputFactory: MergeEditorInputFactoryFunction = (mergeEditor: IResourceMergeEditorInput): EditorInputWithOptions => {
			return {
				editor: instantiationService.createInstance(
					MergeEditorInput,
					mergeEditor.base.resource,
					{
						uri: mergeEditor.input1.resource,
						title: mergeEditor.input1.label ?? basename(mergeEditor.input1.resource),
						description: mergeEditor.input1.description ?? '',
						detail: mergeEditor.input1.detail
					},
					{
						uri: mergeEditor.input2.resource,
						title: mergeEditor.input2.label ?? basename(mergeEditor.input2.resource),
						description: mergeEditor.input2.description ?? '',
						detail: mergeEditor.input2.detail
					},
					mergeEditor.result.resource
				)
			};
		};

		this._register(editorResolverService.registerEditor(
			`*`,
			{
				id: DEFAULT_EDITOR_ASSOCIATION.id,
				label: DEFAULT_EDITOR_ASSOCIATION.displayName,
				detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
				priority: RegisteredEditorPriority.builtin
			},
			{},
			{
				createMergeEditorInput: mergeEditorInputFactory
			}
		));
	}
}

type IMergeEditorViewState = ICodeEditorViewState & {
	readonly input1State?: ICodeEditorViewState;
	readonly input2State?: ICodeEditorViewState;
	readonly focusIndex: number;
};
