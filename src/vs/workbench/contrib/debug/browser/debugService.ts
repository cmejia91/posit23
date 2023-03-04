/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as aria from 'vs/base/browser/ui/aria/aria';
import { Action, IAction } from 'vs/base/common/actions';
import { distinct } from 'vs/base/common/arrays';
import { raceTimeout, RunOnceScheduler } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { isErrorWithActions } from 'vs/base/common/errorMessage';
import * as errors from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { deepClone, equals } from 'vs/base/common/objects';
import severity from 'vs/base/common/severity';
import { URI, URI as uri } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITextModel } from 'vs/editor/common/model';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTrustRequestService } from 'vs/platform/workspace/common/workspaceTrust';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IViewDescriptorService, IViewsService, ViewContainerLocation } from 'vs/workbench/common/views';
import { AdapterManager } from 'vs/workbench/contrib/debug/browser/debugAdapterManager';
import { DEBUG_CONFIGURE_COMMAND_ID, DEBUG_CONFIGURE_LABEL } from 'vs/workbench/contrib/debug/browser/debugCommands';
import { ConfigurationManager } from 'vs/workbench/contrib/debug/browser/debugConfigurationManager';
import { DebugMemoryFileSystemProvider } from 'vs/workbench/contrib/debug/browser/debugMemory';
import { DebugSession } from 'vs/workbench/contrib/debug/browser/debugSession';
import { DebugTaskRunner, TaskRunResult } from 'vs/workbench/contrib/debug/browser/debugTaskRunner';
import { CALLSTACK_VIEW_ID, CONTEXT_BREAKPOINTS_EXIST, CONTEXT_HAS_DEBUGGED, CONTEXT_DEBUG_STATE, CONTEXT_DEBUG_TYPE, CONTEXT_DEBUG_UX, CONTEXT_DISASSEMBLY_VIEW_FOCUS, CONTEXT_IN_DEBUG_MODE, debuggerDisabledMessage, DEBUG_MEMORY_SCHEME, getStateLabel, IAdapterManager, IBreakpoint, IBreakpointData, ICompound, IConfig, IConfigurationManager, IDebugConfiguration, IDebugModel, IDebugService, IDebugSession, IDebugSessionOptions, IEnablement, IExceptionBreakpoint, IGlobalConfig, ILaunch, IStackFrame, IThread, IViewModel, REPL_VIEW_ID, State, VIEWLET_ID } from 'vs/workbench/contrib/debug/common/debug';
import { DebugCompoundRoot } from 'vs/workbench/contrib/debug/common/debugCompoundRoot';
import { Debugger } from 'vs/workbench/contrib/debug/common/debugger';
import { Breakpoint, DataBreakpoint, DebugModel, FunctionBreakpoint, InstructionBreakpoint } from 'vs/workbench/contrib/debug/common/debugModel';
import { DebugStorage } from 'vs/workbench/contrib/debug/common/debugStorage';
import { DebugTelemetry } from 'vs/workbench/contrib/debug/common/debugTelemetry';
import { getExtensionHostDebugSession, saveAllBeforeDebugStart } from 'vs/workbench/contrib/debug/common/debugUtils';
import { ViewModel } from 'vs/workbench/contrib/debug/common/debugViewModel';
import { DisassemblyViewInput } from 'vs/workbench/contrib/debug/common/disassemblyViewInput';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from 'vs/workbench/contrib/files/common/files';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';

export class DebugService implements IDebugService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeState: Emitter<State>;
	private readonly _onDidNewSession: Emitter<IDebugSession>;
	private readonly _onWillNewSession: Emitter<IDebugSession>;
	private readonly _onDidEndSession: Emitter<IDebugSession>;
	private debugStorage: DebugStorage;
	private model: DebugModel;
	private viewModel: ViewModel;
	private telemetry: DebugTelemetry;
	private taskRunner: DebugTaskRunner;
	private configurationManager: ConfigurationManager;
	private adapterManager: AdapterManager;
	private disposables = new DisposableStore();
	private debugType!: IContextKey<string>;
	private debugState!: IContextKey<string>;
	private inDebugMode!: IContextKey<boolean>;
	private debugUx!: IContextKey<string>;
	private hasDebugged!: IContextKey<boolean>;
	private breakpointsExist!: IContextKey<boolean>;
	private disassemblyViewFocus!: IContextKey<boolean>;
	private breakpointsToSendOnResourceSaved: Set<URI>;
	private initializing = false;
	private _initializingOptions: IDebugSessionOptions | undefined;
	private previousState: State | undefined;
	private sessionCancellationTokens = new Map<string, CancellationTokenSource>();
	private activity: IDisposable | undefined;
	private chosenEnvironments: { [key: string]: string };
	private haveDoneLazySetup = false;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IViewsService private readonly viewsService: IViewsService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionHostDebugService private readonly extensionHostDebugService: IExtensionHostDebugService,
		@IActivityService private readonly activityService: IActivityService,
		@ICommandService private readonly commandService: ICommandService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		this.breakpointsToSendOnResourceSaved = new Set<URI>();

		this._onDidChangeState = new Emitter<State>();
		this._onDidNewSession = new Emitter<IDebugSession>();
		this._onWillNewSession = new Emitter<IDebugSession>();
		this._onDidEndSession = new Emitter<IDebugSession>();

		this.adapterManager = this.instantiationService.createInstance(AdapterManager, { onDidNewSession: this.onDidNewSession });
		this.disposables.add(this.adapterManager);
		this.configurationManager = this.instantiationService.createInstance(ConfigurationManager, this.adapterManager);
		this.disposables.add(this.configurationManager);
		this.debugStorage = this.instantiationService.createInstance(DebugStorage);

		this.chosenEnvironments = this.debugStorage.loadChosenEnvironments();

		this.model = this.instantiationService.createInstance(DebugModel, this.debugStorage);
		this.telemetry = this.instantiationService.createInstance(DebugTelemetry, this.model);

		this.viewModel = new ViewModel(contextKeyService);
		this.taskRunner = this.instantiationService.createInstance(DebugTaskRunner);

		this.disposables.add(this.fileService.onDidFilesChange(e => this.onFileChanges(e)));
		this.disposables.add(this.lifecycleService.onWillShutdown(this.dispose, this));

		this.disposables.add(this.extensionHostDebugService.onAttachSession(event => {
			const session = this.model.getSession(event.sessionId, true);
			if (session) {
				// EH was started in debug mode -> attach to it
				session.configuration.request = 'attach';
				session.configuration.port = event.port;
				session.setSubId(event.subId);
				this.launchOrAttachToSession(session);
			}
		}));
		this.disposables.add(this.extensionHostDebugService.onTerminateSession(event => {
			const session = this.model.getSession(event.sessionId);
			if (session && session.subId === event.subId) {
				session.disconnect();
			}
		}));

		this.disposables.add(this.viewModel.onDidFocusStackFrame(() => {
			this.onStateChange();
		}));
		this.disposables.add(this.viewModel.onDidFocusSession((session: IDebugSession | undefined) => {
			this.onStateChange();

			if (session) {
				this.setExceptionBreakpointFallbackSession(session.getId());
			}
		}));
		this.disposables.add(Event.any(this.adapterManager.onDidRegisterDebugger, this.configurationManager.onDidSelectConfiguration)(() => {
			const debugUxValue = (this.state !== State.Inactive || (this.configurationManager.getAllConfigurations().length > 0 && this.adapterManager.hasEnabledDebuggers())) ? 'default' : 'simple';
			this.debugUx.set(debugUxValue);
			this.debugStorage.storeDebugUxState(debugUxValue);
		}));
		this.disposables.add(this.model.onDidChangeCallStack(() => {
			const numberOfSessions = this.model.getSessions().filter(s => !s.parentSession).length;
			this.activity?.dispose();
			if (numberOfSessions > 0) {
				const viewContainer = this.viewDescriptorService.getViewContainerByViewId(CALLSTACK_VIEW_ID);
				if (viewContainer) {
					this.activity = this.activityService.showViewContainerActivity(viewContainer.id, { badge: new NumberBadge(numberOfSessions, n => n === 1 ? nls.localize('1activeSession', "1 active session") : nls.localize('nActiveSessions', "{0} active sessions", n)) });
				}
			}
		}));

		this.disposables.add(editorService.onDidActiveEditorChange(() => {
			this.contextKeyService.bufferChangeEvents(() => {
				if (editorService.activeEditor === DisassemblyViewInput.instance) {
					this.disassemblyViewFocus.set(true);
				} else {
					// This key can be initialized a tick after this event is fired
					this.disassemblyViewFocus?.reset();
				}
			});
		}));

		this.disposables.add(this.lifecycleService.onBeforeShutdown(() => {
			for (const editor of editorService.editors) {
				// Editors will not be valid on window reload, so close them.
				if (editor.resource?.scheme === DEBUG_MEMORY_SCHEME) {
					editor.dispose();
				}
			}
		}));

		this.initContextKeys(contextKeyService);
	}

	private initContextKeys(contextKeyService: IContextKeyService): void {
		queueMicrotask(() => {
			contextKeyService.bufferChangeEvents(() => {
				this.debugType = CONTEXT_DEBUG_TYPE.bindTo(contextKeyService);
				this.debugState = CONTEXT_DEBUG_STATE.bindTo(contextKeyService);
				this.hasDebugged = CONTEXT_HAS_DEBUGGED.bindTo(contextKeyService);
				this.inDebugMode = CONTEXT_IN_DEBUG_MODE.bindTo(contextKeyService);
				this.debugUx = CONTEXT_DEBUG_UX.bindTo(contextKeyService);
				this.debugUx.set(this.debugStorage.loadDebugUxState());
				this.breakpointsExist = CONTEXT_BREAKPOINTS_EXIST.bindTo(contextKeyService);
				// Need to set disassemblyViewFocus here to make it in the same context as the debug event handlers
				this.disassemblyViewFocus = CONTEXT_DISASSEMBLY_VIEW_FOCUS.bindTo(contextKeyService);
			});

			const setBreakpointsExistContext = () => this.breakpointsExist.set(!!(this.model.getBreakpoints().length || this.model.getDataBreakpoints().length || this.model.getFunctionBreakpoints().length));
			setBreakpointsExistContext();
			this.disposables.add(this.model.onDidChangeBreakpoints(() => setBreakpointsExistContext()));
		});
	}

	getModel(): IDebugModel {
		return this.model;
	}

	getViewModel(): IViewModel {
		return this.viewModel;
	}

	getConfigurationManager(): IConfigurationManager {
		return this.configurationManager;
	}

	getAdapterManager(): IAdapterManager {
		return this.adapterManager;
	}

	sourceIsNotAvailable(uri: uri): void {
		this.model.sourceIsNotAvailable(uri);
	}

	dispose(): void {
		this.disposables.dispose();
	}

	//---- state management

	get state(): State {
		const focusedSession = this.viewModel.focusedSession;
		if (focusedSession) {
			return focusedSession.state;
		}

		return this.initializing ? State.Initializing : State.Inactive;
	}

	get initializingOptions(): IDebugSessionOptions | undefined {
		return this._initializingOptions;
	}

	private startInitializingState(options?: IDebugSessionOptions): void {
		if (!this.initializing) {
			this.initializing = true;
			this._initializingOptions = options;
			this.onStateChange();
		}
	}

	private endInitializingState(): void {
		if (this.initializing) {
			this.initializing = false;
			this._initializingOptions = undefined;
			this.onStateChange();
		}
	}

	private cancelTokens(id: string | undefined): void {
		if (id) {
			const token = this.sessionCancellationTokens.get(id);
			if (token) {
				token.cancel();
				this.sessionCancellationTokens.delete(id);
			}
		} else {
			this.sessionCancellationTokens.forEach(t => t.cancel());
			this.sessionCancellationTokens.clear();
		}
	}

	private onStateChange(): void {
		const state = this.state;
		if (this.previousState !== state) {
			this.contextKeyService.bufferChangeEvents(() => {
				this.debugState.set(getStateLabel(state));
				this.inDebugMode.set(state !== State.Inactive);
				// Only show the simple ux if debug is not yet started and if no launch.json exists
				const debugUxValue = ((state !== State.Inactive && state !== State.Initializing) || (this.adapterManager.hasEnabledDebuggers() && this.configurationManager.selectedConfiguration.name)) ? 'default' : 'simple';
				this.debugUx.set(debugUxValue);
				this.debugStorage.storeDebugUxState(debugUxValue);
			});
			this.previousState = state;
			this._onDidChangeState.fire(state);
		}
	}

	get onDidChangeState(): Event<State> {
		return this._onDidChangeState.event;
	}

	get onDidNewSession(): Event<IDebugSession> {
		return this._onDidNewSession.event;
	}

	get onWillNewSession(): Event<IDebugSession> {
		return this._onWillNewSession.event;
	}

	get onDidEndSession(): Event<IDebugSession> {
		return this._onDidEndSession.event;
	}

	private lazySetup() {
		if (!this.haveDoneLazySetup) {
			// Registering fs providers is slow
			// https://github.com/microsoft/vscode/issues/159886
			this.disposables.add(this.fileService.registerProvider(DEBUG_MEMORY_SCHEME, new DebugMemoryFileSystemProvider(this)));
			this.haveDoneLazySetup = true;
		}
	}

	//---- life cycle management

	/**
	 * main entry point
	 * properly manages compounds, checks for errors and handles the initializing state.
	 */
	async startDebugging(launch: ILaunch | undefined, configOrName?: IConfig | string, options?: IDebugSessionOptions, saveBeforeStart = !options?.parentSession): Promise<boolean> {
		const message = options && options.noDebug ? nls.localize('runTrust', "Running executes build tasks and program code from your workspace.") : nls.localize('debugTrust', "Debugging executes build tasks and program code from your workspace.");
		const trust = await this.workspaceTrustRequestService.requestWorkspaceTrust({ message });
		if (!trust) {
			return false;
		}

		this.lazySetup();
		this.startInitializingState(options);
		this.hasDebugged.set(true);
		try {
			// make sure to save all files and that the configuration is up to date
			await this.extensionService.activateByEvent('onDebug');
			if (saveBeforeStart) {
				await saveAllBeforeDebugStart(this.configurationService, this.editorService);
			}
			await this.extensionService.whenInstalledExtensionsRegistered();

			let config: IConfig | undefined;
			let compound: ICompound | undefined;
			if (!configOrName) {
				configOrName = this.configurationManager.selectedConfiguration.name;
			}
			if (typeof configOrName === 'string' && launch) {
				config = launch.getConfiguration(configOrName);
				compound = launch.getCompound(configOrName);
			} else if (typeof configOrName !== 'string') {
				config = configOrName;
			}

			if (compound) {
				// we are starting a compound debug, first do some error checking and than start each configuration in the compound
				if (!compound.configurations) {
					throw new Error(nls.localize({ key: 'compoundMustHaveConfigurations', comment: ['compound indicates a "compounds" configuration item', '"configurations" is an attribute and should not be localized'] },
						"Compound must have \"configurations\" attribute set in order to start multiple configurations."));
				}
				if (compound.preLaunchTask) {
					const taskResult = await this.taskRunner.runTaskAndCheckErrors(launch?.workspace || this.contextService.getWorkspace(), compound.preLaunchTask);
					if (taskResult === TaskRunResult.Failure) {
						this.endInitializingState();
						return false;
					}
				}
				if (compound.stopAll) {
					options = { ...options, compoundRoot: new DebugCompoundRoot() };
				}

				const values = await Promise.all(compound.configurations.map(configData => {
					const name = typeof configData === 'string' ? configData : configData.name;
					if (name === compound!.name) {
						return Promise.resolve(false);
					}

					let launchForName: ILaunch | undefined;
					if (typeof configData === 'string') {
						const launchesContainingName = this.configurationManager.getLaunches().filter(l => !!l.getConfiguration(name));
						if (launchesContainingName.length === 1) {
							launchForName = launchesContainingName[0];
						} else if (launch && launchesContainingName.length > 1 && launchesContainingName.indexOf(launch) >= 0) {
							// If there are multiple launches containing the configuration give priority to the configuration in the current launch
							launchForName = launch;
						} else {
							throw new Error(launchesContainingName.length === 0 ? nls.localize('noConfigurationNameInWorkspace', "Could not find launch configuration '{0}' in the workspace.", name)
								: nls.localize('multipleConfigurationNamesInWorkspace', "There are multiple launch configurations '{0}' in the workspace. Use folder name to qualify the configuration.", name));
						}
					} else if (configData.folder) {
						const launchesMatchingConfigData = this.configurationManager.getLaunches().filter(l => l.workspace && l.workspace.name === configData.folder && !!l.getConfiguration(configData.name));
						if (launchesMatchingConfigData.length === 1) {
							launchForName = launchesMatchingConfigData[0];
						} else {
							throw new Error(nls.localize('noFolderWithName', "Can not find folder with name '{0}' for configuration '{1}' in compound '{2}'.", configData.folder, configData.name, compound!.name));
						}
					}

					return this.createSession(launchForName, launchForName!.getConfiguration(name), options);
				}));

				const result = values.every(success => !!success); // Compound launch is a success only if each configuration launched successfully
				this.endInitializingState();
				return result;
			}

			if (configOrName && !config) {
				const message = !!launch ? nls.localize('configMissing', "Configuration '{0}' is missing in 'launch.json'.", typeof configOrName === 'string' ? configOrName : configOrName.name) :
					nls.localize('launchJsonDoesNotExist', "'launch.json' does not exist for passed workspace folder.");
				throw new Error(message);
			}

			const result = await this.createSession(launch, config, options);
			this.endInitializingState();
			return result;
		} catch (err) {
			// make sure to get out of initializing state, and propagate the result
			this.notificationService.error(err);
			this.endInitializingState();
			return Promise.reject(err);
		}
	}

	/**
	 * gets the debugger for the type, resolves configurations by providers, substitutes variables and runs prelaunch tasks
	 */
	private async createSession(launch: ILaunch | undefined, config: IConfig | undefined, options?: IDebugSessionOptions): Promise<boolean> {
		// We keep the debug type in a separate variable 'type' so that a no-folder config has no attributes.
		// Storing the type in the config would break extensions that assume that the no-folder case is indicated by an empty config.
		let type: string | undefined;
		if (config) {
			type = config.type;
		} else {
			// a no-folder workspace has no launch.config
			config = Object.create(null);
		}
		if (options && options.noDebug) {
			config!.noDebug = true;
		} else if (options && typeof options.noDebug === 'undefined' && options.parentSession && options.parentSession.configuration.noDebug) {
			config!.noDebug = true;
		}
		const unresolvedConfig = deepClone(config);

		let guess: Debugger | undefined;
		let activeEditor: EditorInput | undefined;
		if (!type) {
			activeEditor = this.editorService.activeEditor;
			if (activeEditor && activeEditor.resource) {
				type = this.chosenEnvironments[activeEditor.resource.toString()];
			}
			if (!type) {
				guess = await this.adapterManager.guessDebugger(false);
				if (guess) {
					type = guess.type;
				}
			}
		}

		const initCancellationToken = new CancellationTokenSource();
		const sessionId = generateUuid();
		this.sessionCancellationTokens.set(sessionId, initCancellationToken);

		const configByProviders = await this.configurationManager.resolveConfigurationByProviders(launch && launch.workspace ? launch.workspace.uri : undefined, type, config!, initCancellationToken.token);
		// a falsy config indicates an aborted launch
		if (configByProviders && configByProviders.type) {
			try {
				let resolvedConfig = await this.substituteVariables(launch, configByProviders);
				if (!resolvedConfig) {
					// User cancelled resolving of interactive variables, silently return
					return false;
				}

				if (initCancellationToken.token.isCancellationRequested) {
					// User cancelled, silently return
					return false;
				}

				const workspace = launch?.workspace || this.contextService.getWorkspace();
				const taskResult = await this.taskRunner.runTaskAndCheckErrors(workspace, resolvedConfig.preLaunchTask);
				if (taskResult === TaskRunResult.Failure) {
					return false;
				}

				const cfg = await this.configurationManager.resolveDebugConfigurationWithSubstitutedVariables(launch && launch.workspace ? launch.workspace.uri : undefined, type, resolvedConfig, initCancellationToken.token);
				if (!cfg) {
					if (launch && type && cfg === null && !initCancellationToken.token.isCancellationRequested) {	// show launch.json only for "config" being "null".
						await launch.openConfigFile({ preserveFocus: true, type }, initCancellationToken.token);
					}
					return false;
				}
				resolvedConfig = cfg;

				const dbg = this.adapterManager.getDebugger(resolvedConfig.type);
				if (!dbg || (configByProviders.request !== 'attach' && configByProviders.request !== 'launch')) {
					let message: string;
					if (configByProviders.request !== 'attach' && configByProviders.request !== 'launch') {
						message = configByProviders.request ? nls.localize('debugRequestNotSupported', "Attribute '{0}' has an unsupported value '{1}' in the chosen debug configuration.", 'request', configByProviders.request)
							: nls.localize('debugRequesMissing', "Attribute '{0}' is missing from the chosen debug configuration.", 'request');

					} else {
						message = resolvedConfig.type ? nls.localize('debugTypeNotSupported', "Configured debug type '{0}' is not supported.", resolvedConfig.type) :
							nls.localize('debugTypeMissing', "Missing property 'type' for the chosen launch configuration.");
					}

					const actionList: IAction[] = [];

					actionList.push(new Action(
						'installAdditionalDebuggers',
						nls.localize({ key: 'installAdditionalDebuggers', comment: ['Placeholder is the debug type, so for example "node", "python"'] }, "Install {0} Extension", resolvedConfig.type),
						undefined,
						true,
						async () => this.commandService.executeCommand('debug.installAdditionalDebuggers', resolvedConfig?.type)
					));

					await this.showError(message, actionList);

					return false;
				}

				if (!dbg.enabled) {
					await this.showError(debuggerDisabledMessage(dbg.type), []);
					return false;
				}

				const result = await this.doCreateSession(sessionId, launch?.workspace, { resolved: resolvedConfig, unresolved: unresolvedConfig }, options);
				if (result && guess && activeEditor && activeEditor.resource) {
					// Remeber user choice of environment per active editor to make starting debugging smoother #124770
					this.chosenEnvironments[activeEditor.resource.toString()] = guess.type;
					this.debugStorage.storeChosenEnvironments(this.chosenEnvironments);
				}
				return result;
			} catch (err) {
				if (err && err.message) {
					await this.showError(err.message);
				} else if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
					await this.showError(nls.localize('noFolderWorkspaceDebugError', "The active file can not be debugged. Make sure it is saved and that you have a debug extension installed for that file type."));
				}
				if (launch && !initCancellationToken.token.isCancellationRequested) {
					await launch.openConfigFile({ preserveFocus: true }, initCancellationToken.token);
				}

				return false;
			}
		}

		if (launch && type && configByProviders === null && !initCancellationToken.token.isCancellationRequested) {	// show launch.json only for "config" being "null".
			await launch.openConfigFile({ preserveFocus: true, type }, initCancellationToken.token);
		}

		return false;
	}

	/**
	 * instantiates the new session, initializes the session, registers session listeners and reports telemetry
	 */
	private async doCreateSession(sessionId: string, root: IWorkspaceFolder | undefined, configuration: { resolved: IConfig; unresolved: IConfig | undefined }, options?: IDebugSessionOptions): Promise<boolean> {

		const session = this.instantiationService.createInstance(DebugSession, sessionId, configuration, root, this.model, options);
		if (options?.startedByUser && this.model.getSessions().some(s => s.getLabel() === session.getLabel()) && configuration.resolved.suppressMultipleSessionWarning !== true) {
			// There is already a session with the same name, prompt user #127721
			const result = await this.dialogService.confirm({ message: nls.localize('multipleSession', "'{0}' is already running. Do you want to start another instance?", session.getLabel()) });
			if (!result.confirmed) {
				return false;
			}
		}

		this.model.addSession(session);
		// register listeners as the very first thing!
		this.registerSessionListeners(session);

		// since the Session is now properly registered under its ID and hooked, we can announce it
		// this event doesn't go to extensions
		this._onWillNewSession.fire(session);

		const openDebug = this.configurationService.getValue<IDebugConfiguration>('debug').openDebug;
		// Open debug viewlet based on the visibility of the side bar and openDebug setting. Do not open for 'run without debug'
		if (!configuration.resolved.noDebug && (openDebug === 'openOnSessionStart' || (openDebug !== 'neverOpen' && this.viewModel.firstSessionStart)) && !session.suppressDebugView) {
			await this.paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar);
		}

		try {
			await this.launchOrAttachToSession(session);

			const internalConsoleOptions = session.configuration.internalConsoleOptions || this.configurationService.getValue<IDebugConfiguration>('debug').internalConsoleOptions;
			if (internalConsoleOptions === 'openOnSessionStart' || (this.viewModel.firstSessionStart && internalConsoleOptions === 'openOnFirstSessionStart')) {
				this.viewsService.openView(REPL_VIEW_ID, false);
			}

			this.viewModel.firstSessionStart = false;
			const showSubSessions = this.configurationService.getValue<IDebugConfiguration>('debug').showSubSessionsInToolBar;
			const sessions = this.model.getSessions();
			const shownSessions = showSubSessions ? sessions : sessions.filter(s => !s.parentSession);
			if (shownSessions.length > 1) {
				this.viewModel.setMultiSessionView(true);
			}

			// since the initialized response has arrived announce the new Session (including extensions)
			this._onDidNewSession.fire(session);

			return true;
		} catch (error) {

			if (errors.isCancellationError(error)) {
				// don't show 'canceled' error messages to the user #7906
				return false;
			}

			// Show the repl if some error got logged there #5870
			if (session && session.getReplElements().length > 0) {
				this.viewsService.openView(REPL_VIEW_ID, false);
			}

			if (session.configuration && session.configuration.request === 'attach' && session.configuration.__autoAttach) {
				// ignore attach timeouts in auto attach mode
				return false;
			}

			const errorMessage = error instanceof Error ? error.message : error;
			if (error.showUser !== false) {
				// Only show the error when showUser is either not defined, or is true #128484
				await this.showError(errorMessage, isErrorWithActions(error) ? error.actions : []);
			}
			return false;
		}
	}

	private async launchOrAttachToSession(session: IDebugSession, forceFocus = false): Promise<void> {
		const dbgr = this.adapterManager.getDebugger(session.configuration.type);
		try {
			await session.initialize(dbgr!);
			await session.launchOrAttach(session.configuration);
			const launchJsonExists = !!session.root && !!this.configurationService.getValue<IGlobalConfig>('launch', { resource: session.root.uri });
			await this.telemetry.logDebugSessionStart(dbgr!, launchJsonExists);

			if (forceFocus || !this.viewModel.focusedSession || (session.parentSession === this.viewModel.focusedSession && session.compact)) {
				await this.focusStackFrame(undefined, undefined, session);
			}
		} catch (err) {
			if (this.viewModel.focusedSession === session) {
				await this.focusStackFrame(undefined);
			}
			return Promise.reject(err);
		}
	}

	private registerSessionListeners(session: IDebugSession): void {
		const sessionRunningScheduler = new RunOnceScheduler(() => {
			// Do not immediatly defocus the stack frame if the session is running
			if (session.state === State.Running && this.viewModel.focusedSession === session) {
				this.viewModel.setFocus(undefined, this.viewModel.focusedThread, session, false);
			}
		}, 200);
		this.disposables.add(session.onDidChangeState(() => {
			if (session.state === State.Running && this.viewModel.focusedSession === session) {
				sessionRunningScheduler.schedule();
			}
			if (session === this.viewModel.focusedSession) {
				this.onStateChange();
			}
		}));

		this.disposables.add(session.onDidEndAdapter(async adapterExitEvent => {

			if (adapterExitEvent) {
				if (adapterExitEvent.error) {
					this.notificationService.error(nls.localize('debugAdapterCrash', "Debug adapter process has terminated unexpectedly ({0})", adapterExitEvent.error.message || adapterExitEvent.error.toString()));
				}
				this.telemetry.logDebugSessionStop(session, adapterExitEvent);
			}

			// 'Run without debugging' mode VSCode must terminate the extension host. More details: #3905
			const extensionDebugSession = getExtensionHostDebugSession(session);
			if (extensionDebugSession && extensionDebugSession.state === State.Running && extensionDebugSession.configuration.noDebug) {
				this.extensionHostDebugService.close(extensionDebugSession.getId());
			}

			if (session.configuration.postDebugTask) {
				const root = session.root ?? this.contextService.getWorkspace();
				try {
					await this.taskRunner.runTask(root, session.configuration.postDebugTask);
				} catch (err) {
					this.notificationService.error(err);
				}
			}
			this.endInitializingState();
			this.cancelTokens(session.getId());
			this._onDidEndSession.fire(session);

			const focusedSession = this.viewModel.focusedSession;
			if (focusedSession && focusedSession.getId() === session.getId()) {
				const { session, thread, stackFrame } = getStackFrameThreadAndSessionToFocus(this.model, undefined, undefined, undefined, focusedSession);
				this.viewModel.setFocus(stackFrame, thread, session, false);
			}

			if (this.model.getSessions().length === 0) {
				this.viewModel.setMultiSessionView(false);

				if (this.layoutService.isVisible(Parts.SIDEBAR_PART) && this.configurationService.getValue<IDebugConfiguration>('debug').openExplorerOnEnd) {
					this.paneCompositeService.openPaneComposite(EXPLORER_VIEWLET_ID, ViewContainerLocation.Sidebar);
				}

				// Data breakpoints that can not be persisted should be cleared when a session ends
				const dataBreakpoints = this.model.getDataBreakpoints().filter(dbp => !dbp.canPersist);
				dataBreakpoints.forEach(dbp => this.model.removeDataBreakpoints(dbp.getId()));

				if (this.configurationService.getValue<IDebugConfiguration>('debug').console.closeOnEnd) {
					const debugConsoleContainer = this.viewDescriptorService.getViewContainerByViewId(REPL_VIEW_ID);
					if (debugConsoleContainer && this.viewsService.isViewContainerVisible(debugConsoleContainer.id)) {
						this.viewsService.closeViewContainer(debugConsoleContainer.id);
					}
				}
			}

			this.model.removeExceptionBreakpointsForSession(session.getId());
		}));
	}

	async restartSession(session: IDebugSession, restartData?: any): Promise<any> {
		if (session.saveBeforeRestart) {
			await saveAllBeforeDebugStart(this.configurationService, this.editorService);
		}

		const isAutoRestart = !!restartData;

		const runTasks: () => Promise<TaskRunResult> = async () => {
			if (isAutoRestart) {
				// Do not run preLaunch and postDebug tasks for automatic restarts
				return Promise.resolve(TaskRunResult.Success);
			}

			const root = session.root || this.contextService.getWorkspace();
			await this.taskRunner.runTask(root, session.configuration.preRestartTask);
			await this.taskRunner.runTask(root, session.configuration.postDebugTask);

			const taskResult1 = await this.taskRunner.runTaskAndCheckErrors(root, session.configuration.preLaunchTask);
			if (taskResult1 !== TaskRunResult.Success) {
				return taskResult1;
			}

			return this.taskRunner.runTaskAndCheckErrors(root, session.configuration.postRestartTask);
		};

		const extensionDebugSession = getExtensionHostDebugSession(session);
		if (extensionDebugSession) {
			const taskResult = await runTasks();
			if (taskResult === TaskRunResult.Success) {
				this.extensionHostDebugService.reload(extensionDebugSession.getId());
			}

			return;
		}

		// Read the configuration again if a launch.json has been changed, if not just use the inmemory configuration
		let needsToSubstitute = false;
		let unresolved: IConfig | undefined;
		const launch = session.root ? this.configurationManager.getLaunch(session.root.uri) : undefined;
		if (launch) {
			unresolved = launch.getConfiguration(session.configuration.name);
			if (unresolved && !equals(unresolved, session.unresolvedConfiguration)) {
				// Take the type from the session since the debug extension might overwrite it #21316
				unresolved.type = session.configuration.type;
				unresolved.noDebug = session.configuration.noDebug;
				needsToSubstitute = true;
			}
		}

		let resolved: IConfig | undefined | null = session.configuration;
		if (launch && needsToSubstitute && unresolved) {
			const initCancellationToken = new CancellationTokenSource();
			this.sessionCancellationTokens.set(session.getId(), initCancellationToken);
			const resolvedByProviders = await this.configurationManager.resolveConfigurationByProviders(launch.workspace ? launch.workspace.uri : undefined, unresolved.type, unresolved, initCancellationToken.token);
			if (resolvedByProviders) {
				resolved = await this.substituteVariables(launch, resolvedByProviders);
				if (resolved && !initCancellationToken.token.isCancellationRequested) {
					resolved = await this.configurationManager.resolveDebugConfigurationWithSubstitutedVariables(launch && launch.workspace ? launch.workspace.uri : undefined, unresolved.type, resolved, initCancellationToken.token);
				}
			} else {
				resolved = resolvedByProviders;
			}
		}
		if (resolved) {
			session.setConfiguration({ resolved, unresolved });
		}
		session.configuration.__restart = restartData;

		if (session.capabilities.supportsRestartRequest) {
			const taskResult = await runTasks();
			if (taskResult === TaskRunResult.Success) {
				await session.restart();
			}

			return;
		}

		const shouldFocus = !!this.viewModel.focusedSession && session.getId() === this.viewModel.focusedSession.getId();
		// If the restart is automatic  -> disconnect, otherwise -> terminate #55064
		if (isAutoRestart) {
			await session.disconnect(true);
		} else {
			await session.terminate(true);
		}

		return new Promise<void>((c, e) => {
			setTimeout(async () => {
				const taskResult = await runTasks();
				if (taskResult !== TaskRunResult.Success) {
					return;
				}

				if (!resolved) {
					return c(undefined);
				}

				try {
					await this.launchOrAttachToSession(session, shouldFocus);
					this._onDidNewSession.fire(session);
					c(undefined);
				} catch (error) {
					e(error);
				}
			}, 300);
		});
	}

	async stopSession(session: IDebugSession | undefined, disconnect = false, suspend = false): Promise<any> {
		if (session) {
			return disconnect ? session.disconnect(undefined, suspend) : session.terminate();
		}

		const sessions = this.model.getSessions();
		if (sessions.length === 0) {
			this.taskRunner.cancel();
			// User might have cancelled starting of a debug session, and in some cases the quick pick is left open
			await this.quickInputService.cancel();
			this.endInitializingState();
			this.cancelTokens(undefined);
		}

		return Promise.all(sessions.map(s => disconnect ? s.disconnect(undefined, suspend) : s.terminate()));
	}

	private async substituteVariables(launch: ILaunch | undefined, config: IConfig): Promise<IConfig | undefined> {
		const dbg = this.adapterManager.getDebugger(config.type);
		if (dbg) {
			let folder: IWorkspaceFolder | undefined = undefined;
			if (launch && launch.workspace) {
				folder = launch.workspace;
			} else {
				const folders = this.contextService.getWorkspace().folders;
				if (folders.length === 1) {
					folder = folders[0];
				}
			}
			try {
				return await dbg.substituteVariables(folder, config);
			} catch (err) {
				this.showError(err.message, undefined, !!launch?.getConfiguration(config.name));
				return undefined;	// bail out
			}
		}
		return Promise.resolve(config);
	}

	private async showError(message: string, errorActions: ReadonlyArray<IAction> = [], promptLaunchJson = true): Promise<void> {
		const configureAction = new Action(DEBUG_CONFIGURE_COMMAND_ID, DEBUG_CONFIGURE_LABEL, undefined, true, () => this.commandService.executeCommand(DEBUG_CONFIGURE_COMMAND_ID));
		// Don't append the standard command if id of any provided action indicates it is a command
		const actions = errorActions.filter((action) => action.id.endsWith('.command')).length > 0 ?
			errorActions :
			[...errorActions, ...(promptLaunchJson ? [configureAction] : [])];
		await this.dialogService.prompt({
			type: severity.Error,
			message,
			buttons: actions.map(action => ({
				label: action.label,
				run: () => action.run()
			})),
			cancelButton: true
		});
	}

	//---- focus management

	async focusStackFrame(_stackFrame: IStackFrame | undefined, _thread?: IThread, _session?: IDebugSession, options?: { explicit?: boolean; preserveFocus?: boolean; sideBySide?: boolean; pinned?: boolean }): Promise<void> {
		const { stackFrame, thread, session } = getStackFrameThreadAndSessionToFocus(this.model, _stackFrame, _thread, _session);

		if (stackFrame) {
			const editor = await stackFrame.openInEditor(this.editorService, options?.preserveFocus ?? true, options?.sideBySide, options?.pinned);
			if (editor) {
				if (editor.input === DisassemblyViewInput.instance) {
					// Go to address is invoked via setFocus
				} else {
					const control = editor.getControl();
					if (stackFrame && isCodeEditor(control) && control.hasModel()) {
						const model = control.getModel();
						const lineNumber = stackFrame.range.startLineNumber;
						if (lineNumber >= 1 && lineNumber <= model.getLineCount()) {
							const lineContent = control.getModel().getLineContent(lineNumber);
							aria.alert(nls.localize({ key: 'debuggingPaused', comment: ['First placeholder is the file line content, second placeholder is the reason why debugging is stopped, for example "breakpoint", third is the stack frame name, and last is the line number.'] },
								"{0}, debugging paused {1}, {2}:{3}", lineContent, thread && thread.stoppedDetails ? `, reason ${thread.stoppedDetails.reason}` : '', stackFrame.source ? stackFrame.source.name : '', stackFrame.range.startLineNumber));
						}
					}
				}
			}
		}
		if (session) {
			this.debugType.set(session.configuration.type);
		} else {
			this.debugType.reset();
		}

		this.viewModel.setFocus(stackFrame, thread, session, !!options?.explicit);
	}

	//---- watches

	addWatchExpression(name?: string): void {
		const we = this.model.addWatchExpression(name);
		if (!name) {
			this.viewModel.setSelectedExpression(we, false);
		}
		this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
	}

	renameWatchExpression(id: string, newName: string): void {
		this.model.renameWatchExpression(id, newName);
		this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
	}

	moveWatchExpression(id: string, position: number): void {
		this.model.moveWatchExpression(id, position);
		this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
	}

	removeWatchExpressions(id?: string): void {
		this.model.removeWatchExpressions(id);
		this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
	}

	//---- breakpoints

	canSetBreakpointsIn(model: ITextModel): boolean {
		return this.adapterManager.canSetBreakpointsIn(model);
	}

	async enableOrDisableBreakpoints(enable: boolean, breakpoint?: IEnablement): Promise<void> {
		if (breakpoint) {
			this.model.setEnablement(breakpoint, enable);
			this.debugStorage.storeBreakpoints(this.model);
			if (breakpoint instanceof Breakpoint) {
				await this.sendBreakpoints(breakpoint.uri);
			} else if (breakpoint instanceof FunctionBreakpoint) {
				await this.sendFunctionBreakpoints();
			} else if (breakpoint instanceof DataBreakpoint) {
				await this.sendDataBreakpoints();
			} else if (breakpoint instanceof InstructionBreakpoint) {
				await this.sendInstructionBreakpoints();
			} else {
				await this.sendExceptionBreakpoints();
			}
		} else {
			this.model.enableOrDisableAllBreakpoints(enable);
			this.debugStorage.storeBreakpoints(this.model);
			await this.sendAllBreakpoints();
		}
		this.debugStorage.storeBreakpoints(this.model);
	}

	async addBreakpoints(uri: uri, rawBreakpoints: IBreakpointData[], ariaAnnounce = true): Promise<IBreakpoint[]> {
		const breakpoints = this.model.addBreakpoints(uri, rawBreakpoints);
		if (ariaAnnounce) {
			breakpoints.forEach(bp => aria.status(nls.localize('breakpointAdded', "Added breakpoint, line {0}, file {1}", bp.lineNumber, uri.fsPath)));
		}

		// In some cases we need to store breakpoints before we send them because sending them can take a long time
		// And after sending them because the debug adapter can attach adapter data to a breakpoint
		this.debugStorage.storeBreakpoints(this.model);
		await this.sendBreakpoints(uri);
		this.debugStorage.storeBreakpoints(this.model);
		return breakpoints;
	}

	async updateBreakpoints(uri: uri, data: Map<string, DebugProtocol.Breakpoint>, sendOnResourceSaved: boolean): Promise<void> {
		this.model.updateBreakpoints(data);
		this.debugStorage.storeBreakpoints(this.model);
		if (sendOnResourceSaved) {
			this.breakpointsToSendOnResourceSaved.add(uri);
		} else {
			await this.sendBreakpoints(uri);
			this.debugStorage.storeBreakpoints(this.model);
		}
	}

	async removeBreakpoints(id?: string): Promise<void> {
		const toRemove = this.model.getBreakpoints().filter(bp => !id || bp.getId() === id);
		toRemove.forEach(bp => aria.status(nls.localize('breakpointRemoved', "Removed breakpoint, line {0}, file {1}", bp.lineNumber, bp.uri.fsPath)));
		const urisToClear = distinct(toRemove, bp => bp.uri.toString()).map(bp => bp.uri);

		this.model.removeBreakpoints(toRemove);

		this.debugStorage.storeBreakpoints(this.model);
		await Promise.all(urisToClear.map(uri => this.sendBreakpoints(uri)));
	}

	setBreakpointsActivated(activated: boolean): Promise<void> {
		this.model.setBreakpointsActivated(activated);
		return this.sendAllBreakpoints();
	}

	addFunctionBreakpoint(name?: string, id?: string): void {
		this.model.addFunctionBreakpoint(name || '', id);
	}

	async updateFunctionBreakpoint(id: string, update: { name?: string; hitCondition?: string; condition?: string }): Promise<void> {
		this.model.updateFunctionBreakpoint(id, update);
		this.debugStorage.storeBreakpoints(this.model);
		await this.sendFunctionBreakpoints();
	}

	async removeFunctionBreakpoints(id?: string): Promise<void> {
		this.model.removeFunctionBreakpoints(id);
		this.debugStorage.storeBreakpoints(this.model);
		await this.sendFunctionBreakpoints();
	}

	async addDataBreakpoint(label: string, dataId: string, canPersist: boolean, accessTypes: DebugProtocol.DataBreakpointAccessType[] | undefined, accessType: DebugProtocol.DataBreakpointAccessType): Promise<void> {
		this.model.addDataBreakpoint(label, dataId, canPersist, accessTypes, accessType);
		this.debugStorage.storeBreakpoints(this.model);
		await this.sendDataBreakpoints();
		this.debugStorage.storeBreakpoints(this.model);
	}

	async removeDataBreakpoints(id?: string): Promise<void> {
		this.model.removeDataBreakpoints(id);
		this.debugStorage.storeBreakpoints(this.model);
		await this.sendDataBreakpoints();
	}

	async addInstructionBreakpoint(address: string, offset: number, condition?: string, hitCondition?: string): Promise<void> {
		this.model.addInstructionBreakpoint(address, offset, condition, hitCondition);
		this.debugStorage.storeBreakpoints(this.model);
		await this.sendInstructionBreakpoints();
		this.debugStorage.storeBreakpoints(this.model);
	}

	async removeInstructionBreakpoints(address?: string): Promise<void> {
		this.model.removeInstructionBreakpoints(address);
		this.debugStorage.storeBreakpoints(this.model);
		await this.sendInstructionBreakpoints();
	}

	setExceptionBreakpointFallbackSession(sessionId: string) {
		this.model.setExceptionBreakpointFallbackSession(sessionId);
		this.debugStorage.storeBreakpoints(this.model);
	}

	setExceptionBreakpointsForSession(session: IDebugSession, data: DebugProtocol.ExceptionBreakpointsFilter[]): void {
		this.model.setExceptionBreakpointsForSession(session.getId(), data);
		this.debugStorage.storeBreakpoints(this.model);
	}

	async setExceptionBreakpointCondition(exceptionBreakpoint: IExceptionBreakpoint, condition: string | undefined): Promise<void> {
		this.model.setExceptionBreakpointCondition(exceptionBreakpoint, condition);
		this.debugStorage.storeBreakpoints(this.model);
		await this.sendExceptionBreakpoints();
	}

	async sendAllBreakpoints(session?: IDebugSession): Promise<any> {
		const setBreakpointsPromises = distinct(this.model.getBreakpoints(), bp => bp.uri.toString())
			.map(bp => this.sendBreakpoints(bp.uri, false, session));

		// If sending breakpoints to one session which we know supports the configurationDone request, can make all requests in parallel
		if (session?.capabilities.supportsConfigurationDoneRequest) {
			await Promise.all([
				...setBreakpointsPromises,
				this.sendFunctionBreakpoints(session),
				this.sendDataBreakpoints(session),
				this.sendInstructionBreakpoints(session),
				this.sendExceptionBreakpoints(session),
			]);
		} else {
			await Promise.all(setBreakpointsPromises);
			await this.sendFunctionBreakpoints(session);
			await this.sendDataBreakpoints(session);
			await this.sendInstructionBreakpoints(session);
			// send exception breakpoints at the end since some debug adapters may rely on the order - this was the case before
			// the configurationDone request was introduced.
			await this.sendExceptionBreakpoints(session);
		}
	}

	private async sendBreakpoints(modelUri: uri, sourceModified = false, session?: IDebugSession): Promise<void> {
		const breakpointsToSend = this.model.getBreakpoints({ uri: modelUri, enabledOnly: true });
		await sendToOneOrAllSessions(this.model, session, async s => {
			if (!s.configuration.noDebug) {
				await s.sendBreakpoints(modelUri, breakpointsToSend, sourceModified);
			}
		});
	}

	private async sendFunctionBreakpoints(session?: IDebugSession): Promise<void> {
		const breakpointsToSend = this.model.getFunctionBreakpoints().filter(fbp => fbp.enabled && this.model.areBreakpointsActivated());

		await sendToOneOrAllSessions(this.model, session, async s => {
			if (s.capabilities.supportsFunctionBreakpoints && !s.configuration.noDebug) {
				await s.sendFunctionBreakpoints(breakpointsToSend);
			}
		});
	}

	private async sendDataBreakpoints(session?: IDebugSession): Promise<void> {
		const breakpointsToSend = this.model.getDataBreakpoints().filter(fbp => fbp.enabled && this.model.areBreakpointsActivated());

		await sendToOneOrAllSessions(this.model, session, async s => {
			if (s.capabilities.supportsDataBreakpoints && !s.configuration.noDebug) {
				await s.sendDataBreakpoints(breakpointsToSend);
			}
		});
	}

	private async sendInstructionBreakpoints(session?: IDebugSession): Promise<void> {
		const breakpointsToSend = this.model.getInstructionBreakpoints().filter(fbp => fbp.enabled && this.model.areBreakpointsActivated());

		await sendToOneOrAllSessions(this.model, session, async s => {
			if (s.capabilities.supportsInstructionBreakpoints && !s.configuration.noDebug) {
				await s.sendInstructionBreakpoints(breakpointsToSend);
			}
		});
	}

	private sendExceptionBreakpoints(session?: IDebugSession): Promise<void> {
		return sendToOneOrAllSessions(this.model, session, async s => {
			const enabledExceptionBps = this.model.getExceptionBreakpointsForSession(s.getId()).filter(exb => exb.enabled);
			if (s.capabilities.supportsConfigurationDoneRequest && (!s.capabilities.exceptionBreakpointFilters || s.capabilities.exceptionBreakpointFilters.length === 0)) {
				// Only call `setExceptionBreakpoints` as specified in dap protocol #90001
				return;
			}
			if (!s.configuration.noDebug) {
				await s.sendExceptionBreakpoints(enabledExceptionBps);
			}
		});
	}

	private onFileChanges(fileChangesEvent: FileChangesEvent): void {
		const toRemove = this.model.getBreakpoints().filter(bp =>
			fileChangesEvent.contains(bp.uri, FileChangeType.DELETED));
		if (toRemove.length) {
			this.model.removeBreakpoints(toRemove);
		}

		const toSend: URI[] = [];
		for (const uri of this.breakpointsToSendOnResourceSaved) {
			if (fileChangesEvent.contains(uri, FileChangeType.UPDATED)) {
				toSend.push(uri);
			}
		}

		for (const uri of toSend) {
			this.breakpointsToSendOnResourceSaved.delete(uri);
			this.sendBreakpoints(uri, true);
		}
	}

	async runTo(uri: uri, lineNumber: number, column?: number): Promise<void> {
		let breakpointToRemove: IBreakpoint | undefined;
		let threadToContinue = this.getViewModel().focusedThread;
		const addTempBreakPoint = async () => {
			const bpExists = !!(this.getModel().getBreakpoints({ column, lineNumber, uri }).length);

			if (!bpExists) {
				const addResult = await this.addAndValidateBreakpoints(uri, lineNumber, column);
				if (addResult.thread) {
					threadToContinue = addResult.thread;
				}

				if (addResult.breakpoint) {
					breakpointToRemove = addResult.breakpoint;
				}
			}
			return { threadToContinue, breakpointToRemove };
		};
		const removeTempBreakPoint = (state: State): boolean => {
			if (state === State.Stopped || state === State.Inactive) {
				if (breakpointToRemove) {
					this.removeBreakpoints(breakpointToRemove.getId());
				}
				return true;
			}
			return false;
		};

		await addTempBreakPoint();
		if (this.state === State.Inactive) {
			// If no session exists start the debugger
			const { launch, name, getConfig } = this.getConfigurationManager().selectedConfiguration;
			const config = await getConfig();
			const configOrName = config ? Object.assign(deepClone(config), {}) : name;
			const listener = this.onDidChangeState(state => {
				if (removeTempBreakPoint(state)) {
					listener.dispose();
				}
			});
			await this.startDebugging(launch, configOrName, undefined, true);
		}
		if (this.state === State.Stopped) {
			const focusedSession = this.getViewModel().focusedSession;
			if (!focusedSession || !threadToContinue) {
				return;
			}

			const listener = threadToContinue.session.onDidChangeState(() => {
				if (removeTempBreakPoint(focusedSession.state)) {
					listener.dispose();
				}
			});
			await threadToContinue.continue();
		}
	}

	private async addAndValidateBreakpoints(uri: URI, lineNumber: number, column?: number) {
		const debugModel = this.getModel();
		const viewModel = this.getViewModel();

		const breakpoints = await this.addBreakpoints(uri, [{ lineNumber, column }], false);
		const breakpoint = breakpoints?.[0];
		if (!breakpoint) {
			return { breakpoint: undefined, thread: viewModel.focusedThread };
		}

		// If the breakpoint was not initially verified, wait up to 2s for it to become so.
		// Inherently racey if multiple sessions can verify async, but not solvable...
		if (!breakpoint.verified) {
			let listener: IDisposable;
			await raceTimeout(new Promise<void>(resolve => {
				listener = debugModel.onDidChangeBreakpoints(() => {
					if (breakpoint.verified) {
						resolve();
					}
				});
			}), 2000);
			listener!.dispose();
		}

		// Look at paused threads for sessions that verified this bp. Prefer, in order:
		const enum Score {
			/** The focused thread */
			Focused,
			/** Any other stopped thread of a session that verified the bp */
			Verified,
			/** Any thread that verified and paused in the same file */
			VerifiedAndPausedInFile,
			/** The focused thread if it verified the breakpoint */
			VerifiedAndFocused,
		}

		let bestThread = viewModel.focusedThread;
		let bestScore = Score.Focused;
		for (const sessionId of breakpoint.sessionsThatVerified) {
			const session = debugModel.getSession(sessionId);
			if (!session) {
				continue;
			}

			const threads = session.getAllThreads().filter(t => t.stopped);
			if (bestScore < Score.VerifiedAndFocused) {
				if (viewModel.focusedThread && threads.includes(viewModel.focusedThread)) {
					bestThread = viewModel.focusedThread;
					bestScore = Score.VerifiedAndFocused;
				}
			}

			if (bestScore < Score.VerifiedAndPausedInFile) {
				const pausedInThisFile = threads.find(t => {
					const top = t.getTopStackFrame();
					return top && this.uriIdentityService.extUri.isEqual(top.source.uri, uri);
				});

				if (pausedInThisFile) {
					bestThread = pausedInThisFile;
					bestScore = Score.VerifiedAndPausedInFile;
				}
			}

			if (bestScore < Score.Verified) {
				bestThread = threads[0];
				bestScore = Score.VerifiedAndPausedInFile;
			}
		}

		return { thread: bestThread, breakpoint };
	}
}

export function getStackFrameThreadAndSessionToFocus(model: IDebugModel, stackFrame: IStackFrame | undefined, thread?: IThread, session?: IDebugSession, avoidSession?: IDebugSession): { stackFrame: IStackFrame | undefined; thread: IThread | undefined; session: IDebugSession | undefined } {
	if (!session) {
		if (stackFrame || thread) {
			session = stackFrame ? stackFrame.thread.session : thread!.session;
		} else {
			const sessions = model.getSessions();
			const stoppedSession = sessions.find(s => s.state === State.Stopped);
			// Make sure to not focus session that is going down
			session = stoppedSession || sessions.find(s => s !== avoidSession && s !== avoidSession?.parentSession) || (sessions.length ? sessions[0] : undefined);
		}
	}

	if (!thread) {
		if (stackFrame) {
			thread = stackFrame.thread;
		} else {
			const threads = session ? session.getAllThreads() : undefined;
			const stoppedThread = threads && threads.find(t => t.stopped);
			thread = stoppedThread || (threads && threads.length ? threads[0] : undefined);
		}
	}

	if (!stackFrame && thread) {
		stackFrame = thread.getTopStackFrame();
	}

	return { session, thread, stackFrame };
}

async function sendToOneOrAllSessions(model: DebugModel, session: IDebugSession | undefined, send: (session: IDebugSession) => Promise<void>): Promise<void> {
	if (session) {
		await send(session);
	} else {
		await Promise.all(model.getSessions().map(s => send(s)));
	}
}
