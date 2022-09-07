/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RStudio, PBC.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ILanguageRuntime, ILanguageRuntimeMessage } from 'vs/workbench/contrib/languageRuntime/common/languageRuntimeService';
import { Emitter } from 'vs/base/common/event';

class ExtHostLanguageWrapper implements ILanguageRuntime, vscode.Disposable {
	constructor(private readonly _runtime: vscode.LanguageRuntime) {
		this.language = _runtime.language;
		this.name = _runtime.name;
		this.version = _runtime.version;
		this.messages = new Emitter<ILanguageRuntimeMessage>();
		_runtime.messages.event(e => this.messages.fire(e));
	}

	dispose() {
		this.messages.dispose();
	}

	language: string;

	name: string;

	version: string;

	messages: Emitter<ILanguageRuntimeMessage>;

	execute(code: string): Thenable<string> {
		return this._runtime.execute(code);
	}
	interrupt(): void {
		this._runtime.interrupt();
	}
	restart(): void {
		this._runtime.restart();
	}
	shutdown(): void {
		this._runtime.shutdown();
	}
}

export class ExtHostLanguageRuntime {
	constructor() {
	}

	public $registerLanguageRuntime(
		runtime: vscode.LanguageRuntime): vscode.Disposable {
		const wrapper = new ExtHostLanguageWrapper(runtime);
		return wrapper;
	}
}
