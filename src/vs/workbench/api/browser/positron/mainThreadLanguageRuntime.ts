/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	ExtHostLanguageRuntimeShape,
	MainThreadLanguageRuntimeShape,
	MainPositronContext,
	ExtHostPositronContext
} from '../../common/positron/extHost.positron.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ILanguageRuntime, ILanguageRuntimeInfo, ILanguageRuntimeMessageCommClosed, ILanguageRuntimeMessageCommData, ILanguageRuntimeMessageError, ILanguageRuntimeMessageEvent, ILanguageRuntimeMessageInput, ILanguageRuntimeMessageOutput, ILanguageRuntimeMessagePrompt, ILanguageRuntimeMessageState, ILanguageRuntimeMessageStream, ILanguageRuntimeMetadata, ILanguageRuntimeService, RuntimeCodeExecutionMode, RuntimeCodeFragmentStatus, RuntimeErrorBehavior, RuntimeState } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { IPositronConsoleService } from 'vs/workbench/services/positronConsole/common/interfaces/positronConsoleService';
import { ILogService } from 'vs/platform/log/common/log';
import { IRuntimeClientInstance, RuntimeClientState, RuntimeClientType } from 'vs/workbench/services/languageRuntime/common/languageRuntimeClientInstance';

// Adapter class; presents an ILanguageRuntime interface that connects to the
// extension host proxy to supply language features.
class ExtHostLanguageRuntimeAdapter implements ILanguageRuntime {

	private readonly _stateEmitter = new Emitter<RuntimeState>();
	private readonly _startupEmitter = new Emitter<ILanguageRuntimeInfo>();

	private readonly _onDidReceiveRuntimeMessageOutputEmitter = new Emitter<ILanguageRuntimeMessageOutput>();
	private readonly _onDidReceiveRuntimeMessageStreamEmitter = new Emitter<ILanguageRuntimeMessageStream>();
	private readonly _onDidReceiveRuntimeMessageInputEmitter = new Emitter<ILanguageRuntimeMessageInput>();
	private readonly _onDidReceiveRuntimeMessageErrorEmitter = new Emitter<ILanguageRuntimeMessageError>();
	private readonly _onDidReceiveRuntimeMessagePromptEmitter = new Emitter<ILanguageRuntimeMessagePrompt>();
	private readonly _onDidReceiveRuntimeMessageStateEmitter = new Emitter<ILanguageRuntimeMessageState>();
	private readonly _onDidReceiveRuntimeMessageEventEmitter = new Emitter<ILanguageRuntimeMessageEvent>();

	private _currentState: RuntimeState = RuntimeState.Uninitialized;
	private _clients: Map<string, ExtHostRuntimeClientInstance<any>> = new Map<string, ExtHostRuntimeClientInstance<any>>();

	constructor(readonly handle: number,
		readonly metadata: ILanguageRuntimeMetadata,
		private readonly _logService: ILogService,
		private readonly _proxy: ExtHostLanguageRuntimeShape) {

		// Bind events to emitters
		this.onDidChangeRuntimeState = this._stateEmitter.event;
		this.onDidCompleteStartup = this._startupEmitter.event;

		// Listen to state changes and track the current state
		this.onDidChangeRuntimeState((state) => {
			this._currentState = state;
		});
	}

	onDidChangeRuntimeState: Event<RuntimeState>;

	onDidCompleteStartup: Event<ILanguageRuntimeInfo>;

	onDidReceiveRuntimeMessageOutput = this._onDidReceiveRuntimeMessageOutputEmitter.event;
	onDidReceiveRuntimeMessageStream = this._onDidReceiveRuntimeMessageStreamEmitter.event;
	onDidReceiveRuntimeMessageInput = this._onDidReceiveRuntimeMessageInputEmitter.event;
	onDidReceiveRuntimeMessageError = this._onDidReceiveRuntimeMessageErrorEmitter.event;
	onDidReceiveRuntimeMessagePrompt = this._onDidReceiveRuntimeMessagePromptEmitter.event;
	onDidReceiveRuntimeMessageState = this._onDidReceiveRuntimeMessageStateEmitter.event;
	onDidReceiveRuntimeMessageEvent = this._onDidReceiveRuntimeMessageEventEmitter.event;

	emitDidReceiveRuntimeMessageOutput(languageRuntimeMessageOutput: ILanguageRuntimeMessageOutput) {
		this._onDidReceiveRuntimeMessageOutputEmitter.fire(languageRuntimeMessageOutput);
	}

	emitDidReceiveRuntimeMessageStream(languageRuntimeMessageStream: ILanguageRuntimeMessageStream) {
		this._onDidReceiveRuntimeMessageStreamEmitter.fire(languageRuntimeMessageStream);
	}

	emitDidReceiveRuntimeMessageInput(languageRuntimeMessageInput: ILanguageRuntimeMessageInput) {
		this._onDidReceiveRuntimeMessageInputEmitter.fire(languageRuntimeMessageInput);
	}

	emitDidReceiveRuntimeMessageError(languageRuntimeMessageError: ILanguageRuntimeMessageError) {
		this._onDidReceiveRuntimeMessageErrorEmitter.fire(languageRuntimeMessageError);
	}

	emitDidReceiveRuntimeMessagePrompt(languageRuntimeMessagePrompt: ILanguageRuntimeMessagePrompt) {
		this._onDidReceiveRuntimeMessagePromptEmitter.fire(languageRuntimeMessagePrompt);
	}

	emitDidReceiveRuntimeMessageState(languageRuntimeMessageState: ILanguageRuntimeMessageState) {
		this._onDidReceiveRuntimeMessageStateEmitter.fire(languageRuntimeMessageState);
	}

	emitDidReceiveRuntimeMessageEvent(languageRuntimeMessageEvent: ILanguageRuntimeMessageEvent) {
		this._onDidReceiveRuntimeMessageEventEmitter.fire(languageRuntimeMessageEvent);
	}

	emitState(state: RuntimeState): void {
		this._stateEmitter.fire(state);
	}

	/**
	 * Relays a message from the server side of a comm to the client side.
	 */
	emitDidReceiveClientMessage(message: ILanguageRuntimeMessageCommData): void {
		const client = this._clients.get(message.comm_id);
		if (client) {
			client.emitData(message);
		} else {
			this._logService.warn(`Client instance '${message.comm_id}' not found; dropping message: ${JSON.stringify(message)}`);
		}
	}

	/**
	 * Updates the state of a client from the server side of a comm.
	 */
	emitClientState(id: string, state: RuntimeClientState): void {
		const client = this._clients.get(id);
		if (client) {
			client.setClientState(state);
		} else {
			this._logService.warn(`Client instance '${id}' not found; dropping state change: ${state}`);
		}
	}

	/** Gets the current state of the notebook runtime */
	getRuntimeState(): RuntimeState {
		return this._currentState;
	}

	execute(code: string, id: string, mode: RuntimeCodeExecutionMode, errorBehavior: RuntimeErrorBehavior): void {
		this._proxy.$executeCode(this.handle, code, id, mode, errorBehavior);
	}

	isCodeFragmentComplete(code: string): Thenable<RuntimeCodeFragmentStatus> {
		return this._proxy.$isCodeFragmentComplete(this.handle, code);
	}

	/** Create a new client inside the runtime */
	createClient<T>(type: RuntimeClientType, params: any): Thenable<IRuntimeClientInstance<T>> {
		// Create an ID for the client.
		const id = this.generateClientId(this.metadata.languageId, type);

		// Create the new instance and add it to the map.
		const client = new ExtHostRuntimeClientInstance<T>(id, type, this.handle, this._proxy);
		this._clients.set(id, client);
		this._logService.info(`Creating ${type} client '${id}'...`);
		client.setClientState(RuntimeClientState.Opening);

		// Kick off the creation of the client on the server side. There's no
		// reply defined to this call in the protocol, so this is almost
		// fire-and-forget; we need to return the instance right away so that
		// the client can start listening to events.
		//
		// If the creation fails on the server, we'll either get an error here
		// or see the server end get closed immediately via a CommClose message.
		// In either case we'll let the client know.
		this._proxy.$createClient(this.handle, id, type, params).then(() => {
			// There is no protocol message indicating that the client has been
			// successfully created, so presume it's connected once the message
			// has been safely delivered, and handle the close event if it
			// happens.
			if (client.getClientState() === RuntimeClientState.Opening) {
				client.setClientState(RuntimeClientState.Connected);
			} else {
				this._logService.warn(`Client '${id}' in runtime '${this.metadata.runtimeName}' ` +
					`was closed before it could be created`);
			}
		}).catch((err) => {
			this._logService.error(`Failed to create client '${id}' ` +
				`in runtime '${this.metadata.runtimeName}': ${err}`);
			client.setClientState(RuntimeClientState.Closed);
			this._clients.delete(id);
		});

		return Promise.resolve(client);
	}

	/** List active clients */
	listClients(): Thenable<IRuntimeClientInstance<any>[]> {
		return Promise.resolve(Array.from(this._clients.values()));
	}

	replyToPrompt(id: string, value: string): void {
		this._proxy.$replyToPrompt(this.handle, id, value);
	}

	interrupt(): void {
		return this._proxy.$interruptLanguageRuntime(this.handle);
	}

	restart(): void {
		return this._proxy.$restartLanguageRuntime(this.handle);
	}

	shutdown(): void {
		return this._proxy.$shutdownLanguageRuntime(this.handle);
	}

	start(): Promise<ILanguageRuntimeInfo> {
		return new Promise((resolve, reject) => {
			this._proxy.$startLanguageRuntime(this.handle).then((info) => {
				this._startupEmitter.fire(info);
				resolve(info);
			}).catch((err) => {
				reject(err);
			});
		});
	}

	/**
	 * Generates a client ID for a language runtime client instance.
	 *
	 * @param languageId The ID of the language that the client is associated with, such as "python"
	 * @param clientType The type of client for which to generate an ID
	 * @returns A unique ID for the client, such as "positron-environment-python-1-f2ef6a9a"
	 */
	private generateClientId(languageId: string, clientType: RuntimeClientType): string {
		// Generate a random 8-character hexadecimal string to serve as this client's ID
		const randomId = Math.floor(Math.random() * 0x100000000).toString(16);

		// Generate a unique auto-incrementing ID for this client
		const nextId = ExtHostLanguageRuntimeAdapter.clientCounter++;

		// Replace periods in the language ID with hyphens, so that the generated ID contains only
		// alphanumeric characters and hyphens
		const client = clientType.replace(/\./g, '-');

		// Return the generated client ID
		return `${client}-${languageId}-${nextId}-${randomId}`;
	}
	static clientCounter = 0;
}

/**
 * Represents the front-end instance of a client widget inside a language runtime.
 *
 * Its lifetime is tied to the lifetime of the client widget and associated server
 * component. It is presumed that the comm channel has already been established
 * between the client and server; this class is responsible for managing the
 * communication channel and closing it when the client is disposed.
 */
class ExtHostRuntimeClientInstance<T> extends Disposable implements IRuntimeClientInstance<T> {

	private readonly _stateEmitter = new Emitter<RuntimeClientState>();

	private readonly _dataEmitter = new Emitter<T>();


	private _state: RuntimeClientState = RuntimeClientState.Uninitialized;

	constructor(
		private readonly _id: string,
		private readonly _type: RuntimeClientType,
		private readonly _handle: number,
		private readonly _proxy: ExtHostLanguageRuntimeShape) {
		super();

		this.onDidChangeClientState = this._stateEmitter.event;
		this._register(this._stateEmitter);

		this.onDidReceiveData = this._dataEmitter.event;
		this._register(this._dataEmitter);

		this._stateEmitter.event((state) => {
			this._state = state;
		});
	}

	/**
	 * Sends a message (of any type) to the server side of the comm.
	 *
	 * @param message Message to send to the server
	 */
	sendMessage(message: any): void {
		this._proxy.$sendClientMessage(this._handle, this._id, message);
	}

	/**
	 * Emits a message (of any type) to the client side of the comm.
	 *
	 * @param message The message to emit to the client
	 */
	emitData(message: ILanguageRuntimeMessageCommData): void {
		this._dataEmitter.fire(message.data as T);
	}

	/**
	 * Sets the state of the client by firing an event bearing the new state.
	 *
	 * @param state The new state of the client
	 */
	setClientState(state: RuntimeClientState): void {
		this._stateEmitter.fire(state);
	}

	onDidChangeClientState: Event<RuntimeClientState>;

	onDidReceiveData: Event<T>;

	getClientState(): RuntimeClientState {
		return this._state;
	}

	getClientId(): string {
		return this._id;
	}

	getClientType(): RuntimeClientType {
		return this._type;
	}

	public override dispose(): void {
		super.dispose();
		this._proxy.$removeClient(this._handle, this._id);
		this._stateEmitter.fire(RuntimeClientState.Closed);
	}
}

@extHostNamedCustomer(MainPositronContext.MainThreadLanguageRuntime)
export class MainThreadLanguageRuntime implements MainThreadLanguageRuntimeShape {

	private readonly _disposables = new DisposableStore();

	private readonly _proxy: ExtHostLanguageRuntimeShape;

	private readonly _runtimes: Map<number, ExtHostLanguageRuntimeAdapter> = new Map();

	constructor(
		extHostContext: IExtHostContext,
		@ILanguageRuntimeService private readonly _languageRuntimeService: ILanguageRuntimeService,
		@IPositronConsoleService private readonly _positronConsoleService: IPositronConsoleService,
		@ILogService private readonly _logService: ILogService
	) {
		// TODO@softwarenerd - I needed to find a central place where I could
		// ensure that the PositronConsoleService was alive early. For now,
		// this is what I've chosen.
		this._positronConsoleService.initialize();
		this._proxy = extHostContext.getProxy(ExtHostPositronContext.ExtHostLanguageRuntime);
	}

	$emitRuntimeClientMessage(handle: number, message: ILanguageRuntimeMessageCommData): void {
		this.findRuntime(handle).emitDidReceiveClientMessage(message);
	}

	$emitRuntimeClientClosed(handle: number, message: ILanguageRuntimeMessageCommClosed): void {
		this.findRuntime(handle).emitClientState(message.comm_id, RuntimeClientState.Closed);
	}

	$emitLanguageRuntimeMessageOutput(handle: number, message: ILanguageRuntimeMessageOutput): void {
		this.findRuntime(handle).emitDidReceiveRuntimeMessageOutput(message);
	}

	$emitLanguageRuntimeMessageStream(handle: number, message: ILanguageRuntimeMessageStream): void {
		this.findRuntime(handle).emitDidReceiveRuntimeMessageStream(message);
	}

	$emitLanguageRuntimeMessageInput(handle: number, message: ILanguageRuntimeMessageInput): void {
		this.findRuntime(handle).emitDidReceiveRuntimeMessageInput(message);
	}

	$emitLanguageRuntimeMessageError(handle: number, message: ILanguageRuntimeMessageError): void {
		this.findRuntime(handle).emitDidReceiveRuntimeMessageError(message);
	}

	$emitLanguageRuntimeMessagePrompt(handle: number, message: ILanguageRuntimeMessagePrompt): void {
		this.findRuntime(handle).emitDidReceiveRuntimeMessagePrompt(message);
	}

	$emitLanguageRuntimeMessageState(handle: number, message: ILanguageRuntimeMessageState): void {
		this.findRuntime(handle).emitDidReceiveRuntimeMessageState(message);
	}

	$emitLanguageRuntimeMessageEvent(handle: number, message: ILanguageRuntimeMessageEvent): void {
		this.findRuntime(handle).emitDidReceiveRuntimeMessageEvent(message);
	}

	$emitLanguageRuntimeState(handle: number, state: RuntimeState): void {
		this.findRuntime(handle).emitState(state);
	}

	// Called by the extension host to register a language runtime
	$registerLanguageRuntime(handle: number, metadata: ILanguageRuntimeMetadata): void {
		const adapter = new ExtHostLanguageRuntimeAdapter(handle, metadata, this._logService, this._proxy);
		this._runtimes.set(handle, adapter);

		// Consider - do we need a flag (on the API side) to indicate whether
		// the runtime should be started implicitly?
		this._languageRuntimeService.registerRuntime(adapter,
			metadata.startupBehavior);
	}

	$unregisterLanguageRuntime(handle: number): void {
		this._runtimes.delete(handle);
	}

	public dispose(): void {
		this._disposables.dispose();
	}

	private findRuntime(handle: number): ExtHostLanguageRuntimeAdapter {
		const runtime = this._runtimes.get(handle);
		if (!runtime) {
			throw new Error(`Unknown language runtime handle: ${handle}`);
		}

		return runtime;
	}
}
