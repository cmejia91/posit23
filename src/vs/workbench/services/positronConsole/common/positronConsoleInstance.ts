/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from 'vs/base/common/uuid';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { RuntimeItem } from 'vs/workbench/services/positronConsole/common/classes/runtimeItem';
import { ActivityItem } from 'vs/workbench/services/positronConsole/common/classes/activityItem';
import { RuntimeItemTrace } from 'vs/workbench/services/positronConsole/common/classes/runtimeItemTrace';
import { ActivityItemError } from 'vs/workbench/services/positronConsole/common/classes/ativityItemError';
import { ActivityItemInput } from 'vs/workbench/services/positronConsole/common/classes/activityItemInput';
import { ActivityItemOutput } from 'vs/workbench/services/positronConsole/common/classes/activityItemOutput';
import { RuntimeItemStartup } from 'vs/workbench/services/positronConsole/common/classes/runtimeItemStartup';
import { RuntimeItemActivity } from 'vs/workbench/services/positronConsole/common/classes/runtimeItemActivity';
import { IPositronConsoleInstance, PositronConsoleState } from 'vs/workbench/services/positronConsole/common/interfaces/positronConsoleInstance';
import { ILanguageRuntime, ILanguageRuntimeMessage, RuntimeOnlineState } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { RuntimeItemReconnected } from 'vs/workbench/services/positronConsole/common/classes/runtimeItemReconnected';
import { RuntimeItemStarting } from 'vs/workbench/services/positronConsole/common/classes/runtimeItemStarting';

/**
 * Formats a timestamp.
 * @param timestamp The timestamp.
 * @returns The formatted timestamp.
 */
const formatTimestamp = (timestamp: Date) => {
	const toTwoDigits = (v: number) => v < 10 ? `0${v}` : v;
	const toFourDigits = (v: number) => v < 10 ? `000${v}` : v < 1000 ? `0${v}` : v;
	return `${toTwoDigits(timestamp.getHours())}:${toTwoDigits(timestamp.getMinutes())}:${toTwoDigits(timestamp.getSeconds())}.${toFourDigits(timestamp.getMilliseconds())}`;
};

/**
 * Formats callback trace.
 * @param callback The callback name.
 * @param languageRuntimeMessage The ILanguageRuntimeMessage.
 * @returns The formatted callback trace.
 */
const formatCallbackTrace = (callback: string, languageRuntimeMessage: ILanguageRuntimeMessage) =>
	`${callback} (ID: ${languageRuntimeMessage.id} Parent ID: ${languageRuntimeMessage.parent_id} When: ${formatTimestamp(new Date(languageRuntimeMessage.when))})`;

/**
 * Formats a traceback.
 * @param traceback The traceback.
 * @returns The formatted traceback.
 */
const formatOutputData = (data: Record<string, string>) => {
	let result = '\nOutput:';
	if (!data['text/plain']) {
		result += ' None';
	} else {
		result += '\n' + data['text/plain'];
	}
	return result;
};

/**
 * Formats a traceback.
 * @param traceback The traceback.
 * @returns The formatted traceback.
 */
const formatTraceback = (traceback: string[]) => {
	let result = '\nTraceback:';
	if (!traceback.length) {
		result += ' None';
	} else {
		traceback.forEach((tracebackEntry, index) => result += `\n[${index + 1}]: ${tracebackEntry}`);
	}
	return result;
};

/**
* PositronConsoleInstance class.
*/
export class PositronConsoleInstance extends Disposable implements IPositronConsoleInstance {
	//#region Private Properties

	/**
	 * Gets the state.
	 */
	private _state = PositronConsoleState.Uninitialized;

	/**
	 * A value which indicates whether trace is enabled.
	 */
	private _trace = false;

	/**
	 * The runtime items.
	 */
	private _runtimeItems: RuntimeItem[] = [];

	/**
	 * The runtime item activities.
	 */
	private _runtimeItemActivities = new Map<string, RuntimeItemActivity>();

	/**
	 * The onDidChangeState event emitter.
	 */
	private readonly _onDidChangeStateEmitter = this._register(new Emitter<PositronConsoleState>);

	/**
	 * The onDidChangeTrace event emitter.
	 */
	private readonly _onDidChangeTraceEmitter = this._register(new Emitter<boolean>);

	/**
	 * The onDidChangeRuntimeItems event emitter.
	 */
	private readonly _onDidChangeRuntimeItemsEmitter = this._register(new Emitter<RuntimeItem[]>);

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

	//#region Constructor & Dispose

	/**
	 * Constructor.
	 * @param runtime The language runtime.
	 * @param starting A value which indicates whether the Positron console instance is starting.
	 */
	constructor(readonly runtime: ILanguageRuntime, starting: boolean) {
		// Call the base class's constructor.
		super();

		// Set the state.
		this.setState(starting ? PositronConsoleState.Starting : PositronConsoleState.Running);

		// Add the appropriate runtime item to indicate whether the Positron console instance is
		// is starting or is reconnected.
		if (starting) {
			this.addRuntimeItem(new RuntimeItemStarting(
				generateUuid(),
				`${runtime.metadata.runtimeName} ${runtime.metadata.languageVersion} starting.`
			));
		} else {
			this.addRuntimeItem(new RuntimeItemReconnected(
				generateUuid(),
				`${runtime.metadata.runtimeName} ${runtime.metadata.languageVersion} reconnected.`
			));
		}

		// Add the onDidChangeRuntimeState event handler.
		this._register(runtime.onDidChangeRuntimeState(runtimeState => {
			this.addRuntimeItemTrace(`onDidChangeRuntimeState (${runtimeState})`);
		}));

		// Add the onDidCompleteStartup event handler.
		this._register(runtime.onDidCompleteStartup(languageRuntimeInfo => {
			// Add item trace.
			this.addRuntimeItemTrace(`onDidCompleteStartup`);

			// Set the state.
			this.setState(PositronConsoleState.Running);

			// Add the item startup.
			this.addRuntimeItem(new RuntimeItemStartup(
				generateUuid(),
				languageRuntimeInfo.banner,
				languageRuntimeInfo.implementation_version,
				languageRuntimeInfo.language_version
			));
		}));

		// Add the onDidReceiveRuntimeMessageOutput event handler.
		this._register(runtime.onDidReceiveRuntimeMessageOutput(languageRuntimeMessageOutput => {
			// Add trace item.
			this.addRuntimeItemTrace(
				formatCallbackTrace('onDidReceiveRuntimeMessageOutput', languageRuntimeMessageOutput) +
				formatOutputData(languageRuntimeMessageOutput.data)
			);

			// Add or update the activity event.
			this.addOrUpdateUpdateRuntimeItemActivity(languageRuntimeMessageOutput.parent_id, new ActivityItemOutput(
				languageRuntimeMessageOutput.id,
				languageRuntimeMessageOutput.parent_id,
				new Date(languageRuntimeMessageOutput.when),
				languageRuntimeMessageOutput.data
			));
		}));

		// Add the onDidReceiveRuntimeMessageInput event handler.
		this._register(runtime.onDidReceiveRuntimeMessageInput(languageRuntimeMessageInput => {
			// Add trace item.
			this.addRuntimeItemTrace(
				formatCallbackTrace('onDidReceiveRuntimeMessageInput', languageRuntimeMessageInput) +
				'\nCode:\n' +
				languageRuntimeMessageInput.code
			);

			// Add or update the activity event.
			this.addOrUpdateUpdateRuntimeItemActivity(languageRuntimeMessageInput.parent_id, new ActivityItemInput(
				languageRuntimeMessageInput.id,
				languageRuntimeMessageInput.parent_id,
				new Date(languageRuntimeMessageInput.when),
				languageRuntimeMessageInput.code
			));
		}));

		// Add the onDidReceiveRuntimeMessageError event handler.
		this._register(runtime.onDidReceiveRuntimeMessageError(languageRuntimeMessageError => {
			// Add trace item.
			this.addRuntimeItemTrace(
				formatCallbackTrace('onDidReceiveRuntimeMessageError', languageRuntimeMessageError) +
				`\nName: ${languageRuntimeMessageError.name}` +
				'\nMessage:\n' +
				languageRuntimeMessageError.message +
				formatTraceback(languageRuntimeMessageError.traceback)
			);

			// Add or update the activity event.
			this.addOrUpdateUpdateRuntimeItemActivity(languageRuntimeMessageError.parent_id, new ActivityItemError(
				languageRuntimeMessageError.id,
				languageRuntimeMessageError.parent_id,
				new Date(languageRuntimeMessageError.when),
				languageRuntimeMessageError.name,
				languageRuntimeMessageError.message,
				languageRuntimeMessageError.traceback
			));
		}));

		// Add the onDidReceiveRuntimeMessagePrompt event handler.
		this._register(runtime.onDidReceiveRuntimeMessagePrompt(languageRuntimeMessagePrompt => {
			// Add trace event.
			this.addRuntimeItemTrace(`onDidReceiveRuntimeMessagePrompt: ID: ${languageRuntimeMessagePrompt.id} Parent ID: ${languageRuntimeMessagePrompt.parent_id}\nPassword: ${languageRuntimeMessagePrompt.password}\Prompt: ${languageRuntimeMessagePrompt.prompt}`);
		}));

		// Add the onDidReceiveRuntimeMessageState event handler.
		this._register(runtime.onDidReceiveRuntimeMessageState(languageRuntimeMessageState => {
			// Add trace event.
			this.addRuntimeItemTrace(
				formatCallbackTrace('onDidReceiveRuntimeMessageState', languageRuntimeMessageState) +
				`\nState: ${languageRuntimeMessageState.state}`);

			switch (languageRuntimeMessageState.state) {
				case RuntimeOnlineState.Starting: {
					break;
				}

				case RuntimeOnlineState.Busy: {
					if (languageRuntimeMessageState.parent_id.startsWith('fragment-')) {
						break;
					}
				}

				case RuntimeOnlineState.Idle: {
					if (languageRuntimeMessageState.parent_id.startsWith('fragment-')) {
						break;
					}
				}
			}
		}));

		// Add the onDidReceiveRuntimeMessageEvent event handler.
		this._register(runtime.onDidReceiveRuntimeMessageEvent(languageRuntimeMessageEvent => {
		}));
	}

	//#endregion Constructor & Dispose

	//#region IPositronConsoleInstance Implementation

	/**
	 * Gets the state.
	 */
	get state(): PositronConsoleState {
		return this._state;
	}

	/**
	 * Gets a value which indicates whether trace is enabled.
	 */
	get trace(): boolean {
		return this._trace;
	}

	/**
	 * Gets the runtime items.
	 */
	get runtimeItems(): RuntimeItem[] {
		return this._runtimeItems;
	}

	/**
	 * onDidChangeState event.
	 */
	readonly onDidChangeState: Event<PositronConsoleState> = this._onDidChangeStateEmitter.event;

	/**
	 * onDidChangeTrace event.
	 */
	readonly onDidChangeTrace: Event<boolean> = this._onDidChangeTraceEmitter.event;

	/**
	 * onDidChangeRuntimeItems event.
	 */
	readonly onDidChangeRuntimeItems: Event<RuntimeItem[]> = this._onDidChangeRuntimeItemsEmitter.event;

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
	 * Toggles trace.
	 */
	toggleTrace(): void {
		this._trace = !this._trace;
		this._onDidChangeTraceEmitter.fire(this._trace);
	}

	/**
	 * Clears the console.
	 */
	clearConsole(): void {
		this._runtimeItems = [];
		this._runtimeItemActivities.clear();
		this._onDidChangeRuntimeItemsEmitter.fire(this._runtimeItems);
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
	 * @param codeFragment The code fragment to execute.
	 */
	executeCode(codeFragment: string): void {
		this._onDidExecuteCodeEmitter.fire(codeFragment);
	}

	//#endregion IPositronConsoleInstance Implementation

	//#region Public Methods

	foo() {
		console.log('FOO');
	}

	//#endregion Public Methods

	//#region Private Methods

	/**
	 * Sets the state.
	 */
	private setState(state: PositronConsoleState): void {
		this._state = state;
		this._onDidChangeStateEmitter.fire(this._state);
	}

	/**
	 * Adds a trace runtime item.
	 * @param trace The text.
	 */
	private addRuntimeItemTrace(trace: string) {
		this.addRuntimeItem(new RuntimeItemTrace(generateUuid(), trace));
	}

	/**
	 * Adds or updates an activity runtime item.
	 * @param parentId The parent identifier.
	 * @param activityItem The activity item.
	 */
	private addOrUpdateUpdateRuntimeItemActivity(parentId: string, activityItem: ActivityItem) {
		const runtimeItemActivity = this._runtimeItemActivities.get(parentId);
		if (runtimeItemActivity) {
			runtimeItemActivity.addActivityItem(activityItem);
		} else {
			const runtimeItemActivity = new RuntimeItemActivity(parentId, activityItem);
			this._runtimeItemActivities.set(parentId, runtimeItemActivity);
			this.addRuntimeItem(runtimeItemActivity);
		}
	}

	/**
	 * Adds a runtime item.
	 * @param runtimeItem The runtime item.
	 */
	private addRuntimeItem(runtimeItem: RuntimeItem) {
		// Add the runtime item.
		this._runtimeItems.push(runtimeItem);
		if (runtimeItem instanceof RuntimeItemActivity) {
			this._runtimeItemActivities.set(runtimeItem.id, runtimeItem);
		}

		// Fire the runtime items changed event.
		this._onDidChangeRuntimeItemsEmitter.fire(this._runtimeItems);
	}

	//#endregion Private Methods
}
