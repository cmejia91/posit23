/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { ILanguageRuntime } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { IPositronConsoleInstance } from 'vs/workbench/services/positronConsole/common/positronConsoleInstance';

/**
 * PositronConsoleInstance class.
 */
export class PositronConsoleInstance extends Disposable implements IPositronConsoleInstance {
	//#region Private Properties

	/**
	 * The onDidClearConsole event emitter.
	 */
	private readonly _onDidClearConsoleEmitter = this._register(new Emitter<void>);

	/**
	 * The onDidClearInputHistory event emitter.
	 */
	private readonly _onDidClearInputHistoryEmitter = this._register(new Emitter<void>);

	/**
	 * The onDidExecuteCode event emitter.
	 */
	private readonly _onDidExecuteCodeEmitter = this._register(new Emitter<string>);

	//#endregion Private Properties

	/**
	 * Constructor.
	 * @param runtime The language runtime.
	 */
	constructor(readonly runtime: ILanguageRuntime) {
		// Call the base class's constructor.
		super();

		// Populate with execution history
		// (TODO: these entries, after being fetched here, should be appended to the UI)
		// this._executionHistoryService.getExecutionEntries(this._instance.runtime.metadata.id);
	}

	/**
	 * onDidClearConsole event.
	 */
	readonly onDidClearConsole: Event<void> = this._onDidClearConsoleEmitter.event;

	/**
	 * onDidClearInputHistory event.
	 */
	readonly onDidClearInputHistory: Event<void> = this._onDidClearInputHistoryEmitter.event;

	/**
	 * onDidExecuteCode event.
	 */
	readonly onDidExecuteCode: Event<string> = this._onDidExecuteCodeEmitter.event;

	/**
	 * Clears the console.
	 */
	clearConsole(): void {
		this._onDidClearConsoleEmitter.fire();
	}

	/**
	 * Clears the input history.
	 */
	clearInputHistory(): void {
		this._onDidClearInputHistoryEmitter.fire();
	}

	/**
	 * Executes code.
	 * @param code The code to execute.
	 */
	executeCode(code: string): void {
		this._onDidExecuteCodeEmitter.fire(code);
	}
}
