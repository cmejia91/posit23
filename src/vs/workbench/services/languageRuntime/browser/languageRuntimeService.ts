/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit, PBC.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { NotebookLanguageRuntime } from 'vs/workbench/contrib/languageRuntime/common/languageRuntimeNotebook';
import { ILanguageRuntime, ILanguageRuntimeService, RuntimeState } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { INotebookKernel, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { ILogService } from 'vs/platform/log/common/log';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

/**
 * The implementation of ILanguageRuntimeService
 */
export class LanguageRuntimeService extends Disposable implements ILanguageRuntimeService {
	/** Needed for service branding in dependency injector */
	declare readonly _serviceBrand: undefined;

	private readonly _runtimes: Map<String, ILanguageRuntime> = new Map();

	private readonly _onDidStartRuntime = this._register(new Emitter<ILanguageRuntime>);
	readonly onDidStartRuntime = this._onDidStartRuntime.event;

	constructor(
		@INotebookKernelService private _notebookKernelService: INotebookKernelService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@ICommandService private readonly _commandService: ICommandService,
		@ILanguageService private readonly _languageService: ILanguageService
	) {
		super();

		// Pull kernels from the notebook kernel service as they are added.
		//
		// Note that most kernels are only added when the extension supplying
		// them is activated, so this event will fire on extension activation
		// events such as opening a file of the associated language type.
		this._register(this._notebookKernelService.onDidAddKernel((kernel: INotebookKernel) => {
			// Skip non-interactive kernels
			if (kernel.id.indexOf('Interactive') === -1) {
				return;
			}

			// Check to see whether the kernel thinks it supports every language.
			if (kernel.supportedLanguages.length === this._languageService.getRegisteredLanguageIds().length) {
				// If the kernel says that it supports every single registered
				// language, then it is lying. It just hasn't had its set of
				// registered languages populated yet (this happens
				// asynchronously).
				//
				// Wait for population to finish and then register the kernel
				// when its set of supported languages changes.
				const handler = kernel.onDidChange(e => {
					// The population is complete when the kernel's set of
					// supported languages is no longer the same as the set
					// of registered languages.
					if (e.supportedLanguages &&
						kernel.supportedLanguages.length < this._languageService.getRegisteredLanguageIds().length) {
						this._logService.debug(`Kernel ${kernel.id} changed: ${JSON.stringify(e)}`);

						// Stop listening for changes so we don't trigger a loop
						// (registering the kernel will trigger another change event
						// when we add the backing notebook)
						handler.dispose();

						// Register the notebook as a language backend
						this.registerNotebookRuntime(kernel.supportedLanguages[0], kernel);
					}
				});
			} else {
				// The kernel is already registered; add it directly
				this.registerNotebookRuntime(kernel.supportedLanguages[0], kernel);
			}
		}));
	}

	registerRuntime(runtime: ILanguageRuntime): IDisposable {
		this._runtimes.set(runtime.metadata.id, runtime);
		this._logService.trace(`Added new language runtime: ${runtime.metadata.language} (${runtime.metadata.id})`);
		return toDisposable(() => {
			this._runtimes.delete(runtime.metadata.id);
		});
	}

	/**
	 * Returns the list of all registered runtimes
	 */
	getAllRuntimes(): Array<ILanguageRuntime> {
		return Array.from(this._runtimes.values());
	}

	registerNotebookRuntime(language: string, kernel: INotebookKernel): void {
		// Create a language runtime from the notebook kernel; this triggers the
		// creation of a NotebookLanguageRuntime object that wraps the kernel in
		// the ILanguageRuntime interface.
		try {
			this.registerRuntime(this._instantiationService.createInstance(
				NotebookLanguageRuntime,
				kernel));
		} catch (err) {
			this._logService.warn(`Can't register notebook kernel ${kernel.id} as a language runtime: ${err}`);
		}
	}

	getActiveRuntime(language: string | null): ILanguageRuntime | undefined {
		// Get all runtimes that match the language; return the first one.
		const runtimes = this.getActiveLanguageRuntimes(language);
		if (runtimes.length > 0) {
			return runtimes[0];
		}

		// If there are no runtimes, return undefined
		return;
	}

	startRuntime(id: string): void {
		const runtimes = this._runtimes.values();
		for (const runtime of runtimes) {
			if (runtime.metadata.id === id) {
				// Check to see whether there's already a runtime active for
				// this language
				const activeRuntimes = this.getActiveLanguageRuntimes(runtime.metadata.language);

				// Start the requested runtime if no other runtime is active
				if (activeRuntimes.length === 0) {
					this.startLanguageRuntime(runtime);
				} else {
					throw new Error(`Can't start runtime ${id} because another runtime is already active for language ${runtime.metadata.language}`);
				}
				return;
			}
		}
		throw new Error(`No runtime with id '${id}' was found.`);
	}

	private startLanguageRuntime(runtime: ILanguageRuntime): void {
		this._logService.trace(`Language runtime starting: '${runtime.metadata.language}' (${runtime.metadata.id})`);
		runtime.start().then(info => {
			// Execute the Focus into Console command using the command service
			// to expose the REPL for the new runtime.
			this._commandService.executeCommand('workbench.panel.console.focus');
		});
		this._onDidStartRuntime.fire(runtime);
	}

	getActiveLanguageRuntimes(language: string | null): Array<ILanguageRuntime> {
		return Array.from(this._runtimes.values()).filter(runtime => {
			return runtime.getRuntimeState() !== RuntimeState.Uninitialized &&
				runtime.getRuntimeState() !== RuntimeState.Exited &&
				(language === null || runtime.metadata.language === language);
		});
	}

	/**
	 * Get the active language runtimes
	 *
	 * @returns All active runtimes
	 */
	getActiveRuntimes(): Array<ILanguageRuntime> {
		return this.getActiveLanguageRuntimes(null);
	}
}

// Register language runtime singleton
registerSingleton(ILanguageRuntimeService, LanguageRuntimeService, InstantiationType.Delayed);
