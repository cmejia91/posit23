/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GroupIdentifier, IWorkbenchEditorConfiguration, IEditorIdentifier, IEditorCloseEvent, IEditorPartOptions, IEditorPartOptionsChangeEvent, SideBySideEditor, EditorCloseContext, IEditorPane, IEditorPartLimitOptions, IEditorPartDecorationOptions } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IEditorGroup, GroupDirection, IMergeGroupOptions, GroupsOrder, GroupsArrangement, IAuxiliaryEditorPart, IEditorPart } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Dimension } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ISerializableView } from 'vs/base/browser/ui/grid/grid';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { isObject } from 'vs/base/common/types';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IWindowsConfiguration } from 'vs/platform/window/common/window';
import { BooleanVerifier, EnumVerifier, NumberVerifier, ObjectVerifier, SetVerifier, verifyObject } from 'vs/base/common/verifier';
import product from 'vs/platform/product/common/product';
import { IAuxiliaryWindowOpenOptions } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';

export interface IEditorPartCreationOptions {
	readonly restorePreviousState: boolean;
}

export const DEFAULT_EDITOR_MIN_DIMENSIONS = new Dimension(220, 70);
export const DEFAULT_EDITOR_MAX_DIMENSIONS = new Dimension(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);

export const DEFAULT_EDITOR_PART_OPTIONS: IEditorPartOptions = {
	showTabs: 'multiple',
	highlightModifiedTabs: false,
	tabActionLocation: 'right',
	tabActionCloseVisibility: true,
	tabActionUnpinVisibility: true,
	tabSizing: 'fit',
	tabSizingFixedMinWidth: 50,
	tabSizingFixedMaxWidth: 160,
	pinnedTabSizing: 'normal',
	pinnedTabsOnSeparateRow: false,
	tabHeight: 'default',
	preventPinnedEditorClose: 'keyboardAndMouse',
	titleScrollbarSizing: 'default',
	focusRecentEditorAfterClose: true,
	showIcons: true,
	hasIcons: true, // 'vs-seti' is our default icon theme
	// --- Start Positron ---
	// enablePreview: true,
	enablePreview: false,
	// --- End Positron ---
	openPositioning: 'right',
	openSideBySideDirection: 'right',
	closeEmptyGroups: true,
	labelFormat: 'default',
	splitSizing: 'auto',
	splitOnDragAndDrop: true,
	dragToOpenWindow: product.quality !== 'stable',
	centeredLayoutFixedWidth: false,
	doubleClickTabToToggleEditorGroupSizes: 'expand',
	editorActionsLocation: 'default',
	wrapTabs: false,
	enablePreviewFromQuickOpen: false,
	scrollToSwitchTabs: false,
	enablePreviewFromCodeNavigation: false,
	closeOnFileDelete: false,
	mouseBackForwardToNavigate: true,
	restoreViewState: true,
	splitInGroupLayout: 'horizontal',
	revealIfOpen: false,
	// Properties that are Objects have to be defined as getters
	// to ensure no consumer modifies the default values
	get limit(): IEditorPartLimitOptions { return { enabled: false, value: 10, perEditorGroup: false, excludeDirty: false }; },
	get decorations(): IEditorPartDecorationOptions { return { badges: true, colors: true }; },
	get autoLockGroups(): Set<string> { return new Set<string>(); }
};

export function impactsEditorPartOptions(event: IConfigurationChangeEvent): boolean {
	return event.affectsConfiguration('workbench.editor') || event.affectsConfiguration('workbench.iconTheme') || event.affectsConfiguration('window.density');
}

export function getEditorPartOptions(configurationService: IConfigurationService, themeService: IThemeService): IEditorPartOptions {
	const options = {
		...DEFAULT_EDITOR_PART_OPTIONS,
		hasIcons: themeService.getFileIconTheme().hasFileIcons
	};

	const config = configurationService.getValue<IWorkbenchEditorConfiguration>();
	if (config?.workbench?.editor) {

		// Assign all primitive configuration over
		Object.assign(options, config.workbench.editor);

		// Special handle array types and convert to Set
		if (isObject(config.workbench.editor.autoLockGroups)) {
			options.autoLockGroups = DEFAULT_EDITOR_PART_OPTIONS.autoLockGroups;

			for (const [editorId, enablement] of Object.entries(config.workbench.editor.autoLockGroups)) {
				if (enablement === true) {
					options.autoLockGroups.add(editorId);
				}
			}
		} else {
			options.autoLockGroups = DEFAULT_EDITOR_PART_OPTIONS.autoLockGroups;
		}
	}

	const windowConfig = configurationService.getValue<IWindowsConfiguration>();
	if (windowConfig?.window?.density?.editorTabHeight) {
		options.tabHeight = windowConfig.window.density.editorTabHeight;
	}

	return validateEditorPartOptions(options);
}

function validateEditorPartOptions(options: IEditorPartOptions): IEditorPartOptions {

	// Migrate: Show tabs (config migration kicks in very late and can cause flicker otherwise)
	if (typeof options.showTabs === 'boolean') {
		options.showTabs = options.showTabs ? 'multiple' : 'single';
	}

	return verifyObject<IEditorPartOptions>({
		'wrapTabs': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['wrapTabs']),
		'scrollToSwitchTabs': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['scrollToSwitchTabs']),
		'highlightModifiedTabs': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['highlightModifiedTabs']),
		'tabActionCloseVisibility': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabActionCloseVisibility']),
		'tabActionUnpinVisibility': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabActionUnpinVisibility']),
		'pinnedTabsOnSeparateRow': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['pinnedTabsOnSeparateRow']),
		'focusRecentEditorAfterClose': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['focusRecentEditorAfterClose']),
		'showIcons': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['showIcons']),
		'enablePreview': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['enablePreview']),
		'enablePreviewFromQuickOpen': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['enablePreviewFromQuickOpen']),
		'enablePreviewFromCodeNavigation': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['enablePreviewFromCodeNavigation']),
		'closeOnFileDelete': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['closeOnFileDelete']),
		'closeEmptyGroups': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['closeEmptyGroups']),
		'revealIfOpen': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['revealIfOpen']),
		'mouseBackForwardToNavigate': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['mouseBackForwardToNavigate']),
		'restoreViewState': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['restoreViewState']),
		'splitOnDragAndDrop': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['splitOnDragAndDrop']),
		'dragToOpenWindow': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['dragToOpenWindow']),
		'centeredLayoutFixedWidth': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['centeredLayoutFixedWidth']),
		'hasIcons': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['hasIcons']),

		'tabSizingFixedMinWidth': new NumberVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabSizingFixedMinWidth']),
		'tabSizingFixedMaxWidth': new NumberVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabSizingFixedMaxWidth']),

		'showTabs': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['showTabs'], ['multiple', 'single', 'none']),
		'tabActionLocation': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabActionLocation'], ['left', 'right']),
		'tabSizing': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabSizing'], ['fit', 'shrink', 'fixed']),
		'pinnedTabSizing': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['pinnedTabSizing'], ['normal', 'compact', 'shrink']),
		'tabHeight': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabHeight'], ['default', 'compact']),
		'preventPinnedEditorClose': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['preventPinnedEditorClose'], ['keyboardAndMouse', 'keyboard', 'mouse', 'never']),
		'titleScrollbarSizing': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['titleScrollbarSizing'], ['default', 'large']),
		'openPositioning': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['openPositioning'], ['left', 'right', 'first', 'last']),
		'openSideBySideDirection': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['openSideBySideDirection'], ['right', 'down']),
		'labelFormat': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['labelFormat'], ['default', 'short', 'medium', 'long']),
		'splitInGroupLayout': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['splitInGroupLayout'], ['vertical', 'horizontal']),
		'splitSizing': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['splitSizing'], ['distribute', 'split', 'auto']),
		'doubleClickTabToToggleEditorGroupSizes': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['doubleClickTabToToggleEditorGroupSizes'], ['maximize', 'expand', 'off']),
		'editorActionsLocation': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['editorActionsLocation'], ['default', 'titleBar', 'hidden']),
		'autoLockGroups': new SetVerifier<string>(DEFAULT_EDITOR_PART_OPTIONS['autoLockGroups']),

		'limit': new ObjectVerifier<IEditorPartLimitOptions>(DEFAULT_EDITOR_PART_OPTIONS['limit'], {
			'enabled': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['limit']['enabled']),
			'value': new NumberVerifier(DEFAULT_EDITOR_PART_OPTIONS['limit']['value']),
			'perEditorGroup': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['limit']['perEditorGroup']),
			'excludeDirty': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['limit']['excludeDirty'])
		}),
		'decorations': new ObjectVerifier<IEditorPartDecorationOptions>(DEFAULT_EDITOR_PART_OPTIONS['decorations'], {
			'badges': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['decorations']['badges']),
			'colors': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['decorations']['colors'])
		}),
	}, options);
}

/**
 * A helper to access editor groups across all opened editor parts.
 */
export interface IEditorPartsView {

	readonly mainPart: IEditorGroupsView;
	registerPart(part: IEditorPart): IDisposable;

	readonly activeGroup: IEditorGroupView;
	readonly groups: IEditorGroupView[];
	getGroup(identifier: GroupIdentifier): IEditorGroupView | undefined;
	getGroups(order?: GroupsOrder): IEditorGroupView[];

	readonly count: number;

	createAuxiliaryEditorPart(options?: IAuxiliaryWindowOpenOptions): Promise<IAuxiliaryEditorPart>;
}

/**
 * A helper to access and mutate editor groups within an editor part.
 */
export interface IEditorGroupsView {

	readonly isAuxiliary: boolean;

	readonly groups: IEditorGroupView[];
	readonly activeGroup: IEditorGroupView;

	readonly partOptions: IEditorPartOptions;
	readonly onDidChangeEditorPartOptions: Event<IEditorPartOptionsChangeEvent>;

	readonly onDidVisibilityChange: Event<boolean>;

	getGroup(identifier: GroupIdentifier): IEditorGroupView | undefined;
	getGroups(order: GroupsOrder): IEditorGroupView[];

	activateGroup(identifier: IEditorGroupView | GroupIdentifier, preserveWindowOrder?: boolean): IEditorGroupView;
	restoreGroup(identifier: IEditorGroupView | GroupIdentifier): IEditorGroupView;

	addGroup(location: IEditorGroupView | GroupIdentifier, direction: GroupDirection, groupToCopy?: IEditorGroupView): IEditorGroupView;
	mergeGroup(group: IEditorGroupView | GroupIdentifier, target: IEditorGroupView | GroupIdentifier, options?: IMergeGroupOptions): IEditorGroupView;

	moveGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView;
	copyGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView;

	removeGroup(group: IEditorGroupView | GroupIdentifier, preserveFocus?: boolean): void;

	arrangeGroups(arrangement: GroupsArrangement, target?: IEditorGroupView | GroupIdentifier): void;
	toggleMaximizeGroup(group?: IEditorGroupView | GroupIdentifier): void;
	toggleExpandGroup(group?: IEditorGroupView | GroupIdentifier): void;
}

export interface IEditorGroupTitleHeight {

	/**
	 * The overall height of the editor group title control.
	 */
	readonly total: number;

	/**
	 * The height offset to e.g. use when drawing drop overlays.
	 * This number may be smaller than `height` if the title control
	 * decides to have an `offset` that is within the title control
	 * (e.g. when breadcrumbs are enabled).
	 */
	readonly offset: number;
}

/**
 * A helper to access and mutate an editor group within an editor part.
 */
export interface IEditorGroupView extends IDisposable, ISerializableView, IEditorGroup {

	readonly onDidFocus: Event<void>;

	readonly onDidOpenEditorFail: Event<EditorInput>;
	readonly onDidCloseEditor: Event<IEditorCloseEvent>;

	readonly groupsView: IEditorGroupsView;

	/**
	 * A promise that resolves when the group has been restored.
	 *
	 * For a group with active editor, the promise will resolve
	 * when the active editor has finished to resolve.
	 */
	readonly whenRestored: Promise<void>;

	readonly titleHeight: IEditorGroupTitleHeight;

	readonly disposed: boolean;

	setActive(isActive: boolean): void;

	notifyIndexChanged(newIndex: number): void;
	notifyLabelChanged(newLabel: string): void;

	openEditor(editor: EditorInput, options?: IEditorOptions, internalOptions?: IInternalEditorOpenOptions): Promise<IEditorPane | undefined>;

	relayout(): void;
}

export function fillActiveEditorViewState(group: IEditorGroup, expectedActiveEditor?: EditorInput, presetOptions?: IEditorOptions): IEditorOptions {
	if (!expectedActiveEditor || !group.activeEditor || expectedActiveEditor.matches(group.activeEditor)) {
		const options: IEditorOptions = {
			...presetOptions,
			viewState: group.activeEditorPane?.getViewState()
		};

		return options;
	}

	return presetOptions || Object.create(null);
}

/**
 * A sub-interface of IEditorService to hide some workbench-core specific
 * events from clients.
 */
export interface EditorServiceImpl extends IEditorService {

	/**
	 * Emitted when an editor failed to open.
	 */
	readonly onDidOpenEditorFail: Event<IEditorIdentifier>;

	/**
	 * Emitted when the list of most recently active editors change.
	 */
	readonly onDidMostRecentlyActiveEditorsChange: Event<void>;
}

export interface IInternalEditorTitleControlOptions {

	/**
	 * A hint to defer updating the title control for perf reasons.
	 * The caller must ensure to update the title control then.
	 */
	readonly skipTitleUpdate?: boolean;
}

export interface IInternalEditorOpenOptions extends IInternalEditorTitleControlOptions {

	/**
	 * Whether to consider a side by side editor as matching
	 * when figuring out if the editor to open is already
	 * opened or not. By default, side by side editors will
	 * not be considered as matching, even if the editor is
	 * opened in one of the sides.
	 */
	readonly supportSideBySide?: SideBySideEditor.ANY | SideBySideEditor.BOTH;

	/**
	 * When set to `true`, pass DOM focus into the tab control.
	 */
	readonly focusTabControl?: boolean;

	/**
	 * When set to `true`, will not attempt to move the window to
	 * the top that the editor opens in.
	 */
	readonly preserveWindowOrder?: boolean;
}

export interface IInternalEditorCloseOptions extends IInternalEditorTitleControlOptions {

	/**
	 * A hint that the editor is closed due to an error opening. This can be
	 * used to optimize how error toasts are appearing if any.
	 */
	readonly fromError?: boolean;

	/**
	 * Additional context as to why an editor is closed.
	 */
	readonly context?: EditorCloseContext;
}

export interface IInternalMoveCopyOptions extends IInternalEditorOpenOptions {

	/**
	 * Whether to close the editor at the source or keep it.
	 */
	readonly keepCopy?: boolean;
}
