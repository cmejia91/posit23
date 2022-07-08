/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RStudio, PBC.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { ILanguageRuntimeService } from 'vs/workbench/contrib/languageRuntime/common/languageRuntimeService';
import { ReplInstanceView } from 'vs/workbench/contrib/repl/browser/replInstanceView';
import { INotebookKernel } from 'vs/workbench/contrib/notebook/common/notebookKernelService';

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
		@ILanguageRuntimeService private readonly _languageRuntimeService: ILanguageRuntimeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
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

		this._languageRuntimeService.onDidStartRuntime((e: INotebookKernel) => {
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

		// If we don't, create an instance for the active runtime, if any.
		const kernels = this._languageRuntimeService.getActiveRuntimes();
		if (kernels.length > 0) {
			this.createInstance(kernels[0]);
		} else {
			const t = document.createElement('h1');
			t.innerText = 'No kernel is active.';
			container.appendChild(t);
		}
	}

	/**
	 * Create a new REPL instance view
	 *
	 * @param kernel The kernel to bind to the REPL instance.
	 */
	private createInstance(kernel: INotebookKernel) {
		this._instanceView = this._instantiationService.createInstance(
			ReplInstanceView,
			kernel,
			this._container!);
		this._register(this._instanceView);
		this._instanceView.render();
	}
}
