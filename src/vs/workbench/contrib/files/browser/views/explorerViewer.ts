/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import * as DOM from 'vs/base/browser/dom';
import * as glob from 'vs/base/common/glob';
import { IListVirtualDelegate, ListDragOverEffect } from 'vs/base/browser/ui/list/list';
import { IProgressService, ProgressLocation, } from 'vs/platform/progress/common/progress';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IFileService, FileKind, FileOperationError, FileOperationResult, FileChangeType } from 'vs/platform/files/common/files';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { isTemporaryWorkspace, IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IDisposable, Disposable, dispose, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IFileLabelOptions, IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { ITreeNode, ITreeFilter, TreeVisibility, IAsyncDataSource, ITreeSorter, ITreeDragAndDrop, ITreeDragOverReaction, TreeDragOverBubble } from 'vs/base/browser/ui/tree/tree';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFilesConfiguration, UndoConfirmLevel } from 'vs/workbench/contrib/files/common/files';
import { dirname, joinPath, distinctParents } from 'vs/base/common/resources';
import { InputBox, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { localize } from 'vs/nls';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { once } from 'vs/base/common/functional';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { equals, deepClone } from 'vs/base/common/objects';
import * as path from 'vs/base/common/path';
import { ExplorerItem, NewExplorerItem } from 'vs/workbench/contrib/files/common/explorerModel';
import { compareFileExtensionsDefault, compareFileNamesDefault, compareFileNamesUpper, compareFileExtensionsUpper, compareFileNamesLower, compareFileExtensionsLower, compareFileNamesUnicode, compareFileExtensionsUnicode } from 'vs/base/common/comparers';
import { CodeDataTransfers, containsDragType } from 'vs/platform/dnd/browser/dnd';
import { fillEditorsDragData } from 'vs/workbench/browser/dnd';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDragAndDropData, DataTransfers } from 'vs/base/browser/dnd';
import { Schemas } from 'vs/base/common/network';
import { NativeDragAndDropData, ExternalElementsDragAndDropData, ElementsDragAndDropData } from 'vs/base/browser/ui/list/listView';
import { isMacintosh, isWeb } from 'vs/base/common/platform';
import { IDialogService, getFileNamesMessage } from 'vs/platform/dialogs/common/dialogs';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspaces/common/workspaceEditing';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { findValidPasteFileTarget } from 'vs/workbench/contrib/files/browser/fileActions';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { Emitter, Event, EventMultiplexer } from 'vs/base/common/event';
import { ITreeCompressionDelegate } from 'vs/base/browser/ui/tree/asyncDataTree';
import { ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { ICompressedTreeNode } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { ILabelService } from 'vs/platform/label/common/label';
import { isNumber } from 'vs/base/common/types';
import { IEditableData } from 'vs/workbench/common/views';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ResourceFileEdit } from 'vs/editor/browser/services/bulkEditService';
import { IExplorerService } from 'vs/workbench/contrib/files/browser/files';
import { BrowserFileUpload, ExternalFileImport, getMultipleFilesOverwriteConfirm } from 'vs/workbench/contrib/files/browser/fileImportExport';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { WebFileSystemAccess } from 'vs/platform/files/browser/webFileSystemAccess';
import { IgnoreFile } from 'vs/workbench/services/search/common/ignoreFile';
import { ResourceSet, TernarySearchTree } from 'vs/base/common/map';

export class ExplorerDelegate implements IListVirtualDelegate<ExplorerItem> {

	static readonly ITEM_HEIGHT = 22;

	getHeight(element: ExplorerItem): number {
		return ExplorerDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: ExplorerItem): string {
		return FilesRenderer.ID;
	}
}

export const explorerRootErrorEmitter = new Emitter<URI>();
export class ExplorerDataSource implements IAsyncDataSource<ExplorerItem | ExplorerItem[], ExplorerItem> {

	constructor(
		private fileFilter: FilesFilter,
		@IProgressService private readonly progressService: IProgressService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IFileService private readonly fileService: IFileService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
	) { }

	hasChildren(element: ExplorerItem | ExplorerItem[]): boolean {
		// don't render nest parents as containing children when all the children are filtered out
		return Array.isArray(element) || element.hasChildren((stat) => this.fileFilter.filter(stat, TreeVisibility.Visible));
	}

	getChildren(element: ExplorerItem | ExplorerItem[]): ExplorerItem[] | Promise<ExplorerItem[]> {
		if (Array.isArray(element)) {
			return element;
		}

		const wasError = element.isError;
		const sortOrder = this.explorerService.sortOrderConfiguration.sortOrder;
		const children = element.fetchChildren(sortOrder);
		if (Array.isArray(children)) {
			// fast path when children are known sync (i.e. nested children)
			return children;
		}
		const promise = children.then(
			children => {
				// Clear previous error decoration on root folder
				if (element instanceof ExplorerItem && element.isRoot && !element.isError && wasError && this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER) {
					explorerRootErrorEmitter.fire(element.resource);
				}
				return children;
			}
			, e => {

				if (element instanceof ExplorerItem && element.isRoot) {
					if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
						// Single folder create a dummy explorer item to show error
						const placeholder = new ExplorerItem(element.resource, this.fileService, this.configService, undefined, undefined, false);
						placeholder.isError = true;
						return [placeholder];
					} else {
						explorerRootErrorEmitter.fire(element.resource);
					}
				} else {
					// Do not show error for roots since we already use an explorer decoration to notify user
					this.notificationService.error(e);
				}

				return []; // we could not resolve any children because of an error
			});

		this.progressService.withProgress({
			location: ProgressLocation.Explorer,
			delay: this.layoutService.isRestored() ? 800 : 1500 // reduce progress visibility when still restoring
		}, _progress => promise);

		return promise;
	}
}

export interface ICompressedNavigationController {
	readonly current: ExplorerItem;
	readonly currentId: string;
	readonly items: ExplorerItem[];
	readonly labels: HTMLElement[];
	readonly index: number;
	readonly count: number;
	readonly onDidChange: Event<void>;
	previous(): void;
	next(): void;
	first(): void;
	last(): void;
	setIndex(index: number): void;
	updateCollapsed(collapsed: boolean): void;
}

export class CompressedNavigationController implements ICompressedNavigationController, IDisposable {

	static ID = 0;

	private _index: number;
	private _labels!: HTMLElement[];
	private _updateLabelDisposable: IDisposable;

	get index(): number { return this._index; }
	get count(): number { return this.items.length; }
	get current(): ExplorerItem { return this.items[this._index]!; }
	get currentId(): string { return `${this.id}_${this.index}`; }
	get labels(): HTMLElement[] { return this._labels; }

	private _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	constructor(private id: string, readonly items: ExplorerItem[], templateData: IFileTemplateData, private depth: number, private collapsed: boolean) {
		this._index = items.length - 1;

		this.updateLabels(templateData);
		this._updateLabelDisposable = templateData.label.onDidRender(() => this.updateLabels(templateData));
	}

	private updateLabels(templateData: IFileTemplateData): void {
		this._labels = Array.from(templateData.container.querySelectorAll('.label-name')) as HTMLElement[];
		let parents = '';
		for (let i = 0; i < this.labels.length; i++) {
			const ariaLabel = parents.length ? `${this.items[i].name}, compact, ${parents}` : this.items[i].name;
			this.labels[i].setAttribute('aria-label', ariaLabel);
			this.labels[i].setAttribute('aria-level', `${this.depth + i}`);
			parents = parents.length ? `${this.items[i].name} ${parents}` : this.items[i].name;
		}
		this.updateCollapsed(this.collapsed);

		if (this._index < this.labels.length) {
			this.labels[this._index].classList.add('active');
		}
	}

	previous(): void {
		if (this._index <= 0) {
			return;
		}

		this.setIndex(this._index - 1);
	}

	next(): void {
		if (this._index >= this.items.length - 1) {
			return;
		}

		this.setIndex(this._index + 1);
	}

	first(): void {
		if (this._index === 0) {
			return;
		}

		this.setIndex(0);
	}

	last(): void {
		if (this._index === this.items.length - 1) {
			return;
		}

		this.setIndex(this.items.length - 1);
	}

	setIndex(index: number): void {
		if (index < 0 || index >= this.items.length) {
			return;
		}

		this.labels[this._index].classList.remove('active');
		this._index = index;
		this.labels[this._index].classList.add('active');

		this._onDidChange.fire();
	}

	updateCollapsed(collapsed: boolean): void {
		this.collapsed = collapsed;
		for (let i = 0; i < this.labels.length; i++) {
			this.labels[i].setAttribute('aria-expanded', collapsed ? 'false' : 'true');
		}
	}

	dispose(): void {
		this._onDidChange.dispose();
		this._updateLabelDisposable.dispose();
	}
}

export interface IFileTemplateData {
	elementDisposable: IDisposable;
	label: IResourceLabel;
	container: HTMLElement;
}

export class FilesRenderer implements ICompressibleTreeRenderer<ExplorerItem, FuzzyScore, IFileTemplateData>, IListAccessibilityProvider<ExplorerItem>, IDisposable {
	static readonly ID = 'file';

	private styler: HTMLStyleElement;
	private config: IFilesConfiguration;
	private configListener: IDisposable;
	private compressedNavigationControllers = new Map<ExplorerItem, CompressedNavigationController>();

	private _onDidChangeActiveDescendant = new EventMultiplexer<void>();
	readonly onDidChangeActiveDescendant = this._onDidChangeActiveDescendant.event;

	constructor(
		private labels: ResourceLabels,
		private updateWidth: (stat: ExplorerItem) => void,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IThemeService private readonly themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@ILabelService private readonly labelService: ILabelService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
	) {
		this.config = this.configurationService.getValue<IFilesConfiguration>();

		this.styler = DOM.createStyleSheet();
		const buildOffsetStyles = () => {
			const indent = this.configurationService.getValue<number>('workbench.tree.indent');
			const offset = Math.max(22 - indent, 0); // derived via inspection
			const rule = `.explorer-viewlet .explorer-item.align-nest-icon-with-parent-icon { margin-left: ${offset}px }`;
			if (this.styler.innerText !== rule) { this.styler.innerText = rule; }
		};

		this.configListener = this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('explorer')) {
				this.config = this.configurationService.getValue();
			}
			if (e.affectsConfiguration('workbench.tree.indent')) {
				buildOffsetStyles();
			}
		});

		buildOffsetStyles();
	}

	getWidgetAriaLabel(): string {
		return localize('treeAriaLabel', "Files Explorer");
	}

	get templateId(): string {
		return FilesRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IFileTemplateData {
		const elementDisposable = Disposable.None;
		const label = this.labels.create(container, { supportHighlights: true });

		return { elementDisposable, label, container };
	}

	renderElement(node: ITreeNode<ExplorerItem, FuzzyScore>, index: number, templateData: IFileTemplateData): void {
		templateData.elementDisposable.dispose();
		const stat = node.element;
		const editableData = this.explorerService.getEditableData(stat);

		templateData.label.element.classList.remove('compressed');

		// File Label
		if (!editableData) {
			templateData.label.element.style.display = 'flex';
			templateData.elementDisposable = this.renderStat(stat, stat.name, undefined, node.filterData, templateData);
		}

		// Input Box
		else {
			templateData.label.element.style.display = 'none';
			templateData.elementDisposable = this.renderInputBox(templateData.container, stat, editableData);
		}
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ExplorerItem>, FuzzyScore>, index: number, templateData: IFileTemplateData, height: number | undefined): void {
		templateData.elementDisposable.dispose();

		const stat = node.element.elements[node.element.elements.length - 1];
		const editable = node.element.elements.filter(e => this.explorerService.isEditable(e));
		const editableData = editable.length === 0 ? undefined : this.explorerService.getEditableData(editable[0]);

		// File Label
		if (!editableData) {
			templateData.label.element.classList.add('compressed');
			templateData.label.element.style.display = 'flex';

			const disposables = new DisposableStore();
			const id = `compressed-explorer_${CompressedNavigationController.ID++}`;

			const label = node.element.elements.map(e => e.name);
			disposables.add(this.renderStat(stat, label, id, node.filterData, templateData));

			const compressedNavigationController = new CompressedNavigationController(id, node.element.elements, templateData, node.depth, node.collapsed);
			disposables.add(compressedNavigationController);
			this.compressedNavigationControllers.set(stat, compressedNavigationController);

			// accessibility
			disposables.add(this._onDidChangeActiveDescendant.add(compressedNavigationController.onDidChange));

			disposables.add(DOM.addDisposableListener(templateData.container, 'mousedown', e => {
				const result = getIconLabelNameFromHTMLElement(e.target);

				if (result) {
					compressedNavigationController.setIndex(result.index);
				}
			}));

			disposables.add(toDisposable(() => this.compressedNavigationControllers.delete(stat)));

			templateData.elementDisposable = disposables;
		}

		// Input Box
		else {
			templateData.label.element.classList.remove('compressed');
			templateData.label.element.style.display = 'none';
			templateData.elementDisposable = this.renderInputBox(templateData.container, editable[0], editableData);
		}
	}

	private renderStat(stat: ExplorerItem, label: string | string[], domId: string | undefined, filterData: FuzzyScore | undefined, templateData: IFileTemplateData): IDisposable {
		const elementDisposables = new DisposableStore();
		templateData.label.element.style.display = 'flex';
		const extraClasses = ['explorer-item'];
		if (this.explorerService.isCut(stat)) {
			extraClasses.push('cut');
		}

		const setResourceData = () => {
			// Offset nested children unless folders have both chevrons and icons, otherwise alignment breaks
			const theme = this.themeService.getFileIconTheme();

			// Hack to always render chevrons for file nests, or else may not be able to identify them.
			const twistieContainer = (templateData.container.parentElement?.parentElement?.querySelector('.monaco-tl-twistie') as HTMLElement);
			if (twistieContainer) {
				if (stat.hasNests && theme.hidesExplorerArrows) {
					twistieContainer.classList.add('force-twistie');
				} else {
					twistieContainer.classList.remove('force-twistie');
				}
			}

			// when explorer arrows are hidden or there are no folder icons, nests get misaligned as they are forced to have arrows and files typically have icons
			// Apply some CSS magic to get things looking as reasonable as possible.
			const themeIsUnhappyWithNesting = theme.hasFileIcons && (theme.hidesExplorerArrows || !theme.hasFolderIcons);
			const realignNestedChildren = stat.nestedParent && themeIsUnhappyWithNesting;

			templateData.label.setResource({ resource: stat.resource, name: label }, {
				fileKind: stat.isRoot ? FileKind.ROOT_FOLDER : stat.isDirectory ? FileKind.FOLDER : FileKind.FILE,
				extraClasses: realignNestedChildren ? [...extraClasses, 'align-nest-icon-with-parent-icon'] : extraClasses,
				fileDecorations: this.config.explorer.decorations,
				matches: createMatches(filterData),
				separator: this.labelService.getSeparator(stat.resource.scheme, stat.resource.authority),
				domId
			});
		};

		elementDisposables.add(this.themeService.onDidFileIconThemeChange(() => setResourceData()));
		setResourceData();

		elementDisposables.add(templateData.label.onDidRender(() => {
			try {
				this.updateWidth(stat);
			} catch (e) {
				// noop since the element might no longer be in the tree, no update of width necessary
			}
		}));

		return elementDisposables;
	}

	private renderInputBox(container: HTMLElement, stat: ExplorerItem, editableData: IEditableData): IDisposable {

		// Use a file label only for the icon next to the input box
		const label = this.labels.create(container);
		const extraClasses = ['explorer-item', 'explorer-item-edited'];
		const fileKind = stat.isRoot ? FileKind.ROOT_FOLDER : stat.isDirectory ? FileKind.FOLDER : FileKind.FILE;

		const theme = this.themeService.getFileIconTheme();
		const themeIsUnhappyWithNesting = theme.hasFileIcons && (theme.hidesExplorerArrows || !theme.hasFolderIcons);
		const realignNestedChildren = stat.nestedParent && themeIsUnhappyWithNesting;

		const labelOptions: IFileLabelOptions = {
			hidePath: true,
			hideLabel: true,
			fileKind,
			extraClasses: realignNestedChildren ? [...extraClasses, 'align-nest-icon-with-parent-icon'] : extraClasses,
		};


		const parent = stat.name ? dirname(stat.resource) : stat.resource;
		const value = stat.name || '';

		label.setFile(joinPath(parent, value || ' '), labelOptions); // Use icon for ' ' if name is empty.

		// hack: hide label
		(label.element.firstElementChild as HTMLElement).style.display = 'none';

		// Input field for name
		const inputBox = new InputBox(label.element, this.contextViewService, {
			validationOptions: {
				validation: (value) => {
					const message = editableData.validationMessage(value);
					if (!message || message.severity !== Severity.Error) {
						return null;
					}

					return {
						content: message.content,
						formatContent: true,
						type: MessageType.ERROR
					};
				}
			},
			ariaLabel: localize('fileInputAriaLabel', "Type file name. Press Enter to confirm or Escape to cancel.")
		});
		const styler = attachInputBoxStyler(inputBox, this.themeService);

		const lastDot = value.lastIndexOf('.');

		inputBox.value = value;
		inputBox.focus();
		inputBox.select({ start: 0, end: lastDot > 0 && !stat.isDirectory ? lastDot : value.length });

		const done = once((success: boolean, finishEditing: boolean) => {
			label.element.style.display = 'none';
			const value = inputBox.value;
			dispose(toDispose);
			label.element.remove();
			if (finishEditing) {
				editableData.onFinish(value, success);
			}
		});

		const showInputBoxNotification = () => {
			if (inputBox.isInputValid()) {
				const message = editableData.validationMessage(inputBox.value);
				if (message) {
					inputBox.showMessage({
						content: message.content,
						formatContent: true,
						type: message.severity === Severity.Info ? MessageType.INFO : message.severity === Severity.Warning ? MessageType.WARNING : MessageType.ERROR
					});
				} else {
					inputBox.hideMessage();
				}
			}
		};
		showInputBoxNotification();

		const toDispose = [
			inputBox,
			inputBox.onDidChange(value => {
				label.setFile(joinPath(parent, value || ' '), labelOptions); // update label icon while typing!
			}),
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
				if (e.equals(KeyCode.Enter)) {
					if (!inputBox.validate()) {
						done(true, true);
					}
				} else if (e.equals(KeyCode.Escape)) {
					done(false, true);
				}
			}),
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_UP, (e: IKeyboardEvent) => {
				showInputBoxNotification();
			}),
			DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, () => {
				done(inputBox.isInputValid(), true);
			}),
			label,
			styler
		];

		return toDisposable(() => {
			done(false, false);
		});
	}

	disposeElement(element: ITreeNode<ExplorerItem, FuzzyScore>, index: number, templateData: IFileTemplateData): void {
		templateData.elementDisposable.dispose();
	}

	disposeCompressedElements(node: ITreeNode<ICompressedTreeNode<ExplorerItem>, FuzzyScore>, index: number, templateData: IFileTemplateData): void {
		templateData.elementDisposable.dispose();
	}

	disposeTemplate(templateData: IFileTemplateData): void {
		templateData.elementDisposable.dispose();
		templateData.label.dispose();
	}

	getCompressedNavigationController(stat: ExplorerItem): ICompressedNavigationController | undefined {
		return this.compressedNavigationControllers.get(stat);
	}

	// IAccessibilityProvider

	getAriaLabel(element: ExplorerItem): string {
		return element.name;
	}

	getAriaLevel(element: ExplorerItem): number {
		// We need to comput aria level on our own since children of compact folders will otherwise have an incorrect level	#107235
		let depth = 0;
		let parent = element.parent;
		while (parent) {
			parent = parent.parent;
			depth++;
		}

		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			depth = depth + 1;
		}

		return depth;
	}

	getActiveDescendantId(stat: ExplorerItem): string | undefined {
		const compressedNavigationController = this.compressedNavigationControllers.get(stat);
		return compressedNavigationController?.currentId;
	}

	dispose(): void {
		this.configListener.dispose();
		this.styler.innerText = '';
	}
}

interface CachedParsedExpression {
	original: glob.IExpression;
	parsed: glob.ParsedExpression;
}

/**
 * Respectes files.exclude setting in filtering out content from the explorer.
 * Makes sure that visible editors are always shown in the explorer even if they are filtered out by settings.
 */
export class FilesFilter implements ITreeFilter<ExplorerItem, FuzzyScore> {
	private hiddenExpressionPerRoot = new Map<string, CachedParsedExpression>();
	private editorsAffectingFilter = new Set<EditorInput>();
	private _onDidChange = new Emitter<void>();
	private toDispose: IDisposable[] = [];
	// List of ignoreFile resources. Used to detect changes to the ignoreFiles.
	private ignoreFileResourcesPerRoot = new Map<string, ResourceSet>();
	// Ignore tree per root. Similar to `hiddenExpressionPerRoot`
	// Note: URI in the ternary search tree is the URI of the folder containing the ignore file
	// It is not the ignore file itself. This is because of the way the IgnoreFile works and nested paths
	private ignoreTreesPerRoot = new Map<string, TernarySearchTree<URI, IgnoreFile>>();

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@IEditorService private readonly editorService: IEditorService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService
	) {
		this.toDispose.push(this.contextService.onDidChangeWorkspaceFolders(() => this.updateConfiguration()));
		this.toDispose.push(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('files.exclude') || e.affectsConfiguration('explorer.excludeGitIgnore')) {
				this.updateConfiguration();
			}
		}));
		this.toDispose.push(this.fileService.onDidFilesChange(e => {
			// Check to see if the update contains any of the ignoreFileResources
			for (const [root, ignoreFileResourceSet] of this.ignoreFileResourcesPerRoot.entries()) {
				ignoreFileResourceSet.forEach(async ignoreResource => {
					if (e.contains(ignoreResource, FileChangeType.UPDATED)) {
						await this.processIgnoreFile(root, ignoreResource, true);
					}
					if (e.contains(ignoreResource, FileChangeType.DELETED)) {
						this.ignoreTreesPerRoot.get(root)?.delete(dirname(ignoreResource));
						ignoreFileResourceSet.delete(ignoreResource);
						this._onDidChange.fire();
					}
				});
			}
		}));
		this.toDispose.push(this.editorService.onDidVisibleEditorsChange(() => {
			const editors = this.editorService.visibleEditors;
			let shouldFire = false;

			for (const e of editors) {
				if (!e.resource) {
					continue;
				}

				const stat = this.explorerService.findClosest(e.resource);
				if (stat && stat.isExcluded) {
					// A filtered resource suddenly became visible since user opened an editor
					shouldFire = true;
					break;
				}
			}

			for (const e of this.editorsAffectingFilter) {
				if (!editors.includes(e)) {
					// Editor that was affecting filtering is no longer visible
					shouldFire = true;
					break;
				}
			}

			if (shouldFire) {
				this.editorsAffectingFilter.clear();
				this._onDidChange.fire();
			}
		}));
		this.updateConfiguration();
	}

	get onDidChange(): Event<void> {
		return this._onDidChange.event;
	}

	private updateConfiguration(): void {
		let shouldFire = false;
		let updatedGitIgnoreSetting = false;
		this.contextService.getWorkspace().folders.forEach(folder => {
			const configuration = this.configurationService.getValue<IFilesConfiguration>({ resource: folder.uri });
			const excludesConfig: glob.IExpression = configuration?.files?.exclude || Object.create(null);
			const parseIgnoreFile: boolean = configuration.explorer.excludeGitIgnore;

			// If we should be parsing ignoreFiles for this workspace and don't have an ignore tree initialize one
			if (parseIgnoreFile && !this.ignoreTreesPerRoot.has(folder.uri.toString())) {
				updatedGitIgnoreSetting = true;
				this.ignoreFileResourcesPerRoot.set(folder.uri.toString(), new ResourceSet());
				this.ignoreTreesPerRoot.set(folder.uri.toString(), TernarySearchTree.forUris((uri) => this.uriIdentityService.extUri.ignorePathCasing(uri)));
			}

			// If we shouldn't be parsing ignore files but have an ignore tree, clear the ignore tree
			if (!parseIgnoreFile && this.ignoreTreesPerRoot.has(folder.uri.toString())) {
				updatedGitIgnoreSetting = true;
				this.ignoreFileResourcesPerRoot.delete(folder.uri.toString());
				this.ignoreTreesPerRoot.delete(folder.uri.toString());
			}

			if (!shouldFire) {
				const cached = this.hiddenExpressionPerRoot.get(folder.uri.toString());
				shouldFire = !cached || !equals(cached.original, excludesConfig);
			}

			const excludesConfigCopy = deepClone(excludesConfig); // do not keep the config, as it gets mutated under our hoods

			this.hiddenExpressionPerRoot.set(folder.uri.toString(), { original: excludesConfigCopy, parsed: glob.parse(excludesConfigCopy) });
		});

		if (shouldFire || updatedGitIgnoreSetting) {
			this.editorsAffectingFilter.clear();
			this._onDidChange.fire();
		}
	}

	/**
	 * Given a .gitignore file resource, processes the resource and adds it to the ignore tree which hides explorer items
	 * @param root The root folder of the workspace as a string. Used for lookup key for ignore tree and resource list
	 * @param ignoreFileResource The resource of the .gitignore file
	 * @param update Whether or not we're updating an existing ignore file. If true it deletes the old entry
	 */
	private async processIgnoreFile(root: string, ignoreFileResource: URI, update?: boolean) {
		// Get the name of the directory which the ignore file is in
		const dirUri = dirname(ignoreFileResource);
		const ignoreTree = this.ignoreTreesPerRoot.get(root);
		if (!ignoreTree) {
			return;
		}

		// Don't process a directory if we already have it in the tree
		if (!update && ignoreTree.has(dirUri)) {
			return;
		}
		// Maybe we need a cancellation token here in case it's super long?
		const content = await this.fileService.readFile(ignoreFileResource);

		// If it's just an update we update the contents keeping all references the same
		if (update) {
			const ignoreFile = ignoreTree.get(dirUri);
			ignoreFile?.updateContents(content.value.toString());
		} else {
			// Otherwise we create a new ignorefile and add it to the tree
			const ignoreParent = ignoreTree.findSubstr(dirUri);
			const ignoreFile = new IgnoreFile(content.value.toString(), dirUri.path, ignoreParent);
			ignoreTree.set(dirUri, ignoreFile);
			// If we haven't seen this resource before then we need to add it to the list of resources we're tracking
			if (!this.ignoreFileResourcesPerRoot.get(root)?.has(ignoreFileResource)) {
				this.ignoreFileResourcesPerRoot.get(root)?.add(ignoreFileResource);
			}
		}

		// Notify the explorer of the change so we may ignore these files
		this._onDidChange.fire();
	}

	filter(stat: ExplorerItem, parentVisibility: TreeVisibility): boolean {
		// Add newly visited .gitignore files to the ignore tree
		if (stat.name === '.gitignore') {
			this.processIgnoreFile(stat.root.resource.toString(), stat.resource, false);
			// Never hide .gitignore files
			return true;
		}

		return this.isVisible(stat, parentVisibility);
	}

	private isVisible(stat: ExplorerItem, parentVisibility: TreeVisibility): boolean {
		stat.isExcluded = false;
		if (parentVisibility === TreeVisibility.Hidden) {
			stat.isExcluded = true;
			return false;
		}
		if (this.explorerService.getEditableData(stat)) {
			return true; // always visible
		}

		// Hide those that match Hidden Patterns
		const cached = this.hiddenExpressionPerRoot.get(stat.root.resource.toString());
		const globMatch = cached?.parsed(path.relative(stat.root.resource.path, stat.resource.path), stat.name, name => !!(stat.parent && stat.parent.getChild(name)));
		// Small optimization to only traverse gitIgnore if the globMatch from fileExclude returned nothing
		const ignoreFile = globMatch ? undefined : this.ignoreTreesPerRoot.get(stat.root.resource.toString())?.findSubstr(stat.resource);
		const isIncludedInTraversal = ignoreFile?.isPathIncludedInTraversal(stat.resource.path, stat.isDirectory);
		// Doing !undefined returns true and we want it to be false when undefined because that means it's not included in the ignore file
		const isIgnoredByIgnoreFile = isIncludedInTraversal === undefined ? false : !isIncludedInTraversal;
		if (isIgnoredByIgnoreFile || globMatch || stat.parent?.isExcluded) {
			stat.isExcluded = true;
			const editors = this.editorService.visibleEditors;
			const editor = editors.find(e => e.resource && this.uriIdentityService.extUri.isEqualOrParent(e.resource, stat.resource));
			if (editor && stat.root === this.explorerService.findClosestRoot(stat.resource)) {
				this.editorsAffectingFilter.add(editor);
				return true; // Show all opened files and their parents
			}

			return false; // hidden through pattern
		}

		return true;
	}

	dispose(): void {
		dispose(this.toDispose);
	}
}

// Explorer Sorter
export class FileSorter implements ITreeSorter<ExplorerItem> {

	constructor(
		@IExplorerService private readonly explorerService: IExplorerService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
	) { }

	compare(statA: ExplorerItem, statB: ExplorerItem): number {
		// Do not sort roots
		if (statA.isRoot) {
			if (statB.isRoot) {
				const workspaceA = this.contextService.getWorkspaceFolder(statA.resource);
				const workspaceB = this.contextService.getWorkspaceFolder(statB.resource);
				return workspaceA && workspaceB ? (workspaceA.index - workspaceB.index) : -1;
			}

			return -1;
		}

		if (statB.isRoot) {
			return 1;
		}

		const sortOrder = this.explorerService.sortOrderConfiguration.sortOrder;
		const lexicographicOptions = this.explorerService.sortOrderConfiguration.lexicographicOptions;

		let compareFileNames;
		let compareFileExtensions;
		switch (lexicographicOptions) {
			case 'upper':
				compareFileNames = compareFileNamesUpper;
				compareFileExtensions = compareFileExtensionsUpper;
				break;
			case 'lower':
				compareFileNames = compareFileNamesLower;
				compareFileExtensions = compareFileExtensionsLower;
				break;
			case 'unicode':
				compareFileNames = compareFileNamesUnicode;
				compareFileExtensions = compareFileExtensionsUnicode;
				break;
			default:
				// 'default'
				compareFileNames = compareFileNamesDefault;
				compareFileExtensions = compareFileExtensionsDefault;
		}

		// Sort Directories
		switch (sortOrder) {
			case 'type':
				if (statA.isDirectory && !statB.isDirectory) {
					return -1;
				}

				if (statB.isDirectory && !statA.isDirectory) {
					return 1;
				}

				if (statA.isDirectory && statB.isDirectory) {
					return compareFileNames(statA.name, statB.name);
				}

				break;

			case 'filesFirst':
				if (statA.isDirectory && !statB.isDirectory) {
					return 1;
				}

				if (statB.isDirectory && !statA.isDirectory) {
					return -1;
				}

				break;

			case 'foldersNestsFiles':
				if (statA.isDirectory && !statB.isDirectory) {
					return -1;
				}

				if (statB.isDirectory && !statA.isDirectory) {
					return 1;
				}

				if (statA.hasNests && !statB.hasNests) {
					return -1;
				}

				if (statB.hasNests && !statA.hasNests) {
					return 1;
				}

				break;

			case 'mixed':
				break; // not sorting when "mixed" is on

			default: /* 'default', 'modified' */
				if (statA.isDirectory && !statB.isDirectory) {
					return -1;
				}

				if (statB.isDirectory && !statA.isDirectory) {
					return 1;
				}

				break;
		}

		// Sort Files
		switch (sortOrder) {
			case 'type':
				return compareFileExtensions(statA.name, statB.name);

			case 'modified':
				if (statA.mtime !== statB.mtime) {
					return (statA.mtime && statB.mtime && statA.mtime < statB.mtime) ? 1 : -1;
				}

				return compareFileNames(statA.name, statB.name);

			default: /* 'default', 'mixed', 'filesFirst' */
				return compareFileNames(statA.name, statB.name);
		}
	}
}

export class FileDragAndDrop implements ITreeDragAndDrop<ExplorerItem> {
	private static readonly CONFIRM_DND_SETTING_KEY = 'explorer.confirmDragAndDrop';

	private compressedDragOverElement: HTMLElement | undefined;
	private compressedDropTargetDisposable: IDisposable = Disposable.None;

	private toDispose: IDisposable[];
	private dropEnabled = false;

	constructor(
		private isCollapsed: (item: ExplorerItem) => boolean,
		@IExplorerService private explorerService: IExplorerService,
		@IEditorService private editorService: IEditorService,
		@IDialogService private dialogService: IDialogService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IFileService private fileService: IFileService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		this.toDispose = [];

		const updateDropEnablement = () => {
			this.dropEnabled = this.configurationService.getValue('explorer.enableDragAndDrop');
		};
		updateDropEnablement();
		this.toDispose.push(this.configurationService.onDidChangeConfiguration((e) => updateDropEnablement()));
	}

	onDragOver(data: IDragAndDropData, target: ExplorerItem | undefined, targetIndex: number | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		if (!this.dropEnabled) {
			return false;
		}

		// Compressed folders
		if (target) {
			const compressedTarget = FileDragAndDrop.getCompressedStatFromDragEvent(target, originalEvent);

			if (compressedTarget) {
				const iconLabelName = getIconLabelNameFromHTMLElement(originalEvent.target);

				if (iconLabelName && iconLabelName.index < iconLabelName.count - 1) {
					const result = this.handleDragOver(data, compressedTarget, targetIndex, originalEvent);

					if (result) {
						if (iconLabelName.element !== this.compressedDragOverElement) {
							this.compressedDragOverElement = iconLabelName.element;
							this.compressedDropTargetDisposable.dispose();
							this.compressedDropTargetDisposable = toDisposable(() => {
								iconLabelName.element.classList.remove('drop-target');
								this.compressedDragOverElement = undefined;
							});

							iconLabelName.element.classList.add('drop-target');
						}

						return typeof result === 'boolean' ? result : { ...result, feedback: [] };
					}

					this.compressedDropTargetDisposable.dispose();
					return false;
				}
			}
		}

		this.compressedDropTargetDisposable.dispose();
		return this.handleDragOver(data, target, targetIndex, originalEvent);
	}

	private handleDragOver(data: IDragAndDropData, target: ExplorerItem | undefined, targetIndex: number | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		const isCopy = originalEvent && ((originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh));
		const isNative = data instanceof NativeDragAndDropData;
		const effect = (isNative || isCopy) ? ListDragOverEffect.Copy : ListDragOverEffect.Move;

		// Native DND
		if (isNative) {
			if (!containsDragType(originalEvent, DataTransfers.FILES, CodeDataTransfers.FILES, DataTransfers.RESOURCES)) {
				return false;
			}
		}

		// Other-Tree DND
		else if (data instanceof ExternalElementsDragAndDropData) {
			return false;
		}

		// In-Explorer DND
		else {
			const items = FileDragAndDrop.getStatsFromDragAndDropData(data as ElementsDragAndDropData<ExplorerItem, ExplorerItem[]>);

			if (!target) {
				// Dropping onto the empty area. Do not accept if items dragged are already
				// children of the root unless we are copying the file
				if (!isCopy && items.every(i => !!i.parent && i.parent.isRoot)) {
					return false;
				}

				return { accept: true, bubble: TreeDragOverBubble.Down, effect, autoExpand: false };
			}

			if (!Array.isArray(items)) {
				return false;
			}

			if (items.some((source) => {
				if (source.isRoot && target instanceof ExplorerItem && !target.isRoot) {
					return true; // Root folder can not be moved to a non root file stat.
				}

				if (this.uriIdentityService.extUri.isEqual(source.resource, target.resource)) {
					return true; // Can not move anything onto itself
				}

				if (source.isRoot && target instanceof ExplorerItem && target.isRoot) {
					// Disable moving workspace roots in one another
					return false;
				}

				if (!isCopy && this.uriIdentityService.extUri.isEqual(dirname(source.resource), target.resource)) {
					return true; // Can not move a file to the same parent unless we copy
				}

				if (this.uriIdentityService.extUri.isEqualOrParent(target.resource, source.resource)) {
					return true; // Can not move a parent folder into one of its children
				}

				return false;
			})) {
				return false;
			}
		}

		// All (target = model)
		if (!target) {
			return { accept: true, bubble: TreeDragOverBubble.Down, effect };
		}

		// All (target = file/folder)
		else {
			if (target.isDirectory) {
				if (target.isReadonly) {
					return false;
				}

				return { accept: true, bubble: TreeDragOverBubble.Down, effect, autoExpand: true };
			}

			if (this.contextService.getWorkspace().folders.every(folder => folder.uri.toString() !== target.resource.toString())) {
				return { accept: true, bubble: TreeDragOverBubble.Up, effect };
			}
		}

		return false;
	}

	getDragURI(element: ExplorerItem): string | null {
		if (this.explorerService.isEditable(element)) {
			return null;
		}

		return element.resource.toString();
	}

	getDragLabel(elements: ExplorerItem[], originalEvent: DragEvent): string | undefined {
		if (elements.length === 1) {
			const stat = FileDragAndDrop.getCompressedStatFromDragEvent(elements[0], originalEvent);
			return stat.name;
		}

		return String(elements.length);
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const items = FileDragAndDrop.getStatsFromDragAndDropData(data as ElementsDragAndDropData<ExplorerItem, ExplorerItem[]>, originalEvent);
		if (items && items.length && originalEvent.dataTransfer) {
			// Apply some datatransfer types to allow for dragging the element outside of the application
			this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, items, originalEvent));

			// The only custom data transfer we set from the explorer is a file transfer
			// to be able to DND between multiple code file explorers across windows
			const fileResources = items.filter(s => s.resource.scheme === Schemas.file).map(r => r.resource.fsPath);
			if (fileResources.length) {
				originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
			}
		}
	}

	async drop(data: IDragAndDropData, target: ExplorerItem | undefined, targetIndex: number | undefined, originalEvent: DragEvent): Promise<void> {
		this.compressedDropTargetDisposable.dispose();

		// Find compressed target
		if (target) {
			const compressedTarget = FileDragAndDrop.getCompressedStatFromDragEvent(target, originalEvent);

			if (compressedTarget) {
				target = compressedTarget;
			}
		}

		// Find parent to add to
		if (!target) {
			target = this.explorerService.roots[this.explorerService.roots.length - 1];
		}
		if (!target.isDirectory && target.parent) {
			target = target.parent;
		}
		if (target.isReadonly) {
			return;
		}
		const resolvedTarget = target;
		if (!resolvedTarget) {
			return;
		}

		try {

			// External file DND (Import/Upload file)
			if (data instanceof NativeDragAndDropData) {
				// Use local file import when supported
				if (!isWeb || (isTemporaryWorkspace(this.contextService.getWorkspace()) && WebFileSystemAccess.supported(window))) {
					const fileImport = this.instantiationService.createInstance(ExternalFileImport);
					await fileImport.import(resolvedTarget, originalEvent);
				}
				// Otherwise fallback to browser based file upload
				else {
					const browserUpload = this.instantiationService.createInstance(BrowserFileUpload);
					await browserUpload.upload(target, originalEvent);
				}
			}

			// In-Explorer DND (Move/Copy file)
			else {
				await this.handleExplorerDrop(data as ElementsDragAndDropData<ExplorerItem, ExplorerItem[]>, resolvedTarget, originalEvent);
			}
		} catch (error) {
			this.dialogService.show(Severity.Error, toErrorMessage(error));
		}
	}

	private async handleExplorerDrop(data: ElementsDragAndDropData<ExplorerItem, ExplorerItem[]>, target: ExplorerItem, originalEvent: DragEvent): Promise<void> {
		const elementsData = FileDragAndDrop.getStatsFromDragAndDropData(data);
		const distinctItems = new Set(elementsData);

		for (const item of distinctItems) {
			if (this.isCollapsed(item)) {
				const nestedChildren = item.nestedChildren;
				if (nestedChildren) {
					for (const child of nestedChildren) {
						distinctItems.add(child);
					}
				}
			}
		}

		const items = distinctParents([...distinctItems], s => s.resource);
		const isCopy = (originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh);

		// Handle confirm setting
		const confirmDragAndDrop = !isCopy && this.configurationService.getValue<boolean>(FileDragAndDrop.CONFIRM_DND_SETTING_KEY);
		if (confirmDragAndDrop) {
			const message = items.length > 1 && items.every(s => s.isRoot) ? localize('confirmRootsMove', "Are you sure you want to change the order of multiple root folders in your workspace?")
				: items.length > 1 ? localize('confirmMultiMove', "Are you sure you want to move the following {0} files into '{1}'?", items.length, target.name)
					: items[0].isRoot ? localize('confirmRootMove', "Are you sure you want to change the order of root folder '{0}' in your workspace?", items[0].name)
						: localize('confirmMove', "Are you sure you want to move '{0}' into '{1}'?", items[0].name, target.name);
			const detail = items.length > 1 && !items.every(s => s.isRoot) ? getFileNamesMessage(items.map(i => i.resource)) : undefined;

			const confirmation = await this.dialogService.confirm({
				message,
				detail,
				checkbox: {
					label: localize('doNotAskAgain', "Do not ask me again")
				},
				type: 'question',
				primaryButton: localize({ key: 'moveButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Move")
			});

			if (!confirmation.confirmed) {
				return;
			}

			// Check for confirmation checkbox
			if (confirmation.checkboxChecked === true) {
				await this.configurationService.updateValue(FileDragAndDrop.CONFIRM_DND_SETTING_KEY, false);
			}
		}

		await this.doHandleRootDrop(items.filter(s => s.isRoot), target);

		const sources = items.filter(s => !s.isRoot);
		if (isCopy) {
			return this.doHandleExplorerDropOnCopy(sources, target);
		}

		return this.doHandleExplorerDropOnMove(sources, target);
	}

	private async doHandleRootDrop(roots: ExplorerItem[], target: ExplorerItem): Promise<void> {
		if (roots.length === 0) {
			return;
		}

		const folders = this.contextService.getWorkspace().folders;
		let targetIndex: number | undefined;
		const workspaceCreationData: IWorkspaceFolderCreationData[] = [];
		const rootsToMove: IWorkspaceFolderCreationData[] = [];

		for (let index = 0; index < folders.length; index++) {
			const data = {
				uri: folders[index].uri,
				name: folders[index].name
			};
			if (target instanceof ExplorerItem && this.uriIdentityService.extUri.isEqual(folders[index].uri, target.resource)) {
				targetIndex = index;
			}

			if (roots.every(r => r.resource.toString() !== folders[index].uri.toString())) {
				workspaceCreationData.push(data);
			} else {
				rootsToMove.push(data);
			}
		}
		if (targetIndex === undefined) {
			targetIndex = workspaceCreationData.length;
		}

		workspaceCreationData.splice(targetIndex, 0, ...rootsToMove);

		return this.workspaceEditingService.updateFolders(0, workspaceCreationData.length, workspaceCreationData);
	}

	private async doHandleExplorerDropOnCopy(sources: ExplorerItem[], target: ExplorerItem): Promise<void> {

		// Reuse duplicate action when user copies
		const explorerConfig = this.configurationService.getValue<IFilesConfiguration>().explorer;
		const resourceFileEdits = sources.map(({ resource, isDirectory }) =>
			(new ResourceFileEdit(resource, findValidPasteFileTarget(this.explorerService, target, { resource, isDirectory, allowOverwrite: false }, explorerConfig.incrementalNaming), { copy: true })));
		const labelSufix = getFileOrFolderLabelSufix(sources);
		await this.explorerService.applyBulkEdit(resourceFileEdits, {
			confirmBeforeUndo: explorerConfig.confirmUndo === UndoConfirmLevel.Default || explorerConfig.confirmUndo === UndoConfirmLevel.Verbose,
			undoLabel: localize('copy', "Copy {0}", labelSufix),
			progressLabel: localize('copying', "Copying {0}", labelSufix),
		});

		const editors = resourceFileEdits.filter(edit => {
			const item = edit.newResource ? this.explorerService.findClosest(edit.newResource) : undefined;
			return item && !item.isDirectory;
		}).map(edit => ({ resource: edit.newResource, options: { pinned: true } }));

		await this.editorService.openEditors(editors);
	}

	private async doHandleExplorerDropOnMove(sources: ExplorerItem[], target: ExplorerItem): Promise<void> {

		// Do not allow moving readonly items
		const resourceFileEdits = sources.filter(source => !source.isReadonly).map(source => new ResourceFileEdit(source.resource, joinPath(target.resource, source.name)));
		const labelSufix = getFileOrFolderLabelSufix(sources);
		const options = {
			confirmBeforeUndo: this.configurationService.getValue<IFilesConfiguration>().explorer.confirmUndo === UndoConfirmLevel.Verbose,
			undoLabel: localize('move', "Move {0}", labelSufix),
			progressLabel: localize('moving', "Moving {0}", labelSufix)
		};

		try {
			await this.explorerService.applyBulkEdit(resourceFileEdits, options);
		} catch (error) {

			// Conflict
			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_MOVE_CONFLICT) {

				const overwrites: URI[] = [];
				for (const edit of resourceFileEdits) {
					if (edit.newResource && await this.fileService.exists(edit.newResource)) {
						overwrites.push(edit.newResource);
					}
				}

				// Move with overwrite if the user confirms
				const confirm = getMultipleFilesOverwriteConfirm(overwrites);
				const { confirmed } = await this.dialogService.confirm(confirm);
				if (confirmed) {
					await this.explorerService.applyBulkEdit(resourceFileEdits.map(re => new ResourceFileEdit(re.oldResource, re.newResource, { overwrite: true })), options);
				}
			}

			// Any other error: bubble up
			else {
				throw error;
			}
		}
	}

	private static getStatsFromDragAndDropData(data: ElementsDragAndDropData<ExplorerItem, ExplorerItem[]>, dragStartEvent?: DragEvent): ExplorerItem[] {
		if (data.context) {
			return data.context;
		}

		// Detect compressed folder dragging
		if (dragStartEvent && data.elements.length === 1) {
			data.context = [FileDragAndDrop.getCompressedStatFromDragEvent(data.elements[0], dragStartEvent)];
			return data.context;
		}

		return data.elements;
	}

	private static getCompressedStatFromDragEvent(stat: ExplorerItem, dragEvent: DragEvent): ExplorerItem {
		const target = document.elementFromPoint(dragEvent.clientX, dragEvent.clientY);
		const iconLabelName = getIconLabelNameFromHTMLElement(target);

		if (iconLabelName) {
			const { count, index } = iconLabelName;

			let i = count - 1;
			while (i > index && stat.parent) {
				stat = stat.parent;
				i--;
			}

			return stat;
		}

		return stat;
	}

	onDragEnd(): void {
		this.compressedDropTargetDisposable.dispose();
	}
}

function getIconLabelNameFromHTMLElement(target: HTMLElement | EventTarget | Element | null): { element: HTMLElement; count: number; index: number } | null {
	if (!(target instanceof HTMLElement)) {
		return null;
	}

	let element: HTMLElement | null = target;

	while (element && !element.classList.contains('monaco-list-row')) {
		if (element.classList.contains('label-name') && element.hasAttribute('data-icon-label-count')) {
			const count = Number(element.getAttribute('data-icon-label-count'));
			const index = Number(element.getAttribute('data-icon-label-index'));

			if (isNumber(count) && isNumber(index)) {
				return { element: element, count, index };
			}
		}

		element = element.parentElement;
	}

	return null;
}

export function isCompressedFolderName(target: HTMLElement | EventTarget | Element | null): boolean {
	return !!getIconLabelNameFromHTMLElement(target);
}

export class ExplorerCompressionDelegate implements ITreeCompressionDelegate<ExplorerItem> {

	isIncompressible(stat: ExplorerItem): boolean {
		return stat.isRoot || !stat.isDirectory || stat instanceof NewExplorerItem || (!stat.parent || stat.parent.isRoot);
	}
}

function getFileOrFolderLabelSufix(items: ExplorerItem[]): string {
	if (items.length === 1) {
		return items[0].name;
	}

	if (items.every(i => i.isDirectory)) {
		return localize('numberOfFolders', "{0} folders", items.length);
	}
	if (items.every(i => !i.isDirectory)) {
		return localize('numberOfFiles', "{0} files", items.length);
	}

	return `${items.length} files and folders`;
}
