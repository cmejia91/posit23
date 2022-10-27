/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit, PBC.
 *--------------------------------------------------------------------------------------------*/

export const REPL_VIEW_ID = 'repl';
import * as nls from 'vs/nls';

export const enum LanguageRuntimeCommandId {
	Select = 'workbench.action.languageRuntime.select',
}

export interface INotebookBridgeService {
	readonly _serviceBrand: undefined;
	// Stub for dependency injection; this service has no public methods.
}

export const LANGUAGE_RUNTIME_ACTION_CATEGORY = nls.localize('languageRuntimeCategory', "Language Runtime");
