/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent, IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { OverviewRulerPosition, ConfigurationChangedEvent, EditorLayoutInfo, IComputedEditorOptions, EditorOption, FindComputedEditorOptionValueById, IEditorOptions, IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ICursorPositionChangedEvent, ICursorSelectionChangedEvent } from 'vs/editor/common/cursorEvents';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IIdentifiedSingleEditOperation, IModelDecoration, IModelDeltaDecoration, ITextModel, ICursorStateComputer, PositionAffinity } from 'vs/editor/common/model';
import { IWordAtPosition } from 'vs/editor/common/core/wordHelper';
import { IModelContentChangedEvent, IModelDecorationsChangedEvent, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent, IModelOptionsChangedEvent, IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { OverviewRulerZone } from 'vs/editor/common/viewModel/overviewZoneManager';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IEditorWhitespace, IViewModel } from 'vs/editor/common/viewModel';
import { InjectedText } from 'vs/editor/common/modelLineProjectionData';
import { ILineChange, IDiffComputationResult } from 'vs/editor/common/diff/smartLinesDiffComputer';
import { IDimension } from 'vs/editor/common/core/dimension';

/**
 * A view zone is a full horizontal rectangle that 'pushes' text down.
 * The editor reserves space for view zones when rendering.
 */
export interface IViewZone {
	/**
	 * The line number after which this zone should appear.
	 * Use 0 to place a view zone before the first line number.
	 */
	afterLineNumber: number;
	/**
	 * The column after which this zone should appear.
	 * If not set, the maxLineColumn of `afterLineNumber` will be used.
	 * This is relevant for wrapped lines.
	 */
	afterColumn?: number;

	/**
	 * If the `afterColumn` has multiple view columns, the affinity specifies which one to use. Defaults to `none`.
	*/
	afterColumnAffinity?: PositionAffinity;
	/**
	 * Suppress mouse down events.
	 * If set, the editor will attach a mouse down listener to the view zone and .preventDefault on it.
	 * Defaults to false
	 */
	suppressMouseDown?: boolean;
	/**
	 * The height in lines of the view zone.
	 * If specified, `heightInPx` will be used instead of this.
	 * If neither `heightInPx` nor `heightInLines` is specified, a default of `heightInLines` = 1 will be chosen.
	 */
	heightInLines?: number;
	/**
	 * The height in px of the view zone.
	 * If this is set, the editor will give preference to it rather than `heightInLines` above.
	 * If neither `heightInPx` nor `heightInLines` is specified, a default of `heightInLines` = 1 will be chosen.
	 */
	heightInPx?: number;
	/**
	 * The minimum width in px of the view zone.
	 * If this is set, the editor will ensure that the scroll width is >= than this value.
	 */
	minWidthInPx?: number;
	/**
	 * The dom node of the view zone
	 */
	domNode: HTMLElement;
	/**
	 * An optional dom node for the view zone that will be placed in the margin area.
	 */
	marginDomNode?: HTMLElement | null;
	/**
	 * Callback which gives the relative top of the view zone as it appears (taking scrolling into account).
	 */
	onDomNodeTop?: (top: number) => void;
	/**
	 * Callback which gives the height in pixels of the view zone.
	 */
	onComputedHeight?: (height: number) => void;
}
/**
 * An accessor that allows for zones to be added or removed.
 */
export interface IViewZoneChangeAccessor {
	/**
	 * Create a new view zone.
	 * @param zone Zone to create
	 * @return A unique identifier to the view zone.
	 */
	addZone(zone: IViewZone): string;
	/**
	 * Remove a zone
	 * @param id A unique identifier to the view zone, as returned by the `addZone` call.
	 */
	removeZone(id: string): void;
	/**
	 * Change a zone's position.
	 * The editor will rescan the `afterLineNumber` and `afterColumn` properties of a view zone.
	 */
	layoutZone(id: string): void;
}

/**
 * A positioning preference for rendering content widgets.
 */
export const enum ContentWidgetPositionPreference {
	/**
	 * Place the content widget exactly at a position
	 */
	EXACT,
	/**
	 * Place the content widget above a position
	 */
	ABOVE,
	/**
	 * Place the content widget below a position
	 */
	BELOW
}
/**
 * A position for rendering content widgets.
 */
export interface IContentWidgetPosition {
	/**
	 * Desired position for the content widget.
	 * `preference` will also affect the placement.
	 */
	position: IPosition | null;
	/**
	 * Optionally, a secondary position can be provided to further
	 * define the position of the content widget. The secondary position
	 * must have the same line number as the primary position.
	 */
	secondaryPosition?: IPosition | null;
	/**
	 * Placement preference for position, in order of preference.
	 */
	preference: ContentWidgetPositionPreference[];

	/**
	 * Placement preference when multiple view positions refer to the same (model) position.
	 * This plays a role when injected text is involved.
	*/
	positionAffinity?: PositionAffinity;
}
/**
 * A content widget renders inline with the text and can be easily placed 'near' an editor position.
 */
export interface IContentWidget {
	/**
	 * Render this content widget in a location where it could overflow the editor's view dom node.
	 */
	allowEditorOverflow?: boolean;
	/**
	 * Call preventDefault() on mousedown events that target the content widget.
	 */
	suppressMouseDown?: boolean;
	/**
	 * Get a unique identifier of the content widget.
	 */
	getId(): string;
	/**
	 * Get the dom node of the content widget.
	 */
	getDomNode(): HTMLElement;
	/**
	 * Get the placement of the content widget.
	 * If null is returned, the content widget will be placed off screen.
	 */
	getPosition(): IContentWidgetPosition | null;
	/**
	 * Optional function that is invoked before rendering
	 * the content widget. If a dimension is returned the editor will
	 * attempt to use it.
	 */
	beforeRender?(): IDimension | null;
	/**
	 * Optional function that is invoked after rendering the content
	 * widget. Is being invoked with the selected position preference
	 * or `null` if not rendered.
	 */
	afterRender?(position: ContentWidgetPositionPreference | null): void;
}

/**
 * A positioning preference for rendering overlay widgets.
 */
export const enum OverlayWidgetPositionPreference {
	/**
	 * Position the overlay widget in the top right corner
	 */
	TOP_RIGHT_CORNER,

	/**
	 * Position the overlay widget in the bottom right corner
	 */
	BOTTOM_RIGHT_CORNER,

	/**
	 * Position the overlay widget in the top center
	 */
	TOP_CENTER
}
/**
 * A position for rendering overlay widgets.
 */
export interface IOverlayWidgetPosition {
	/**
	 * The position preference for the overlay widget.
	 */
	preference: OverlayWidgetPositionPreference | null;
}
/**
 * An overlay widgets renders on top of the text.
 */
export interface IOverlayWidget {
	/**
	 * Get a unique identifier of the overlay widget.
	 */
	getId(): string;
	/**
	 * Get the dom node of the overlay widget.
	 */
	getDomNode(): HTMLElement;
	/**
	 * Get the placement of the overlay widget.
	 * If null is returned, the overlay widget is responsible to place itself.
	 */
	getPosition(): IOverlayWidgetPosition | null;
}

/**
 * Type of hit element with the mouse in the editor.
 */
export const enum MouseTargetType {
	/**
	 * Mouse is on top of an unknown element.
	 */
	UNKNOWN,
	/**
	 * Mouse is on top of the textarea used for input.
	 */
	TEXTAREA,
	/**
	 * Mouse is on top of the glyph margin
	 */
	GUTTER_GLYPH_MARGIN,
	/**
	 * Mouse is on top of the line numbers
	 */
	GUTTER_LINE_NUMBERS,
	/**
	 * Mouse is on top of the line decorations
	 */
	GUTTER_LINE_DECORATIONS,
	/**
	 * Mouse is on top of the whitespace left in the gutter by a view zone.
	 */
	GUTTER_VIEW_ZONE,
	/**
	 * Mouse is on top of text in the content.
	 */
	CONTENT_TEXT,
	/**
	 * Mouse is on top of empty space in the content (e.g. after line text or below last line)
	 */
	CONTENT_EMPTY,
	/**
	 * Mouse is on top of a view zone in the content.
	 */
	CONTENT_VIEW_ZONE,
	/**
	 * Mouse is on top of a content widget.
	 */
	CONTENT_WIDGET,
	/**
	 * Mouse is on top of the decorations overview ruler.
	 */
	OVERVIEW_RULER,
	/**
	 * Mouse is on top of a scrollbar.
	 */
	SCROLLBAR,
	/**
	 * Mouse is on top of an overlay widget.
	 */
	OVERLAY_WIDGET,
	/**
	 * Mouse is outside of the editor.
	 */
	OUTSIDE_EDITOR,
}
export interface IBaseMouseTarget {
	/**
	 * The target element
	 */
	readonly element: Element | null;
	/**
	 * The 'approximate' editor position
	 */
	readonly position: Position | null;
	/**
	 * Desired mouse column (e.g. when position.column gets clamped to text length -- clicking after text on a line).
	 */
	readonly mouseColumn: number;
	/**
	 * The 'approximate' editor range
	 */
	readonly range: Range | null;
}
export interface IMouseTargetUnknown extends IBaseMouseTarget {
	readonly type: MouseTargetType.UNKNOWN;
}
export interface IMouseTargetTextarea extends IBaseMouseTarget {
	readonly type: MouseTargetType.TEXTAREA;
	readonly position: null;
	readonly range: null;
}
export interface IMouseTargetMarginData {
	readonly isAfterLines: boolean;
	readonly glyphMarginLeft: number;
	readonly glyphMarginWidth: number;
	readonly lineNumbersWidth: number;
	readonly offsetX: number;
}
export interface IMouseTargetMargin extends IBaseMouseTarget {
	readonly type: MouseTargetType.GUTTER_GLYPH_MARGIN | MouseTargetType.GUTTER_LINE_NUMBERS | MouseTargetType.GUTTER_LINE_DECORATIONS;
	readonly position: Position;
	readonly range: Range;
	readonly detail: IMouseTargetMarginData;
}
export interface IMouseTargetViewZoneData {
	readonly viewZoneId: string;
	readonly positionBefore: Position | null;
	readonly positionAfter: Position | null;
	readonly position: Position;
	readonly afterLineNumber: number;
}
export interface IMouseTargetViewZone extends IBaseMouseTarget {
	readonly type: MouseTargetType.GUTTER_VIEW_ZONE | MouseTargetType.CONTENT_VIEW_ZONE;
	readonly position: Position;
	readonly range: Range;
	readonly detail: IMouseTargetViewZoneData;
}
export interface IMouseTargetContentTextData {
	readonly mightBeForeignElement: boolean;
	/**
	 * @internal
	 */
	readonly injectedText: InjectedText | null;
}
export interface IMouseTargetContentText extends IBaseMouseTarget {
	readonly type: MouseTargetType.CONTENT_TEXT;
	readonly position: Position;
	readonly range: Range;
	readonly detail: IMouseTargetContentTextData;
}
export interface IMouseTargetContentEmptyData {
	readonly isAfterLines: boolean;
	readonly horizontalDistanceToText?: number;
}
export interface IMouseTargetContentEmpty extends IBaseMouseTarget {
	readonly type: MouseTargetType.CONTENT_EMPTY;
	readonly position: Position;
	readonly range: Range;
	readonly detail: IMouseTargetContentEmptyData;
}
export interface IMouseTargetContentWidget extends IBaseMouseTarget {
	readonly type: MouseTargetType.CONTENT_WIDGET;
	readonly position: null;
	readonly range: null;
	readonly detail: string;
}
export interface IMouseTargetOverlayWidget extends IBaseMouseTarget {
	readonly type: MouseTargetType.OVERLAY_WIDGET;
	readonly position: null;
	readonly range: null;
	readonly detail: string;
}
export interface IMouseTargetScrollbar extends IBaseMouseTarget {
	readonly type: MouseTargetType.SCROLLBAR;
	readonly position: Position;
	readonly range: Range;
}
export interface IMouseTargetOverviewRuler extends IBaseMouseTarget {
	readonly type: MouseTargetType.OVERVIEW_RULER;
}
export interface IMouseTargetOutsideEditor extends IBaseMouseTarget {
	readonly type: MouseTargetType.OUTSIDE_EDITOR;
	readonly outsidePosition: 'above' | 'below' | 'left' | 'right';
	readonly outsideDistance: number;
}
/**
 * Target hit with the mouse in the editor.
 */
export type IMouseTarget = (
	IMouseTargetUnknown
	| IMouseTargetTextarea
	| IMouseTargetMargin
	| IMouseTargetViewZone
	| IMouseTargetContentText
	| IMouseTargetContentEmpty
	| IMouseTargetContentWidget
	| IMouseTargetOverlayWidget
	| IMouseTargetScrollbar
	| IMouseTargetOverviewRuler
	| IMouseTargetOutsideEditor
);
/**
 * A mouse event originating from the editor.
 */
export interface IEditorMouseEvent {
	readonly event: IMouseEvent;
	readonly target: IMouseTarget;
}
export interface IPartialEditorMouseEvent {
	readonly event: IMouseEvent;
	readonly target: IMouseTarget | null;
}

/**
 * A paste event originating from the editor.
 */
export interface IPasteEvent {
	readonly range: Range;
	readonly languageId: string | null;
}

/**
 * An overview ruler
 * @internal
 */
export interface IOverviewRuler {
	getDomNode(): HTMLElement;
	dispose(): void;
	setZones(zones: OverviewRulerZone[]): void;
	setLayout(position: OverviewRulerPosition): void;
}

/**
 * Editor aria options.
 * @internal
 */
export interface IEditorAriaOptions {
	activeDescendant: string | undefined;
	role?: string;
}

export interface IDiffEditorConstructionOptions extends IDiffEditorOptions {
	/**
	 * The initial editor dimension (to avoid measuring the container).
	 */
	dimension?: IDimension;

	/**
	 * Place overflow widgets inside an external DOM node.
	 * Defaults to an internal DOM node.
	 */
	overflowWidgetsDomNode?: HTMLElement;

	/**
	 * Aria label for original editor.
	 */
	originalAriaLabel?: string;

	/**
	 * Aria label for modified editor.
	 */
	modifiedAriaLabel?: string;

	/**
	 * Is the diff editor inside another editor
	 * Defaults to false
	 */
	isInEmbeddedEditor?: boolean;
}

/**
 * A rich code editor.
 */
export interface ICodeEditor extends editorCommon.IEditor {
	/**
	 * This editor is used as an alternative to an <input> box, i.e. as a simple widget.
	 * @internal
	 */
	readonly isSimpleWidget: boolean;
	/**
	 * An event emitted when the content of the current model has changed.
	 * @event
	 */
	readonly onDidChangeModelContent: Event<IModelContentChangedEvent>;
	/**
	 * An event emitted when the language of the current model has changed.
	 * @event
	 */
	readonly onDidChangeModelLanguage: Event<IModelLanguageChangedEvent>;
	/**
	 * An event emitted when the language configuration of the current model has changed.
	 * @event
	 */
	readonly onDidChangeModelLanguageConfiguration: Event<IModelLanguageConfigurationChangedEvent>;
	/**
	 * An event emitted when the options of the current model has changed.
	 * @event
	 */
	readonly onDidChangeModelOptions: Event<IModelOptionsChangedEvent>;
	/**
	 * An event emitted when the configuration of the editor has changed. (e.g. `editor.updateOptions()`)
	 * @event
	 */
	readonly onDidChangeConfiguration: Event<ConfigurationChangedEvent>;
	/**
	 * An event emitted when the cursor position has changed.
	 * @event
	 */
	readonly onDidChangeCursorPosition: Event<ICursorPositionChangedEvent>;
	/**
	 * An event emitted when the cursor selection has changed.
	 * @event
	 */
	readonly onDidChangeCursorSelection: Event<ICursorSelectionChangedEvent>;
	/**
	 * An event emitted when the model of this editor has changed (e.g. `editor.setModel()`).
	 * @event
	 */
	readonly onDidChangeModel: Event<editorCommon.IModelChangedEvent>;
	/**
	 * An event emitted when the decorations of the current model have changed.
	 * @event
	 */
	readonly onDidChangeModelDecorations: Event<IModelDecorationsChangedEvent>;
	/**
	 * An event emitted when the tokens of the current model have changed.
	 * @internal
	 */
	readonly onDidChangeModelTokens: Event<IModelTokensChangedEvent>;
	/**
	 * An event emitted when the text inside this editor gained focus (i.e. cursor starts blinking).
	 * @event
	 */
	readonly onDidFocusEditorText: Event<void>;
	/**
	 * An event emitted when the text inside this editor lost focus (i.e. cursor stops blinking).
	 * @event
	 */
	readonly onDidBlurEditorText: Event<void>;
	/**
	 * An event emitted when the text inside this editor or an editor widget gained focus.
	 * @event
	 */
	readonly onDidFocusEditorWidget: Event<void>;
	/**
	 * An event emitted when the text inside this editor or an editor widget lost focus.
	 * @event
	 */
	readonly onDidBlurEditorWidget: Event<void>;
	/**
	 * An event emitted before interpreting typed characters (on the keyboard).
	 * @event
	 * @internal
	 */
	readonly onWillType: Event<string>;
	/**
	 * An event emitted after interpreting typed characters (on the keyboard).
	 * @event
	 * @internal
	 */
	readonly onDidType: Event<string>;
	/**
	 * An event emitted after composition has started.
	 */
	readonly onDidCompositionStart: Event<void>;
	/**
	 * An event emitted after composition has ended.
	 */
	readonly onDidCompositionEnd: Event<void>;
	/**
	 * An event emitted when editing failed because the editor is read-only.
	 * @event
	 */
	readonly onDidAttemptReadOnlyEdit: Event<void>;
	/**
	 * An event emitted when users paste text in the editor.
	 * @event
	 */
	readonly onDidPaste: Event<IPasteEvent>;
	/**
	 * An event emitted on a "mouseup".
	 * @event
	 */
	readonly onMouseUp: Event<IEditorMouseEvent>;
	/**
	 * An event emitted on a "mousedown".
	 * @event
	 */
	readonly onMouseDown: Event<IEditorMouseEvent>;
	/**
	 * An event emitted on a "mousedrag".
	 * @internal
	 * @event
	 */
	readonly onMouseDrag: Event<IEditorMouseEvent>;
	/**
	 * An event emitted on a "mousedrop".
	 * @internal
	 * @event
	 */
	readonly onMouseDrop: Event<IPartialEditorMouseEvent>;
	/**
	 * An event emitted on a "mousedropcanceled".
	 * @internal
	 * @event
	 */
	readonly onMouseDropCanceled: Event<void>;
	/**
	 * An event emitted when content is dropped into the editor.
	 * @internal
	 * @event
	 */
	readonly onDropIntoEditor: Event<{ readonly position: IPosition; readonly event: DragEvent }>;
	/**
	 * An event emitted on a "contextmenu".
	 * @event
	 */
	readonly onContextMenu: Event<IEditorMouseEvent>;
	/**
	 * An event emitted on a "mousemove".
	 * @event
	 */
	readonly onMouseMove: Event<IEditorMouseEvent>;
	/**
	 * An event emitted on a "mouseleave".
	 * @event
	 */
	readonly onMouseLeave: Event<IPartialEditorMouseEvent>;
	/**
	 * An event emitted on a "mousewheel"
	 * @event
	 * @internal
	 */
	readonly onMouseWheel: Event<IMouseWheelEvent>;
	/**
	 * An event emitted on a "keyup".
	 * @event
	 */
	readonly onKeyUp: Event<IKeyboardEvent>;
	/**
	 * An event emitted on a "keydown".
	 * @event
	 */
	readonly onKeyDown: Event<IKeyboardEvent>;
	/**
	 * An event emitted when the layout of the editor has changed.
	 * @event
	 */
	readonly onDidLayoutChange: Event<EditorLayoutInfo>;
	/**
	 * An event emitted when the content width or content height in the editor has changed.
	 * @event
	 */
	readonly onDidContentSizeChange: Event<editorCommon.IContentSizeChangedEvent>;
	/**
	 * An event emitted when the scroll in the editor has changed.
	 * @event
	 */
	readonly onDidScrollChange: Event<editorCommon.IScrollEvent>;

	/**
	 * An event emitted when hidden areas change in the editor (e.g. due to folding).
	 * @event
	 */
	readonly onDidChangeHiddenAreas: Event<void>;

	/**
	 * Saves current view state of the editor in a serializable object.
	 */
	saveViewState(): editorCommon.ICodeEditorViewState | null;

	/**
	 * Restores the view state of the editor from a serializable object generated by `saveViewState`.
	 */
	restoreViewState(state: editorCommon.ICodeEditorViewState | null): void;

	/**
	 * Returns true if the text inside this editor or an editor widget has focus.
	 */
	hasWidgetFocus(): boolean;

	/**
	 * Get a contribution of this editor.
	 * @id Unique identifier of the contribution.
	 * @return The contribution or null if contribution not found.
	 */
	getContribution<T extends editorCommon.IEditorContribution>(id: string): T | null;

	/**
	 * Execute `fn` with the editor's services.
	 * @internal
	 */
	invokeWithinContext<T>(fn: (accessor: ServicesAccessor) => T): T;

	/**
	 * Type the getModel() of IEditor.
	 */
	getModel(): ITextModel | null;

	/**
	 * Sets the current model attached to this editor.
	 * If the previous model was created by the editor via the value key in the options
	 * literal object, it will be destroyed. Otherwise, if the previous model was set
	 * via setModel, or the model key in the options literal object, the previous model
	 * will not be destroyed.
	 * It is safe to call setModel(null) to simply detach the current model from the editor.
	 */
	setModel(model: ITextModel | null): void;

	/**
	 * Gets all the editor computed options.
	 */
	getOptions(): IComputedEditorOptions;

	/**
	 * Gets a specific editor option.
	 */
	getOption<T extends EditorOption>(id: T): FindComputedEditorOptionValueById<T>;

	/**
	 * Returns the editor's configuration (without any validation or defaults).
	 */
	getRawOptions(): IEditorOptions;

	/**
	 * @internal
	 */
	getOverflowWidgetsDomNode(): HTMLElement | undefined;

	/**
	 * @internal
	 */
	getConfiguredWordAtPosition(position: Position): IWordAtPosition | null;

	/**
	 * Get value of the current model attached to this editor.
	 * @see {@link ITextModel.getValue}
	 */
	getValue(options?: { preserveBOM: boolean; lineEnding: string }): string;

	/**
	 * Set the value of the current model attached to this editor.
	 * @see {@link ITextModel.setValue}
	 */
	setValue(newValue: string): void;

	/**
	 * Get the width of the editor's content.
	 * This is information that is "erased" when computing `scrollWidth = Math.max(contentWidth, width)`
	 */
	getContentWidth(): number;
	/**
	 * Get the scrollWidth of the editor's viewport.
	 */
	getScrollWidth(): number;
	/**
	 * Get the scrollLeft of the editor's viewport.
	 */
	getScrollLeft(): number;

	/**
	 * Get the height of the editor's content.
	 * This is information that is "erased" when computing `scrollHeight = Math.max(contentHeight, height)`
	 */
	getContentHeight(): number;
	/**
	 * Get the scrollHeight of the editor's viewport.
	 */
	getScrollHeight(): number;
	/**
	 * Get the scrollTop of the editor's viewport.
	 */
	getScrollTop(): number;

	/**
	 * Change the scrollLeft of the editor's viewport.
	 */
	setScrollLeft(newScrollLeft: number, scrollType?: editorCommon.ScrollType): void;
	/**
	 * Change the scrollTop of the editor's viewport.
	 */
	setScrollTop(newScrollTop: number, scrollType?: editorCommon.ScrollType): void;
	/**
	 * Change the scroll position of the editor's viewport.
	 */
	setScrollPosition(position: editorCommon.INewScrollPosition, scrollType?: editorCommon.ScrollType): void;

	/**
	 * Get an action that is a contribution to this editor.
	 * @id Unique identifier of the contribution.
	 * @return The action or null if action not found.
	 */
	getAction(id: string): editorCommon.IEditorAction | null;

	/**
	 * Execute a command on the editor.
	 * The edits will land on the undo-redo stack, but no "undo stop" will be pushed.
	 * @param source The source of the call.
	 * @param command The command to execute
	 */
	executeCommand(source: string | null | undefined, command: editorCommon.ICommand): void;

	/**
	 * Create an "undo stop" in the undo-redo stack.
	 */
	pushUndoStop(): boolean;

	/**
	 * Remove the "undo stop" in the undo-redo stack.
	 */
	popUndoStop(): boolean;

	/**
	 * Execute edits on the editor.
	 * The edits will land on the undo-redo stack, but no "undo stop" will be pushed.
	 * @param source The source of the call.
	 * @param edits The edits to execute.
	 * @param endCursorState Cursor state after the edits were applied.
	 */
	executeEdits(source: string | null | undefined, edits: IIdentifiedSingleEditOperation[], endCursorState?: ICursorStateComputer | Selection[]): boolean;

	/**
	 * Execute multiple (concomitant) commands on the editor.
	 * @param source The source of the call.
	 * @param command The commands to execute
	 */
	executeCommands(source: string | null | undefined, commands: (editorCommon.ICommand | null)[]): void;

	/**
	 * @internal
	 */
	_getViewModel(): IViewModel | null;

	/**
	 * Get all the decorations on a line (filtering out decorations from other editors).
	 */
	getLineDecorations(lineNumber: number): IModelDecoration[] | null;

	/**
	 * Get all the decorations for a range (filtering out decorations from other editors).
	 */
	getDecorationsInRange(range: Range): IModelDecoration[] | null;

	/**
	 * All decorations added through this call will get the ownerId of this editor.
	 * @deprecated
	 */
	deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[];

	/**
	 * Remove previously added decorations.
	 */
	removeDecorations(decorationIds: string[]): void;

	/**
	 * @internal
	 */
	setDecorationsByType(description: string, decorationTypeKey: string, ranges: editorCommon.IDecorationOptions[]): void;

	/**
	 * @internal
	 */
	setDecorationsByTypeFast(decorationTypeKey: string, ranges: IRange[]): void;

	/**
	 * @internal
	 */
	removeDecorationsByType(decorationTypeKey: string): void;

	/**
	 * Get the layout info for the editor.
	 */
	getLayoutInfo(): EditorLayoutInfo;

	/**
	 * Returns the ranges that are currently visible.
	 * Does not account for horizontal scrolling.
	 */
	getVisibleRanges(): Range[];

	/**
	 * @internal
	 */
	getVisibleRangesPlusViewportAboveBelow(): Range[];

	/**
	 * Get the view zones.
	 * @internal
	 */
	getWhitespaces(): IEditorWhitespace[];

	/**
	 * Get the vertical position (top offset) for the line's top w.r.t. to the first line.
	 */
	getTopForLineNumber(lineNumber: number): number;

	/**
	 * Get the vertical position (top offset) for the line's bottom w.r.t. to the first line.
	 */
	getBottomForLineNumber(lineNumber: number): number;

	/**
	 * Get the vertical position (top offset) for the position w.r.t. to the first line.
	 */
	getTopForPosition(lineNumber: number, column: number): number;

	/**
	 * Set the model ranges that will be hidden in the view.
	 * Hidden areas are stored per source.
	 * @internal
	 */
	setHiddenAreas(ranges: IRange[], source?: unknown): void;

	/**
	 * Sets the editor aria options, primarily the active descendent.
	 * @internal
	 */
	setAriaOptions(options: IEditorAriaOptions): void;

	/**
	 * Write the screen reader content to be the current selection
	 */
	writeScreenReaderContent(reason: string): void;

	/**
	 * @internal
	 */
	getTelemetryData(): { [key: string]: any } | undefined;

	/**
	 * Returns the editor's container dom node
	 */
	getContainerDomNode(): HTMLElement;

	/**
	 * Returns the editor's dom node
	 */
	getDomNode(): HTMLElement | null;

	/**
	 * Add a content widget. Widgets must have unique ids, otherwise they will be overwritten.
	 */
	addContentWidget(widget: IContentWidget): void;
	/**
	 * Layout/Reposition a content widget. This is a ping to the editor to call widget.getPosition()
	 * and update appropriately.
	 */
	layoutContentWidget(widget: IContentWidget): void;
	/**
	 * Remove a content widget.
	 */
	removeContentWidget(widget: IContentWidget): void;

	/**
	 * Add an overlay widget. Widgets must have unique ids, otherwise they will be overwritten.
	 */
	addOverlayWidget(widget: IOverlayWidget): void;
	/**
	 * Layout/Reposition an overlay widget. This is a ping to the editor to call widget.getPosition()
	 * and update appropriately.
	 */
	layoutOverlayWidget(widget: IOverlayWidget): void;
	/**
	 * Remove an overlay widget.
	 */
	removeOverlayWidget(widget: IOverlayWidget): void;

	/**
	 * Change the view zones. View zones are lost when a new model is attached to the editor.
	 */
	changeViewZones(callback: (accessor: IViewZoneChangeAccessor) => void): void;

	/**
	 * Get the horizontal position (left offset) for the column w.r.t to the beginning of the line.
	 * This method works only if the line `lineNumber` is currently rendered (in the editor's viewport).
	 * Use this method with caution.
	 */
	getOffsetForColumn(lineNumber: number, column: number): number;

	/**
	 * Force an editor render now.
	 */
	render(forceRedraw?: boolean): void;

	/**
	 * Get the hit test target at coordinates `clientX` and `clientY`.
	 * The coordinates are relative to the top-left of the viewport.
	 *
	 * @returns Hit test target or null if the coordinates fall outside the editor or the editor has no model.
	 */
	getTargetAtClientPoint(clientX: number, clientY: number): IMouseTarget | null;

	/**
	 * Get the visible position for `position`.
	 * The result position takes scrolling into account and is relative to the top left corner of the editor.
	 * Explanation 1: the results of this method will change for the same `position` if the user scrolls the editor.
	 * Explanation 2: the results of this method will not change if the container of the editor gets repositioned.
	 * Warning: the results of this method are inaccurate for positions that are outside the current editor viewport.
	 */
	getScrolledVisiblePosition(position: IPosition): { top: number; left: number; height: number } | null;

	/**
	 * Apply the same font settings as the editor to `target`.
	 */
	applyFontInfo(target: HTMLElement): void;

	/**
	 * Check if the current instance has a model attached.
	 * @internal
	 */
	hasModel(): this is IActiveCodeEditor;

	setBanner(bannerDomNode: HTMLElement | null, height: number): void;
}

/**
 * @internal
 */
export interface IActiveCodeEditor extends ICodeEditor {
	/**
	 * Returns the primary position of the cursor.
	 */
	getPosition(): Position;

	/**
	 * Returns the primary selection of the editor.
	 */
	getSelection(): Selection;

	/**
	 * Returns all the selections of the editor.
	 */
	getSelections(): Selection[];

	/**
	 * Saves current view state of the editor in a serializable object.
	 */
	saveViewState(): editorCommon.ICodeEditorViewState;

	/**
	 * Type the getModel() of IEditor.
	 */
	getModel(): ITextModel;

	/**
	 * @internal
	 */
	_getViewModel(): IViewModel;

	/**
	 * Get all the decorations on a line (filtering out decorations from other editors).
	 */
	getLineDecorations(lineNumber: number): IModelDecoration[];

	/**
	 * Returns the editor's dom node
	 */
	getDomNode(): HTMLElement;

	/**
	 * Get the visible position for `position`.
	 * The result position takes scrolling into account and is relative to the top left corner of the editor.
	 * Explanation 1: the results of this method will change for the same `position` if the user scrolls the editor.
	 * Explanation 2: the results of this method will not change if the container of the editor gets repositioned.
	 * Warning: the results of this method are inaccurate for positions that are outside the current editor viewport.
	 */
	getScrolledVisiblePosition(position: IPosition): { top: number; left: number; height: number };
}

/**
 * Information about a line in the diff editor
 */
export interface IDiffLineInformation {
	readonly equivalentLineNumber: number;
}

/**
 * @internal
 */
export const enum DiffEditorState {
	Idle,
	ComputingDiff,
	DiffComputed
}

/**
 * A rich diff editor.
 */
export interface IDiffEditor extends editorCommon.IEditor {

	/**
	 * Returns whether the diff editor is ignoring trim whitespace or not.
	 * @internal
	 */
	readonly ignoreTrimWhitespace: boolean;
	/**
	 * Returns whether the diff editor is rendering side by side or inline.
	 * @internal
	 */
	readonly renderSideBySide: boolean;
	/**
	 * Timeout in milliseconds after which diff computation is cancelled.
	 * @internal
	 */
	readonly maxComputationTime: number;

	/**
	 * @see {@link ICodeEditor.getContainerDomNode}
	 */
	getContainerDomNode(): HTMLElement;

	/**
	 * An event emitted when the diff information computed by this diff editor has been updated.
	 * @event
	 */
	readonly onDidUpdateDiff: Event<void>;

	/**
	 * An event emitted when the diff model is changed (i.e. the diff editor shows new content).
	 * @event
	 */
	readonly onDidChangeModel: Event<void>;

	/**
	 * Saves current view state of the editor in a serializable object.
	 */
	saveViewState(): editorCommon.IDiffEditorViewState | null;

	/**
	 * Restores the view state of the editor from a serializable object generated by `saveViewState`.
	 */
	restoreViewState(state: editorCommon.IDiffEditorViewState | null): void;

	/**
	 * Type the getModel() of IEditor.
	 */
	getModel(): editorCommon.IDiffEditorModel | null;

	/**
	 * Sets the current model attached to this editor.
	 * If the previous model was created by the editor via the value key in the options
	 * literal object, it will be destroyed. Otherwise, if the previous model was set
	 * via setModel, or the model key in the options literal object, the previous model
	 * will not be destroyed.
	 * It is safe to call setModel(null) to simply detach the current model from the editor.
	 */
	setModel(model: editorCommon.IDiffEditorModel | null): void;

	/**
	 * Get the `original` editor.
	 */
	getOriginalEditor(): ICodeEditor;

	/**
	 * Get the `modified` editor.
	 */
	getModifiedEditor(): ICodeEditor;

	/**
	 * Get the computed diff information.
	 */
	getLineChanges(): ILineChange[] | null;

	/**
	 * Get the computed diff information.
	 * @internal
	 */
	getDiffComputationResult(): IDiffComputationResult | null;

	/**
	 * Get information based on computed diff about a line number from the original model.
	 * If the diff computation is not finished or the model is missing, will return null.
	 */
	getDiffLineInformationForOriginal(lineNumber: number): IDiffLineInformation | null;

	/**
	 * Get information based on computed diff about a line number from the modified model.
	 * If the diff computation is not finished or the model is missing, will return null.
	 */
	getDiffLineInformationForModified(lineNumber: number): IDiffLineInformation | null;

	/**
	 * Update the editor's options after the editor has been created.
	 */
	updateOptions(newOptions: IDiffEditorOptions): void;
}

/**
 *@internal
 */
export function isCodeEditor(thing: unknown): thing is ICodeEditor {
	if (thing && typeof (<ICodeEditor>thing).getEditorType === 'function') {
		return (<ICodeEditor>thing).getEditorType() === editorCommon.EditorType.ICodeEditor;
	} else {
		return false;
	}
}

/**
 *@internal
 */
export function isDiffEditor(thing: unknown): thing is IDiffEditor {
	if (thing && typeof (<IDiffEditor>thing).getEditorType === 'function') {
		return (<IDiffEditor>thing).getEditorType() === editorCommon.EditorType.IDiffEditor;
	} else {
		return false;
	}
}

/**
 *@internal
 */
export function isCompositeEditor(thing: unknown): thing is editorCommon.ICompositeCodeEditor {
	return !!thing
		&& typeof thing === 'object'
		&& typeof (<editorCommon.ICompositeCodeEditor>thing).onDidChangeActiveEditor === 'function';

}

/**
 *@internal
 */
export function getCodeEditor(thing: unknown): ICodeEditor | null {
	if (isCodeEditor(thing)) {
		return thing;
	}

	if (isDiffEditor(thing)) {
		return thing.getModifiedEditor();
	}

	if (isCompositeEditor(thing) && isCodeEditor(thing.activeCodeEditor)) {
		return thing.activeCodeEditor;
	}

	return null;
}

/**
 *@internal
 */
export function getIEditor(thing: any): editorCommon.IEditor | null {
	if (isCodeEditor(thing) || isDiffEditor(thing)) {
		return thing;
	}

	return null;
}
