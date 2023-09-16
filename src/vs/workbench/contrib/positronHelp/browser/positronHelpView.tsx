/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./positronHelpView';
import * as React from 'react';
import * as DOM from 'vs/base/browser/dom';
import { generateUuid } from 'vs/base/common/uuid';
import { Event, Emitter } from 'vs/base/common/event';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOverlayWebview } from 'vs/workbench/contrib/webview/browser/webview';
import { IHelpEntry } from 'vs/workbench/contrib/positronHelp/browser/helpEntry';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPane';
import { ActionBars } from 'vs/workbench/contrib/positronHelp/browser/components/actionBars';
import { IPositronHelpService } from 'vs/workbench/contrib/positronHelp/browser/positronHelpService';
import { IReactComponentContainer, ISize, PositronReactRenderer } from 'vs/base/browser/positronReactRenderer';

/**
 * PositronHelpCommand interface.
 */
interface PositronHelpCommand {
	identifier: string;
	command: string;
	findText?: string;
}

/**
 * PositronHelpView class.
 */
export class PositronHelpView extends ViewPane implements IReactComponentContainer {
	//#region Private Properties

	// The width. This value is set in layoutBody and is used to implement the
	// IReactComponentContainer interface.
	private _width = 0;

	// The height. This value is set in layoutBody and is used to implement the
	// IReactComponentContainer interface.
	private _height = 0;

	// The Positron help container - contains the entire Positron help UI.
	private positronHelpContainer: HTMLElement;

	// The help action bars container - contains the PositronHelpActionBars component.
	private helpActionBarsContainer: HTMLElement;

	// The PositronReactRenderer for the PositronHelpActionBars component.
	private positronReactRendererHelpActionBars?: PositronReactRenderer;

	// The container for the help webview.
	private helpViewContainer: HTMLElement;

	// The last Positron help command that was sent to the help iframe.
	private lastPositronHelpCommand?: PositronHelpCommand;

	/**
	 * The onSizeChanged emitter.
	 */
	private onSizeChangedEmitter = this._register(new Emitter<ISize>());

	/**
	 * The onVisibilityChanged event emitter.
	 */
	private onVisibilityChangedEmitter = this._register(new Emitter<boolean>());

	/**
	 * The onSaveScrollPosition emitter.
	 */
	private onSaveScrollPositionEmitter = this._register(new Emitter<void>());

	/**
	 * The onRestoreScrollPosition emitter.
	 */
	private onRestoreScrollPositionEmitter = this._register(new Emitter<void>());

	/**
	 * The onFocused emitter.
	 */
	private onFocusedEmitter = this._register(new Emitter<void>());

	/**
	 * The help overlay webview that's being displayed.
	 */
	private helpOverlayWebview?: IOverlayWebview;

	//#endregion Private Properties

	//#region IReactComponentContainer

	/**
	 * Gets the width.
	 */
	get width() {
		return this._width;
	}

	/**
	 * Gets the height.
	 */
	get height() {
		return this._height;
	}

	/**
	 * Gets the visible state.
	 */
	get visible() {
		return this.isBodyVisible();
	}

	/**
	 * Directs the React component container to take focus.
	 */
	takeFocus(): void {
		this.focus();
	}

	/**
	 * The onSizeChanged event.
	 */
	readonly onSizeChanged: Event<ISize> = this.onSizeChangedEmitter.event;

	/**
	 * The onVisibilityChanged event.
	 */
	readonly onVisibilityChanged: Event<boolean> = this.onVisibilityChangedEmitter.event;

	/**
	 * The onSaveScrollPosition event.
	 */
	readonly onSaveScrollPosition: Event<void> = this.onSaveScrollPositionEmitter.event;

	/**
	 * The onRestoreScrollPosition event.
	 */
	readonly onRestoreScrollPosition: Event<void> = this.onRestoreScrollPositionEmitter.event;

	/**
	 * The onFocused event.
	 */
	readonly onFocused: Event<void> = this.onFocusedEmitter.event;

	//#endregion IReactComponentContainer

	//#region Constructor & Dispose

	/**
	 * Constructor.
	 * @param options The IViewPaneOptions for the view pane.
	 * @param commandService The ICommandService.
	 * @param configurationService The IConfigurationService.
	 * @param contextKeyService The IContextKeyService.
	 * @param contextMenuService The IContextMenuService.
	 * @param instantiationService The IInstantiationService.
	 * @param keybindingService The IKeybindingService.
	 * @param openerService The IOpenerService.
	 * @param positronHelpService The IPositronHelpService.
	 * @param telemetryService The ITelemetryService.
	 * @param themeService The IThemeService.
	 * @param viewDescriptorService The IViewDescriptorService.
	 * @param webviewService The IWebviewService.
	 */
	constructor(
		options: IViewPaneOptions,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@IPositronHelpService private readonly positronHelpService: IPositronHelpService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService
	) {
		// Call the base class's constructor.
		super(
			options,
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			telemetryService
		);

		// Create containers.
		this.positronHelpContainer = DOM.$('.positron-help-container');
		this.helpActionBarsContainer = DOM.$('.help-action-bars-container');
		this.helpViewContainer = DOM.$('.positron-help-view-container');

		// Append the help action bars container and help view container to the help container.
		this.positronHelpContainer.appendChild(this.helpActionBarsContainer);
		this.positronHelpContainer.appendChild(this.helpViewContainer);

		// Register the onDidChangeCurrentHelpEntry event handler.
		this._register(this.positronHelpService.onDidChangeCurrentHelpEntry(currentHelpEntry => {
			// Update the current help entry.
			this.updateCurrentHelpEntry(currentHelpEntry);
		}));

		// Register the onDidChangeBodyVisibility event handler.
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (this.helpOverlayWebview) {
				if (!visible) {
					this.helpOverlayWebview.release(this);
				} else {
					this.helpOverlayWebview.claim(this, undefined);
					this.helpOverlayWebview.layoutWebviewOverElement(this.helpViewContainer);
				}
			}

			// Fire the onVisibilityChanged event.
			this.onVisibilityChangedEmitter.fire(visible);
		}));
	}

	/**
	 * dispose override method.
	 */
	public override dispose(): void {
		// Release the help overlay webview.
		if (this.helpOverlayWebview) {
			this.helpOverlayWebview.release(this);
			this.helpOverlayWebview = undefined;
		}

		// Call the base class's dispose method.
		super.dispose();
	}

	//#endregion Constructor & Dispose

	//#region ViewPane Overrides

	/**
	 * renderBody override method.
	 * @param container The container HTMLElement.
	 */
	protected override renderBody(container: HTMLElement): void {
		// Call the base class's method.
		super.renderBody(container);

		// Append the Positron help container.
		container.appendChild(this.positronHelpContainer);

		// Home handler.
		const homeHandler = () => {
		};

		// Find handler.
		const findHandler = (findText: string) => {
		};

		// Find handler.
		const checkFindResultsHandler = () => {
			if (this.lastPositronHelpCommand) {
				console.log('TODO');
			}
			// if (this._helpView?.contentWindow && this._lastPositronHelpCommand) {
			// 	const result = this._helpView.contentWindow.sessionStorage.getItem(this._lastPositronHelpCommand.identifier);
			// 	if (result) {
			// 		return result === 'true';
			// 	}
			// }

			// Result is not available.
			return undefined;
		};

		// Find previous handler.
		const findPrevious = () => {
			this.postHelpIFrameMessage({ identifier: generateUuid(), command: 'find-previous' });
		};

		// Find next handler.
		const findNext = () => {
			this.postHelpIFrameMessage({ identifier: generateUuid(), command: 'find-next' });
		};

		// Create and register the PositronReactRenderer for the action bars.
		this.positronReactRendererHelpActionBars = new PositronReactRenderer(this.helpActionBarsContainer);
		this._register(this.positronReactRendererHelpActionBars);

		// Render the ActionBars component.
		this.positronReactRendererHelpActionBars.render(
			<ActionBars
				commandService={this.commandService}
				configurationService={this.configurationService}
				contextKeyService={this.contextKeyService}
				contextMenuService={this.contextMenuService}
				keybindingService={this.keybindingService}
				positronHelpService={this.positronHelpService}
				reactComponentContainer={this}
				onHome={homeHandler}
				onFind={findHandler}
				onCheckFindResults={checkFindResultsHandler}
				onFindPrevious={findPrevious}
				onFindNext={findNext}
				onCancelFind={() => findHandler('')}
			/>
		);

		// Update the current help entry.
		this.updateCurrentHelpEntry(this.positronHelpService.currentHelpEntry);
	}

	/**
	 * focus override method.
	 */
	override focus(): void {
		// Call the base class's method.
		super.focus();

		// Fire the onFocused event.
		this.onFocusedEmitter.fire();
	}

	/**
	 * layoutBody override method.
	 * @param height The height of the body.
	 * @param width The width of the body.
	 */
	protected override layoutBody(height: number, width: number): void {
		// Call the base class's method.
		super.layoutBody(height, width);

		// Raise the onSizeChanged event.
		this.onSizeChangedEmitter.fire({
			width,
			height
		});

		// Layout the helpOverlayWebview.
		this.helpOverlayWebview?.layoutWebviewOverElement(this.helpViewContainer);
	}

	//#endregion ViewPane Overrides

	//#region Private Methods

	/**
	 * Updates the current help entry.
	 * @param currentHelpEntry The current help entry.
	 */
	private updateCurrentHelpEntry(currentHelpEntry?: IHelpEntry) {
		// Release the overlay help view, if there is one.
		if (this.helpOverlayWebview) {
			this.helpOverlayWebview.release(this);
			this.helpOverlayWebview = undefined;
		}

		// If there is a current help entry, get its help overlay webview, claim it, and lay it out.
		if (currentHelpEntry) {
			this.helpOverlayWebview = currentHelpEntry.helpOverlayWebview;
			this.helpOverlayWebview.claim(this, undefined);
			this.helpOverlayWebview.layoutWebviewOverElement(this.helpViewContainer);
		}
	}

	/**
	 * Posts a message to the help iframe.
	 * @param positronHelpCommand The PositronHelpCommand to post.
	 */
	private postHelpIFrameMessage(positronHelpCommand: PositronHelpCommand): void {
		// Post the message to the help iframe.
		//this._helpView?.postMessage(positronHelpCommand);

		// Save the command?
		if (positronHelpCommand.command === 'find' && positronHelpCommand.findText) {
			this.lastPositronHelpCommand = positronHelpCommand;
		} else {
			this.lastPositronHelpCommand = undefined;
		}
	}

	//#endregion Private Methods
}
