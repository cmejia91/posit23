/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit, PBC.
 *--------------------------------------------------------------------------------------------*/

import type * as positron from 'positron';
import { ILanguageRuntimeInfo, RuntimeClientType, RuntimeCodeExecutionMode, RuntimeErrorBehavior } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import * as extHostProtocol from './extHost.positron.protocol';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';

export class ExtHostLanguageRuntime implements extHostProtocol.ExtHostLanguageRuntimeShape {

	private readonly _proxy: extHostProtocol.MainThreadLanguageRuntimeShape;

	private readonly _runtimes = new Array<positron.LanguageRuntime>();

	constructor(
		mainContext: extHostProtocol.IMainPositronContext,
	) {
		// Trigger creation of the proxy
		this._proxy = mainContext.getProxy(extHostProtocol.MainPositronContext.MainThreadLanguageRuntime);
	}

	$startLanguageRuntime(handle: number): Promise<ILanguageRuntimeInfo> {
		return new Promise((resolve, reject) => {
			if (handle >= this._runtimes.length) {
				return reject(new Error(`Cannot start runtime: language runtime handle '${handle}' not found or no longer valid.`));
			}
			this._runtimes[handle].start().then(info => {
				resolve(info);
			});
		});
	}

	$interruptLanguageRuntime(handle: number): void {
		if (handle >= this._runtimes.length) {
			throw new Error(`Cannot interrupt runtime: language runtime handle '${handle}' not found or no longer valid.`);
		}
		this._runtimes[handle].interrupt();
	}

	$shutdownLanguageRuntime(handle: number): void {
		if (handle >= this._runtimes.length) {
			throw new Error(`Cannot shut down runtime: language runtime handle '${handle}' not found or no longer valid.`);
		}
		this._runtimes[handle].shutdown();
	}

	$restartLanguageRuntime(handle: number): void {
		if (handle >= this._runtimes.length) {
			throw new Error(`Cannot restart runtime: language runtime handle '${handle}' not found or no longer valid.`);
		}
		this._runtimes[handle].restart();
	}

	$executeCode(handle: number, code: string, id: string, mode: RuntimeCodeExecutionMode, errorBehavior: RuntimeErrorBehavior): void {
		if (handle >= this._runtimes.length) {
			throw new Error(`Cannot execute code: language runtime handle '${handle}' not found or no longer valid.`);
		}
		this._runtimes[handle].execute(code, id, mode, errorBehavior);
	}

	$createClient(handle: number, type: RuntimeClientType): Promise<string> {
		if (handle >= this._runtimes.length) {
			throw new Error(`Cannot create '${type}' client: language runtime handle '${handle}' not found or no longer valid.`);
		}
		return Promise.resolve(this._runtimes[handle].createClient(type));
	}

	$removeClient(handle: number, id: string): void {
		if (handle >= this._runtimes.length) {
			throw new Error(`Cannot remove client: language runtime handle '${handle}' not found or no longer valid.`);
		}
		this._runtimes[handle].removeClient(id);
	}

	$replyToPrompt(handle: number, id: string, response: string): void {
		if (handle >= this._runtimes.length) {
			throw new Error(`Cannot reply to prompt: language runtime handle '${handle}' not found or no longer valid.`);
		}
		this._runtimes[handle].replyToPrompt(id, response);
	}

	public registerLanguageRuntime(
		runtime: positron.LanguageRuntime): IDisposable {

		// Create a handle and register the runtime with the main thread
		const handle = this._runtimes.length;

		// Wire event handlers for state changes and messages
		runtime.onDidChangeRuntimeState(state =>
			this._proxy.$emitLanguageRuntimeState(handle, state));
		runtime.onDidReceiveRuntimeMessage(message =>
			this._proxy.$emitLanguageRuntimeMessage(handle, message));

		// Register the runtime
		this._runtimes.push(runtime);

		this._proxy.$registerLanguageRuntime(handle, runtime.metadata);
		return new Disposable(() => {
			this._proxy.$unregisterLanguageRuntime(handle);
		});
	}
}

