/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILanguageRuntimeMetadata, LanguageRuntimeSessionMode, ILanguageRuntimeSessionState, RuntimeState, ILanguageRuntimeInfo, ILanguageRuntimeStartupFailure, ILanguageRuntimeExit, ILanguageRuntimeClientCreatedEvent, ILanguageRuntimeMessageOutput, ILanguageRuntimeMessageStream, ILanguageRuntimeMessageInput, ILanguageRuntimeMessageError, ILanguageRuntimeMessagePrompt, ILanguageRuntimeMessageState, RuntimeCodeExecutionMode, RuntimeErrorBehavior, RuntimeCodeFragmentStatus, RuntimeExitReason } from '../../languageRuntime/common/languageRuntimeService';
import { RuntimeClientType, IRuntimeClientInstance } from 'vs/workbench/services/languageRuntime/common/languageRuntimeClientInstance';
import { IRuntimeClientEvent } from 'vs/workbench/services/languageRuntime/common/languageRuntimeUiClient';

export const IRuntimeSessionService = createDecorator<IRuntimeSessionService>('languageRuntimeService');


export interface ILanguageRuntimeGlobalEvent {
	/** The ID of the session from which the event originated */
	session_id: string;

	/** The event itself */
	event: IRuntimeClientEvent;
}

export interface ILanguageRuntimeSessionStateEvent {
	/** The ID of the session that changed states */
	session_id: string;

	/** The runtime's previous state */
	old_state: RuntimeState;

	/** The runtime's new state */
	new_state: RuntimeState;
}

/**
 * The main interface for interacting with a language runtime session.
 */

export interface ILanguageRuntimeSession {
	/** The language runtime's static metadata */
	readonly metadata: ILanguageRuntimeMetadata;

	/** The unique identifier of the session */
	readonly sessionId: string;

	/** A user-friendly name for the session */
	readonly sessionName: string;

	/** The session mode */
	readonly sessionMode: LanguageRuntimeSessionMode;

	/** The language runtime's dynamic metadata */
	dynState: ILanguageRuntimeSessionState;

	/** An object that emits events when the runtime state changes */
	onDidChangeRuntimeState: Event<RuntimeState>;

	/** An object that emits an event when the runtime completes startup */
	onDidCompleteStartup: Event<ILanguageRuntimeInfo>;

	/** An object that emits an event when runtime startup fails */
	onDidEncounterStartupFailure: Event<ILanguageRuntimeStartupFailure>;

	/** An object that emits an event when the runtime exits */
	onDidEndSession: Event<ILanguageRuntimeExit>;

	/**
	 * An object that emits an event when a client instance (comm) is created
	 * from the runtime side. Note that this only fires when an instance is
	 * created from the runtime side; it does not fire when
	 * `createClient` is called from the front end.
	 */
	onDidCreateClientInstance: Event<ILanguageRuntimeClientCreatedEvent>;

	onDidReceiveRuntimeMessageOutput: Event<ILanguageRuntimeMessageOutput>;
	onDidReceiveRuntimeMessageStream: Event<ILanguageRuntimeMessageStream>;
	onDidReceiveRuntimeMessageInput: Event<ILanguageRuntimeMessageInput>;
	onDidReceiveRuntimeMessageError: Event<ILanguageRuntimeMessageError>;
	onDidReceiveRuntimeMessagePrompt: Event<ILanguageRuntimeMessagePrompt>;
	onDidReceiveRuntimeMessageState: Event<ILanguageRuntimeMessageState>;
	onDidReceiveRuntimeClientEvent: Event<IRuntimeClientEvent>;
	onDidReceiveRuntimeMessagePromptConfig: Event<void>;

	/** The current state of the runtime (tracks events above) */
	getRuntimeState(): RuntimeState;

	/**
	 * Opens a resource in the runtime.
	 * @param resource The resource to open.
	 * @returns true if the resource was opened; otherwise, false.
	 */
	openResource(resource: URI | string): Thenable<boolean>;

	/** Execute code in the runtime */
	execute(code: string,
		id: string,
		mode: RuntimeCodeExecutionMode,
		errorBehavior: RuntimeErrorBehavior): void;

	/** Test a code fragment for completeness */
	isCodeFragmentComplete(code: string): Thenable<RuntimeCodeFragmentStatus>;

	/**
	 * Create a new instance of a client; return null if the client type
	 * is not supported by this runtime.
	 *
	 * @param type The type of client to create
	 * @param params The parameters to pass to the client constructor
	 */
	createClient<T, U>(type: RuntimeClientType, params: any): Thenable<IRuntimeClientInstance<T, U>>;

	/** Get a list of all known clients */
	listClients(type?: RuntimeClientType): Thenable<Array<IRuntimeClientInstance<any, any>>>;

	/** Reply to an input prompt that the runtime issued
	 * (via a LanguageRuntimePrompt message)
	 */
	replyToPrompt(id: string, value: string): void;

	start(): Thenable<ILanguageRuntimeInfo>;

	/** Interrupt the runtime */
	interrupt(): void;

	/** Restart the runtime */
	restart(): Thenable<void>;

	/** Shut down the runtime */
	shutdown(exitReason?: RuntimeExitReason): Thenable<void>;

	/** Force quit the runtime */
	forceQuit(): Thenable<void>;

	/** Show output log of the runtime */
	showOutput(): void;
}

/**
 * A manager for runtime sessions.
 */
export interface ILanguageRuntimeSessionManager {
	/**
	 *
	 * @param runtimeMetadata The metadata of the runtime for which a session is
	 *  	to be created.
	 * @param sessionId A unique ID to assign to the new session
	 *
	 * @returns A promise that resolves to the new session.
	 */
	createSession(
		runtimeMetadata: ILanguageRuntimeMetadata,
		sessionId: string,
		sessionName: string,
		sessionMode: LanguageRuntimeSessionMode):
		Promise<ILanguageRuntimeSession>;
}

export interface IRuntimeSessionService {
	// Needed for service branding in dependency injector.
	readonly _serviceBrand: undefined;

	// An event that fires when a runtime session is about to start.
	readonly onWillStartRuntime: Event<ILanguageRuntimeSession>;

	// An event that fires when a runtime session starts.
	readonly onDidStartRuntime: Event<ILanguageRuntimeSession>;

	// An event that fires when a runtime fails to start.
	readonly onDidFailStartRuntime: Event<ILanguageRuntimeSession>;

	// An event that fires when a runtime is reconnected.
	readonly onDidReconnectRuntime: Event<ILanguageRuntimeSession>;

	// An event that fires when a runtime changes state.
	readonly onDidChangeRuntimeState: Event<ILanguageRuntimeSessionStateEvent>;

	// An event that fires when a runtime receives a global event.
	readonly onDidReceiveRuntimeEvent: Event<ILanguageRuntimeGlobalEvent>;

	// An event that fires when the active runtime changes.
	readonly onDidChangeForegroundSession: Event<ILanguageRuntimeSession | undefined>;

	/**
	 * Gets the active runtime sessions
	 */
	readonly activeSessions: ILanguageRuntimeSession[];

	/**
	 * Register a session manager. Used only once, by the extension host.
	 */
	registerSessionManager(manager: ILanguageRuntimeSessionManager): void;

	/**
	 * Gets a specific runtime session by session identifier.
	 */
	getSession(sessionId: string): ILanguageRuntimeSession | undefined;

	/**
	 * Gets a specific runtime console by runtime identifier. Currently, only
	 * one console can exist per runtime ID.
	 */
	getConsoleSessionForRuntime(runtimeId: string): ILanguageRuntimeSession | undefined;

	/**
	 * Gets a specific runtime console by language identifier. Currently, only
	 * one console can exist per language ID.
	 */
	getConsoleSessionForLanguage(languageId: string): ILanguageRuntimeSession | undefined;

	/**
	 * Checks for a starting or running console for the given language ID.
	 *
	 * @param languageId The language ID to check for; if undefined, checks for
	 * 	any starting or running console.
	 */
	hasStartingOrRunningConsole(languageId?: string | undefined): boolean;

	/**
	 * Gets or sets the active foreground runtime session, if any.
	 */
	foregroundSession: ILanguageRuntimeSession | undefined;

	/**
	 * Starts a new session for a runtime. Use to start a new runtime at the
	 * behest of a user gesture.
	 *
	 * @param runtimeId The runtime identifier of the runtime to start.
	 * @param sessionName A human-readable (displayed) name for the session to start.
	 * @param sessionMode The mode of the session to start.
	 * @param source The source of the request to start the runtime, for debugging purposes
	 *  (not displayed to the user)
	 *
	 * Returns a promise that resolves to the session ID of the new session.
	 */
	startNewRuntimeSession(runtimeId: string,
		sessionName: string,
		sessionMode: LanguageRuntimeSessionMode,
		source: string): Promise<string>;

	/**
	 * Automatically starts a runtime. Use when starting a runtime automatically
	 * or implicitly.
	 *
	 * @param runtime The runtime to start.
	 * @param source The source of the request to start the runtime.
	 *
	 * @returns A promise that resolves with a session ID for the new session,
	 * if one was started.
	 */
	autoStartRuntime(metadata: ILanguageRuntimeMetadata, source: string): Promise<string>;

	/**
	 * Restart a runtime session.
	 *
	 * @param sessionId The identifier of the session to restart.
	 * @param source The source of the request to restart the session, for debugging purposes.
	 */
	restartRuntime(sessionId: string, source: string): Promise<void>;

}

export { RuntimeClientType, IRuntimeClientInstance };
