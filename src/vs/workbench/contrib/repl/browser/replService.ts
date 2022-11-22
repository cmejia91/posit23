/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit, PBC.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { ILanguageRuntime, ILanguageRuntimeService, RuntimeState } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { ICreateReplOptions, IReplInstance, IReplService } from 'vs/workbench/contrib/repl/browser/repl';
import { ReplInstance } from 'vs/workbench/contrib/repl/browser/replInstance';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import * as nls from 'vs/nls';
import Severity from 'vs/base/common/severity';

/**
 * The implementation of IReplService
 */
export class ReplService extends Disposable implements IReplService {
	declare readonly _serviceBrand: undefined;

	/** Event emitted when new REPL instances are started */
	private readonly _onDidStartRepl = this._register(new Emitter<IReplInstance>);
	readonly onDidStartRepl = this._onDidStartRepl.event;

	/** The set of active REPL instances */
	private readonly _instances: Array<IReplInstance> = [];

	/** Counter for assigning unique IDs to REPL instances */
	private _maxInstanceId: number = 1;

	/**
	 * Construct a new REPL service from injected services
	 */
	constructor(
		@ILanguageRuntimeService private _languageRuntimeService: ILanguageRuntimeService,
		@ILogService private _logService: ILogService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IDialogService private readonly _dialogService: IDialogService
	) {
		super();

		const runtime = this._languageRuntimeService.getActiveRuntime(null);
		if (runtime) {
			// There is already a language runtime active; start a REPL for it
			this.startRepl(runtime);
		} else {
			// No language runtime active yet. When a language runtime starts,
			// open a REPL for it if we don't already have an active REPL.
			this._languageRuntimeService.onDidStartRuntime((e) => {
				if (this._instances.length === 0) {
					this.startRepl(e);
				} else {
					this._logService.info(`Not starting REPL for ${e.metadata.name} because another REPL is already active.`);
				}
			});
		}
	}

	/**
	 * Return the current set of REPL instances
	 */
	get instances(): IReplInstance[] {
		return this._instances;
	}

	/**
	 * Creates a new REPL instance and returns it.
	 *
	 * @param options The REPL's settings
	 * @returns A promise that resolves to the newly created REPL instance.
	 */
	async createRepl(options?: ICreateReplOptions | undefined): Promise<IReplInstance> {
		const kernel = this._languageRuntimeService.getActiveRuntime(null);
		if (typeof kernel === 'undefined') {
			throw new Error('Cannot create REPL; no language runtime is active.');
		}
		return this.startRepl(kernel);
	}

	/**
	 * Clears the currently active REPL instance.
	 */
	clearActiveRepl(): void {
		if (this._instances.length === 0) {
			this._logService.warn('Clear REPL command issued when no REPL is active; ignoring.');
			return;
		}

		// TODO: We don't currently support multiple REPLs, so just clear the first one for now.
		this._instances[0].clear();
	}

	/**
	 * Executes code in the REPL active for the language
	 *
	 * @param languageId The language of the code
	 * @param code The code to execute
	 */
	executeCode(languageId: string, code: string): void {

		// Attempt to find a running REPL for the code
		let hasRepl = false;
		for (const instance of this._instances) {
			if (instance.languageId === languageId) {
				hasRepl = true;
				instance.executeCode(code);
				break;
			}
		}

		if (!hasRepl) {
			this._logService.warn(`Attempt to execute code fragment ${code} in language ${languageId}, but no REPL is active for that language.`);
		}
	}

	/**
	 * Starts a new REPL.
	 *
	 * @param kernel The kernel to bind to the new REPL
	 * @returns The new REPL instance
	 */
	private startRepl(kernel: ILanguageRuntime): IReplInstance {
		// Look up supported language ID for this kernel
		const languageId =
			this._languageService.getLanguageIdByLanguageName(kernel.metadata.language);
		if (!languageId) {
			throw new Error(`Could not find ID for kernel language ${kernel.metadata.language}`);
		}
		this._logService.trace(`Starting REPL for language ${languageId} (${kernel.metadata.name})`);

		// Auto-generate an instance ID for this REPL
		const id = this._maxInstanceId++;

		// Register new REPL instance
		const instance = this._register(new ReplInstance(id, languageId, kernel));

		// Store the instance and fire event to listeners
		this._instances.push(instance);
		this._onDidStartRepl.fire(instance);

		// When the REPL exits, see if the user wants to restart it.
		this._register(kernel.onDidChangeRuntimeState((state) => {
			if (state === RuntimeState.Exited) {
				this.promptToRestartRuntime(kernel);
			}
		}));

		return instance;
	}

	private promptToRestartRuntime(runtime: ILanguageRuntime): void {
		// Ask the dialog service to prompt the user for a restart
		this._dialogService.show(Severity.Info,
			nls.localize('restartRuntime', '{0} exited. Would you like to restart it?',
				runtime.metadata.name),
			[
				nls.localize('restart', 'Restart'),
				nls.localize('cancel', 'Cancel')
			]).then(result => {
				if (result.choice === 0) {
					this._languageRuntimeService.startRuntime(runtime.metadata.id);
				}
			});
	}
}
