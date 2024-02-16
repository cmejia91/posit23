/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type * as positron from 'positron';
import { ILanguageRuntimeMessage, ILanguageRuntimeMessageCommClosed, ILanguageRuntimeMessageCommData, ILanguageRuntimeMessageCommOpen, RuntimeCodeExecutionMode, RuntimeCodeFragmentStatus, RuntimeErrorBehavior, RuntimeState } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import * as extHostProtocol from './extHost.positron.protocol';
import { Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Disposable, LanguageRuntimeMessageType } from 'vs/workbench/api/common/extHostTypes';
import { RuntimeClientType } from 'vs/workbench/api/common/positron/extHostTypes.positron';
import { ExtHostRuntimeClientInstance } from 'vs/workbench/api/common/positron/extHostClientInstance';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';

/**
 * A language runtime manager and metadata about the extension that registered it.
 */
interface LanguageRuntimeManager {
	discoverer: positron.LanguageRuntimeManager;
	extension: IExtensionDescription;
}

export class ExtHostLanguageRuntime implements extHostProtocol.ExtHostLanguageRuntimeShape {

	private readonly _proxy: extHostProtocol.MainThreadLanguageRuntimeShape;

	private readonly _registeredRuntimes = new Array<positron.LanguageRuntimeMetadata>();

	// A map of the runtime managers. This is keyed by the languageId of the runtime provider.
	private readonly _runtimeSessionMangers = new Map<string, LanguageRuntimeManager>();

	// A list of active sessions.
	private readonly _runtimeSessions = new Array<positron.LanguageRuntimeSession>();

	private readonly _clientInstances = new Array<ExtHostRuntimeClientInstance>();

	private readonly _clientHandlers = new Array<positron.RuntimeClientHandler>();

	/**
	 * Lamport clocks, used for event ordering. Each runtime has its own clock since
	 * events are only ordered within a runtime.
	 */
	private _eventClocks = new Array<number>();

	/**
	 * Indicates whether language runtime discovery is complete.
	 */
	private _runtimeDiscoveryComplete = false;

	// The event emitter for the onDidRegisterRuntime event.
	private readonly _onDidRegisterRuntimeEmitter = new Emitter<positron.LanguageRuntimeMetadata>;

	// The event that fires when a runtime is registered.
	public onDidRegisterRuntime = this._onDidRegisterRuntimeEmitter.event;

	constructor(
		mainContext: extHostProtocol.IMainPositronContext
	) {
		// Trigger creation of the proxy
		this._proxy = mainContext.getProxy(extHostProtocol.MainPositronContext.MainThreadLanguageRuntime);
	}

	/**
	 * Creates a language runtime session.
	 *
	 * @param metadata The metadata for the language runtime.
	 * @param sessionId A previously provisioned ID for the session.
	 *
	 * @returns A promise that resolves with a handle to the runtime session.
	 */
	$createLanguageRuntimeSession(
		metadata: positron.LanguageRuntimeMetadata,
		sessionId: string): Promise<number> {
		return new Promise((resolve, reject) => {
			// Look up the session manager responsible for the language ID
			const sessionManager = this._runtimeSessionManagers.get(metadata.languageId);
			if (sessionManager) {
				sessionManager.manager.createSession(metadata, sessionId).then((session) => {
					resolve(this.attachToSession(session));
				}, (err) => {
					reject(err);
				});
			} else {
				reject(new Error(`No session manager found for language ID '${metadata.languageId}'.`));
			}
		});
	}

	attachToSession(session: positron.LanguageRuntimeSession): number {

		// Wire event handlers for state changes and messages
		session.onDidChangeRuntimeState(state => {
			const tick = this._eventClocks[handle] = this._eventClocks[handle] + 1;
			this._proxy.$emitLanguageRuntimeState(handle, tick, state);
		});

		session.onDidReceiveRuntimeMessage(message => {
			const tick = this._eventClocks[handle] = this._eventClocks[handle] + 1;
			// Amend the message with the event clock for ordering
			const runtimeMessage: ILanguageRuntimeMessage = {
				event_clock: tick,
				...message
			};

			// Dispatch the message to the appropriate handler
			switch (message.type) {
				// Handle comm messages separately
				case LanguageRuntimeMessageType.CommOpen:
					this.handleCommOpen(handle, runtimeMessage as ILanguageRuntimeMessageCommOpen);
					break;

				case LanguageRuntimeMessageType.CommData:
					this.handleCommData(handle, runtimeMessage as ILanguageRuntimeMessageCommData);
					break;

				case LanguageRuntimeMessageType.CommClosed:
					this.handleCommClosed(handle, runtimeMessage as ILanguageRuntimeMessageCommClosed);
					break;

				// Pass everything else to the main thread
				default:
					this._proxy.$emitLanguageRuntimeMessage(handle, runtimeMessage);
					break;
			}
		});

		// Hook up the session end (exit) handler
		session.onDidEndSession(exit => {
			this._proxy.$emitLanguageRuntimeExit(handle, exit);
		});

		// Register the runtime
		const handle = this._runtimeSessions.length;
		this._runtimeSessions.push(session);

		this._eventClocks.push(0);

		return handle;
	}

	async $interruptLanguageRuntime(handle: number): Promise<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot interrupt runtime: session handle '${handle}' not found or no longer valid.`);
		}
		return this._runtimeSessions[handle].interrupt();
	}

	async $shutdownLanguageRuntime(handle: number, exitReason: positron.RuntimeExitReason): Promise<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot shut down runtime: session handle '${handle}' not found or no longer valid.`);
		}
		return this._runtimeSessions[handle].shutdown(exitReason);
	}

	async $forceQuitLanguageRuntime(handle: number): Promise<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot force quit runtime: session handle '${handle}' not found or no longer valid.`);
		}
		return this._runtimeSessions[handle].forceQuit();
	}

	async $restartLanguageRuntime(handle: number): Promise<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot restart runtime: session handle '${handle}' not found or no longer valid.`);
		}
		return this._runtimeSessions[handle].restart();
	}

	async $startLanguageRuntime(handle: number): Promise<positron.LanguageRuntimeInfo> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot restart runtime: session handle '${handle}' not found or no longer valid.`);
		}
		return this._runtimeSessions[handle].start();
	}

	$showOutputLanguageRuntime(handle: number): void {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot show output for runtime: language runtime session handle '${handle}' not found or no longer valid.`);
		}
		if (!this._runtimeSessions[handle].showOutput) {
			throw new Error(`Cannot show output for runtime: language runtime session handle '${handle}' does not implement logging.`);
		}
		return this._runtimeSessions[handle].showOutput!();
	}

	$openResource(handle: number, resource: URI | string): Promise<boolean> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot open resource: session handle '${handle}' not found or no longer valid.`);
		}
		if (!this._runtimeSessions[handle].openResource) {
			return Promise.resolve(false);
		}
		return Promise.resolve(this._runtimeSessions[handle].openResource!(resource));
	}

	$executeCode(handle: number, code: string, id: string, mode: RuntimeCodeExecutionMode, errorBehavior: RuntimeErrorBehavior): void {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot execute code: session handle '${handle}' not found or no longer valid.`);
		}
		this._runtimeSessions[handle].execute(code, id, mode, errorBehavior);
	}

	$isCodeFragmentComplete(handle: number, code: string): Promise<RuntimeCodeFragmentStatus> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot test code completeness: session handle '${handle}' not found or no longer valid.`);
		}
		return Promise.resolve(this._runtimeSessions[handle].isCodeFragmentComplete(code));
	}

	$createClient(handle: number, id: string, type: RuntimeClientType, params: any): Promise<void> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot create '${type}' client: session handle '${handle}' not found or no longer valid.`);
		}
		return Promise.resolve(this._runtimeSessions[handle].createClient(id, type, params));
	}

	$listClients(handle: number, type?: RuntimeClientType): Promise<Record<string, string>> {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot list clients: session handle '${handle}' not found or no longer valid.`);
		}
		return Promise.resolve(this._runtimeSessions[handle].listClients(type));
	}

	$removeClient(handle: number, id: string): void {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot remove client: session handle '${handle}' not found or no longer valid.`);
		}
		this._runtimeSessions[handle].removeClient(id);
	}

	$sendClientMessage(handle: number, client_id: string, message_id: string, message: any): void {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot send message to client: session handle '${handle}' not found or no longer valid.`);
		}
		this._runtimeSessions[handle].sendClientMessage(client_id, message_id, message);
	}

	$replyToPrompt(handle: number, id: string, response: string): void {
		if (handle >= this._runtimeSessions.length) {
			throw new Error(`Cannot reply to prompt: session handle '${handle}' not found or no longer valid.`);
		}
		this._runtimeSessions[handle].replyToPrompt(id, response);
	}

	/**
	 * Discovers language runtimes and registers them with the main thread.
	 */
	public async $discoverLanguageRuntimes(): Promise<void> {
		// Discover runtimes from each provider in parallel
		let start = 0;
		let end = this._runtimeDiscoverers.length;
		while (start !== end) {
			// Extract the section of the providers list we're working on and discover
			// runtimes from it
			const providers = this._runtimeDiscoverers.slice(start, end);
			try {
				await this.discoverLanguageRuntimes(providers);
			} catch (err) {
				// Log and continue if errors occur during registration; this is
				// a safeguard to ensure we always signal the main thread when
				// discovery is complete (below)
				console.error(err);
			}

			// Typically the loop ends after the first pass, but if new
			// providers were added while we were discovering runtimes, then we
			// need to go back into the body of the loop to discover those
			// runtimes as well.
			start = end;
			end = this._runtimeDiscoverers.length;
		}

		// Notify the main thread that discovery is complete
		this._runtimeDiscoveryComplete = true;
		this._proxy.$completeLanguageRuntimeDiscovery();
	}

	/**
	 * Discovers language runtimes in parallel and registers each one with the main thread.
	 *
	 * @param discoverers The set of discoverers to discover runtimes from
	 */
	private async discoverLanguageRuntimes(discoverers: Array<LanguageRuntimeDiscoverer>):
		Promise<void> {

		// The number of discoverers we're waiting on (initially all discoverers)
		let count = discoverers.length;

		// Utility promise
		const never: Promise<never> = new Promise(() => { });

		// Utility function to get the next runtime from a provider and amend an
		// index. If the provider throws an error attempting to get the next
		// provider, then the error is logged and the function signals that the
		// provider is done.
		const getNext = async (asyncGen: LanguageRuntimeDiscoverer, index: number) => {
			try {
				const result = await asyncGen.discoverer.next();
				return ({ index, extension: asyncGen.extension, result });
			} catch (err) {
				console.error(`Language runtime provider threw an error during registration: ` +
					`${err}`);
				return {
					index,
					extension: asyncGen.extension,
					result: { value: undefined, done: true }
				};
			}
		};

		// Array mapping each provider to a promise for its next runtime
		const nextPromises = discoverers.map(getNext);

		try {
			while (count) {
				// Wait for the next runtime to be discovered from any provider
				const { index, extension, result } = await Promise.race(nextPromises);
				if (result.done) {
					// If the provider is done supplying runtimes, remove it
					// from the list of discoverers we're waiting on
					nextPromises[index] = never;
					count--;
				} else if (result.value !== undefined) {
					// Otherwise, move on to the next runtime from the provider
					// and register the runtime it returned
					nextPromises[index] = getNext(discoverers[index], index);
					try {
						this.registerLanguageRuntime(extension, result.value);
					} catch (err) {
						console.error(`Error registering language runtime ` +
							`${result.value.runtimeName}: ${err}`);
					}
				}
			}
		} catch (err) {
			console.error(`Halting language runtime registration: ${err}`);
		} finally {
			// Clean up any remaining promises
			for (const [index, iterator] of discoverers.entries()) {
				if (nextPromises[index] !== never && iterator.discoverer.return !== null) {
					void iterator.discoverer.return(null);
				}
			}
		}
	}

	public registerClientHandler(handler: positron.RuntimeClientHandler): IDisposable {
		this._clientHandlers.push(handler);
		return new Disposable(() => {
			const index = this._clientHandlers.indexOf(handler);
			if (index >= 0) {
				this._clientHandlers.splice(index, 1);
			}
		});
	}

	public getRegisteredRuntimes(): Promise<positron.LanguageRuntimeMetadata[]> {
		return Promise.resolve(this._registeredRuntimes);
	}

	public async getPreferredRuntime(languageId: string): Promise<positron.LanguageRuntimeMetadata> {
		const metadata = await this._proxy.$getPreferredRuntime(languageId);
		const runtime = this._registeredRuntimes.find(runtime => runtime.runtimeId === metadata.runtimeId);
		if (!runtime) {
			throw new Error(`Runtime exists on main thread but not extension host: ${metadata.runtimeId}`);
		}
		return runtime;
	}

	public getRunningRuntimes(languageId: string): Promise<positron.LanguageRuntimeMetadata[]> {
		return this._proxy.$getRunningRuntimes(languageId);
	}

	public registerLanguageRuntimeManager(
		extension: IExtensionDescription,
		manager: positron.LanguageRuntimeManager): void {
		if (this._runtimeDiscoveryComplete) {
			// We missed the discovery phase. Invoke the provider's async
			// generator and register each runtime it returns right away.
			void (async () => {
				for await (const runtime of manager.discoverRuntimes) {
					this.registerLanguageRuntime(extension, runtime);
				}
			})();
		} else {
			// We didn't miss it; either discovery is happening now or it hasn't started. Add
			// the provider to the list of providers on which we need to perform discovery.
			this._runtimeDiscoverers.push({ extension, discoverer });
		}
	}

	public registerLanguageRuntime(
		extension: IExtensionDescription,
		runtime: positron.LanguageRuntimeMetadata): IDisposable {

		// Create a handle and register the runtime with the main thread
		const handle = this._registeredRuntimes.length;

		// Register the runtime with the main thread
		this._proxy.$registerLanguageRuntime(handle, {
			extensionId: extension.identifier,
			...runtime
		});
		this._onDidRegisterRuntimeEmitter.fire(runtime);

		return new Disposable(() => {
			this._proxy.$unregisterLanguageRuntime(handle);
		});
	}

	public executeCode(languageId: string, code: string, focus: boolean, skipChecks?: boolean): Promise<boolean> {
		return this._proxy.$executeCode(languageId, code, focus, skipChecks);
	}

	/**
	 * Selects and starts a language runtime.
	 *
	 * @param runtimeId The runtime ID to select and start.
	 */
	public selectLanguageRuntime(runtimeId: string): Promise<void> {
		return this._proxy.$selectLanguageRuntime(runtimeId);
	}

	/**
	 * Restarts a running language runtime.
	 *
	 * @param runtimeId The runtime ID to restart.
	 */
	public restartLanguageRuntime(runtimeId: string): Promise<void> {
		// Look for the runtime with the given ID
		for (let i = 0; i < this._runtimeSessions.length; i++) {
			if (this._runtimeSessions[i].metadata.runtimeId === runtimeId) {
				return this._proxy.$restartLanguageRuntime(i);
			}
		}
		return Promise.reject(
			new Error(`Runtime with ID '${runtimeId}' must be registered before ` +
				`it can be restarted.`));
	}

	/**
	 * Handles a comm open message from the language runtime by either creating
	 * a client instance for it or passing it to a registered client handler.
	 *
	 * @param handle The handle of the language runtime
	 * @param message The message to handle
	 */
	private handleCommOpen(handle: number, message: ILanguageRuntimeMessageCommOpen): void {
		// Create a client instance for the comm
		const clientInstance = new ExtHostRuntimeClientInstance(message,
			(id, data) => {
				// Callback to send a message to the runtime
				this._runtimeSessions[handle].sendClientMessage(message.comm_id, id, data);
			},
			() => {
				// Callback to remove the client instance
				this._runtimeSessions[handle].removeClient(message.comm_id);
			});

		// Dispose the client instance when the runtime exits
		this._runtimeSessions[handle].onDidChangeRuntimeState(state => {
			if (state === RuntimeState.Exited) {
				clientInstance.dispose();
			}
		});

		// See if one of the registered client handlers wants to handle this
		for (const handler of this._clientHandlers) {
			// If the client type matches, then call the handler
			if (message.target_name === handler.clientType) {
				// If the handler returns true, then it'll take it from here
				if (handler.callback(clientInstance, message.data)) {
					// Add the client instance to the list
					this._clientInstances.push(clientInstance);
				}
			}
		}

		// Notify the main thread that a client has been opened.
		//
		// Consider: should this event include information on whether a client
		// handler took ownership of the client?
		this._proxy.$emitLanguageRuntimeMessage(handle, message);
	}

	/**
	 * Handles a comm data message from the language runtime
	 *
	 * @param handle The handle of the language runtime
	 * @param message The message to handle
	 */
	private handleCommData(handle: number, message: ILanguageRuntimeMessageCommData): void {
		// Find the client instance
		const clientInstance = this._clientInstances.find(instance =>
			instance.getClientId() === message.comm_id);
		if (clientInstance) {
			clientInstance.emitMessage(message);
		}

		this._proxy.$emitLanguageRuntimeMessage(handle, message);
	}

	/**
	 * Handles a comm closed message from the language runtime
	 *
	 * @param handle The handle of the language runtime
	 * @param message The message to handle
	 */
	private handleCommClosed(handle: number, message: ILanguageRuntimeMessageCommClosed): void {
		// See if this client instance is still active
		const idx = this._clientInstances.findIndex(instance =>
			instance.getClientId() === message.comm_id);
		if (idx >= 0) {
			// If it is, dispose and remove it
			const clientInstance = this._clientInstances[idx];
			clientInstance.dispose();
			this._clientInstances.splice(idx, 1);
		}

		this._proxy.$emitLanguageRuntimeMessage(handle, message);
	}
}
