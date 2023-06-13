/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// This file was automatically generated by 'positron/scripts/generate-events.ts'.
// Please do not modify this file directly.

export interface LanguageRuntimeEventData { }

export enum LanguageRuntimeEventType {
	Busy = 'busy',
	ShowMessage = 'show_message',
	ShowHelp = 'show_help',
}

// Represents a change in the runtime's busy state.
// Note that this represents the busy state of the underlying computation engine, not the busy state of the kernel.
// The kernel is busy when it is processing a request, but the runtime is busy only when a computation is running.
export interface BusyEvent extends LanguageRuntimeEventData {

	/** Whether the runtime is busy. */
	busy: boolean;

}

// Use this event to show a message to the user.
export interface ShowMessageEvent extends LanguageRuntimeEventData {

	/** The message to show to the user. */
	message: string;

}

// Show help content in the Help pane.
export interface ShowHelpEvent extends LanguageRuntimeEventData {

	/** The help content to be shown. */
	content: string;

	/** The content help type. Must be one of 'html', 'markdown', or 'url'. */
	kind: string;

	/** Focus the Help pane after the Help content has been rendered? */
	focus: boolean;

}

