/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import * as positron from 'positron';
import { MakeSGR, SGR } from './ansi';
import * as ansi from 'ansi-escape-sequences';

/**
 * Constants.
 */
export const ESC = '\x1b';
export const CSI = ESC + '[';

const TEN_SPACES = '          ';
const TEN_BLOCKS = '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588';
const FIVE_SPACES = '     ';
const FIVE_BLOCKS = '\u2588\u2588\u2588\u2588\u2588';
const CONTRAST_FOREGROUND = '  Contrast Foreground  ';
/**
 * The help lines.
 */
const HelpLines = [
	'Zed help:',
	'',
	'ansi 16     - Displays standard ANSI colors as foreground and background colors',
	'ansi 256    - Displays indexed ANSI colors as foreground and background colors',
	'ansi rgb    - Displays RGB ANSI colors as foreground and background colors',
	'code X Y    - Simulates a successful X line input with Y lines of output (where X >= 1 and Y >= 0)',
	'error X Y Z - Simulates an unsuccessful X line input with Y lines of error message and Z lines of traceback (where X >= 1 and Y >= 1 and Z >= 0)',
	'help        - Shows this help',
	'offline     - Simulates going offline for two seconds',
	'progress    - Renders a progress bar',
	'shutdown    - Simulates orderly shutdown',
	'version     - Shows the Zed version'
].join('\n');

/**
 * Returns a right-aligned three digit decimal value.
 * @param value The value (must be between 0 and 255).
 * @returns The right-right-aligned three digit decimal value such that:
 *   1 = '   1 ' and
 * 255 = ' 255 '.
 */
const rightAlignedThreeDigitDecimal = (value: number) => {
	if (value < 0 && value > 255) {
		return ' ??? ';
	} else {
		// Return the value right aligned to three places.
		const decimal = value.toString(10);
		if (decimal.length === 1) {
			return `   ${decimal} `;
		} else if (decimal.length === 2) {
			return `  ${decimal} `;
		} else {
			return ` ${decimal} `;
		}
	}
};

/**
 * PositronZedLanguageRuntime.
 */
export class PositronZedLanguageRuntime implements positron.LanguageRuntime {
	//#region Private Properties

	/**
	 * The onDidReceiveRuntimeMessage event emitter.
	 */
	private readonly _onDidReceiveRuntimeMessage = new vscode.EventEmitter<positron.LanguageRuntimeMessage>();

	/**
	 * The onDidChangeRuntimeState event emitter.
	 */
	private readonly _onDidChangeRuntimeState = new vscode.EventEmitter<positron.RuntimeState>();

	/**
	 * A history of executed commands
	 */
	private readonly _history: string[][] = [];

	//#endregion Private Properties

	//#region Constructor

	/**
	 * Constructor.
	 * @param runtimeId The ID for the new runtime
	 * @param version The language version.
	 */
	constructor(runtimeId: string, version: string) {
		this.metadata = {
			runtimeId,
			languageId: 'zed',
			languageName: 'Zed',
			runtimeName: 'Zed',
			languageVersion: version,
			runtimeVersion: '0.0.1',
			startupBehavior: positron.LanguageRuntimeStartupBehavior.Implicit
		};
	}

	//#endregion Constructor

	//#region LanguageRuntime Implementation

	/**
	 * Gets the metadata for the language runtime.
	 */
	readonly metadata: positron.LanguageRuntimeMetadata;

	/**
	 * An object that emits language runtime events.
	 */
	onDidReceiveRuntimeMessage: vscode.Event<positron.LanguageRuntimeMessage> = this._onDidReceiveRuntimeMessage.event;

	/**
	 * An object that emits he current state of the runtime.
	 */
	onDidChangeRuntimeState: vscode.Event<positron.RuntimeState> = this._onDidChangeRuntimeState.event;

	/**
	 * Execute code in the runtime.
	 * @param code The code to exeucte.
	 * @param id The ID of the operation.
	 * @param mode The execution mode to conform to.
	 * @param errorBehavior The error behavior to conform to.
	 */
	execute(code: string, id: string, mode: positron.RuntimeCodeExecutionMode, errorBehavior: positron.RuntimeErrorBehavior): void {
		// Trim the code.
		code = code.trim();

		// Check for commands by regex.
		let match;
		if (match = code.match(/^code ([1-9]{1}[\d]*) ([\d]+)$/)) {
			// Build the code.
			let code = '';
			for (let i = 1; i <= +match[1]; i++) {
				code += `Code line ${i}\n`;
			}

			// Build the output.
			const output = '';
			for (let i = 1; i <= +match[2]; i++) {
				code += `Output line ${i}\n`;
			}

			// Simulate successful code execution.
			return this.simulateSuccessfulCodeExecution(id, code, output);
		} else if (match = code.match(/^error ([1-9]{1}[\d]*) ([1-9]{1}[\d]*) ([\d]+)$/)) {
			// Build the code.
			let code = '';
			for (let i = 1; i <= +match[1]; i++) {
				code += `Code line ${i}\n`;
			}

			// Build the message.
			let message = '';
			for (let i = 1; i <= +match[2]; i++) {
				message += `Error message line ${i}\n`;
			}

			// Build the traceback.
			const traceback: string[] = [];
			for (let i = 1; i <= +match[3]; i++) {
				traceback.push(`Traceback line ${i}`);
			}

			// Simulate unsuccessful code execution.
			return this.simulateUnsuccessfulCodeExecution(id, code, 'Simulated Error', message, traceback);
		}

		// Process the "code".
		switch (code) {
			case '':
				this.simulateSuccessfulCodeExecution(id, code);
				break;

			case 'ansi 16':
				this.simulateSuccessfulCodeExecution(id, code,
					`Standard ANSI foreground colors:\n` +
					`${MakeSGR(SGR.ForegroundBlack)}${TEN_BLOCKS}${MakeSGR()} Black foreground\n` +
					`${MakeSGR(SGR.ForegroundRed)}${TEN_BLOCKS}${MakeSGR()} Red foreground\n` +
					`${MakeSGR(SGR.ForegroundGreen)}${TEN_BLOCKS}${MakeSGR()} Green foreground\n` +
					`${MakeSGR(SGR.ForegroundYellow)}${TEN_BLOCKS}${MakeSGR()} Yellow foreground\n` +
					`${MakeSGR(SGR.ForegroundBlue)}${TEN_BLOCKS}${MakeSGR()} Blue foreground\n` +
					`${MakeSGR(SGR.ForegroundMagenta)}${TEN_BLOCKS}${MakeSGR()} Magenta foreground\n` +
					`${MakeSGR(SGR.ForegroundCyan)}${TEN_BLOCKS}${MakeSGR()} Cyan foreground\n` +
					`${MakeSGR(SGR.ForegroundWhite)}${TEN_BLOCKS}${MakeSGR()} White foreground\n` +

					`\nBright ANSI foreground colors:\n` +
					`${MakeSGR(SGR.ForegroundBrightBlack)}${TEN_BLOCKS}${MakeSGR()} Bright black foreground\n` +
					`${MakeSGR(SGR.ForegroundBrightRed)}${TEN_BLOCKS}${MakeSGR()} Bright red foreground\n` +
					`${MakeSGR(SGR.ForegroundBrightGreen)}${TEN_BLOCKS}${MakeSGR()} Bright green foreground\n` +
					`${MakeSGR(SGR.ForegroundBrightYellow)}${TEN_BLOCKS}${MakeSGR()} Bright yellow foreground \n` +
					`${MakeSGR(SGR.ForegroundBrightBlue)}${TEN_BLOCKS}${MakeSGR()} Bright blue foreground\n` +
					`${MakeSGR(SGR.ForegroundBrightMagenta)}${TEN_BLOCKS}${MakeSGR()} Bright magenta foreground\n` +
					`${MakeSGR(SGR.ForegroundBrightCyan)}${TEN_BLOCKS}${MakeSGR()} Bright cyan foreground\n` +
					`${MakeSGR(SGR.ForegroundBrightWhite)}${TEN_BLOCKS}${MakeSGR()} Bright white foreground\n` +

					`\nStandard ANSI background colors:\n` +
					`${MakeSGR(SGR.BackgroundBlack)}${TEN_SPACES}${MakeSGR()} Black background\n` +
					`${MakeSGR(SGR.BackgroundRed)}${TEN_SPACES}${MakeSGR()} Red background\n` +
					`${MakeSGR(SGR.BackgroundGreen)}${TEN_SPACES}${MakeSGR()} Green background\n` +
					`${MakeSGR(SGR.BackgroundYellow)}${TEN_SPACES}${MakeSGR()} Yellow background\n` +
					`${MakeSGR(SGR.BackgroundBlue)}${TEN_SPACES}${MakeSGR()} Blue background\n` +
					`${MakeSGR(SGR.BackgroundMagenta)}${TEN_SPACES}${MakeSGR()} Magenta background\n` +
					`${MakeSGR(SGR.BackgroundCyan)}${TEN_SPACES}${MakeSGR()} Cyan background\n` +
					`${MakeSGR(SGR.BackgroundWhite)}${TEN_SPACES}${MakeSGR()} White background\n` +

					`\nBright ANSI background colors:\n` +
					`${MakeSGR(SGR.BackgroundBrightBlack)}${TEN_SPACES}${MakeSGR()} Bright black background\n` +
					`${MakeSGR(SGR.BackgroundBrightRed)}${TEN_SPACES}${MakeSGR()} Bright red background\n` +
					`${MakeSGR(SGR.BackgroundBrightGreen)}${TEN_SPACES}${MakeSGR()} Bright green background\n` +
					`${MakeSGR(SGR.BackgroundBrightYellow)}${TEN_SPACES}${MakeSGR()} Bright yellow background\n` +
					`${MakeSGR(SGR.BackgroundBrightBlue)}${TEN_SPACES}${MakeSGR()} Bright blue background\n` +
					`${MakeSGR(SGR.BackgroundBrightMagenta)}${TEN_SPACES}${MakeSGR()} Bright magenta background\n` +
					`${MakeSGR(SGR.BackgroundBrightCyan)}${TEN_SPACES}${MakeSGR()} Bright cyan background\n` +
					`${MakeSGR(SGR.BackgroundBrightWhite)}${TEN_SPACES}${MakeSGR()} Bright white background\n` +

					`\nStandard ANSI background colors with automatically contrasting foreground colors:\n` +
					`${MakeSGR(SGR.BackgroundBlack)}${CONTRAST_FOREGROUND}${MakeSGR()} Black background\n` +
					`${MakeSGR(SGR.BackgroundRed)}${CONTRAST_FOREGROUND}${MakeSGR()} Red background\n` +
					`${MakeSGR(SGR.BackgroundGreen)}${CONTRAST_FOREGROUND}${MakeSGR()} Green background\n` +
					`${MakeSGR(SGR.BackgroundYellow)}${CONTRAST_FOREGROUND}${MakeSGR()} Yellow background\n` +
					`${MakeSGR(SGR.BackgroundBlue)}${CONTRAST_FOREGROUND}${MakeSGR()} Blue background\n` +
					`${MakeSGR(SGR.BackgroundMagenta)}${CONTRAST_FOREGROUND}${MakeSGR()} Magenta background\n` +
					`${MakeSGR(SGR.BackgroundCyan)}${CONTRAST_FOREGROUND}${MakeSGR()} Cyan background\n` +
					`${MakeSGR(SGR.BackgroundWhite)}${CONTRAST_FOREGROUND}${MakeSGR()} White background\n` +

					`\nBright ANSI background colors with automatically contrasting foreground colors:\n` +
					`${MakeSGR(SGR.BackgroundBrightBlack)}${CONTRAST_FOREGROUND}${MakeSGR()} Bright black background\n` +
					`${MakeSGR(SGR.BackgroundBrightRed)}${CONTRAST_FOREGROUND}${MakeSGR()} Bright red background\n` +
					`${MakeSGR(SGR.BackgroundBrightGreen)}${CONTRAST_FOREGROUND}${MakeSGR()} Bright green background\n` +
					`${MakeSGR(SGR.BackgroundBrightYellow)}${CONTRAST_FOREGROUND}${MakeSGR()} Bright yellow background\n` +
					`${MakeSGR(SGR.BackgroundBrightBlue)}${CONTRAST_FOREGROUND}${MakeSGR()} Bright blue background\n` +
					`${MakeSGR(SGR.BackgroundBrightMagenta)}${CONTRAST_FOREGROUND}${MakeSGR()} Bright magenta background\n` +
					`${MakeSGR(SGR.BackgroundBrightCyan)}${CONTRAST_FOREGROUND}${MakeSGR()} Bright cyan background\n` +
					`${MakeSGR(SGR.BackgroundBrightWhite)}${CONTRAST_FOREGROUND}${MakeSGR()} Bright white background\n`
				);
				break;

			case 'ansi 256': {
				let output = 'Foreground colors:\n';
				for (let i = 0; i < 16; i++) {
					for (let j = 0; j < 16; j++) {
						const colorIndex = i * 16 + j;
						output += `${rightAlignedThreeDigitDecimal(colorIndex)} `;
					}
					output += '\n';
					for (let j = 0; j < 16; j++) {
						const colorIndex = i * 16 + j;
						output += `${MakeSGR(SGR.SetForeground, 5, colorIndex)}${FIVE_BLOCKS}${MakeSGR()} `;
					}
					output += '\n';
				}

				output += '\nBackground colors:\n';

				for (let i = 0; i < 16; i++) {
					for (let j = 0; j < 16; j++) {
						const colorIndex = i * 16 + j;
						output += `${rightAlignedThreeDigitDecimal(colorIndex)} `;
					}
					output += '\n';
					for (let j = 0; j < 16; j++) {
						const colorIndex = i * 16 + j;
						output += `${MakeSGR(SGR.SetBackground, 5, colorIndex)}${FIVE_SPACES}${MakeSGR()} `;
					}
					output += '\n';
				}
				this.simulateSuccessfulCodeExecution(id, code, output);
				break;
			}

			case 'ansi rgb': {
				this.simulateSuccessfulCodeExecution(id, code,
					`${MakeSGR(SGR.SetForeground, 2, 0xdd, 0x00, 0x00)}${TEN_BLOCKS}${MakeSGR()} Red Foreground\n` +
					`${MakeSGR(SGR.SetForeground, 2, 0xfe, 0x62, 0x30)}${TEN_BLOCKS}${MakeSGR()} Orange Foreground\n` +
					`${MakeSGR(SGR.SetForeground, 2, 0xfe, 0xf6, 0x00)}${TEN_BLOCKS}${MakeSGR()} Yellow Foreground\n` +
					`${MakeSGR(SGR.SetForeground, 2, 0x00, 0xbb, 0x00)}${TEN_BLOCKS}${MakeSGR()} Green Foreground\n` +
					`${MakeSGR(SGR.SetForeground, 2, 0x00, 0x9b, 0xfe)}${TEN_BLOCKS}${MakeSGR()} Blue Foreground\n` +
					`${MakeSGR(SGR.SetForeground, 2, 0x00, 0x00, 0x83)}${TEN_BLOCKS}${MakeSGR()} Indigo Foreground\n` +
					`${MakeSGR(SGR.SetForeground, 2, 0x30, 0x00, 0x9b)}${TEN_BLOCKS}${MakeSGR()} Violet Foreground\n` +
					`${MakeSGR(SGR.SetBackground, 2, 0xdd, 0x00, 0x00)}${TEN_SPACES}${MakeSGR()} Red Background\n` +
					`${MakeSGR(SGR.SetBackground, 2, 0xfe, 0x62, 0x30)}${TEN_SPACES}${MakeSGR()} Orange Background\n` +
					`${MakeSGR(SGR.SetBackground, 2, 0xfe, 0xf6, 0x00)}${TEN_SPACES}${MakeSGR()} Yellow Background\n` +
					`${MakeSGR(SGR.SetBackground, 2, 0x00, 0xbb, 0x00)}${TEN_SPACES}${MakeSGR()} Green Background\n` +
					`${MakeSGR(SGR.SetBackground, 2, 0x00, 0x9b, 0xfe)}${TEN_SPACES}${MakeSGR()} Blue Background\n` +
					`${MakeSGR(SGR.SetBackground, 2, 0x00, 0x00, 0x83)}${TEN_SPACES}${MakeSGR()} Indigo Background\n` +
					`${MakeSGR(SGR.SetBackground, 2, 0x30, 0x00, 0x9b)}${TEN_SPACES}${MakeSGR()} Violet Background\n`
				);
				break;
			}

			case 'help':
				this.simulateSuccessfulCodeExecution(id, code, HelpLines);
				break;

			case 'offline':
				this.simulateOffline();
				break;

			case 'progress':
				this.simulateProgressBar(id, code);
				break;

			case 'shutdown':
				this.shutdown();
				break;

			case 'version':
				this.simulateSuccessfulCodeExecution(id, code, `Zed v${this.metadata.languageVersion} (${this.metadata.runtimeId})`);
				break;

			default:
				this.simulateUnsuccessfulCodeExecution(id, code, 'Unknown Command', `Error. '${code}' not recognized.\n`, []);
				break;
		}
	}

	/**
	 * Tests a code fragment to see if it's complete.
	 * @param code The code to test for completeness.
	 * @returns A Thenable that resolves with the status of the code fragment.
	 */
	isCodeFragmentComplete(code: string): Thenable<positron.RuntimeCodeFragmentStatus> {
		const parentId = randomUUID();
		this.simulateBusyState(parentId);
		this.simulateIdleState(parentId);
		return Promise.resolve(positron.RuntimeCodeFragmentStatus.Complete);
	}

	/**
	 * Create a new instance of a client.
	 * @param type The runtime client type.
	 */
	createClient(type: positron.RuntimeClientType): Promise<string> {
		return Promise.reject('Method not implemented.');
	}

	/**
	 * Removes an instance of a client.
	 */
	removeClient(id: string): void {
		throw new Error('Method not implemented.');
	}

	/**
	 * Send a message to the client instance.
	 * @param id The ID of the message.
	 * @param message The message.
	 */
	sendClientMessage(id: string, message: any): void {
		throw new Error('Method not implemented.');
	}

	/**
	 * Replies to a prompt issued by the runtime.
	 * @param id The ID of the prompt.
	 * @param reply The reply of the prompt.
	 */
	replyToPrompt(id: string, reply: string): void {
		throw new Error('Method not implemented.');
	}

	/**
	 * Starts the runtime; returns a Thenable that resolves with information about the runtime.
	 * @returns A Thenable that resolves with information about the runtime
	 */
	start(): Promise<positron.LanguageRuntimeInfo> {
		// Zed 0.98.0 always fails to start.
		if (this.metadata.runtimeId === '00000000-0000-0000-0000-000000000098') {
			this._onDidChangeRuntimeState.fire(positron.RuntimeState.Uninitialized);
			this._onDidChangeRuntimeState.fire(positron.RuntimeState.Initializing);
			this._onDidChangeRuntimeState.fire(positron.RuntimeState.Starting);
			this.simulateErrorMessage(randomUUID(), 'StartupFailed', 'Startup failed');
			this._onDidChangeRuntimeState.fire(positron.RuntimeState.Exiting);
			this._onDidChangeRuntimeState.fire(positron.RuntimeState.Exited);
			return Promise.reject('Failure');
		}

		// Fire state changes.
		this._onDidChangeRuntimeState.fire(positron.RuntimeState.Uninitialized);
		this._onDidChangeRuntimeState.fire(positron.RuntimeState.Initializing);
		this._onDidChangeRuntimeState.fire(positron.RuntimeState.Starting);
		this._onDidChangeRuntimeState.fire(positron.RuntimeState.Ready);

		// A lot of the time, a real runtime goes busy and then idle after it starts.
		setTimeout(() => {
			const parentId = randomUUID();
			this.simulateBusyState(parentId);
			this.simulateIdleState(parentId);
		}, 100);

		// Done.
		return Promise.resolve({
			banner: `${MakeSGR(SGR.ForegroundBlue)}Zed ${this.metadata.languageVersion}${MakeSGR(SGR.Reset)}\nThis is the ${MakeSGR(SGR.ForegroundGreen)}Zed${MakeSGR(SGR.Reset)} test language.\n\nEnter 'help' for help.\n`,
			implementation_version: this.metadata.runtimeVersion,
			language_version: this.metadata.languageVersion,
		} as positron.LanguageRuntimeInfo);
	}

	/**
	 * Interrupts the runtime.
	 */
	interrupt(): void {
		throw new Error('Method not implemented.');
	}

	/**
	 * Restarts the runtime.
	 */
	restart(): void {
		throw new Error('Method not implemented.');
	}

	/**
	 * Shuts down the runtime.
	 */
	shutdown(): void {
		// Simulate the busy/idle that happens first.
		const parentId = randomUUID();
		this.simulateBusyState(parentId);
		this.simulateIdleState(parentId);
		this._onDidChangeRuntimeState.fire(positron.RuntimeState.Exiting);
		this.simulateOutputMessage(parentId, 'Zed Kernel exiting.');
		this._onDidChangeRuntimeState.fire(positron.RuntimeState.Exited);
	}

	//#endregion LanguageRuntime Implementation

	//#region Private Methods

	/**
	 * Simulates going offline for two seconds.
	 */
	private simulateOffline() {
		// Change state to offline.
		this._onDidChangeRuntimeState.fire(positron.RuntimeState.Offline);

		// Change state back to online after two seconds.
		setTimeout(() => {
			this._onDidChangeRuntimeState.fire(positron.RuntimeState.Ready);
		}, 2000);
	}

	/**
	 * Simulates a progress bar.
	 * @param parentId The parent identifier.
	 * @param code The code.
	 */
	private simulateProgressBar(parentId: string, code: string) {
		// Start the progress bar simulation.
		this.simulateBusyState(parentId);
		this.simulateInputMessage(parentId, code);
		this.simulateOutputMessage(parentId, 'Starting long running task');

		// After a tingle of delay, output the progress bar.
		setTimeout(() => {
			// Simulate the progress bar in 100 50ms intervals.
			let progress = 0;
			const interval = setInterval(() => {
				// Simulate progress - (need to add ANSI escapes)
				this.simulateOutputMessage(parentId, `Progress ${++progress}%`);

				// When the progress bar reaches 100%, clear the interval.
				if (progress === 100) {
					clearInterval(interval);
				}
			}, 50);

			// End the progress bar.
			this.simulateOutputMessage(parentId, 'Long running task is complete');
			this.simulateIdleState(parentId);
		}, 500);
	}

	/**
	 * Simulates successful code execution.
	 * @param parentId The parent ID.
	 * @param code The code.
	 * @param output The optional output from the code.
	 */
	private simulateSuccessfulCodeExecution(parentId: string, code: string, output: string | undefined = undefined) {
		this.simulateBusyState(parentId);
		this.simulateInputMessage(parentId, code);
		this._history.push([code, output || '']);
		if (output) {
			this.simulateOutputMessage(parentId, output);
		}
		this.simulateIdleState(parentId);
	}

	/**
	 * Simulates unsuccessful code execution.
	 * @param parentId The parent ID.
	 * @param code The code.
	 * @param name The error name.
	 * @param message The error message.
	 * @param traceback The error traceback.
	 */
	private simulateUnsuccessfulCodeExecution(parentId: string, code: string, name: string, message: string, traceback: string[]) {
		this.simulateBusyState(parentId);
		this.simulateInputMessage(parentId, code);
		this.simulateErrorMessage(parentId, name, message, traceback);
		this.simulateIdleState(parentId);
	}

	/**
	 * Simulates transitioning to the busy state.
	 * @param parentId The parent identifier.
	 */
	private simulateBusyState(parentId: string) {
		this._onDidReceiveRuntimeMessage.fire({
			id: randomUUID(),
			parent_id: parentId,
			when: new Date().toISOString(),
			type: positron.LanguageRuntimeMessageType.State,
			state: positron.RuntimeOnlineState.Busy
		} as positron.LanguageRuntimeState);
		this._onDidChangeRuntimeState.fire(positron.RuntimeState.Busy);
	}

	/**
	 * Simulates transitioning to the idle state.
	 * @param parentId The parent identifier.
	 */
	private simulateIdleState(parentId: string) {
		this._onDidReceiveRuntimeMessage.fire({
			id: randomUUID(),
			parent_id: parentId,
			when: new Date().toISOString(),
			type: positron.LanguageRuntimeMessageType.State,
			state: positron.RuntimeOnlineState.Idle
		} as positron.LanguageRuntimeState);
		this._onDidChangeRuntimeState.fire(positron.RuntimeState.Idle);
	}

	/**
	 * Simulates sending an input message.
	 * @param parentId The parent identifier.
	 * @param code The code.
	 */
	private simulateInputMessage(parentId: string, code: string) {
		this._onDidReceiveRuntimeMessage.fire({
			id: randomUUID(),
			parent_id: parentId,
			when: new Date().toISOString(),
			type: positron.LanguageRuntimeMessageType.Input,
			state: positron.RuntimeOnlineState.Busy,
			code: code,
			execution_count: 1
		} as positron.LanguageRuntimeInput);
	}

	/**
	 * Simulates sending an output message.
	 * @param parentId The parent identifier.
	 * @param output The output.
	 */
	private simulateOutputMessage(parentId: string, output: string) {
		this._onDidReceiveRuntimeMessage.fire({
			id: randomUUID(),
			parent_id: parentId,
			when: new Date().toISOString(),
			type: positron.LanguageRuntimeMessageType.Output,
			data: {
				'text/plain': output
			} as Record<string, string>,
		} as positron.LanguageRuntimeOutput);
	}

	/**
	 * Simulates sending an error message.
	 * @param parentId The parent identifier.
	 * @param name The name.
	 * @param message The message.
	 * @param traceback The traceback.
	 */
	private simulateErrorMessage(parentId: string, name: string, message: string, traceback: string[] = []) {
		this._onDidReceiveRuntimeMessage.fire({
			id: randomUUID(),
			parent_id: parentId,
			when: new Date().toISOString(),
			type: positron.LanguageRuntimeMessageType.Error,
			name,
			message,
			traceback
		} as positron.LanguageRuntimeError);
	}

	//#endregion Private Methods
}
