/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RStudio, PBC.
 *--------------------------------------------------------------------------------------------*/

export const REPL_VIEW_ID = 'repl';
import * as nls from 'vs/nls';

export const enum ReplCommandId {
	New = 'workbench.action.repl.new',
	Open = 'workbench.action.repl.open',
	Clear = 'workbench.action.repl.clear'
}

export const REPL_ACTION_CATEGORY = nls.localize('replCategory', "Console");
