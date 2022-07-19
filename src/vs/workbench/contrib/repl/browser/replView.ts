/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RStudio, PBC.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/repl';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { ReplInstanceView } from 'vs/workbench/contrib/repl/browser/replInstanceView';
import { IReplInstance, IReplService } from 'vs/workbench/contrib/repl/browser/repl';
import { editorErrorBackground, editorErrorForeground, textSeparatorForeground } from 'vs/platform/theme/common/colorRegistry';

/**
 * Holds the rendered REPL inside a ViewPane.
 */
export class ReplViewPane extends ViewPane {

	/** The containing HTML element that hosts the REPL view pane. */
	private _container?: HTMLElement;

	/** The REPL instance inside this view pane. Likely will be > 1 instance in the future. */
	private _instanceView?: ReplInstanceView;

	constructor(options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IReplService private readonly _replService: IReplService,
	) {
		super(options,
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			telemetryService);

		this._replService.onDidStartRepl((e: IReplInstance) => {
			// We already have a REPL instance, and don't currently support more than one
			if (this._instanceView) {
				return;
			}

			// We haven't been rendered yet
			if (!this._container) {
				return;
			}

			// Create the instance!
			this.createInstance(e);
		});
	}

	/**
	 * Renders the body of the REPL view pane
	 *
	 * @param container The HTML element hosting the REPL pane
	 */
	override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		// Save container
		this._container = container;

		// If we already have an instance, just render it.
		if (this._instanceView) {
			this._instanceView.render();
			return;
		}
	}

	/**
	 * Create a new REPL instance view
	 *
	 * @param instance The underlying REPL instance to show in the view
	 */
	private createInstance(instance: IReplInstance) {
		// Ensure we are attached to the DOM
		if (!this._container) {
			throw new Error('Cannot render REPL without parent container.');
		}

		// Clear the container's current contents
		this._container.innerHTML = '';

		// Replace with a fresh REPL instance
		this._instanceView = this._instantiationService.createInstance(
			ReplInstanceView,
			instance,
			this._container);
		this._register(this._instanceView);
		this._instanceView.render();
	}
}

registerThemingParticipant((theme, collector) => {
	const errorFg = theme.getColor(editorErrorForeground);
	if (errorFg) {
		collector.addRule(`.repl-error { color: ${errorFg} ; }`);
	}
	const errorBg = theme.getColor(editorErrorBackground);
	if (errorBg) {
		collector.addRule(`.repl-error { background-color: ${errorBg} ; }`);
	}
	const sep = theme.getColor(textSeparatorForeground);
	if (sep) {
		collector.addRule(`.repl-cell { border-top: 1px solid ${sep} ; }`);
	}
});
