/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditor } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ILogService } from 'vs/platform/log/common/log';
import { Action2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IPositronHelpService } from 'vs/workbench/contrib/positronHelp/browser/positronHelpService';
import { ILanguageRuntimeService } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';

export class ShowHelpAtCursor extends Action2 {
	constructor() {
		super({
			id: 'positron.help.showHelpAtCursor',
			title: {
				value: localize('positron.help.showHelpAtCursor', 'Show Help at Cursor'),
				original: 'Show Help at Cursor'
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.F1
			},
			category: Categories.Help,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const helpService = accessor.get(IPositronHelpService);
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);
		const logService = accessor.get(ILogService);

		// Look up the active editor
		const editor = editorService.activeTextEditorControl as IEditor;
		if (!editor) {
			return;
		}

		// Get the position of the cursor to see where we should show help.
		const position = editor.getPosition();
		if (!position) {
			return;
		}

		// Get all the help topic providers for the current language.
		const model = editor.getModel() as ITextModel;
		const helpTopicProviders =
			languageFeaturesService.helpTopicProvider.all(model);
		if (helpTopicProviders.length > 0) {
			// Use the first provider to get the help topic and show it.
			const provider = helpTopicProviders[0];
			try {
				// Ask the provider for the help topic at the cursor.
				const topic = await provider.provideHelpTopic(
					model,
					position,
					CancellationToken.None);

				if (typeof topic === 'string' && topic.length > 0) {
					// Determine the language ID at the cursor position.
					//
					// Consider: Should the language ID be provided by the help
					// topic provider instead?
					const languageId = model.getLanguageIdAtPosition(
						position.lineNumber,
						position.column);

					// Get help for the topic.
					helpService.showHelpTopic(languageId, topic);
				} else {
					// It's normal to not find a help topic at the cursor, but
					// log a trace statement so we can tell we tried.
					logService.trace(`No help topic at ${position} in ${model.uri}`);
				}
			} catch (err) {
				// If the provider throws an exception, log it and continue
				logService.warn(`Failed to get help topic at ${position}: ${err}`);
			}
		}
	}
}

export class LookupHelpTopic extends Action2 {
	constructor() {
		super({
			id: 'positron.help.lookupHelpTopic',
			title: {
				value: localize('positron.help.lookupHelpTopic', 'Look Up Help Topic'),
				original: 'Look Up Help Topic'
			},
			category: Categories.Help,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const helpService = accessor.get(IPositronHelpService);
		const runtimeService = accessor.get(ILanguageRuntimeService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);

		// Very likely the user's interested in a help topic for the language
		// they're currently editing, so use that as the default.
		const editor = editorService.activeTextEditorControl as IEditor;
		const model = editor?.getModel() as ITextModel;
		let languageId = model.getLanguageId();

		// If no language ID, try to get the language ID from the active runtime.
		if (!languageId) {
			const runtime = runtimeService.activeRuntime;
			if (runtime) {
				languageId = runtime.metadata.languageId;
			} else {
				const message = localize('positron.help.noInterpreters', "There are no interpreters running. Start an interpreter to look up help topics.");
				notificationService.info(message);
				return;
			}
		}

		// Prompt the user for a help topic.
		const topic = await quickInputService.input({
			prompt: localize('positron.help.enterHelpTopic', "Enter a help topic"),
			value: '',
			ignoreFocusLost: true,
			validateInput: async (value: string) => {
				if (value.length === 0) {
					return localize('positron.help.noTopic', "No help topic provided.");
				}
				return undefined;
			}
		});

		// If the user entered a topic, show it.
		if (topic) {
			helpService.showHelpTopic(languageId, topic);
		}
	}
}
