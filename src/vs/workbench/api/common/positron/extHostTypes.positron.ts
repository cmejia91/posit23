/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The set of possible statuses for a language runtime
 */
export enum RuntimeState {
	/** The runtime has not been started or initialized yet. */
	Uninitialized = 'uninitialized',

	/** The runtime is initializing (preparing to start). */
	Initializing = 'initializing',

	/** The runtime is in the process of starting up. It isn't ready for messages. */
	Starting = 'starting',

	/** The runtime has a heartbeat and is ready for messages. */
	Ready = 'ready',

	/** The runtime is ready to execute code. */
	Idle = 'idle',

	/** The runtime is busy executing code. */
	Busy = 'busy',

	/** The runtime is in the process of restarting. */
	Restarting = 'restarting',

	/** The runtime is in the process of shutting down. */
	Exiting = 'exiting',

	/** The runtime's host process has ended. */
	Exited = 'exited',

	/** The runtime is not responding to heartbeats and is presumed offline. */
	Offline = 'offline',

	/** The user has interrupted a busy runtime, but the runtime is not idle yet. */
	Interrupting = 'interrupting',
}


/** Possible states for the language runtime while online */
export enum RuntimeOnlineState {
	/** The runtime is starting up */
	Starting = 'starting',

	/** The runtime is currently processing an instruction or code fragment */
	Busy = 'busy',

	/** The runtime is idle */
	Idle = 'idle',
}

/** The set of possible language runtime messages */
export enum LanguageRuntimeMessageType {
	/** A message representing output (text, plots, etc.) */
	Output = 'output',

	/** A message representing the computational result of a runtime execution */
	Result = 'result',

	/** A message representing output from one of the standard streams (stdout or stderr) */
	Stream = 'stream',

	/** A message representing echoed user input */
	Input = 'input',

	/** A message representing an error that occurred while executing user code */
	Error = 'error',

	/** A message representing a prompt for user input */
	Prompt = 'prompt',

	/** A message representing a change in the runtime's online state */
	State = 'state',

	/** A message representing a runtime event */
	Event = 'event',

	/** A message representing a new comm (client instance) being opened from the rutime side */
	CommOpen = 'comm_open',

	/** A message representing data received via a comm */
	CommData = 'comm_data',

	/** A message indicating that a comm (client instance) was closed from the server side */
	CommClosed = 'comm_closed',
}

/**
 * LanguageRuntimeSessionMode is an enum representing the set of possible
 * modes for a language runtime session.
 */
export enum LanguageRuntimeSessionMode {
	/**
	 * The runtime session is bound to a Positron console. Typically,
	 * there's only one console session per language.
	 */
	Console = 'console',

	/** The runtime session backs a notebook. */
	Notebook = 'notebook',

	/** The runtime session is a background session (not attached to any UI). */
	Background = 'background',
}

/**
 * The set of stand stream names supported for streaming textual output.
 */
export enum LanguageRuntimeStreamName {
	Stdout = 'stdout',
	Stderr = 'stderr'
}

/**
 * Results of analyzing code fragment for completeness
 */
export enum RuntimeCodeFragmentStatus {
	/** The code fragment is complete: it is a valid, self-contained expression */
	Complete = 'complete',

	/** The code is incomplete: it is an expression that is missing elements or operands, such as "1 +" or "foo(" */
	Incomplete = 'incomplete',

	/** The code is invalid: an expression that cannot be parsed because of a syntax error */
	Invalid = 'invalid',

	/** It was not possible to ascertain the code fragment's status */
	Unknown = 'unknown'
}

/**
 * The set of possible output locations for a LanguageRuntimeWebOutput.
 */
export enum PositronOutputLocation {
	/** The output should be displayed inline in Positron's Console */
	Console = 'console',

	/** The output should be displayed in Positron's Viewer pane */
	Viewer = 'viewer',

	/** The output should be displayed in Positron's Plots pane */
	Plot = 'plot',
}

/**
 * The set of client types that can be generated by a language runtime. Note
 * that, because client types can share a namespace with other kinds of
 * widgets, each client type in Positron's API is prefixed with the string
 * "positron".
 */
export enum RuntimeClientType {
	Variables = 'positron.variables',
	Lsp = 'positron.lsp',
	Dap = 'positron.dap',
	Plot = 'positron.plot',
	DataExplorer = 'positron.dataExplorer',
	Ui = 'positron.ui',
	Help = 'positron.help',
	Connection = 'positron.connection',
	IPyWidget = 'jupyter.widget',
	IPyWidgetControl = 'jupyter.widget.control',

	// Future client types may include:
	// - Watch window/variable explorer
	// - Code inspector
	// - etc.
}

/**
 * The possible states for a language runtime client instance. These
 * represent the state of the communications channel between the client and
 * the runtime.
 */
export enum RuntimeClientState {
	/** The client has not yet been initialized */
	Uninitialized = 'uninitialized',

	/** The connection between the server and the client is being opened */
	Opening = 'opening',

	/** The connection between the server and the client has been established */
	Connected = 'connected',

	/** The connection between the server and the client is being closed */
	Closing = 'closing',

	/** The connection between the server and the client is closed */
	Closed = 'closed',
}

/**
 * Possible code execution modes for a language runtime
 */
export enum RuntimeCodeExecutionMode {
	/** The code was entered interactively, and should be executed and stored in the runtime's history. */
	Interactive = 'interactive',

	/** The code should be executed but not stored in history. */
	Transient = 'transient',

	/** The code execution should be fully silent, neither displayed to the user nor stored in history. */
	Silent = 'silent'
}

/**
 * Possible error dispositions for a language runtime
 */
export enum RuntimeErrorBehavior {
	/** The runtime should stop when an error is encountered. */
	Stop = 'stop',

	/** The runtime should continue execution when an error is encountered */
	Continue = 'continue',
}

/**
 * Possible reasons a language runtime could exit.
 */
export enum RuntimeExitReason {
	/** The runtime exited because it could not start correctly. */
	StartupFailed = 'startupFailed',

	/** The runtime is shutting down at the request of the user. */
	Shutdown = 'shutdown',

	/** The runtime exited because it was forced to quit. */
	ForcedQuit = 'forcedQuit',

	/** The runtime is exiting in order to restart. */
	Restart = 'restart',

	/** The runtime is exiting in order to switch to a new runtime. */
	SwitchRuntime = 'switchRuntime',

	/** The runtime exited because of an error, most often a crash. */
	Error = 'error',

	/** The runtime exited because the extension hosting it was stopped. */
	ExtensionHost = 'extensionHost',

	/**
	 * The runtime exited for an unknown reason. This typically means that
	 * it exited unexpectedly but with a normal exit code (0).
	 */
	Unknown = 'unknown',
}

/**
 * An enum representing the set of runtime method error codes; these map to
 * JSON-RPC error codes.
 */
export enum RuntimeMethodErrorCode {
	ParseError = -32700,
	InvalidRequest = -32600,
	MethodNotFound = -32601,
	InvalidParams = -32602,
	InternalError = -32603,
	ServerErrorStart = -32000,
	ServerErrorEnd = -32099
}

export enum LanguageRuntimeStartupBehavior {
	/**
	 * The runtime should be started immediately after registration; usually used for runtimes
	 * that are affiliated with the current workspace.
	 */
	Immediate = 'immediate',

	/**
	 * The runtime should start automatically; usually used for runtimes that provide LSPs
	 */
	Implicit = 'implicit',

	/**
	 * The runtime should start when the user explicitly requests it;
	 * usually used for runtimes that only provide REPLs
	 */
	Explicit = 'explicit',
}

/**
 * An enumeration of possible locations for runtime sessions.
 */
export enum LanguageRuntimeSessionLocation {
	/**
	 * The runtime session is located in the current workspace (usually a
	 * terminal); it should be restored when the workspace is re-opened.
	 */
	Workspace = 'workspace',

	/**
	 * The runtime session is browser-only; it should not be restored when the
	 * workspace is re-opened.
	 */
	Browser = 'browser',
}
