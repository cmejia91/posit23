/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { generateUuid } from 'vs/base/common/uuid';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IKeybindingRule, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { LANGUAGE_RUNTIME_ACTION_CATEGORY } from 'vs/workbench/contrib/languageRuntime/common/languageRuntime';
import { IPositronConsoleService } from 'vs/workbench/services/positronConsole/browser/interfaces/positronConsoleService';
import { ILanguageRuntimeMetadata, ILanguageRuntimeService, LanguageRuntimeSessionMode, RuntimeCodeExecutionMode, RuntimeErrorBehavior } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { ILanguageRuntimeSession, IRuntimeClientInstance, IRuntimeSessionService, RuntimeClientType } from 'vs/workbench/services/runtimeSession/common/runtimeSessionService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ILanguageService } from 'vs/editor/common/languages/language';

// The category for language runtime actions.
const category: ILocalizedString = { value: LANGUAGE_RUNTIME_ACTION_CATEGORY, original: 'Interpreter' };

// Quick pick item interfaces.
interface LanguageRuntimeSessionQuickPickItem extends IQuickPickItem { session: ILanguageRuntimeSession }
interface LanguageRuntimeQuickPickItem extends IQuickPickItem { runtime: ILanguageRuntimeMetadata }
interface RuntimeClientTypeQuickPickItem extends IQuickPickItem { runtimeClientType: RuntimeClientType }
interface RuntimeClientInstanceQuickPickItem extends IQuickPickItem { runtimeClientInstance: IRuntimeClientInstance<any, any> }

/**
 * Helper function that asks the user to select a language runtime session from
 * an array of language runtime sessions.
 *
 * @param quickInputService The quick input service.
 * @param sessions The language runtime sessions the user can select from.
 * @param placeHolder The placeholder for the quick input.
 * @returns The runtime session the user selected, or undefined, if the user canceled the operation.
 */
export const selectLanguageRuntimeSession = async (
	quickInputService: IQuickInputService,
	sessions: ILanguageRuntimeSession[],
	placeHolder: string): Promise<ILanguageRuntimeSession | undefined> => {

	// Build the language runtime quick pick items.
	const sessionQuickPickItems = sessions.map<LanguageRuntimeSessionQuickPickItem>(session => ({
		id: session.sessionId,
		label: session.metadata.sessionName,
		description: session.runtimeMetadata.languageVersion,
		session
	} satisfies LanguageRuntimeSessionQuickPickItem));

	// Prompt the user to select a language runtime.
	const languageRuntimeQuickPickItem = await quickInputService
		.pick<LanguageRuntimeSessionQuickPickItem>(sessionQuickPickItems, {
			canPickMany: false,
			placeHolder
		});

	// Done.
	return languageRuntimeQuickPickItem?.session;
};

/**
 * Helper function that asks the user to select a registered language runtime from
 * an array of language runtime metadata entries.
 *
 * @param quickInputService The quick input service.
 * @param runtimes The language runtime entries the user can select from.
 * @param placeHolder The placeholder for the quick input.
 *
 * @returns The language runtime the user selected, or undefined, if the user canceled the operation.
 */
export const selectLanguageRuntime = async (
	quickInputService: IQuickInputService,
	runtimes: ILanguageRuntimeMetadata[],
	placeHolder: string): Promise<ILanguageRuntimeMetadata | undefined> => {

	// Build the language runtime quick pick items.
	const languageRuntimeQuickPickItems = runtimes.map<LanguageRuntimeQuickPickItem>(runtime => ({
		id: runtime.runtimeId,
		label: runtime.runtimeName,
		description: runtime.languageVersion,
		runtime
	} satisfies LanguageRuntimeQuickPickItem));

	// Prompt the user to select a language runtime.
	const languageRuntimeQuickPickItem = await quickInputService
		.pick<LanguageRuntimeQuickPickItem>(languageRuntimeQuickPickItems, {
			canPickMany: false,
			placeHolder
		});

	// Done.
	return languageRuntimeQuickPickItem?.runtime;
};

/**
 * Helper function that asks the user to select a running language runtime, if no runtime is
 * currently marked as the active runtime.
 *
 * @param runtimeSessionService The runtime session service.
 * @param quickInputService The quick input service.
 * @param placeHolder The placeholder for the quick input.
 * @returns The language runtime the user selected, or undefined, if there are no running language runtimes or the user canceled the operation.
 */
const selectRunningLanguageRuntime = async (
	runtimeSessionService: IRuntimeSessionService,
	quickInputService: IQuickInputService,
	placeHolder: string): Promise<ILanguageRuntimeSession | undefined> => {

	// If there's an active language runtime, use that.
	const activeSession = runtimeSessionService.foregroundSession;
	if (activeSession) {
		return activeSession;
	}

	// If there isn't an active language runtime, but there are running
	// runtimes, ask the user to select one.
	const activeSessions = runtimeSessionService.activeSessions;
	if (!activeSessions.length) {
		alert('No interpreters are currently running.');
		return undefined;
	}

	// As the user to select the running language runtime.
	return await selectLanguageRuntimeSession(quickInputService, activeSessions, placeHolder);
};

/**
 * Registers language runtime actions.
 */
export function registerLanguageRuntimeActions() {
	/**
	 * Helper function to register a language runtime action.
	 * @param id The ID of the language runtime action.
	 * @param title The title of the language runtime action.
	 * @param action The action function to run.
	 * @param keybinding The keybinding for the action (optional)
	 */
	const registerLanguageRuntimeAction = (
		id: string,
		title: string,
		action: (accessor: ServicesAccessor) => Promise<void>,
		keybinding: Omit<IKeybindingRule, 'id'>[] | undefined = undefined): void => {
		registerAction2(class extends Action2 {
			// Constructor.
			constructor() {
				super({
					id,
					title: { value: title, original: title },
					f1: true,
					category,
					keybinding
				});
			}

			/**
			 * Runs the action.
			 * @param accessor The service accessor.
			 */
			async run(accessor: ServicesAccessor) {
				await action(accessor);
			}
		});
	};

	// Registers the start language runtime action.
	registerLanguageRuntimeAction('workbench.action.languageRuntime.start', 'Start Interpreter', async accessor => {
		// Access services.
		const commandService = accessor.get(ICommandService);
		const extensionService = accessor.get(IExtensionService);
		const languageRuntimeService = accessor.get(ILanguageRuntimeService);
		const runtimeSessionService = accessor.get(IRuntimeSessionService);
		const quickInputService = accessor.get(IQuickInputService);

		// Ensure that the python extension is loaded.
		await extensionService.activateByEvent('onLanguage:python');

		// Get the registered language runtimes.
		const registeredRuntimes = languageRuntimeService.registeredRuntimes;
		if (!registeredRuntimes.length) {
			alert(nls.localize('positronNoInstalledRuntimes', "No interpreters are currently installed."));
			return;
		}

		// Ask the user to select the language runtime to start. If they selected one, start it.
		const languageRuntime = await selectLanguageRuntime(quickInputService, registeredRuntimes, 'Select the interpreter to start');
		if (languageRuntime) {
			// Start the language runtime.
			runtimeSessionService.startNewRuntimeSession(languageRuntime.runtimeId,
				languageRuntime.runtimeName,
				LanguageRuntimeSessionMode.Console,
				undefined, // No notebook URI (console session)
				`'Start Interpreter' command invoked`);

			// Drive focus into the Positron console.
			commandService.executeCommand('workbench.panel.positronConsole.focus');
		}
	});

	// Registers the set active language runtime action.
	registerLanguageRuntimeAction('workbench.action.languageRuntime.setActive', 'Set Active Interpreter', async accessor => {
		// Get the language runtime service.
		const runtimeSessionService = accessor.get(IRuntimeSessionService);

		// Have the user select the language runtime they wish to set as the active language runtime.
		const session = await selectRunningLanguageRuntime(
			runtimeSessionService,
			accessor.get(IQuickInputService),
			'Set the active language runtime');

		// If the user selected a language runtime, set it as the active language runtime.
		if (session) {
			runtimeSessionService.foregroundSession = session;
		}
	});

	// Registers the restart language runtime action.
	registerLanguageRuntimeAction('workbench.action.languageRuntime.restart', 'Restart Interpreter', async accessor => {
		// Access services.
		const consoleService = accessor.get(IPositronConsoleService);
		const runtimeSessionService = accessor.get(IRuntimeSessionService);

		// The runtime we'll try to restart.
		let session: ILanguageRuntimeSession | undefined = undefined;

		// Typically, the restart command should act on the language runtime
		// that's active in the Console, so try that first.
		const activeConsole = consoleService.activePositronConsoleInstance;
		if (activeConsole) {
			session = activeConsole.session;
		}

		// If there's no active console, try the active language runtime.
		if (!session) {
			session = runtimeSessionService.foregroundSession;
		}

		// If we still don't have an active language runtime, ask the user to
		// pick one.
		if (!session) {
			session = await selectRunningLanguageRuntime(
				runtimeSessionService,
				accessor.get(IQuickInputService),
				'Select the interpreter to restart');
			if (!session) {
				throw new Error('No interpreter selected');
			}
		}

		// Restart the language runtime.
		runtimeSessionService.restartSession(session.sessionId,
			`'Restart Interpreter' command invoked`);
	},
		[
			{
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Numpad0,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F10]
			},
			{
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit0
			},
		]
	);

	// Registers the interrupt language runtime action.
	registerLanguageRuntimeAction('workbench.action.languageRuntime.interrupt', 'Interrupt Interpreter', async accessor => {
		(await selectRunningLanguageRuntime(
			accessor.get(IRuntimeSessionService),
			accessor.get(IQuickInputService),
			'Select the interpreter to interrupt'))?.interrupt();
	});

	// Registers the shutdown language runtime action.
	registerLanguageRuntimeAction('workbench.action.languageRuntime.shutdown', 'Shutdown Interpreter', async accessor => {
		(await selectRunningLanguageRuntime(
			accessor.get(IRuntimeSessionService),
			accessor.get(IQuickInputService),
			'Select the interpreter to shutdown'))?.shutdown();
	});

	// Registers the force quit language runtime action.
	registerLanguageRuntimeAction('workbench.action.languageRuntime.forceQuit', 'Force Quit Interpreter', async accessor => {
		(await selectRunningLanguageRuntime(
			accessor.get(IRuntimeSessionService),
			accessor.get(IQuickInputService),
			'Select the interpreter to force-quit'))?.forceQuit();
	});

	// Registers the show output language runtime action.
	registerLanguageRuntimeAction('workbench.action.languageRuntime.showOutput', 'Show runtime output', async accessor => {
		(await selectRunningLanguageRuntime(
			accessor.get(IRuntimeSessionService),
			accessor.get(IQuickInputService),
			'Select the interpreter for which to show output'))?.showOutput();
	});

	registerLanguageRuntimeAction('workbench.action.language.runtime.openClient', 'Create Runtime Client Widget', async accessor => {
		// Access services.
		const runtimeSessionService = accessor.get(IRuntimeSessionService);
		const quickInputService = accessor.get(IQuickInputService);

		// Ask the user to select a running language runtime.
		const languageRuntime = await selectRunningLanguageRuntime(runtimeSessionService, quickInputService, 'Select the language runtime');
		if (!languageRuntime) {
			return;
		}

		// Prompt the user to select the runtime client type.
		const selection = await quickInputService.pick<RuntimeClientTypeQuickPickItem>([{
			id: generateUuid(),
			label: 'Environment Pane',
			runtimeClientType: RuntimeClientType.Variables,
		}], {
			canPickMany: false,
			placeHolder: `Select runtime client for ${languageRuntime.runtimeMetadata.runtimeName}`
		});

		// If the user selected a runtime client type, create the client for it.
		if (selection) {
			languageRuntime.createClient(selection.runtimeClientType, null);
		}
	});

	registerLanguageRuntimeAction('workbench.action.language.runtime.closeClient', 'Close Runtime Client Widget', async accessor => {
		// Access services.
		const runtimeSessionService = accessor.get(IRuntimeSessionService);
		const quickInputService = accessor.get(IQuickInputService);

		// Ask the user to select a running language runtime.
		const languageRuntime = await selectRunningLanguageRuntime(runtimeSessionService, quickInputService, 'Select the language runtime');
		if (!languageRuntime) {
			return;
		}

		// Get the runtime client instances for the language runtime.
		const runtimeClientInstances = await languageRuntime.listClients();
		if (!runtimeClientInstances.length) {
			alert('No clients are currently started.');
			return;
		}

		// Create runtime client instance quick pick items.
		const runtimeClientInstanceQuickPickItems = runtimeClientInstances.map<RuntimeClientInstanceQuickPickItem>(runtimeClientInstance => ({
			id: generateUuid(),
			label: runtimeClientInstance.getClientType(),
			runtimeClientInstance,
		} satisfies RuntimeClientInstanceQuickPickItem));

		// Prompt the user to select a runtime client instance.
		const selection = await quickInputService.pick<RuntimeClientInstanceQuickPickItem>(runtimeClientInstanceQuickPickItems, {
			canPickMany: false,
			placeHolder: nls.localize('Client Close Selection Placeholder', 'Close Client for {0}', languageRuntime.runtimeMetadata.runtimeName)
		});

		// If the user selected a runtime client instance, dispose it.
		if (selection) {
			selection.runtimeClientInstance.dispose();
		}
	});

	/**
	 * Arguments passed to the Execute Code actions.
	 */
	interface ExecuteCodeArgs {
		/**
		 * The language ID of the code to execute. This can be omitted, in which
		 * case the code will be assumed to be in whatever language is currently
		 * active in the console.
		 */
		langId: string | undefined;

		/**
		 * The code to execute.
		 */
		code: string;

		/**
		 * Whether to focus the console when executing the code. Defaults to false.
		 */
		focus: boolean | undefined;
	}

	/**
	 * Execute Code in Console: executes code as though the user had typed it
	 * into the console.
	 *
	 * Typically used to run code on the user's behalf; will queue the code to
	 * run after any currently running code, and will start a new console
	 * session if one is not already running.
	 */
	registerAction2(class ExecuteCodeInConsoleAction extends Action2 {

		constructor() {
			super({
				id: 'workbench.action.executeCode.console',
				title: nls.localize2('positron.command.executeCode.console', "Execute Code in Console"),
				f1: false,
				category
			});
		}

		/**
		 * Runs the Execute Code in Console action.
		 *
		 * @param accessor The service accessor.
		 */
		async run(accessor: ServicesAccessor, args: ExecuteCodeArgs | string) {
			const consoleService = accessor.get(IPositronConsoleService);
			const notificationService = accessor.get(INotificationService);

			// If a single string argument is passed, assume it's the code to execute.
			if (typeof args === 'string') {
				args = { langId: undefined, code: args, focus: false };
			}

			// If no language ID is provided, try to get the language ID from
			// the active session.
			if (!args.langId) {
				const foreground = accessor.get(IRuntimeSessionService).foregroundSession;
				if (foreground) {
					args.langId = foreground.runtimeMetadata.languageId;
				} else {
					// Notify the user that there's no console for the language.
					notificationService.warn(nls.localize('positron.execute.noConsole.active', "Cannot execute '{0}'; no console is active."));
					return;
				}
			}

			// Execute the code in the console.
			consoleService.executeCode(
				args.langId, args.code, !!args.focus, true /* execute the code even if incomplete */);
		}
	});

	/**
	 * Execute Code Silently: executes code, but doesn't show it to the user.
	 *
	 * This action executes code immediately after the currently running command
	 * (if any) has finished. It has priority over the queue of pending console
	 * inputs from the user but still needs to wait until the current command is
	 * finished, which might take a long time.
	 *
	 * Any output (messages, warnings, or errors) generated by this command is
	 * discarded silently instead of being shown in the console.
	 *
	 * Typically used to for code that is executed for its side effects, rather
	 * than for its output. Doesn't auto-start sessions.
	 */
	registerAction2(class ExecuteSilentlyAction extends Action2 {
		private static _counter = 0;

		constructor() {
			super({
				id: 'workbench.action.executeCode.silently',
				title: nls.localize2('positron.command.executeCode.silently', "Execute Code Silently"),
				f1: false,
				category
			});
		}

		/**
		 * Runs the Execute Code Silently action.
		 *
		 * @param accessor The service accessor.
		 * @param languageId The language ID.
		 * @param code The code to execute.
		 */
		async run(accessor: ServicesAccessor, args: ExecuteCodeArgs | string) {
			const runtimeSessionService = accessor.get(IRuntimeSessionService);
			if (typeof args === 'string') {
				args = { langId: undefined, code: args, focus: false };
			}

			// Get the active session for the language.
			const session = args.langId ?
				runtimeSessionService.getConsoleSessionForLanguage(args.langId) :
				runtimeSessionService.foregroundSession;
			args.langId = args.langId || session?.runtimeMetadata.languageId;

			if (session) {
				// We already have a console session for the language, so
				// execute the code in it (silently)
				session.execute(args.code, `silent-command-${ExecuteSilentlyAction._counter++}`,
					RuntimeCodeExecutionMode.Silent,
					RuntimeErrorBehavior.Continue);
			} else {
				// No console session available. Since the intent is usually to
				// execute the task in the background, notify the user that
				// there's no console for the language rather than trying nto
				// start a new one (which can be very noisy)
				const notificationService = accessor.get(INotificationService);
				const languageService = accessor.get(ILanguageService);

				// Derive the user-friendly name for the language.
				const languageName = languageService.getLanguageName(args.langId!);

				// Notify the user that there's no console for the language.
				notificationService.warn(nls.localize('positron.executeSilent.noConsole.active', "Cannot execute '{0}'; no {1} console is active.", args.code, languageName));
			}
		}
	});
}
