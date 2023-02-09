/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit Software, PBC.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import * as positron from 'positron';
import * as zmq from 'zeromq/v5-compat';
import * as os from 'os';
import * as fs from 'fs';
import { JupyterSocket } from './JupyterSocket';
import { serializeJupyterMessage } from './JupyterMessageSerializer';
import { deserializeJupyterMessage } from './JupyterMessageDeserializer';
import { EventEmitter } from 'events';
import { JupyterMessageHeader } from './JupyterMessageHeader';
import { JupyterMessage } from './JupyterMessage';
import { JupyterMessageSpec } from './JupyterMessageSpec';
import { JupyterMessagePacket } from './JupyterMessagePacket';
import { JupyterCommOpen } from './JupyterCommOpen';
import { JupyterCommClose } from './JupyterCommClose';
import { v4 as uuidv4 } from 'uuid';
import { JupyterShutdownRequest } from './JupyterShutdownRequest';
import { JupyterInterruptRequest } from './JupyterInterruptRequest';
import { JupyterKernelSpec } from './JupyterKernelSpec';
import { JupyterConnectionSpec } from './JupyterConnectionSpec';
import { JupyterSockets } from './JupyterSockets';
import { JupyterExecuteRequest } from './JupyterExecuteRequest';
import { JupyterInputReply } from './JupyterInputReply';
import { Tail } from 'tail';
import { JupyterCommMsg } from './JupyterCommMsg';
import { createJupyterSession, JupyterSession } from './JupyterSession';

export class JupyterKernel extends EventEmitter implements vscode.Disposable {
	private readonly _spec: JupyterKernelSpec;
	private _process: ChildProcess | null;

	/** A tail file th */
	private _logTail?: Tail;

	/** The kernel's current state */
	private _status: positron.RuntimeState;

	// ZeroMQ sockets ---
	private _control: JupyterSocket | null;
	private _shell: JupyterSocket | null;
	private _stdin: JupyterSocket | null;
	private _iopub: JupyterSocket | null;
	private _heartbeat: JupyterSocket | null;

	/** The LSP port (if the LSP has been started) */
	private _lspClientPort: number | null;

	/**
	 * A map of IDs to pending input requests; used to match up input replies
	 * with the correct request
	 */
	private _inputRequests: Map<string, JupyterMessageHeader> = new Map();

	private _heartbeatTimer: NodeJS.Timeout | null;
	private _lastHeartbeat: number;
	private _session?: JupyterSession;

	constructor(spec: JupyterKernelSpec,
		private readonly _channel: vscode.OutputChannel) {
		super();
		this._spec = spec;
		this._process = null;

		this._control = null;
		this._shell = null;
		this._stdin = null;
		this._iopub = null;
		this._heartbeat = null;
		this._heartbeatTimer = null;
		this._lastHeartbeat = 0;
		this._lspClientPort = null;

		this._status = positron.RuntimeState.Uninitialized;

		// Listen to our own status change events
		this.on('status', (status: positron.RuntimeState) => {
			this.onStatusChange(status);
		});
	}

	/**
	 * Connects to a Jupyter kernel, given the path to the connection JSON file.
	 *
	 * @param connectionJsonPath The path to the connection JSON file
	 */
	public connect(connectionJsonPath: string): void {
		// Create ZeroMQ sockets
		this._control = new JupyterSocket('Control', zmq.socket('dealer'), this._channel);
		this._shell = new JupyterSocket('Shell', zmq.socket('dealer'), this._channel);
		this._stdin = new JupyterSocket('Stdin', zmq.socket('dealer'), this._channel);
		this._iopub = new JupyterSocket('I/O', zmq.socket('sub'), this._channel);
		this._heartbeat = new JupyterSocket('Heartbeat', zmq.socket('req'), this._channel);

		// Create the socket identity for the shell and stdin sockets
		const shellId = Buffer.from('positron-shell', 'utf8');
		this._shell.setZmqIdentity(shellId);
		this._stdin.setZmqIdentity(shellId);

		// Read a JupyterConnectionSpec from the connection file
		const connectionSpec: JupyterConnectionSpec =
			JSON.parse(fs.readFileSync(connectionJsonPath, 'utf8'));

		// Bind the sockets to the ports specified in the connection file
		this._control.connect(connectionSpec.control_port);
		this._shell.connect(connectionSpec.shell_port);
		this._stdin.connect(connectionSpec.stdin_port);
		this._iopub.connect(connectionSpec.iopub_port);
		this._heartbeat.connect(connectionSpec.hb_port);
	}

	/**
	 * Connects to a kernel running in a terminal.
	 *
	 * @param terminal The terminal to connect to
	 */
	private connectToTerminal(terminal: vscode.Terminal): void {
		// When the terminal closes, mark the kernel as exited
		vscode.window.onDidCloseTerminal((closedTerminal) => {
			if (closedTerminal.processId === terminal.processId) {
				if (this._status === positron.RuntimeState.Starting) {
					throw new Error(`${this._spec.display_name} failed to start`);
				} else {
					this.setStatus(positron.RuntimeState.Exited);
					this._channel.appendLine(this._spec.display_name + ' kernel exited');
				}
			}
		});

		this._channel.appendLine(`Connecting to ${this._spec.display_name} kernel (pid ${terminal.processId}})`);

		// Begin streaming the log file, if it exists. We create the log file
		// when we start the kernel, if it has an argument that specifies a log
		// file.
		const logFilePath = this._session!.state.logFile;
		if (fs.existsSync(logFilePath)) {
			this.streamLogFileToChannel(logFilePath, this._spec.language, this._channel);
		}

		this._heartbeat?.socket().once('message', (msg: string) => {

			this._channel.appendLine('Receieved initial heartbeat: ' + msg);
			this.setStatus(positron.RuntimeState.Ready);

			const seconds = vscode.workspace.getConfiguration('positron').get('heartbeat', 30) as number;
			this._channel.appendLine(`Starting heartbeat check at ${seconds} second intervals...`);
			this.heartbeat();
			this._heartbeat?.socket().on('message', (msg: string) => {
				this.onHeartbeat(msg);
			});
		});
		this._heartbeat?.socket().send(['hello']);

		// Subscribe to all topics
		this._iopub?.socket().subscribe('');
		this._iopub?.socket().on('message', (...args: any[]) => {
			const msg = deserializeJupyterMessage(args, this._session!.key, this._channel);
			if (msg !== null) {
				this.emitMessage(JupyterSockets.iopub, msg);
			}
		});
		this._shell?.socket().on('message', (...args: any[]) => {
			const msg = deserializeJupyterMessage(args, this._session!.key, this._channel);
			if (msg !== null) {
				this.emitMessage(JupyterSockets.shell, msg);
			}
		});
		this._stdin?.socket().on('message', (...args: any[]) => {
			const msg = deserializeJupyterMessage(args, this._session!.key, this._channel);
			if (msg !== null) {
				// If this is an input request, save the header so we can
				// can line it up with the client's response.
				if (msg.header.msg_type === 'input_request') {
					this._inputRequests.set(msg.header.msg_id, msg.header);
				}
				this.emitMessage(JupyterSockets.stdin, msg);
			}
		});
	}

	/**
	 * Starts the Jupyter kernel.
	 *
	 * @param lspClientPort The port that the LSP client is listening on, or 0
	 *   if no LSP is started
	 */
	public async start(lspClientPort: number) {

		// Create a new session
		this._session = await createJupyterSession(lspClientPort);
		const connnectionFile = this._session.state.connectionFile;
		const logFile = this._session.state.logFile;

		// Form the command-line arguments to the kernel process
		const args = this._spec.argv.map((arg, _idx) => {
			// Replace {connection_file} with the connection file path
			if (arg === '{connection_file}') {
				return connnectionFile;
			}

			// Replace {log_file} with the log file path. Not all kernels
			// have this argument.
			if (arg === '{log_file}') {
				return logFile;
			}

			return arg;
		}) as Array<string>;

		const command = args.join(' ');

		// Create environment.
		const env = {};
		Object.assign(env, process.env, this._spec.env);

		// We are now starting the kernel
		this.setStatus(positron.RuntimeState.Starting);

		this._channel.appendLine('Starting ' + this._spec.display_name + ' kernel: ' + command + '...');
		if (this._spec.env) {
			this._channel.appendLine('Environment: ' + JSON.stringify(this._spec.env));
		}

		// Use the VS Code terminal API to create a terminal for the kernel
		const terminal = vscode.window.createTerminal(<vscode.TerminalOptions>{
			name: this._spec.display_name,
			shellPath: args[0],
			shellArgs: args.slice(1),
			env,
			message: `** ${this._spec.display_name} **`
			// hideFromUser: true
		});

		vscode.window.onDidOpenTerminal((openedTerminal) => {
			if (openedTerminal.processId === terminal.processId) {
				this.connectToTerminal(openedTerminal);
			}
		});
	}

	/**
	 * Requests that the kernel start a Language Server Protocol server, and
	 * connect it to the client with the given TCP address.
	 *
	 * Note: This is only useful if the kernel hasn't already started an LSP
	 * server.
	 *
	 * @param clientAddress The client's TCP address, e.g. '127.0.0.1:1234'
	 */
	public startLsp(clientAddress: string) {
		// TODO: Should we query the kernel to see if it can create an LSP
		// (QueryInterface style) instead of just demanding it?

		this._channel.appendLine(`Starting LSP server for ${clientAddress}`);

		// Create the message to send to the kernel
		const msg: JupyterCommOpen = {
			target_name: 'Language Server Protocol',  // eslint-disable-line
			comm_id: 'C8C5265A-028C-4A3E-BA3F-D50A28E2B8E4',  // eslint-disable-line
			data: {
				client_address: clientAddress,  // eslint-disable-line
			}
		};
		this.send(uuidv4(), 'comm_open', this._shell!, msg);
	}

	/**
	 * Opens a new communications channel (comm) with the kernel.
	 *
	 * @param targetName The name of the target comm to create.
	 * @param id The ID of the comm to create.
	 * @param data Data to send to the comm.
	 */
	public openComm(targetName: string, id: string, data: any) {
		// Create the message to send to the kernel
		const msg: JupyterCommOpen = {
			target_name: targetName,  // eslint-disable-line
			comm_id: id,  // eslint-disable-line
			data: data
		};

		// Dispatch it
		this.send(uuidv4(), 'comm_open', this._shell!, msg);
	}

	/**
	 * Closes a communications channel (comm) with the kernel.
	 */
	public closeComm(id: string) {
		// Create the message to send to the kernel
		const msg: JupyterCommClose = {
			comm_id: id  // eslint-disable-line
		};

		// Dispatch it
		this.send(uuidv4(), 'comm_close', this._shell!, msg);
	}

	/**
	 * Sends a message to a communications channel (comm) with the kernel.
	 */
	public sendCommMessage(id: string, data: any) {
		// Create the message to send to the kernel
		const msg: JupyterCommMsg = {
			comm_id: id,  // eslint-disable-line
			data: data
		};

		// Dispatch it
		this.send(uuidv4(), 'comm_msg', this._shell!, msg);
	}

	/**
	 * Get the kernel's display name
	 *
	 * @returns The kernel's display name
	 */
	public displayName(): string {
		return this._spec.display_name;
	}

	/**
	 * Gets the kernel's metadata (specification)
	 *
	 * @returns The kernel's metadata
	 */
	public spec(): JupyterKernelSpec {
		return this._spec;
	}

	/**
	 * Get the kernel's current status
	 *
	 * @returns The kernel's current status
	 */
	public status(): positron.RuntimeState {
		return this._status;
	}

	/**
	 * Restarts the kernel
	 */
	public async restart() {

		// Update status
		this.setStatus(positron.RuntimeState.Exiting);

		// Request that the kernel shut down
		this.shutdown(true);

		// Start the kernel again once the process finishes shutting down
		this._process?.once('exit', () => {
			this._channel.appendLine(`Waiting for '${this._spec.display_name}' to restart...`);
			// Start the kernel again, rebinding to the LSP client if we have
			// one
			this.start(this._lspClientPort ?? 0);
		});
	}

	/**
	 * Tells the kernel to shut down
	 */
	public shutdown(restart: boolean) {
		this.setStatus(positron.RuntimeState.Exiting);
		const msg: JupyterShutdownRequest = {
			restart: restart
		};
		this.send(uuidv4(), 'shutdown_request', this._control!, msg);
	}

	/**
	 * Interrupts the kernel
	 */
	public interrupt() {
		this.setStatus(positron.RuntimeState.Interrupting);
		const msg: JupyterInterruptRequest = {};
		this.send(uuidv4(), 'interrupt_request', this._control!, msg);
	}

	/**
	 * Emits a message packet to the webview
	 *
	 * @param socket The socket on which the message was emitted
	 * @param msg The message itself
	 */
	private emitMessage(socket: JupyterSockets, msg: JupyterMessage) {
		const packet: JupyterMessagePacket = {
			type: 'jupyter-message',
			message: msg.content,
			msgId: msg.header.msg_id,
			msgType: msg.header.msg_type,
			when: msg.header.date,
			originId: msg.parent_header ? msg.parent_header.msg_id : '',
			socket: socket
		};
		this._channel.appendLine(`RECV ${msg.header.msg_type} from ${socket}: ${JSON.stringify(msg)}`);
		this.emit('message', packet);
	}

	/**
	 * Executes a fragment of code in the kernel.
	 *
	 * @param code The code to execute.
	 * @param id A client-provided ID for the execution.
	 * @param mode The execution mode.
	 * @param errorBehavior The error behavior.
	 */
	public execute(code: string,
		id: string,
		mode: positron.RuntimeCodeExecutionMode,
		errorBehavior: positron.RuntimeErrorBehavior): void {

		// Create the message to send to the kernel
		const msg: JupyterExecuteRequest = {
			// Pass code to be executed
			code: code,

			// Only allow stdin if we are executing interactively
			allow_stdin: mode !== positron.RuntimeCodeExecutionMode.Silent,

			// Execute silently if requested
			silent: mode === positron.RuntimeCodeExecutionMode.Silent,

			// Don't store history unless we are executing interactively
			store_history: mode === positron.RuntimeCodeExecutionMode.Interactive,

			// Not currently supported
			user_expressions: new Map(),

			// Whether to stop execution on error
			stop_on_error: errorBehavior === positron.RuntimeErrorBehavior.Stop
		};

		// Send the execution request to the kernel
		this.send(id, 'execute_request', this._shell!, msg)
			.catch((err) => {
				// Fail if we couldn't connect to the socket
				this._channel.appendLine(`Failed to send execute_request for ${code} (id ${id}): ${err}`);
			});
	}

	/**
	 * Reply to an input prompt issued by the kernel.
	 *
	 * @param id The ID of the input request
	 * @param value The value to send to the kernel
	 */
	public replyToPrompt(id: string, value: string) {
		// Create the message body
		const msg: JupyterInputReply = {
			value: value
		};

		// Attempt to find the prompt request that we are replying to
		const parent = this._inputRequests.get(id);
		if (parent) {
			// Found it! Send the reply
			this._channel.appendLine(`Sending input reply for ${id}: ${value}`);
			this.sendToSocket(uuidv4(), 'input_reply', this._stdin!, parent, msg);

			// Remove the request from the map now that we've replied
			this._inputRequests.delete(id);
		} else {
			// Couldn't find the request? Send the response anyway; most likely
			// the kernel doesn't care (it is probably waiting for this specific
			// response)
			this._channel.appendLine(`WARN: Failed to find parent for input request ${id}; sending anyway: ${value}`);
			this.send(uuidv4(), 'input_reply', this._stdin!, msg);
		}
	}

	/**
	 * Send a message to the kernel
	 *
	 * @param packet The message package
	 */
	public sendMessage(packet: JupyterMessagePacket) {
		let socket: JupyterSocket | null = null;

		switch (packet.socket) {
			case JupyterSockets.control:
				socket = this._control;
				break;
			case JupyterSockets.heartbeat:
				socket = this._heartbeat;
				break;
			case JupyterSockets.iopub:
				socket = this._iopub;
				break;
			case JupyterSockets.shell:
				socket = this._shell;
				break;
			case JupyterSockets.stdin:
				socket = this._stdin;
				break;
		}

		if (socket === null) {
			this._channel.appendLine(`No socket ${packet.socket} found.`);
			return;
		}

		this.send(packet.msgId, packet.msgType, socket, packet.message);
	}

	public dispose() {
		// If kernel isn't already shut down (or shutting down), shut it down. Note that
		// this must be done before disposing of the sockets, as we need them to send
		// the shutdown request.
		if (this.status() !== positron.RuntimeState.Exiting &&
			this.status() !== positron.RuntimeState.Exited) {
			this._channel.appendLine('Shutting down ' + this._spec.display_name + ' kernel');
			this.shutdown(false);
		}

		// Clean up file watcher for log file
		if (this._logTail) {
			this._logTail.unwatch();
		}

		// Clean up session state (connection and log files)
		if (this._session) {
			this._session.dispose();
		}

		// Close sockets
		this.disposeAllSockets();
	}

	/**
	 * Dispose all sockets
	 */
	private disposeAllSockets() {
		this._control?.dispose();
		this._shell?.dispose();
		this._stdin?.dispose();
		this._heartbeat?.dispose();
		this._iopub?.dispose();

		this._control = null;
		this._shell = null;
		this._stdin = null;
		this._heartbeat = null;
		this._iopub = null;
	}

	private generateMessageHeader(id: string, type: string): JupyterMessageHeader {
		return {
			msg_id: id,            // eslint-disable-line
			msg_type: type,        // eslint-disable-line
			version: '5.0',
			date: (new Date()).toISOString(),
			session: this._session!.sessionId,
			username: os.userInfo().username
		};
	}

	/**
	 * Sends a message to the kernel. Convenience method for messages with no parent
	 * message.
	 *
	 * @param id The unique ID of the message
	 * @param type The type of the message
	 * @param dest The socket to which the message should be sent
	 * @param message The body of the message
	 */
	private send(id: string, type: string, dest: JupyterSocket, message: JupyterMessageSpec): Promise<void> {
		return this.sendToSocket(id, type, dest, {} as JupyterMessageHeader, message);
	}

	/**
	 * Sends a message to the kernel.
	 *
	 * @param id The unique ID of the message
	 * @param type The type of the message
	 * @param dest The socket to which the message should be sent
	 * @param parent The parent message header (if any, {} if no parent)
	 * @param message The body of the message
	 */
	private sendToSocket(id: string, type: string, dest: JupyterSocket, parent: JupyterMessageHeader, message: JupyterMessageSpec): Promise<void> {
		const msg: JupyterMessage = {
			buffers: [],
			content: message,
			header: this.generateMessageHeader(id, type),
			metadata: new Map(),
			parent_header: parent
		};
		this._channel.appendLine(`SEND ${msg.header.msg_type} to ${dest.title()}: ${JSON.stringify(msg)}`);
		return new Promise<void>((resolve, reject) => {
			dest.socket().send(serializeJupyterMessage(msg, this._session!.key), 0, (err) => {
				if (err) {
					this._channel.appendLine(`SEND ${msg.header.msg_type}: ERR: ${err}`);
					reject(err);
				} else {
					this._channel.appendLine(`SEND ${msg.header.msg_type}: OK`);
					resolve();
				}
			});
		});
	}

	/**
	 * Emits a heartbeat message and waits for the kernel to respond.
	 */
	private heartbeat() {
		const seconds = vscode.workspace.getConfiguration('positron').get('heartbeat', 30) as number;
		this._lastHeartbeat = new Date().getUTCMilliseconds();
		this._channel.appendLine(`SEND heartbeat`);
		this._heartbeat?.socket().send(['hello']);
		this._heartbeatTimer = setTimeout(() => {
			// If the kernel hasn't responded in the given amount of time,
			// mark it as offline
			this.setStatus(positron.RuntimeState.Offline);
		}, seconds * 1000);
	}

	/**
	 * Processes a heartbeat message from the kernel.
	 *
	 * @param msg The heartbeat received from the kernel
	 */
	private onHeartbeat(msg: string) {
		// Clear the timer that's tracking the heartbeat
		if (this._heartbeatTimer) {
			clearTimeout(this._heartbeatTimer);
		}

		// If we know how long the kernel took, log it
		if (this._lastHeartbeat) {
			const now = new Date().getUTCMilliseconds();
			const diff = now - this._lastHeartbeat;
			this._channel.appendLine(`Heartbeat received in ${diff}ms: ${msg}`);
		}

		// Schedule the next heartbeat at the configured interval
		const seconds = vscode.workspace.getConfiguration('positron').get('heartbeat', 30) as number;
		setTimeout(() => {
			this.heartbeat();
		}, seconds * 1000);
	}

	/**
	 * Changes the kernel's status
	 *
	 * @param status The new status of the kernel
	 */
	private setStatus(status: positron.RuntimeState) {
		this.emit('status', status);
		this._status = status;
	}

	/**
	 * Processes a kernel status change
	 *
	 * @param status The new status of the kernel
	 */
	private onStatusChange(status: positron.RuntimeState) {
		if (status === positron.RuntimeState.Exited) {
			// Stop checking for heartbeats
			if (this._heartbeatTimer) {
				clearTimeout(this._heartbeatTimer);
				this._heartbeatTimer = null;
			}

			// Dispose all sockets so they don't try to connect to the
			// now-defunct kernel
			this.disposeAllSockets();
		}
	}

	/**
	 * Streams a log file to the output channel
	 */
	private streamLogFileToChannel(logFilePath: string, prefix: string, output: vscode.OutputChannel) {
		output.appendLine('Streaming log file: ' + logFilePath);
		try {
			this._logTail = new Tail(logFilePath, { fromBeginning: true, useWatchFile: true });
		} catch (err) {
			this._channel.appendLine(`Error streaming log file ${logFilePath}: ${err}`);
			return;
		}

		// Establish a listener for new lines in the log file
		this._logTail.on('line', function (data: string) {
			output.appendLine(`[${prefix}] ${data}`);
		});
		this._logTail.on('error', function (error: string) {
			output.appendLine(`[${prefix}] ${error}`);
		});

		// Start watching the log file. This streams output until the kernel is
		// disposed.
		this._logTail.watch();
	}
}
