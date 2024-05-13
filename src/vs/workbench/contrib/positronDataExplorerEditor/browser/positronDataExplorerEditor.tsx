/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./positronDataExplorerEditor';

// React.
import * as React from 'react';

// Other dependencies.
import * as DOM from 'vs/base/browser/dom';
import { Event, Emitter } from 'vs/base/common/event';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { PositronDataExplorer } from 'vs/workbench/browser/positronDataExplorer/positronDataExplorer';
import { IReactComponentContainer, ISize, PositronReactRenderer } from 'vs/base/browser/positronReactRenderer';
import { PositronDataExplorerUri } from 'vs/workbench/services/positronDataExplorer/common/positronDataExplorerUri';
import { IPositronDataExplorerService } from 'vs/workbench/services/positronDataExplorer/browser/interfaces/positronDataExplorerService';
import { PositronDataExplorerEditorInput } from 'vs/workbench/contrib/positronDataExplorerEditor/browser/positronDataExplorerEditorInput';

// Temporary instance counter.
let instance = 0;

/**
 * IPositronDataExplorerEditorOptions interface.
 */
export interface IPositronDataExplorerEditorOptions extends IEditorOptions {
}

/**
 * PositronDataExplorerEditor class.
 */
export class PositronDataExplorerEditor extends EditorPane implements IReactComponentContainer {
	//#region Private Properties

	/**
	 * The onSizeChanged event emitter.
	 */
	private _onSizeChangedEmitter = this._register(new Emitter<ISize>());

	/**
	 * The onVisibilityChanged event emitter.
	 */
	private _onVisibilityChangedEmitter = this._register(new Emitter<boolean>());

	/**
	 * The onSaveScrollPosition event emitter.
	 */
	private _onSaveScrollPositionEmitter = this._register(new Emitter<void>());

	/**
	 * The onRestoreScrollPosition event emitter.
	 */
	private _onRestoreScrollPositionEmitter = this._register(new Emitter<void>());

	/**
	 * The onFocused event emitter.
	 */
	private _onFocusedEmitter = this._register(new Emitter<void>());

	/**
	 * Gets or sets the container element.
	 */
	private _positronDataExplorerContainer!: HTMLElement;

	/**
	 * Gets or sets the PositronReactRenderer for the PositronDataExplorer component.
	 */
	private _positronReactRenderer?: PositronReactRenderer;

	/**
	 * Gets or sets the width. This value is set in layoutBody and is used to implement the
	 * IReactComponentContainer interface.
	 */
	private _width = 0;

	/**
	 * Gets or sets the height. This value is set in layoutBody and is used to implement the
	 * IReactComponentContainer interface.
	 */
	private _height = 0;

	/**
	 * Gets the instance. This is a temporary property.
	 */
	private _instance = `${++instance}`;

	private _identifier?: string;

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
	 * Gets the container visibility.
	 */
	get containerVisible() {
		return this.isVisible();
	}

	/**
	 * Directs the React component container to take focus.
	 */
	takeFocus() {
		this.focus();
	}

	/**
	 * Notifies the React component container when focus changes.
	 */
	focusChanged(focused: boolean) {
		// this._positronVariablesFocusedContextKey?.set(focused);
	}

	/**
	 * The onSizeChanged event.
	 */
	readonly onSizeChanged: Event<ISize> = this._onSizeChangedEmitter.event;

	/**
	 * The onVisibilityChanged event.
	 */
	readonly onVisibilityChanged: Event<boolean> = this._onVisibilityChangedEmitter.event;

	/**
	 * The onSaveScrollPosition event.
	 */
	readonly onSaveScrollPosition: Event<void> = this._onSaveScrollPositionEmitter.event;

	/**
	 * The onRestoreScrollPosition event.
	 */
	readonly onRestoreScrollPosition: Event<void> = this._onRestoreScrollPositionEmitter.event;

	/**
	 * The onFocused event.
	 */
	readonly onFocused: Event<void> = this._onFocusedEmitter.event;

	//#endregion IReactComponentContainer

	//#region Constructor & Dispose

	/**
	 * Constructor.
	 * @param _group The editor group.
	 * @param _clipboardService The clipboard service.
	 * @param _commandService The command service.
	 * @param _configurationService The configuration service.
	 * @param _contextKeyService The context key service.
	 * @param _contextMenuService The context menu service.
	 * @param _keybindingService The keybinding service.
	 * @param _positronDataExplorerService The Positron data explorer service.
	 * @param storageService The storage service.
	 * @param telemetryService The telemetry service.
	 * @param themeService The theme service.
	 */
	constructor(
		readonly _group: IEditorGroup,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ILayoutService private readonly _layoutService: ILayoutService,
		@IPositronDataExplorerService private readonly _positronDataExplorerService: IPositronDataExplorerService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
	) {
		// Call the base class's constructor.
		super(PositronDataExplorerEditorInput.EditorID, _group, telemetryService, themeService, storageService);

		// Logging.
		console.log(`PositronDataExplorerEditor ${this._instance} created`);
	}

	/**
	 * dispose override method.
	 */
	public override dispose(): void {
		// Logging.
		console.log(`PositronDataExplorerEditor ${this._instance} dispose`);

		// Dispose the PositronReactRenderer for the PositronDataExplorer.
		this.disposePositronReactRenderer();

		// Call the base class's dispose method.
		super.dispose();
	}

	//#endregion Constructor & Dispose

	//#region Protected Overrides

	/**
	 * Creates the editor.
	 * @param parent The parent HTML element.
	 */
	protected override createEditor(parent: HTMLElement): void {
		// Logging.
		console.log(`PositronDataExplorerEditor ${this._instance} createEditor`);

		// Create and append the Positron data explorer container.
		this._positronDataExplorerContainer = DOM.$('.positron-data-explorer-container');
		parent.appendChild(this._positronDataExplorerContainer);
	}

	/**
	 * Sets the editor input.
	 * @param input The Positron data explorer editor input.
	 * @param options The Positron data explorer editor options.
	 * @param context The editor open context.
	 * @param token The cancellation token.
	 */
	override async setInput(
		input: PositronDataExplorerEditorInput,
		options: IPositronDataExplorerEditorOptions,
		context: IEditorOpenContext,
		token: CancellationToken
	): Promise<void> {
		// Logging.
		console.log(`PositronDataExplorerEditor ${this._instance} setInput ${input.resource}`);

		// Parse the Positron data explorer URI and set the identifier.
		this._identifier = PositronDataExplorerUri.parse(input.resource);

		if (this._identifier && !this._positronReactRenderer) {
			// Get the Positron data explorer instance.
			const positronDataExplorerInstance = this._positronDataExplorerService.getInstance(this._identifier);

			// If the Positron data explorer instance was found, render the Positron data explorer.
			if (positronDataExplorerInstance) {
				console.log(`PositronDataExplorerEditor ${this._instance} creating PositronReactRenderer and rendering PositronDataExplorer`);

				// Create the PositronReactRenderer for the PositronDataExplorer component and render it.
				this._positronReactRenderer = new PositronReactRenderer(this._positronDataExplorerContainer);
				this._positronReactRenderer.render(
					<PositronDataExplorer
						clipboardService={this._clipboardService}
						commandService={this._commandService}
						configurationService={this._configurationService}
						contextKeyService={this._contextKeyService}
						contextMenuService={this._contextMenuService}
						keybindingService={this._keybindingService}
						layoutService={this._layoutService}
						instance={positronDataExplorerInstance}
						onClose={() => this._group.closeEditor(this.input)}
					/>
				);

				// Logging.
				console.log(`PositronDataExplorerEditor ${this._instance} create PositronReactRenderer`);

				// Hack -- this is usually set by setInput but we're setting it temporarily to be
				// able to edit the editor tab name
				this._input = input;

				// Success.
				return;
			}
		}

		// Call the base class's method.
		await super.setInput(input, options, context, token);
	}

	/**
	 * Clears the input.
	 */
	override clearInput(): void {
		// Logging.
		console.log(`PositronDataExplorerEditor ${this._instance} clearInput`);

		// Dispose the PositronReactRenderer for the PositronDataExplorer.
		this.disposePositronReactRenderer();

		// Clear the identifier.
		this._identifier = undefined;

		// Call the base class's method.
		super.clearInput();
	}

	/**
	 * Sets editor visibility.
	 * @param visible A value which indicates whether the editor should be visible.
	 */
	protected override setEditorVisible(visible: boolean): void {
		// Logging.
		console.log(`PositronDataExplorerEditor ${this._instance} setEditorVisible ${visible} group ${this._group?.id}`);

		// Call the base class's method.
		super.setEditorVisible(visible);
	}

	//#endregion Protected Overrides

	//#region Protected Overrides

	/**
	 * Lays out the editor.
	 * @param dimension The layout dimension.
	 */
	override layout(dimension: DOM.Dimension): void {
		// Logging.
		console.log(`PositronDataExplorerEditor ${this._instance} layout ${dimension.width},${dimension.height}`);

		// Size the container.
		DOM.size(this._positronDataExplorerContainer, dimension.width, dimension.height);

		this._width = dimension.width;
		this._height = dimension.height;

		this._onSizeChangedEmitter.fire({
			width: this._width,
			height: this._height
		});

		if (!this._identifier) {
			console.log('PositronDataExplorerEditor was asked to layout with no input set');
			return;
		}

	}

	//#endregion Protected Overrides

	//#region Private Methods

	/**
	 * Disposes of the PositronReactRenderer for the PositronDataExplorer.
	 */
	private disposePositronReactRenderer() {
		// If the PositronReactRenderer for the PositronDataExplorer is exists, dispose it. This
		// removes the PositronDataExplorer from the DOM.
		if (this._positronReactRenderer) {
			// Logging.
			console.log(`PositronDataExplorerEditor ${this._instance} dispose PositronReactRenderer`);

			// Dispose of the PositronReactRenderer for the PositronDataExplorer.
			this._positronReactRenderer.dispose();
			this._positronReactRenderer = undefined;
		}
	}

	//#endregion Private Methods
}
