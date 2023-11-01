/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { IActivityService } from 'vs/workbench/services/activity/common/activity';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, DisposableStore, Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { IColorTheme } from 'vs/platform/theme/common/themeService';
import { CompositeBar, ICompositeBarItem, CompositeDragAndDrop } from 'vs/workbench/browser/parts/compositeBar';
import { Dimension, createCSSRule, asCSSUrl, isMouseEvent } from 'vs/base/browser/dom';
import { IStorageService, StorageScope, StorageTarget, IProfileStorageValueChangeEvent } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ToggleCompositePinnedAction, ICompositeBarColors, IActivityHoverOptions, ToggleCompositeBadgeAction, CompositeBarAction, ICompositeBar, ICompositeBarActionItem } from 'vs/workbench/browser/parts/compositeBarActions';
import { IViewDescriptorService, ViewContainer, IViewContainerModel, ViewContainerLocation } from 'vs/workbench/common/views';
import { getEnabledViewContainerContextKey } from 'vs/workbench/common/contextkeys';
import { IContextKeyService, ContextKeyExpr, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { isString } from 'vs/base/common/types';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { isNative } from 'vs/base/common/platform';
import { Before2D, ICompositeDragAndDrop } from 'vs/workbench/browser/dnd';
import { ThemeIcon } from 'vs/base/common/themables';
import { IAction, toAction } from 'vs/base/common/actions';
import { StringSHA1 } from 'vs/base/common/hash';
import { GestureEvent } from 'vs/base/browser/touch';
import { IPaneCompositePart } from 'vs/workbench/browser/parts/paneCompositePart';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

interface IPlaceholderViewContainer {
	readonly id: string;
	readonly name?: string;
	readonly iconUrl?: UriComponents;
	readonly themeIcon?: ThemeIcon;
	readonly isBuiltin?: boolean;
	readonly views?: { when?: string }[];
	// TODO @sandy081: Remove this after a while. Migrated to visible in IViewContainerWorkspaceState
	readonly visible?: boolean;
}

interface IPinnedViewContainer {
	readonly id: string;
	readonly pinned: boolean;
	readonly order?: number;
	// TODO @sandy081: Remove this after a while. Migrated to visible in IViewContainerWorkspaceState
	readonly visible: boolean;
}

interface IViewContainerWorkspaceState {
	readonly id: string;
	readonly visible: boolean;
}

interface ICachedViewContainer {
	readonly id: string;
	name?: string;
	icon?: URI | ThemeIcon;
	readonly pinned: boolean;
	readonly order?: number;
	visible: boolean;
	isBuiltin?: boolean;
	views?: { when?: string }[];
}

export interface IPaneCompositeBarOptions {
	readonly partContainerClass: string;
	readonly pinnedViewContainersKey: string;
	readonly placeholderViewContainersKey: string;
	readonly viewContainersWorkspaceStateKey: string;
	readonly icon: boolean;
	readonly compact?: boolean;
	readonly iconSize: number;
	readonly recomputeSizes: boolean;
	readonly orientation: ActionsOrientation;
	readonly compositeSize: number;
	readonly overflowActionSize: number;
	readonly preventLoopNavigation?: boolean;
	readonly activityHoverOptions: IActivityHoverOptions;
	readonly fillExtraContextMenuActions: (actions: IAction[], e?: MouseEvent | GestureEvent) => void;
	readonly colors: (theme: IColorTheme) => ICompositeBarColors;
}

export class PaneCompositeBar extends Disposable {

	private readonly viewContainerDisposables = this._register(new DisposableMap<string, IDisposable>());
	private readonly location: ViewContainerLocation;
	private readonly enabledViewContainersContextKeys: Map<string, IContextKey<boolean>> = new Map<string, IContextKey<boolean>>();

	private readonly compositeBar: CompositeBar;
	readonly dndHandler: ICompositeDragAndDrop;
	private readonly compositeActions = new Map<string, { activityAction: ViewContainerActivityAction; pinnedAction: ToggleCompositePinnedAction; badgeAction: ToggleCompositeBadgeAction }>();

	private hasExtensionsRegistered: boolean = false;

	constructor(
		protected readonly options: IPaneCompositeBarOptions,
		private readonly part: Parts,
		private readonly paneCompositePart: IPaneCompositePart,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWorkbenchLayoutService protected readonly layoutService: IWorkbenchLayoutService,
	) {
		super();
		this.location = paneCompositePart.partId === Parts.PANEL_PART
			? ViewContainerLocation.Panel : paneCompositePart.partId === Parts.AUXILIARYBAR_PART
				? ViewContainerLocation.AuxiliaryBar : ViewContainerLocation.Sidebar;

		this.dndHandler = new CompositeDragAndDrop(this.viewDescriptorService, this.location,
			async (id: string, focus?: boolean) => { return await this.paneCompositePart.openPaneComposite(id, focus) ?? null; },
			(from: string, to: string, before?: Before2D) => this.compositeBar.move(from, to, this.options.orientation === ActionsOrientation.VERTICAL ? before?.verticallyBefore : before?.horizontallyBefore),
			() => this.compositeBar.getCompositeBarItems(),
		);

		const cachedItems = this.cachedViewContainers
			.map(container => ({
				id: container.id,
				name: container.name,
				visible: !this.shouldBeHidden(container.id, container),
				order: container.order,
				pinned: container.pinned,
			}));
		this.compositeBar = this.createCompositeBar(cachedItems);
		this.onDidRegisterViewContainers(this.getViewContainers());
		this.registerListeners();
	}

	private createCompositeBar(cachedItems: ICompositeBarItem[]) {
		return this._register(this.instantiationService.createInstance(CompositeBar, cachedItems, {
			icon: this.options.icon,
			compact: this.options.compact,
			orientation: this.options.orientation,
			activityHoverOptions: this.options.activityHoverOptions,
			preventLoopNavigation: this.options.preventLoopNavigation,
			openComposite: async (compositeId, preserveFocus) => {
				return (await this.paneCompositePart.openPaneComposite(compositeId, !preserveFocus)) ?? null;
			},
			getActivityAction: compositeId => this.getCompositeActions(compositeId).activityAction,
			getCompositePinnedAction: compositeId => this.getCompositeActions(compositeId).pinnedAction,
			getCompositeBadgeAction: compositeId => this.getCompositeActions(compositeId).badgeAction,
			getOnCompositeClickAction: compositeId => this.getCompositeActions(compositeId).activityAction,
			fillExtraContextMenuActions: (actions, e) => this.options.fillExtraContextMenuActions(actions, e),
			getContextMenuActionsForComposite: compositeId => this.getContextMenuActionsForComposite(compositeId),
			getDefaultCompositeId: () => this.viewDescriptorService.getDefaultViewContainer(this.location)?.id,
			dndHandler: this.dndHandler,
			compositeSize: this.options.compositeSize,
			overflowActionSize: this.options.overflowActionSize,
			colors: theme => this.options.colors(theme),
		}));
	}

	private getContextMenuActionsForComposite(compositeId: string): IAction[] {
		const actions: IAction[] = [];

		const viewContainer = this.viewDescriptorService.getViewContainerById(compositeId)!;
		const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(viewContainer)!;
		if (defaultLocation !== this.viewDescriptorService.getViewContainerLocation(viewContainer)) {
			actions.push(toAction({ id: 'resetLocationAction', label: localize('resetLocation', "Reset Location"), run: () => this.viewDescriptorService.moveViewContainerToLocation(viewContainer, defaultLocation, undefined, 'resetLocationAction') }));
		} else {
			const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
			if (viewContainerModel.allViewDescriptors.length === 1) {
				const viewToReset = viewContainerModel.allViewDescriptors[0];
				const defaultContainer = this.viewDescriptorService.getDefaultContainerById(viewToReset.id)!;
				if (defaultContainer !== viewContainer) {
					actions.push(toAction({ id: 'resetLocationAction', label: localize('resetLocation', "Reset Location"), run: () => this.viewDescriptorService.moveViewsToContainer([viewToReset], defaultContainer, undefined, 'resetLocationAction') }));
				}
			}
		}

		return actions;
	}

	private registerListeners(): void {
		// View Container Changes
		this._register(this.viewDescriptorService.onDidChangeViewContainers(({ added, removed }) => this.onDidChangeViewContainers(added, removed)));
		this._register(this.viewDescriptorService.onDidChangeContainerLocation(({ viewContainer, from, to }) => this.onDidChangeViewContainerLocation(viewContainer, from, to)));

		// View Container Visibility Changes
		this._register(this.paneCompositePart.onDidPaneCompositeOpen(e => this.onDidChangeViewContainerVisibility(e.getId(), true)));
		this._register(this.paneCompositePart.onDidPaneCompositeClose(e => this.onDidChangeViewContainerVisibility(e.getId(), false)));

		// Extension registration
		this.extensionService.whenInstalledExtensionsRegistered().then(() => {
			if (this._store.isDisposed) {
				return;
			}
			this.onDidRegisterExtensions();
			this._register(this.compositeBar.onDidChange(() => this.saveCachedViewContainers()));
			this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, this.options.pinnedViewContainersKey, this._store)(e => this.onDidPinnedViewContainersStorageValueChange(e)));
		});
	}

	private onDidChangeViewContainers(added: readonly { container: ViewContainer; location: ViewContainerLocation }[], removed: readonly { container: ViewContainer; location: ViewContainerLocation }[]) {
		removed.filter(({ location }) => location === this.location).forEach(({ container }) => this.onDidDeregisterViewContainer(container));
		this.onDidRegisterViewContainers(added.filter(({ location }) => location === this.location).map(({ container }) => container));
	}

	private onDidChangeViewContainerLocation(container: ViewContainer, from: ViewContainerLocation, to: ViewContainerLocation) {
		if (from === this.location) {
			this.onDidDeregisterViewContainer(container);
		}

		if (to === this.location) {
			this.onDidRegisterViewContainers([container]);

			// Open view container if part is visible and there is no other view container opened
			const visibleComposites = this.compositeBar.getVisibleComposites();
			if (!this.paneCompositePart.getActivePaneComposite() && this.layoutService.isVisible(this.paneCompositePart.partId) && visibleComposites.length) {
				this.paneCompositePart.openPaneComposite(visibleComposites[0].id);
			}
		}
	}

	private onDidChangeViewContainerVisibility(id: string, visible: boolean) {
		if (visible) {
			// Activate view container action on opening of a view container
			this.onDidViewContainerVisible(id);
		} else {
			// Deactivate view container action on close
			this.compositeBar.deactivateComposite(id);
		}
	}

	private onDidRegisterExtensions(): void {
		this.hasExtensionsRegistered = true;

		// show/hide/remove composites
		for (const { id } of this.cachedViewContainers) {
			const viewContainer = this.getViewContainer(id);
			if (viewContainer) {
				this.showOrHideViewContainer(viewContainer);
			} else {
				if (this.viewDescriptorService.isViewContainerRemovedPermanently(id)) {
					this.removeComposite(id);
				} else {
					this.hideComposite(id);
				}
			}
		}

		this.saveCachedViewContainers();
	}

	private onDidViewContainerVisible(id: string): void {
		const viewContainer = this.getViewContainer(id);
		if (viewContainer) {

			// Update the composite bar by adding
			this.addComposite(viewContainer);
			this.compositeBar.activateComposite(viewContainer.id);

			if (this.shouldBeHidden(viewContainer)) {
				const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
				if (viewContainerModel.activeViewDescriptors.length === 0) {
					// Update the composite bar by hiding
					this.hideComposite(viewContainer.id);
				}
			}
		}
	}

	create(parent: HTMLElement): HTMLElement {
		return this.compositeBar.create(parent);
	}

	private getCompositeActions(compositeId: string): { activityAction: ViewContainerActivityAction; pinnedAction: ToggleCompositePinnedAction; badgeAction: ToggleCompositeBadgeAction } {
		let compositeActions = this.compositeActions.get(compositeId);
		if (!compositeActions) {
			const viewContainer = this.getViewContainer(compositeId);
			if (viewContainer) {
				const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
				compositeActions = {
					activityAction: this._register(this.instantiationService.createInstance(ViewContainerActivityAction, this.toCompositeBarActionItemFrom(viewContainerModel), this.part, this.paneCompositePart)),
					pinnedAction: this._register(new ToggleCompositePinnedAction(this.toCompositeBarActionItemFrom(viewContainerModel), this.compositeBar)),
					badgeAction: this._register(new ToggleCompositeBadgeAction(this.toCompositeBarActionItemFrom(viewContainerModel), this.compositeBar))
				};
			} else {
				const cachedComposite = this.cachedViewContainers.filter(c => c.id === compositeId)[0];
				compositeActions = {
					activityAction: this._register(this.instantiationService.createInstance(PlaceHolderViewContainerActivityAction, this.toCompositeBarActionItem(compositeId, cachedComposite?.name ?? compositeId, cachedComposite?.icon, undefined), this.part, this.paneCompositePart)),
					pinnedAction: this._register(new PlaceHolderToggleCompositePinnedAction(compositeId, this.compositeBar)),
					badgeAction: this._register(new PlaceHolderToggleCompositeBadgeAction(compositeId, this.compositeBar))
				};
			}

			this.compositeActions.set(compositeId, compositeActions);
		}

		return compositeActions;
	}

	private onDidRegisterViewContainers(viewContainers: readonly ViewContainer[]): void {
		for (const viewContainer of viewContainers) {
			this.addComposite(viewContainer);

			// Pin it by default if it is new
			const cachedViewContainer = this.cachedViewContainers.filter(({ id }) => id === viewContainer.id)[0];
			if (!cachedViewContainer) {
				this.compositeBar.pin(viewContainer.id);
			}

			// Active
			const visibleViewContainer = this.paneCompositePart.getActivePaneComposite();
			if (visibleViewContainer?.getId() === viewContainer.id) {
				this.compositeBar.activateComposite(viewContainer.id);
			}

			const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
			this.updateCompositeBarActionItem(viewContainer, viewContainerModel);
			this.showOrHideViewContainer(viewContainer);

			const disposables = new DisposableStore();
			disposables.add(viewContainerModel.onDidChangeContainerInfo(() => this.updateCompositeBarActionItem(viewContainer, viewContainerModel)));
			disposables.add(viewContainerModel.onDidChangeActiveViewDescriptors(() => this.showOrHideViewContainer(viewContainer)));

			this.viewContainerDisposables.set(viewContainer.id, disposables);
		}
	}

	private onDidDeregisterViewContainer(viewContainer: ViewContainer): void {
		this.viewContainerDisposables.deleteAndDispose(viewContainer.id);
		this.removeComposite(viewContainer.id);
	}

	private updateCompositeBarActionItem(viewContainer: ViewContainer, viewContainerModel: IViewContainerModel): void {
		const compositeBarActionItem = this.toCompositeBarActionItemFrom(viewContainerModel);
		const { activityAction, pinnedAction } = this.getCompositeActions(viewContainer.id);
		activityAction.updateCompositeBarActionItem(compositeBarActionItem);

		if (pinnedAction instanceof PlaceHolderToggleCompositePinnedAction) {
			pinnedAction.setActivity(compositeBarActionItem);
		}

		if (this.options.recomputeSizes) {
			this.compositeBar.recomputeSizes();
		}

		this.saveCachedViewContainers();
	}

	private toCompositeBarActionItemFrom(viewContainerModel: IViewContainerModel): ICompositeBarActionItem {
		return this.toCompositeBarActionItem(viewContainerModel.viewContainer.id, viewContainerModel.title, viewContainerModel.icon, viewContainerModel.keybindingId);
	}

	private toCompositeBarActionItem(id: string, name: string, icon: URI | ThemeIcon | undefined, keybindingId: string | undefined): ICompositeBarActionItem {
		let classNames: string[] | undefined = undefined;
		let iconUrl: URI | undefined = undefined;
		if (this.options.icon) {
			if (URI.isUri(icon)) {
				iconUrl = icon;
				const cssUrl = asCSSUrl(icon);
				const hash = new StringSHA1();
				hash.update(cssUrl);
				const iconId = `activity-${id.replace(/\./g, '-')}-${hash.digest()}`;
				const iconClass = `.monaco-workbench .${this.options.partContainerClass} .monaco-action-bar .action-label.${iconId}`;
				classNames = [iconId, 'uri-icon'];
				createCSSRule(iconClass, `
				mask: ${cssUrl} no-repeat 50% 50%;
				mask-size: ${this.options.iconSize}px;
				-webkit-mask: ${cssUrl} no-repeat 50% 50%;
				-webkit-mask-size: ${this.options.iconSize}px;
				mask-origin: padding;
				-webkit-mask-origin: padding;
			`);
			} else if (ThemeIcon.isThemeIcon(icon)) {
				classNames = ThemeIcon.asClassNameArray(icon);
			}
		}

		return { id, name, classNames, iconUrl, keybindingId };
	}

	private showOrHideViewContainer(viewContainer: ViewContainer): void {
		let contextKey = this.enabledViewContainersContextKeys.get(viewContainer.id);
		if (!contextKey) {
			contextKey = this.contextKeyService.createKey(getEnabledViewContainerContextKey(viewContainer.id), false);
			this.enabledViewContainersContextKeys.set(viewContainer.id, contextKey);
		}
		if (this.shouldBeHidden(viewContainer)) {
			contextKey.set(false);
			this.hideComposite(viewContainer.id);
		} else {
			contextKey.set(true);
			this.addComposite(viewContainer);
		}
	}

	private shouldBeHidden(viewContainerOrId: string | ViewContainer, cachedViewContainer?: ICachedViewContainer): boolean {
		const viewContainer = isString(viewContainerOrId) ? this.getViewContainer(viewContainerOrId) : viewContainerOrId;
		const viewContainerId = isString(viewContainerOrId) ? viewContainerOrId : viewContainerOrId.id;

		if (viewContainer) {
			if (viewContainer.hideIfEmpty) {
				if (this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length > 0) {
					return false;
				}
			} else {
				return false;
			}
		}

		// Check cache only if extensions are not yet registered and current window is not native (desktop) remote connection window
		if (!this.hasExtensionsRegistered && !(this.part === Parts.SIDEBAR_PART && this.environmentService.remoteAuthority && isNative)) {
			cachedViewContainer = cachedViewContainer || this.cachedViewContainers.find(({ id }) => id === viewContainerId);

			// Show builtin ViewContainer if not registered yet
			if (!viewContainer && cachedViewContainer?.isBuiltin && cachedViewContainer?.visible) {
				return false;
			}

			if (cachedViewContainer?.views?.length) {
				return cachedViewContainer.views.every(({ when }) => !!when && !this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(when)));
			}
		}

		return true;
	}

	private addComposite(viewContainer: ViewContainer): void {
		this.compositeBar.addComposite({ id: viewContainer.id, name: typeof viewContainer.title === 'string' ? viewContainer.title : viewContainer.title.value, order: viewContainer.order, requestedIndex: viewContainer.requestedIndex });
	}

	private hideComposite(compositeId: string): void {
		this.compositeBar.hideComposite(compositeId);

		const compositeActions = this.compositeActions.get(compositeId);
		if (compositeActions) {
			compositeActions.activityAction.dispose();
			compositeActions.pinnedAction.dispose();
			this.compositeActions.delete(compositeId);
		}
	}

	private removeComposite(compositeId: string): void {
		this.compositeBar.removeComposite(compositeId);

		const compositeActions = this.compositeActions.get(compositeId);
		if (compositeActions) {
			compositeActions.activityAction.dispose();
			compositeActions.pinnedAction.dispose();
			this.compositeActions.delete(compositeId);
		}
	}

	getPinnedPaneCompositeIds(): string[] {
		const pinnedCompositeIds = this.compositeBar.getPinnedComposites().map(v => v.id);
		return this.getViewContainers()
			.filter(v => this.compositeBar.isPinned(v.id))
			.sort((v1, v2) => pinnedCompositeIds.indexOf(v1.id) - pinnedCompositeIds.indexOf(v2.id))
			.map(v => v.id);
	}

	getVisiblePaneCompositeIds(): string[] {
		return this.compositeBar.getVisibleComposites()
			.filter(v => this.paneCompositePart.getActivePaneComposite()?.getId() === v.id || this.compositeBar.isPinned(v.id))
			.map(v => v.id);
	}

	getContextMenuActions(): IAction[] {
		return this.compositeBar.getContextMenuActions();
	}

	focus(index?: number): void {
		this.compositeBar.focus(index);
	}

	layout(width: number, height: number): void {
		this.compositeBar.layout(new Dimension(width, height));
	}

	private getViewContainer(id: string): ViewContainer | undefined {
		const viewContainer = this.viewDescriptorService.getViewContainerById(id);
		return viewContainer && this.viewDescriptorService.getViewContainerLocation(viewContainer) === this.location ? viewContainer : undefined;
	}

	private getViewContainers(): readonly ViewContainer[] {
		return this.viewDescriptorService.getViewContainersByLocation(this.location);
	}

	private onDidPinnedViewContainersStorageValueChange(e: IProfileStorageValueChangeEvent): void {
		if (this.pinnedViewContainersValue !== this.getStoredPinnedViewContainersValue() /* This checks if current window changed the value or not */) {
			this._placeholderViewContainersValue = undefined;
			this._pinnedViewContainersValue = undefined;
			this._cachedViewContainers = undefined;

			const newCompositeItems: ICompositeBarItem[] = [];
			const compositeItems = this.compositeBar.getCompositeBarItems();

			for (const cachedViewContainer of this.cachedViewContainers) {
				newCompositeItems.push({
					id: cachedViewContainer.id,
					name: cachedViewContainer.name,
					order: cachedViewContainer.order,
					pinned: cachedViewContainer.pinned,
					visible: cachedViewContainer.visible,
				});
			}

			for (const viewContainer of this.getViewContainers()) {
				// Add missing view containers
				if (!newCompositeItems.some(({ id }) => id === viewContainer.id)) {
					const index = compositeItems.findIndex(({ id }) => id === viewContainer.id);
					if (index !== -1) {
						const compositeItem = compositeItems[index];
						newCompositeItems.splice(index, 0, {
							id: viewContainer.id,
							name: typeof viewContainer.title === 'string' ? viewContainer.title : viewContainer.title.value,
							order: compositeItem.order,
							pinned: compositeItem.pinned,
							visible: compositeItem.visible,
						});
					} else {
						newCompositeItems.push({
							id: viewContainer.id,
							name: typeof viewContainer.title === 'string' ? viewContainer.title : viewContainer.title.value,
							order: viewContainer.order,
							pinned: true,
							visible: !this.shouldBeHidden(viewContainer),
						});
					}
				}
			}

			this.compositeBar.setCompositeBarItems(newCompositeItems);
		}
	}

	private saveCachedViewContainers(): void {
		const state: ICachedViewContainer[] = [];

		const compositeItems = this.compositeBar.getCompositeBarItems();
		for (const compositeItem of compositeItems) {
			const viewContainer = this.getViewContainer(compositeItem.id);
			if (viewContainer) {
				const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
				const views: { when: string | undefined }[] = [];
				for (const { when } of viewContainerModel.allViewDescriptors) {
					views.push({ when: when ? when.serialize() : undefined });
				}
				state.push({
					id: compositeItem.id,
					name: viewContainerModel.title,
					icon: URI.isUri(viewContainerModel.icon) && this.environmentService.remoteAuthority ? undefined : viewContainerModel.icon, // Do not cache uri icons with remote connection
					views,
					pinned: compositeItem.pinned,
					order: compositeItem.order,
					visible: compositeItem.visible,
					isBuiltin: !viewContainer.extensionId
				});
			} else {
				state.push({ id: compositeItem.id, name: compositeItem.name, pinned: compositeItem.pinned, order: compositeItem.order, visible: false, isBuiltin: false });
			}
		}

		this.storeCachedViewContainersState(state);
	}

	private _cachedViewContainers: ICachedViewContainer[] | undefined = undefined;
	private get cachedViewContainers(): ICachedViewContainer[] {
		if (this._cachedViewContainers === undefined) {
			this._cachedViewContainers = this.getPinnedViewContainers();
			for (const placeholderViewContainer of this.getPlaceholderViewContainers()) {
				const cachedViewContainer = this._cachedViewContainers.find(cached => cached.id === placeholderViewContainer.id);
				if (cachedViewContainer) {
					cachedViewContainer.visible = placeholderViewContainer.visible ?? cachedViewContainer.visible;
					cachedViewContainer.name = placeholderViewContainer.name;
					cachedViewContainer.icon = placeholderViewContainer.themeIcon ? placeholderViewContainer.themeIcon :
						placeholderViewContainer.iconUrl ? URI.revive(placeholderViewContainer.iconUrl) : undefined;
					if (URI.isUri(cachedViewContainer.icon) && this.environmentService.remoteAuthority) {
						cachedViewContainer.icon = undefined; // Do not cache uri icons with remote connection
					}
					cachedViewContainer.views = placeholderViewContainer.views;
					cachedViewContainer.isBuiltin = placeholderViewContainer.isBuiltin;
				}
			}
			for (const viewContainerWorkspaceState of this.getViewContainersWorkspaceState()) {
				const cachedViewContainer = this._cachedViewContainers.find(cached => cached.id === viewContainerWorkspaceState.id);
				if (cachedViewContainer) {
					cachedViewContainer.visible = viewContainerWorkspaceState.visible ?? cachedViewContainer.visible;
				}
			}
		}

		return this._cachedViewContainers;
	}

	private storeCachedViewContainersState(cachedViewContainers: ICachedViewContainer[]): void {
		const pinnedViewContainers = this.getPinnedViewContainers();
		this.setPinnedViewContainers(cachedViewContainers.map(({ id, pinned, order }) => (<IPinnedViewContainer>{
			id,
			pinned,
			visible: pinnedViewContainers.find(({ id: pinnedId }) => pinnedId === id)?.visible,
			order
		})));

		this.setPlaceholderViewContainers(cachedViewContainers.map(({ id, icon, name, views, isBuiltin }) => (<IPlaceholderViewContainer>{
			id,
			iconUrl: URI.isUri(icon) ? icon : undefined,
			themeIcon: ThemeIcon.isThemeIcon(icon) ? icon : undefined,
			name,
			isBuiltin,
			views
		})));

		this.setViewContainersWorkspaceState(cachedViewContainers.map(({ id, visible }) => (<IViewContainerWorkspaceState>{
			id,
			visible,
		})));
	}

	private getPinnedViewContainers(): IPinnedViewContainer[] {
		return JSON.parse(this.pinnedViewContainersValue);
	}

	private setPinnedViewContainers(pinnedViewContainers: IPinnedViewContainer[]): void {
		this.pinnedViewContainersValue = JSON.stringify(pinnedViewContainers);
	}

	private _pinnedViewContainersValue: string | undefined;
	private get pinnedViewContainersValue(): string {
		if (!this._pinnedViewContainersValue) {
			this._pinnedViewContainersValue = this.getStoredPinnedViewContainersValue();
		}

		return this._pinnedViewContainersValue;
	}

	private set pinnedViewContainersValue(pinnedViewContainersValue: string) {
		if (this.pinnedViewContainersValue !== pinnedViewContainersValue) {
			this._pinnedViewContainersValue = pinnedViewContainersValue;
			this.setStoredPinnedViewContainersValue(pinnedViewContainersValue);
		}
	}

	private getStoredPinnedViewContainersValue(): string {
		return this.storageService.get(this.options.pinnedViewContainersKey, StorageScope.PROFILE, '[]');
	}

	private setStoredPinnedViewContainersValue(value: string): void {
		this.storageService.store(this.options.pinnedViewContainersKey, value, StorageScope.PROFILE, StorageTarget.USER);
	}

	private getPlaceholderViewContainers(): IPlaceholderViewContainer[] {
		return JSON.parse(this.placeholderViewContainersValue);
	}

	private setPlaceholderViewContainers(placeholderViewContainers: IPlaceholderViewContainer[]): void {
		this.placeholderViewContainersValue = JSON.stringify(placeholderViewContainers);
	}

	private _placeholderViewContainersValue: string | undefined;
	private get placeholderViewContainersValue(): string {
		if (!this._placeholderViewContainersValue) {
			this._placeholderViewContainersValue = this.getStoredPlaceholderViewContainersValue();
		}

		return this._placeholderViewContainersValue;
	}

	private set placeholderViewContainersValue(placeholderViewContainesValue: string) {
		if (this.placeholderViewContainersValue !== placeholderViewContainesValue) {
			this._placeholderViewContainersValue = placeholderViewContainesValue;
			this.setStoredPlaceholderViewContainersValue(placeholderViewContainesValue);
		}
	}

	private getStoredPlaceholderViewContainersValue(): string {
		return this.storageService.get(this.options.placeholderViewContainersKey, StorageScope.PROFILE, '[]');
	}

	private setStoredPlaceholderViewContainersValue(value: string): void {
		this.storageService.store(this.options.placeholderViewContainersKey, value, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private getViewContainersWorkspaceState(): IViewContainerWorkspaceState[] {
		return JSON.parse(this.viewContainersWorkspaceStateValue);
	}

	private setViewContainersWorkspaceState(viewContainersWorkspaceState: IViewContainerWorkspaceState[]): void {
		this.viewContainersWorkspaceStateValue = JSON.stringify(viewContainersWorkspaceState);
	}

	private _viewContainersWorkspaceStateValue: string | undefined;
	private get viewContainersWorkspaceStateValue(): string {
		if (!this._viewContainersWorkspaceStateValue) {
			this._viewContainersWorkspaceStateValue = this.getStoredViewContainersWorkspaceStateValue();
		}

		return this._viewContainersWorkspaceStateValue;
	}

	private set viewContainersWorkspaceStateValue(viewContainersWorkspaceStateValue: string) {
		if (this.viewContainersWorkspaceStateValue !== viewContainersWorkspaceStateValue) {
			this._viewContainersWorkspaceStateValue = viewContainersWorkspaceStateValue;
			this.setStoredViewContainersWorkspaceStateValue(viewContainersWorkspaceStateValue);
		}
	}

	private getStoredViewContainersWorkspaceStateValue(): string {
		return this.storageService.get(this.options.viewContainersWorkspaceStateKey, StorageScope.WORKSPACE, '[]');
	}

	private setStoredViewContainersWorkspaceStateValue(value: string): void {
		this.storageService.store(this.options.viewContainersWorkspaceStateKey, value, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

class ViewContainerActivityAction extends CompositeBarAction {

	private static readonly preventDoubleClickDelay = 300;

	private lastRun = 0;

	constructor(
		compositeBarActionItem: ICompositeBarActionItem,
		private readonly part: Parts,
		private readonly paneCompositePart: IPaneCompositePart,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IActivityService private readonly activityService: IActivityService,
	) {
		super(compositeBarActionItem);
		this.updateActivity();
		this._register(this.activityService.onDidChangeActivity(viewContainerOrAction => {
			if (!isString(viewContainerOrAction) && viewContainerOrAction.id === this.compositeBarActionItem.id) {
				this.updateActivity();
			}
		}));
	}

	updateCompositeBarActionItem(compositeBarActionItem: ICompositeBarActionItem): void {
		this.compositeBarActionItem = compositeBarActionItem;
	}

	private updateActivity(): void {
		const activities = this.activityService.getViewContainerActivities(this.compositeBarActionItem.id);
		this.activity = activities[0];
	}

	override async run(event: { preserveFocus: boolean }): Promise<void> {
		if (isMouseEvent(event) && event.button === 2) {
			return; // do not run on right click
		}

		// prevent accident trigger on a doubleclick (to help nervous people)
		const now = Date.now();
		if (now > this.lastRun /* https://github.com/microsoft/vscode/issues/25830 */ && now - this.lastRun < ViewContainerActivityAction.preventDoubleClickDelay) {
			return;
		}
		this.lastRun = now;

		const focus = (event && 'preserveFocus' in event) ? !event.preserveFocus : true;

		if (this.part === Parts.ACTIVITYBAR_PART) {
			const sideBarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
			const activeViewlet = this.paneCompositePart.getActivePaneComposite();
			const focusBehavior = this.configurationService.getValue<string>('workbench.activityBar.iconClickBehavior');

			if (sideBarVisible && activeViewlet?.getId() === this.compositeBarActionItem.id) {
				switch (focusBehavior) {
					case 'focus':
						this.logAction('refocus');
						this.paneCompositePart.openPaneComposite(this.compositeBarActionItem.id, focus);
						break;
					case 'toggle':
					default:
						// Hide sidebar if selected viewlet already visible
						this.logAction('hide');
						this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
						break;
				}

				return;
			}

			this.logAction('show');
		}

		await this.paneCompositePart.openPaneComposite(this.compositeBarActionItem.id, focus);
		return this.activate();
	}

	private logAction(action: string) {
		type ActivityBarActionClassification = {
			owner: 'sbatten';
			comment: 'Event logged when an activity bar action is triggered.';
			viewletId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The view in the activity bar for which the action was performed.' };
			action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action that was performed. e.g. "hide", "show", or "refocus"' };
		};
		this.telemetryService.publicLog2<{ viewletId: String; action: String }, ActivityBarActionClassification>('activityBarAction', { viewletId: this.compositeBarActionItem.id, action });
	}
}

class PlaceHolderViewContainerActivityAction extends ViewContainerActivityAction { }

class PlaceHolderToggleCompositePinnedAction extends ToggleCompositePinnedAction {

	constructor(id: string, compositeBar: ICompositeBar) {
		super({ id, name: id, classNames: undefined }, compositeBar);
	}

	setActivity(activity: ICompositeBarActionItem): void {
		this.label = activity.name;
	}
}

class PlaceHolderToggleCompositeBadgeAction extends ToggleCompositeBadgeAction {

	constructor(id: string, compositeBar: ICompositeBar) {
		super({ id, name: id, classNames: undefined }, compositeBar);
	}

	setCompositeBarActionItem(actionItem: ICompositeBarActionItem): void {
		this.label = actionItem.name;
	}
}
