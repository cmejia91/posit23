/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

//
// AUTO-GENERATED from ui.json; do not edit.
//

import { Event } from 'vs/base/common/event';
import { PositronBaseComm } from 'vs/workbench/services/languageRuntime/common/positronBaseComm';
import { IRuntimeClientInstance } from 'vs/workbench/services/languageRuntime/common/languageRuntimeClientInstance';

/**
 * Items in Params
 */
export interface Param {
	[k: string]: unknown;
}

/**
 * The method result
 */
export interface CallMethodResult {
	[k: string]: unknown;
}

/**
 * Editor metadata
 */
export interface EditorContext {
	/**
	 * Document metadata
	 */
	document: TextDocument;

	/**
	 * Document contents
	 */
	contents: Array<string>;

	/**
	 * The primary selection, i.e. selections[0]
	 */
	selection: Selection;

	/**
	 * The selections in this text editor.
	 */
	selections: Array<Selection>;

}

/**
 * Document metadata
 */
export interface TextDocument {
	/**
	 * URI of the resource viewed in the editor
	 */
	path: string;

	/**
	 * End of line sequence
	 */
	eol: string;

	/**
	 * Whether the document has been closed
	 */
	is_closed: boolean;

	/**
	 * Whether the document has been modified
	 */
	is_dirty: boolean;

	/**
	 * Whether the document is untitled
	 */
	is_untitled: boolean;

	/**
	 * Language identifier
	 */
	language_id: string;

	/**
	 * Number of lines in the document
	 */
	line_count: number;

	/**
	 * Version number of the document
	 */
	version: number;

}

/**
 * A line and character position, such as the position of the cursor.
 */
export interface Position {
	/**
	 * The zero-based character value, as a Unicode code point offset.
	 */
	character: number;

	/**
	 * The zero-based line value.
	 */
	line: number;

}

/**
 * Selection metadata
 */
export interface Selection {
	/**
	 * Position of the cursor.
	 */
	active: Position;

	/**
	 * Start position of the selection
	 */
	start: Position;

	/**
	 * End position of the selection
	 */
	end: Position;

	/**
	 * Text of the selection
	 */
	text: string;

}

/**
 * Selection range
 */
export interface Range {
	/**
	 * Start position of the selection
	 */
	start: Position;

	/**
	 * End position of the selection
	 */
	end: Position;

}

/**
 * Event: Change in backend's busy/idle status
 */
export interface BusyEvent {
	/**
	 * Whether the backend is busy
	 */
	busy: boolean;

}

/**
 * Event: Clear the console
 */
export interface ClearConsoleEvent {
}

/**
 * Event: Open an editor
 */
export interface OpenEditorEvent {
	/**
	 * The path of the file to open
	 */
	file: string;

	/**
	 * The line number to jump to
	 */
	line: number;

	/**
	 * The column number to jump to
	 */
	column: number;

}

/**
 * Event: Show a message
 */
export interface ShowMessageEvent {
	/**
	 * The message to show to the user.
	 */
	message: string;

}

/**
 * Event: New state of the primary and secondary prompts
 */
export interface PromptStateEvent {
	/**
	 * Prompt for primary input.
	 */
	input_prompt: string;

	/**
	 * Prompt for incomplete input.
	 */
	continuation_prompt: string;

}

/**
 * Event: Change the displayed working directory
 */
export interface WorkingDirectoryEvent {
	/**
	 * The new working directory
	 */
	directory: string;

}

/**
 * Event: Execute a Positron command
 */
export interface ExecuteCommandEvent {
	/**
	 * The command to execute
	 */
	command: string;

}

/**
 * Event: Open a workspace
 */
export interface OpenWorkspaceEvent {
	/**
	 * The path for the workspace to be opened
	 */
	path: string;

	/**
	 * Should the workspace be opened in a new window?
	 */
	new_window: boolean;

}

/**
 * Request: Show a question
 *
 * Use this for a modal dialog that the user can accept or cancel
 */
export interface ShowQuestionRequest {
	/**
	 * The title of the dialog
	 */
	title: string;

	/**
	 * The message to display in the dialog
	 */
	message: string;

	/**
	 * The title of the OK button
	 */
	ok_button_title: string;

	/**
	 * The title of the Cancel button
	 */
	cancel_button_title: string;

}

/**
 * Request: Show a dialog
 *
 * Use this for a modal dialog that the user can only accept
 */
export interface ShowDialogRequest {
	/**
	 * The title of the dialog
	 */
	title: string;

	/**
	 * The message to display in the dialog
	 */
	message: string;

}

/**
 * Request: Sleep for n seconds
 *
 * Useful for testing in the backend a long running frontend method
 */
export interface DebugSleepRequest {
	/**
	 * Duration in milliseconds
	 */
	ms: number;

}

/**
 * Request: Path to the workspace folder
 *
 * Returns the path to the workspace folder, or first folder if there are
 * multiple.
 */
export interface WorkspaceFolderRequest {
}

/**
 * Request: Set the selections in the editor
 *
 * Use this to set the selection ranges/cursor in the editor
 */
export interface SetEditorSelectionsRequest {
	/**
	 * The selections (really, ranges) to set in the document
	 */
	selections: Array<Range>;

}

/**
 * Request: Context metadata for the last editor
 *
 * Returns metadata such as file path for the last editor selected by the
 * user. The result may be undefined if there are no active editors.
 */
export interface LastActiveEditorContextRequest {
}

export enum UiFrontendEvent {
	Busy = 'busy',
	ClearConsole = 'clear_console',
	OpenEditor = 'open_editor',
	ShowMessage = 'show_message',
	PromptState = 'prompt_state',
	WorkingDirectory = 'working_directory',
	ExecuteCommand = 'execute_command',
	OpenWorkspace = 'open_workspace'
}

export enum UiFrontendRequest {
	ShowQuestion = 'show_question',
	ShowDialog = 'show_dialog',
	DebugSleep = 'debug_sleep',
	WorkspaceFolder = 'workspace_folder',
	SetEditorSelections = 'set_editor_selections',
	LastActiveEditorContext = 'last_active_editor_context'
}

export class PositronUiComm extends PositronBaseComm {
	constructor(instance: IRuntimeClientInstance<any, any>) {
		super(instance);
		this.onDidBusy = super.createEventEmitter('busy', ['busy']);
		this.onDidClearConsole = super.createEventEmitter('clear_console', []);
		this.onDidOpenEditor = super.createEventEmitter('open_editor', ['file', 'line', 'column']);
		this.onDidShowMessage = super.createEventEmitter('show_message', ['message']);
		this.onDidPromptState = super.createEventEmitter('prompt_state', ['input_prompt', 'continuation_prompt']);
		this.onDidWorkingDirectory = super.createEventEmitter('working_directory', ['directory']);
		this.onDidExecuteCommand = super.createEventEmitter('execute_command', ['command']);
		this.onDidOpenWorkspace = super.createEventEmitter('open_workspace', ['path', 'new_window']);
	}

	/**
	 * Run a method in the interpreter and return the result to the frontend
	 *
	 * Unlike other RPC methods, `call_method` calls into methods implemented
	 * in the interpreter and returns the result back to the frontend using
	 * an implementation-defined serialization scheme.
	 *
	 * @param method The method to call inside the interpreter
	 * @param params The parameters for `method`
	 *
	 * @returns The method result
	 */
	callMethod(method: string, params: Array<Param>): Promise<CallMethodResult> {
		return super.performRpc('call_method', ['method', 'params'], [method, params]);
	}


	/**
	 * Change in backend's busy/idle status
	 *
	 * This represents the busy state of the underlying computation engine,
	 * not the busy state of the kernel. The kernel is busy when it is
	 * processing a request, but the runtime is busy only when a computation
	 * is running.
	 */
	onDidBusy: Event<BusyEvent>;
	/**
	 * Clear the console
	 *
	 * Use this to clear the console.
	 */
	onDidClearConsole: Event<ClearConsoleEvent>;
	/**
	 * Open an editor
	 *
	 * This event is used to open an editor with a given file and selection.
	 */
	onDidOpenEditor: Event<OpenEditorEvent>;
	/**
	 * Show a message
	 *
	 * Use this for messages that require immediate attention from the user
	 */
	onDidShowMessage: Event<ShowMessageEvent>;
	/**
	 * New state of the primary and secondary prompts
	 *
	 * Languages like R allow users to change the way their prompts look.
	 * This event signals a change in the prompt configuration.
	 */
	onDidPromptState: Event<PromptStateEvent>;
	/**
	 * Change the displayed working directory
	 *
	 * This event signals a change in the working direcotry of the
	 * interpreter
	 */
	onDidWorkingDirectory: Event<WorkingDirectoryEvent>;
	/**
	 * Execute a Positron command
	 *
	 * Use this to execute a Positron command from the backend (like from a
	 * runtime)
	 */
	onDidExecuteCommand: Event<ExecuteCommandEvent>;
	/**
	 * Open a workspace
	 *
	 * Use this to open a workspace in Positron
	 */
	onDidOpenWorkspace: Event<OpenWorkspaceEvent>;
}

