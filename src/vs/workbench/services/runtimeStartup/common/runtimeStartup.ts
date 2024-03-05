/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ILanguageRuntimeMetadata, ILanguageRuntimeService, LanguageRuntimeSessionLocation, LanguageRuntimeSessionMode, LanguageRuntimeStartupBehavior, RuntimeState, formatLanguageRuntimeMetadata } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { IRuntimeStartupService, RuntimeStartupPhase } from 'vs/workbench/services/runtimeStartup/common/runtimeStartupService';
import { ILanguageRuntimeSession, IRuntimeSessionMetadata, IRuntimeSessionService } from 'vs/workbench/services/runtimeSession/common/runtimeSessionService';
import { Event } from 'vs/base/common/event';
import { ObservableValue } from 'vs/base/common/observableInternal/base';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ILifecycleService, ShutdownReason } from 'vs/workbench/services/lifecycle/common/lifecycle';

interface ILanguageRuntimeProviderMetadata {
	languageId: string;
}

/**
 * Metadata for serialized runtime sessions.
 */
interface SerializedSessionMetadata {
	metadata: IRuntimeSessionMetadata;
	runtimeMetadata: ILanguageRuntimeMetadata;
}

/**
 * Key for storing the set of persistent workspace session list; bump version at
 * end when changing storage format.
 */
const PERSISTENT_WORKSPACE_SESSIONS_KEY = 'positron.workspaceSessionList.v1';

const languageRuntimeExtPoint =
	ExtensionsRegistry.registerExtensionPoint<ILanguageRuntimeProviderMetadata[]>({
		extensionPoint: 'languageRuntimes',
		jsonSchema: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					languageId: {
						type: 'string',
						description: nls.localize('contributes.languageRuntime.languageId', 'The language ID for which this extension provides runtime services.'),
					}
				}
			}
		}
	});

/**
 * The RuntimeAffiliationService is responsible for managing the affiliation
 * between language runtimes and workspaces, in the service of ensuring that the
 * correct runtime is started when opening each workspace.
 *
 * It works by storing the runtime ID of the affiliated runtime in the workspace
 * storage. When a new runtime is registered, it checks to see if the runtime is
 * affiliated with the current workspace, and if so, starts the runtime.
 *
 * When runtimes become active, they are affiliated with the current workspace;
 * manually shutting down a runtime removes the affiliation.
 */
export class RuntimeStartupService extends Disposable implements IRuntimeStartupService {

	// Needed for service branding in dependency injector.
	declare readonly _serviceBrand: undefined;

	private readonly storageKey = 'positron.affiliatedRuntimeMetadata';

	// The language packs; a map of language ID to a list of extensions that provide the language.
	private readonly _languagePacks: Map<string, Array<ExtensionIdentifier>> = new Map();

	// The set of encountered languages.
	private readonly _encounteredLanguagesByLanguageId = new Set<string>();

	// A map of most recently started runtimes. This is keyed by the languageId
	// (metadata.languageId) of the runtime.
	private readonly _mostRecentlyStartedRuntimesByLanguageId = new Map<string, ILanguageRuntimeMetadata>();

	private _startupPhase: ObservableValue<RuntimeStartupPhase>;

	onDidChangeRuntimeStartupPhase: Event<RuntimeStartupPhase>;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILanguageRuntimeService private readonly _languageRuntimeService: ILanguageRuntimeService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@ILogService private readonly _logService: ILogService,
		@IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionService,
		@IStorageService private readonly _storageService: IStorageService) {

		super();

		this._register(
			this._runtimeSessionService.onDidChangeForegroundSession(
				this.onDidChangeActiveRuntime, this));

		this._register(
			this._languageRuntimeService.onDidRegisterRuntime(
				this.onDidRegisterRuntime, this));

		this._startupPhase = new ObservableValue<RuntimeStartupPhase>(
			this, 'runtime-startup-phase', RuntimeStartupPhase.Initializing);
		this.onDidChangeRuntimeStartupPhase = Event.fromObservable(this._startupPhase);

		this._register(this._runtimeSessionService.onWillStartRuntime(session => {
			this._register(session.onDidEncounterStartupFailure(_exit => {
				// Update the set of workspace sessions
				this.saveWorkspaceSessions();
			}));
		}));

		// Listen for runtime start events and update the most recently started
		// runtimes for each language.
		this._register(this._runtimeSessionService.onDidStartRuntime(session => {

			this._mostRecentlyStartedRuntimesByLanguageId.set(session.runtimeMetadata.languageId,
				session.runtimeMetadata);

			this.saveWorkspaceSessions();

			this._register(session.onDidEndSession(_exit => {
				// Update the set of workspace sessions
				this.saveWorkspaceSessions();
			}));
		}));

		// When the discovery phase is complete, check to see if we need to
		// auto-start a runtime.
		this._register(this.onDidChangeRuntimeStartupPhase(phase => {
			if (phase === RuntimeStartupPhase.Complete) {
				if (!this.hasAffiliatedRuntime() &&
					!this._runtimeSessionService.hasStartingOrRunningConsole()) {
					// If there are no affiliated runtimes, and no starting or running
					// runtimes, start the first runtime that has Immediate startup
					// behavior.
					const languageRuntimes = this._languageRuntimeService.registeredRuntimes
						.filter(metadata =>
							metadata.startupBehavior === LanguageRuntimeStartupBehavior.Immediate);
					if (languageRuntimes.length) {
						this._runtimeSessionService.autoStartRuntime(languageRuntimes[0],
							`An extension requested the runtime to be started immediately.`);
					}
				}
			}
		}));

		// Add the onDidEncounterLanguage event handler.
		this._register(this._languageService.onDidRequestRichLanguageFeatures(languageId => {
			// Add the language to the set of encountered languages.
			this._encounteredLanguagesByLanguageId.add(languageId);
		}));

		// When a runtime is registered, check to see if we need to auto-start it.
		this._register(this._languageRuntimeService.onDidRegisterRuntime(runtime => {
			// Automatically start the language runtime under the following conditions:
			// - The language runtime wants to start immediately.
			// - No other runtime is currently running.
			// - We have completed the discovery phase of the language runtime
			//   registration process.
			if (runtime.startupBehavior === LanguageRuntimeStartupBehavior.Immediate &&
				this.startupPhase === RuntimeStartupPhase.Complete &&
				!this._runtimeSessionService.hasStartingOrRunningConsole()) {

				this._runtimeSessionService.autoStartRuntime(runtime,
					`An extension requested that the runtime start immediately after being registered.`);
			}

			// Automatically start the language runtime under the following conditions:
			// - We have encountered the language that the runtime serves.
			// - We have completed the discovery phase of the language runtime
			//   registration process.
			// - The runtime is not already starting or running.
			// - The runtime has implicit startup behavior.
			// - There's no runtime affiliated with the current workspace for this
			//   language (if there is, we want that runtime to start, not this one)
			else if (this._encounteredLanguagesByLanguageId.has(runtime.languageId) &&
				this.startupPhase === RuntimeStartupPhase.Complete &&
				!this._runtimeSessionService.hasStartingOrRunningConsole(runtime.languageId) &&
				runtime.startupBehavior === LanguageRuntimeStartupBehavior.Implicit &&
				!this.getAffiliatedRuntimeMetadata(runtime.languageId)) {

				this._runtimeSessionService.autoStartRuntime(runtime,
					`A file with the language ID ${runtime.languageId} was open ` +
					`when the runtime was registered.`);
			}
		}));

		this._extensionService.whenAllExtensionHostsStarted().then(async () => {
			// Reconnect to any active sessions first;
			await this.restoreSessions();

			// then, discover all language runtimes
			await this.discoverAllRuntimes();
		});

		languageRuntimeExtPoint.setHandler((extensions) => {
			// This new set of extensions replaces the old set, so clear the
			// language packs.
			this._languagePacks.clear();

			// Loop over each extension that contributes language runtimes.
			for (const extension of extensions) {
				for (const value of extension.value) {
					this._logService.info(`Extension ${extension.description.identifier.value} contributes language runtime for language ID ${value.languageId}`);
					if (this._languagePacks.has(value.languageId)) {
						this._languagePacks.get(value.languageId)?.push(extension.description.identifier);
					} else {
						this._languagePacks.set(value.languageId, [extension.description.identifier]);
					}
				}
			}
		});

		// Register a shutdown event handler to clear the workspace sessions
		// when the workspace is quitting, since sessions are backed by the
		// workspace.
		this._lifecycleService.onWillShutdown((e) => {
			if (e.reason === ShutdownReason.QUIT) {
				// Before quitting, clear all workspace sessions from session
				// storage.
				this._storageService.store(PERSISTENT_WORKSPACE_SESSIONS_KEY,
					undefined,
					StorageScope.WORKSPACE,
					StorageTarget.MACHINE);
			} else if (e.reason === ShutdownReason.RELOAD) {
				// Attempt to save the current state of the workspace sessions
				// before reloading.
				this.saveWorkspaceSessions();
			}
		});
	}

	get startupPhase(): RuntimeStartupPhase {
		return this._startupPhase.get();
	}

	/**
	 * Completes the language runtime discovery phase. If no runtimes were
	 * started or will be started, automatically start one.
	 */
	completeDiscovery(): void {
		this._startupPhase.set(RuntimeStartupPhase.Complete, undefined);
	}

	/**
	 * Runs as an event handler when the active runtime changes.
	 *
	 * @param runtime The newly active runtime, or undefined if no runtime is active.
	 */
	private onDidChangeActiveRuntime(session: ILanguageRuntimeSession | undefined): void {
		// Ignore if we are entering a state in which no runtime is active.
		if (!session) {
			return;
		}

		// Save this runtime as the affiliated runtime for the current workspace.
		this._storageService.store(this.storageKeyForRuntime(session.runtimeMetadata),
			JSON.stringify(session.runtimeMetadata),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE);

		// If the runtime is exiting, remove the affiliation if it enters the
		// `Exiting` state. This state only occurs when the runtime is manually
		// shut down, so may represent a user's intent to stop using the runtime
		// for this workspace.
		this._register(session.onDidChangeRuntimeState((newState) => {
			if (newState === RuntimeState.Exiting) {
				// Just to be safe, check that the runtime is still affiliated
				// before removing the affiliation
				const affiliatedRuntimeMetadata = this._storageService.get(
					this.storageKeyForRuntime(session.runtimeMetadata), StorageScope.WORKSPACE);
				if (!affiliatedRuntimeMetadata) {
					return;
				}
				const affiliatedRuntimeId = JSON.parse(affiliatedRuntimeMetadata).runtimeId;
				if (session.runtimeMetadata.runtimeId === affiliatedRuntimeId) {
					// Remove the affiliation
					this._storageService.remove(this.storageKeyForRuntime(session.runtimeMetadata),
						StorageScope.WORKSPACE);
				}
			}
		}));
	}

	private async discoverAllRuntimes() {
		// Activate all extensions that contribute language runtimes.
		const activationPromises = Array.from(this._languagePacks.keys()).map(
			async (languageId) => {
				for (const extension of this._languagePacks.get(languageId) || []) {
					this._logService.info(`Activating extension ${extension.value} for language ID ${languageId}`);
					this._extensionService.activateById(extension,
						{
							extensionId: extension,
							activationEvent: `onLanguageRuntime:${languageId}`,
							startup: true
						});
				}
			});
		await Promise.all(activationPromises);
		this._logService.info(`All extensions contributing language runtimes have been activated.`);

		// Enter the discovery phase; this triggers us to ask each extension for its
		// language runtime providers.
		this._startupPhase.set(RuntimeStartupPhase.Discovering, undefined);
	}

	/**
	 * Runs as an event handler when a new runtime is registered; checks to see
	 * if the runtime is affiliated with this workspace, and if so, starts the
	 * runtime.
	 *
	 * @param runtime The newly registered runtime.
	 */
	private onDidRegisterRuntime(metadata: ILanguageRuntimeMetadata): void {

		// Ignore if we're not in the discovery phase.
		if (this.startupPhase !== RuntimeStartupPhase.Discovering) {
			return;
		}

		// Get the runtime metadata that is affiliated with this workspace, if any.
		const affiliatedRuntimeMetadataStr = this._storageService.get(
			this.storageKeyForRuntime(metadata), StorageScope.WORKSPACE);
		if (!affiliatedRuntimeMetadataStr) {
			return;
		}
		const affiliatedRuntimeMetadata = JSON.parse(affiliatedRuntimeMetadataStr);
		const affiliatedRuntimeId = affiliatedRuntimeMetadata.runtimeId;

		// If the runtime is affiliated with this workspace, start it.
		if (metadata.runtimeId === affiliatedRuntimeId) {
			try {

				// Check the setting to see if we should be auto-starting.
				const autoStart = this._configurationService.getValue<boolean>(
					'positron.interpreters.automaticStartup');
				if (!autoStart) {
					this._logService.info(`Language runtime ` +
						`${formatLanguageRuntimeMetadata(affiliatedRuntimeMetadata)} ` +
						`is affiliated with this workspace, but won't be started because automatic ` +
						`startup is disabled in configuration.`);
					return;
				}

				this._runtimeSessionService.startNewRuntimeSession(metadata.runtimeId,
					metadata.runtimeName,
					LanguageRuntimeSessionMode.Console,
					undefined, // Console session
					`Affiliated runtime for workspace`);
			} catch (e) {
				// This isn't necessarily an error; if another runtime took precedence and has
				// already started for this workspace, we don't want to start this one.
				this._logService.debug(`Did not start affiliated runtime ` +
					`${metadata.runtimeName} for this workspace: ` +
					`${e.message}`);
			}
		}
	}

	/**
	 * Get the runtime ID affiliated with the given language ID.
	 *
	 * @param languageId The ID of the language for which to get the affiliated runtime.
	 *
	 * @returns The runtime metadata.
	 */
	public getAffiliatedRuntimeMetadata(languageId: string): ILanguageRuntimeMetadata | undefined {
		const stored = this._storageService.get(`${this.storageKey}.${languageId}`, StorageScope.WORKSPACE);
		if (!stored) {
			return undefined;
		}
		try {
			return JSON.parse(stored) as ILanguageRuntimeMetadata;
		} catch (err) {
			this._logService.error(`Error parsing JSON for ${this.storageKey}: ${err}`);
			return undefined;
		}
	}

	/**
	 * Ascertains what languages are affiliated with the current workspace.
	 *
	 * @returns An array of language IDs for which there is a runtime affiliated
	 */
	public getAffiliatedRuntimeLanguageIds(): string[] | undefined {
		// Get the keys from the storage service and find the language Ids.
		const languageIds = new Array<string>();
		const keys = this._storageService.keys(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		for (const key of keys) {
			if (key.startsWith(this.storageKey)) {
				languageIds.push(key.replace(`${this.storageKey}.`, ''));
			}
		}
		return languageIds;
	}

	/**
	 * Ascertains whether a runtime (of any language) is affiliated with the
	 * current workspace.
	 *
	 * @returns True if there is a runtime affiliated with this workspace.
	 */
	public hasAffiliatedRuntime(): boolean {
		// Get the keys from the storage service and see if any of them match
		// the storage key pattern for affiliated runtimes.
		const keys = this._storageService.keys(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		for (const key of keys) {
			if (key.startsWith(this.storageKey)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Gets the preferred runtime for a language
	 *
	 * @param languageId The language identifier
	 */
	public getPreferredRuntime(languageId: string): ILanguageRuntimeMetadata {
		// If there's an active session for the language, return it.
		const activeSession =
			this._runtimeSessionService.getConsoleSessionForLanguage(languageId);
		if (activeSession) {
			return activeSession.runtimeMetadata;
		}

		// If there's a runtime affiliated with the workspace for the language,
		// return it.
		const affiliatedRuntimeMetadata = this.getAffiliatedRuntimeMetadata(languageId);
		if (affiliatedRuntimeMetadata) {
			const affiliatedRuntimeInfo =
				this._languageRuntimeService.getRegisteredRuntime(affiliatedRuntimeMetadata.runtimeId);
			if (affiliatedRuntimeInfo) {
				return affiliatedRuntimeInfo;
			}
		}

		// If there is a most recently started runtime for the language, return it.
		const mostRecentlyStartedRuntime = this._mostRecentlyStartedRuntimesByLanguageId.get(languageId);
		if (mostRecentlyStartedRuntime) {
			return mostRecentlyStartedRuntime;
		}

		// If there are registered runtimes for the language, return the first.
		const languageRuntimeInfos =
			this._languageRuntimeService.registeredRuntimes
				.filter(info => info.languageId === languageId);
		if (languageRuntimeInfos.length) {
			return languageRuntimeInfos[0];
		}

		// There are no registered runtimes for the language, throw an error.
		throw new Error(`No language runtimes registered for language ID '${languageId}'.`);
	}

	/**
	 * Starts all affiliated runtimes for the workspace.
	 */
	public startAffiliatedLanguageRuntimes(): void {
		const languageIds = this.getAffiliatedRuntimeLanguageIds();
		if (languageIds) {
			languageIds?.map(languageId => this.startAffiliatedRuntime(languageId));
		}
	}

	/**
	 * Convenience method for creating a storage key for a given runtime.
	 *
	 * @param runtime The runtime for which to get the storage key.
	 *
	 * @returns A string used to store the affiliated runtime ID for the given runtime.
	 */
	private storageKeyForRuntime(metadata: ILanguageRuntimeMetadata): string {
		return `${this.storageKey}.${metadata.languageId}`;
	}

	/**
	 * Starts an affiliated runtime for a single language.
	 */
	private startAffiliatedRuntime(languageId: string): void {
		const affiliatedRuntimeMetadata =
			this.getAffiliatedRuntimeMetadata(languageId);

		if (affiliatedRuntimeMetadata) {
			// Check the setting to see if we should be auto-starting.
			const autoStart = this._configurationService.getValue<boolean>(
				'positron.interpreters.automaticStartup');
			if (!autoStart) {
				this._logService.info(`Language runtime ` +
					`${formatLanguageRuntimeMetadata(affiliatedRuntimeMetadata)} ` +
					`is affiliated with this workspace, but won't be started because automatic ` +
					`startup is disabled in configuration.`);
				return;
			}
		}
	}

	private async restoreSessions() {
		const storedSessions = this._storageService.get(PERSISTENT_WORKSPACE_SESSIONS_KEY,
			StorageScope.WORKSPACE);
		if (storedSessions) {
			try {
				const sessions = JSON.parse(storedSessions) as SerializedSessionMetadata[];
				await this.restoreWorkspaceSessions(sessions);
			} catch (err) {
				this._logService.error(`Could not restore workspace sessions: ${err} ` +
					`(data: ${storedSessions})`);
			}
		}
	}

	private async restoreWorkspaceSessions(sessions: SerializedSessionMetadata[]) {
		this._startupPhase.set(RuntimeStartupPhase.Reconnecting, undefined);
		this._logService.debug(`Reconnecting to sessions: ` +
			sessions.map(session => session.metadata.sessionName).join(', '));

		await Promise.all(sessions.map(async session => {
			// Activate the extension that provides the runtime. Note that this
			// waits for the extension service to signal the extension but does
			// not wait for the extension to activate.
			this._logService.debug(`[Reconnect ${session.metadata.sessionId}]: ` +
				`Activating extension ${session.runtimeMetadata.extensionId.value}`);
			await this._extensionService.activateById(session.runtimeMetadata.extensionId,
				{
					extensionId: session.runtimeMetadata.extensionId,
					activationEvent: `onLanguageRuntime:${session.runtimeMetadata.languageId}`,
					startup: true
				});

			this._logService.debug(`[Reconnect ${session.metadata.sessionId}]: ` +
				`Restoring session for ${session.metadata.sessionName}`);
			await this._runtimeSessionService.restoreRuntimeSession(
				session.runtimeMetadata, session.metadata);
		}));
	}

	/**
	 * Update the set of workspace sessions in the workspace storage.
	 */
	private saveWorkspaceSessions() {

		// Derive the set of sessions that are currently active and workspace scoped.
		const workspaceSessions = this._runtimeSessionService.activeSessions
			.filter(session =>
				session.getRuntimeState() !== RuntimeState.Uninitialized &&
				session.getRuntimeState() !== RuntimeState.Exited &&
				session.runtimeMetadata.sessionLocation === LanguageRuntimeSessionLocation.Workspace)
			.map(session => {
				const metadata: SerializedSessionMetadata = {
					metadata: session.metadata,
					runtimeMetadata: session.runtimeMetadata
				};
				return metadata;
			});

		// Diagnostic logs: what are we saving?
		this._logService.trace(`Saving workspace sessions: ${workspaceSessions.map(session =>
			`${session.metadata.sessionName} (${session.metadata.sessionId})`).join(', ')}`);

		// Save the sessions to the workspace storage.
		this._storageService.store(PERSISTENT_WORKSPACE_SESSIONS_KEY,
			JSON.stringify(workspaceSessions),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE);
	}

}

registerSingleton(IRuntimeStartupService, RuntimeStartupService, InstantiationType.Eager);
