/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RStudio, PBC.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostContext, ExtHostLanguageRuntimeShape, MainContext, MainThreadLanguageRuntimeShape } from '../../common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ILanguageRuntime, ILanguageRuntimeInfo, ILanguageRuntimeMessage, ILanguageRuntimeMetadata, ILanguageRuntimeService, RuntimeCodeExecutionMode, RuntimeErrorBehavior, RuntimeState } from 'vs/workbench/contrib/languageRuntime/common/languageRuntimeService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';

// Adapter class for the main thread to call into the extension host
class ExtHostLanguageRuntimeAdapter implements ILanguageRuntime {

	private readonly _stateEmitter = new Emitter<RuntimeState>();
	private readonly _messageEmitter = new Emitter<ILanguageRuntimeMessage>();

	constructor(readonly handle: number,
		readonly metadata: ILanguageRuntimeMetadata,
		private readonly _proxy: ExtHostLanguageRuntimeShape) {
		this.onDidChangeRuntimeState = this._stateEmitter.event;
		this.onDidReceiveRuntimeMessage = this._messageEmitter.event;
	}

	onDidReceiveRuntimeMessage: Event<ILanguageRuntimeMessage>;

	onDidChangeRuntimeState: Event<RuntimeState>;

	emitMessage(message: ILanguageRuntimeMessage): void {
		this._messageEmitter.fire(message);
	}

	emitState(state: RuntimeState): void {
		this._stateEmitter.fire(state);
	}

	execute(code: string, mode: RuntimeCodeExecutionMode, errorBehavior: RuntimeErrorBehavior): Thenable<string> {
		throw new Error('Method not implemented.');
	}
	interrupt(): void {
		throw new Error('Method not implemented.');
	}
	restart(): void {
		throw new Error('Method not implemented.');
	}
	shutdown(): void {
		throw new Error('Method not implemented.');
	}

	start(): Promise<ILanguageRuntimeInfo> {
		return this._proxy.$startLanguageRuntime(this.handle);
	}
}

@extHostNamedCustomer(MainContext.MainThreadLanguageRuntime)
export class MainThreadLanguageRuntime implements MainThreadLanguageRuntimeShape {

	private readonly _disposables = new DisposableStore();

	private readonly _proxy: ExtHostLanguageRuntimeShape;

	private readonly _runtimes: Map<number, ExtHostLanguageRuntimeAdapter> = new Map();

	constructor(
		extHostContext: IExtHostContext,
		@ILanguageRuntimeService private readonly _languageRuntimeService: ILanguageRuntimeService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostLanguageRuntime);
	}

	$emitLanguageRuntimeMessage(handle: number, message: ILanguageRuntimeMessage): void {
		const runtime = this._runtimes.get(handle);
		if (runtime) {
			runtime.emitMessage(message);
		} else {
			throw new Error(`Unknown language runtime handle: ${handle}`);
		}
	}

	$emitLanguageRuntimeState(handle: number, state: RuntimeState): void {
		const runtime = this._runtimes.get(handle);
		if (runtime) {
			runtime.emitState(state);
		} else {
			throw new Error(`Unknown language runtime handle: ${handle}`);
		}
	}

	// Called by the extension host to register a language runtime
	$registerLanguageRuntime(handle: number, metadata: ILanguageRuntimeMetadata): void {
		const adapter = new ExtHostLanguageRuntimeAdapter(handle, metadata, this._proxy);
		this._runtimes.set(handle, adapter);
		this._languageRuntimeService.registerRuntime(adapter);
	}

	$unregisterLanguageRuntime(handle: number): void {
		this._runtimes.delete(handle);
	}

	public dispose(): void {
		this._disposables.dispose();
	}
}
