/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit, PBC.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./positronHelpView';
import * as React from 'react';
import * as DOM from 'vs/base/browser/dom';
import { Event, Emitter } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPane';
import { IPositronHelpService } from 'vs/workbench/services/positronHelp/common/positronHelp';
import { PositronHelpActions } from 'vs/workbench/contrib/positronHelp/browser/positronHelpActions';
import { IReactComponentContainer, ISize, PositronReactRenderer } from 'vs/base/browser/positronReactRenderer';

/**
 * PositronHelpCommand interface.
 */
interface PositronHelpCommand {
	command: string;
	findText?: string;
}

/**
 * PositronHelpViewPane class.
 */
export class PositronHelpViewPane extends ViewPane implements IReactComponentContainer {

	// The PositronReactRenderer.
	private _positronReactRenderer: PositronReactRenderer | undefined;

	// The onSizeChanged event.
	private _onSizeChanged = this._register(new Emitter<ISize>());
	readonly onSizeChanged: Event<ISize> = this._onSizeChanged.event;

	// The onVisibilityChanged event.
	private _onVisibilityChanged = this._register(new Emitter<boolean>());
	readonly onVisibilityChanged: Event<boolean> = this._onVisibilityChanged.event;

	// The help container - contains the entire help UI.
	private _helpContainer!: HTMLElement;

	// The help actions container - contains the PositronHelpActions component.
	private _helpActionsContainer!: HTMLElement;

	// The help iframe.
	private _helpIFrame?: HTMLIFrameElement;

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
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
	) {
		// Call the base class's constructor.
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

		// Register event handlers.
		this._register(this.onDidChangeBodyVisibility(() => this._onVisibilityChanged.fire(this.isBodyVisible())));
		this._register(this.positronHelpService.onRenderHelp(helpResult => {
			// Remove the previous help iframe.
			if (this._helpIFrame) {
				this._helpIFrame.remove();
			}

			// Append the new help iframe and render the help result.
			this._helpIFrame = DOM.$('iframe.positron-help-iframe');
			this._helpContainer.appendChild(this._helpIFrame);
			this._helpIFrame.contentWindow?.document.open();
			this._helpIFrame.contentWindow?.document.write(helpResult as unknown as string);
			this._helpIFrame.contentWindow?.document.close();
		}));
	}

	/**
	 * dispose override method.
	 */
	public override dispose(): void {
		// Destroy the PositronReactRenderer.
		if (this._positronReactRenderer) {
			this._positronReactRenderer.destroy();
			this._positronReactRenderer = undefined;
		}

		// Call the base class's dispose method.
		super.dispose();
	}

	/**
	 * focus override method.
	 */
	override focus(): void {
		// Call the base class's method.
		super.focus();
	}

	/**
	 * renderBody override method.
	 * @param container The container HTMLElement.
	 */
	protected override renderBody(container: HTMLElement): void {
		// Call the base class's method.
		super.renderBody(container);

		// Append the help container.
		this._helpContainer = DOM.$('.positron-help-container');
		container.appendChild(this._helpContainer);

		// Append the help action bars container.
		this._helpActionsContainer = DOM.$('.positron-help-actions-container');
		this._helpContainer.appendChild(this._helpActionsContainer);

		const homeHandler = () => {
			this.positronHelpService.openHelpMarkdown(new MarkdownString(
				`This is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\nThis is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\n***The Real End***\n\n`
			));
		};

		// Find handler.
		const findHandler = (findText: string) => {
			this.postHelpIFrameMessage({ command: 'find', findText });
		};

		// Find previous handler.
		const findPrevious = () => {
			this.postHelpIFrameMessage({ command: 'find-previous' });
		};

		// Find next handler.
		const findNext = () => {
			this.postHelpIFrameMessage({ command: 'find-next' });
		};

		// Render the Positron help action bars component.
		this._positronReactRenderer = new PositronReactRenderer(this._helpActionsContainer);
		this._positronReactRenderer.render(
			<PositronHelpActions
				commandService={this.commandService}
				configurationService={this.configurationService}
				contextKeyService={this.contextKeyService}
				contextMenuService={this.contextMenuService}
				keybindingService={this.keybindingService}
				reactComponentContainer={this}
				onPreviousTopic={() => console.log('Previous topic made it to the Positron help view.')}
				onNextTopic={() => console.log('Next topic made it to the Positron help view.')}
				onHome={homeHandler}
				onFind={findHandler}
				onFindPrevious={findPrevious}
				onFindNext={findNext}
				onCancelFind={() => findHandler('')}
			/>
		);
	}

	/**
	 * layoutBody override method.
	 * @param height The height of the body.
	 * @param width The width of the body.
	 */
	override layoutBody(height: number, width: number): void {
		// Call the base class's method.
		super.layoutBody(height, width);

		// Raise the onSizeChanged event.
		this._onSizeChanged.fire({
			width,
			height
		});
	}

	/**
	 * Posts a message to the help iframe.
	 * @param positronHelpCommand The PositronHelpCommand to post.
	 */
	private postHelpIFrameMessage(positronHelpCommand: PositronHelpCommand): void {
		if (this._helpIFrame?.contentWindow) {
			this._helpIFrame.contentWindow.postMessage(positronHelpCommand);
		}
	}
}
