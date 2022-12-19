/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { IStringDictionary } from 'vs/base/common/collections';
import { Emitter, Event } from 'vs/base/common/event';
import * as glob from 'vs/base/common/glob';
import * as json from 'vs/base/common/json';
import { Disposable, dispose, IDisposable, IReference } from 'vs/base/common/lifecycle';
import { LRUCache, Touch } from 'vs/base/common/map';
import * as Objects from 'vs/base/common/objects';
import { ValidationState, ValidationStatus } from 'vs/base/common/parsers';
import * as Platform from 'vs/base/common/platform';
import { TerminateResponseCode } from 'vs/base/common/processes';
import * as resources from 'vs/base/common/resources';
import Severity from 'vs/base/common/severity';
import * as Types from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import * as UUID from 'vs/base/common/uuid';
import * as nls from 'vs/nls';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService, IFileStatWithPartialMetadata } from 'vs/platform/files/common/files';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IProgressOptions, IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INamedProblemMatcher, ProblemMatcherRegistry } from 'vs/workbench/contrib/tasks/common/problemMatcher';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';

import { IModelService } from 'vs/editor/common/services/model';

import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState, WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { Markers } from 'vs/workbench/contrib/markers/common/markers';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

import { IOutputChannel, IOutputService } from 'vs/workbench/services/output/common/output';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

import { ITerminalGroupService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalProfileResolverService } from 'vs/workbench/contrib/terminal/common/terminal';

import { ConfiguringTask, ContributedTask, CustomTask, ExecutionEngine, InMemoryTask, ITaskEvent, ITaskIdentifier, ITaskSet, JsonSchemaVersion, KeyedTaskIdentifier, RuntimeType, Task, TaskDefinition, TaskEventKind, TaskGroup, TaskRunSource, TaskSettingId, TaskSorter, TaskSourceKind, TasksSchemaProperties, TASK_RUNNING_STATE, USER_TASKS_GROUP_KEY } from 'vs/workbench/contrib/tasks/common/tasks';
import { CustomExecutionSupportedContext, ICustomizationProperties, IProblemMatcherRunOptions, ITaskFilter, ITaskProvider, ITaskService, IWorkspaceFolderTaskResult, ProcessExecutionSupportedContext, ServerlessWebContext, ShellExecutionSupportedContext, TaskCommandsRegistered, TaskExecutionSupportedContext } from 'vs/workbench/contrib/tasks/common/taskService';
import { ITaskExecuteResult, ITaskResolver, ITaskSummary, ITaskSystem, ITaskSystemInfo, ITaskTerminateResponse, TaskError, TaskErrors, TaskExecuteKind } from 'vs/workbench/contrib/tasks/common/taskSystem';
import { getTemplates as getTaskTemplates } from 'vs/workbench/contrib/tasks/common/taskTemplates';

import * as TaskConfig from '../common/taskConfiguration';
import { TerminalTaskSystem } from './terminalTaskSystem';

import { IQuickInputService, IQuickPick, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';

import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TaskDefinitionRegistry } from 'vs/workbench/contrib/tasks/common/taskDefinitionRegistry';

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { once } from 'vs/base/common/functional';
import { toFormattedString } from 'vs/base/common/jsonFormatter';
import { Schemas } from 'vs/base/common/network';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { TextEditorSelectionRevealType } from 'vs/platform/editor/common/editor';
import { ILogService } from 'vs/platform/log/common/log';
import { IThemeService, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from 'vs/platform/workspace/common/workspaceTrust';
import { VirtualWorkspaceContext } from 'vs/workbench/common/contextkeys';
import { EditorResourceAccessor, SaveReason } from 'vs/workbench/common/editor';
import { IViewDescriptorService, IViewsService } from 'vs/workbench/common/views';
import { configureTaskIcon, isWorkspaceFolder, ITaskQuickPickEntry, QUICKOPEN_DETAIL_CONFIG, QUICKOPEN_SKIP_CONFIG, TaskQuickPick } from 'vs/workbench/contrib/tasks/browser/taskQuickPick';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILifecycleService, ShutdownReason, StartupKind } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { TerminalExitReason } from 'vs/platform/terminal/common/terminal';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

const QUICKOPEN_HISTORY_LIMIT_CONFIG = 'task.quickOpen.history';
const PROBLEM_MATCHER_NEVER_CONFIG = 'task.problemMatchers.neverPrompt';
const USE_SLOW_PICKER = 'task.quickOpen.showAll';

export namespace ConfigureTaskAction {
	export const ID = 'workbench.action.tasks.configureTaskRunner';
	export const TEXT = nls.localize('ConfigureTaskRunnerAction.label', "Configure Task");
}

export type TaskQuickPickEntryType = (IQuickPickItem & { task: Task }) | (IQuickPickItem & { folder: IWorkspaceFolder }) | (IQuickPickItem & { settingType: string });

class ProblemReporter implements TaskConfig.IProblemReporter {

	private _validationStatus: ValidationStatus;

	constructor(private _outputChannel: IOutputChannel) {
		this._validationStatus = new ValidationStatus();
	}

	public info(message: string): void {
		this._validationStatus.state = ValidationState.Info;
		this._outputChannel.append(message + '\n');
	}

	public warn(message: string): void {
		this._validationStatus.state = ValidationState.Warning;
		this._outputChannel.append(message + '\n');
	}

	public error(message: string): void {
		this._validationStatus.state = ValidationState.Error;
		this._outputChannel.append(message + '\n');
	}

	public fatal(message: string): void {
		this._validationStatus.state = ValidationState.Fatal;
		this._outputChannel.append(message + '\n');
	}

	public get status(): ValidationStatus {
		return this._validationStatus;
	}
}

export interface IWorkspaceFolderConfigurationResult {
	workspaceFolder: IWorkspaceFolder;
	config: TaskConfig.IExternalTaskRunnerConfiguration | undefined;
	hasErrors: boolean;
}

interface ICommandUpgrade {
	command?: string;
	args?: string[];
}

class TaskMap {
	private _store: Map<string, Task[]> = new Map();

	public forEach(callback: (value: Task[], folder: string) => void): void {
		this._store.forEach(callback);
	}

	public static getKey(workspaceFolder: IWorkspace | IWorkspaceFolder | string): string {
		let key: string | undefined;
		if (Types.isString(workspaceFolder)) {
			key = workspaceFolder;
		} else {
			const uri: URI | null | undefined = isWorkspaceFolder(workspaceFolder) ? workspaceFolder.uri : workspaceFolder.configuration;
			key = uri ? uri.toString() : '';
		}
		return key;
	}

	public get(workspaceFolder: IWorkspace | IWorkspaceFolder | string): Task[] {
		const key = TaskMap.getKey(workspaceFolder);
		let result: Task[] | undefined = this._store.get(key);
		if (!result) {
			result = [];
			this._store.set(key, result);
		}
		return result;
	}

	public add(workspaceFolder: IWorkspace | IWorkspaceFolder | string, ...task: Task[]): void {
		const key = TaskMap.getKey(workspaceFolder);
		let values = this._store.get(key);
		if (!values) {
			values = [];
			this._store.set(key, values);
		}
		values.push(...task);
	}

	public all(): Task[] {
		const result: Task[] = [];
		this._store.forEach((values) => result.push(...values));
		return result;
	}
}

export abstract class AbstractTaskService extends Disposable implements ITaskService {

	// private static autoDetectTelemetryName: string = 'taskServer.autoDetect';
	private static readonly RecentlyUsedTasks_Key = 'workbench.tasks.recentlyUsedTasks';
	private static readonly RecentlyUsedTasks_KeyV2 = 'workbench.tasks.recentlyUsedTasks2';
	private static readonly PersistentTasks_Key = 'workbench.tasks.persistentTasks';
	private static readonly IgnoreTask010DonotShowAgain_key = 'workbench.tasks.ignoreTask010Shown';

	public _serviceBrand: undefined;
	public static OutputChannelId: string = 'tasks';
	public static OutputChannelLabel: string = nls.localize('tasks', "Tasks");

	private static _nextHandle: number = 0;

	private _tasksReconnected: boolean = false;
	private _schemaVersion: JsonSchemaVersion | undefined;
	private _executionEngine: ExecutionEngine | undefined;
	private _workspaceFolders: IWorkspaceFolder[] | undefined;
	private _workspace: IWorkspace | undefined;
	private _ignoredWorkspaceFolders: IWorkspaceFolder[] | undefined;
	private _showIgnoreMessage?: boolean;
	private _providers: Map<number, ITaskProvider>;
	private _providerTypes: Map<number, string>;
	protected _taskSystemInfos: Map<string, ITaskSystemInfo[]>;

	protected _workspaceTasksPromise?: Promise<Map<string, IWorkspaceFolderTaskResult>>;

	protected _taskSystem?: ITaskSystem;
	protected _taskSystemListeners?: IDisposable[] = [];
	private _recentlyUsedTasksV1: LRUCache<string, string> | undefined;
	private _recentlyUsedTasks: LRUCache<string, string> | undefined;

	private _persistentTasks: LRUCache<string, string> | undefined;

	protected _taskRunningState: IContextKey<boolean>;

	private _inProgressTasks: Set<string> = new Set();

	protected _outputChannel: IOutputChannel;
	protected readonly _onDidStateChange: Emitter<ITaskEvent>;
	private _waitForSupportedExecutions: Promise<void>;
	private _onDidRegisterSupportedExecutions: Emitter<void> = new Emitter();
	private _onDidChangeTaskSystemInfo: Emitter<void> = new Emitter();
	private _willRestart: boolean = false;
	public onDidChangeTaskSystemInfo: Event<void> = this._onDidChangeTaskSystemInfo.event;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IMarkerService protected readonly _markerService: IMarkerService,
		@IOutputService protected readonly _outputService: IOutputService,
		@IPaneCompositePartService private readonly _paneCompositeService: IPaneCompositePartService,
		@IViewsService private readonly _viewsService: IViewsService,
		@ICommandService private readonly _commandService: ICommandService,
		@IEditorService private readonly _editorService: IEditorService,
		@IFileService protected readonly _fileService: IFileService,
		@IWorkspaceContextService protected readonly _contextService: IWorkspaceContextService,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IModelService protected readonly _modelService: IModelService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IConfigurationResolverService protected readonly _configurationResolverService: IConfigurationResolverService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IStorageService private readonly _storageService: IStorageService,
		@IProgressService private readonly _progressService: IProgressService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IDialogService protected readonly _dialogService: IDialogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IContextKeyService protected readonly _contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@IPathService private readonly _pathService: IPathService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IPreferencesService private readonly _preferencesService: IPreferencesService,
		@IViewDescriptorService private readonly _viewDescriptorService: IViewDescriptorService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@ILogService private readonly _logService: ILogService,
		@IThemeService private readonly _themeService: IThemeService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		this._workspaceTasksPromise = undefined;
		this._taskSystem = undefined;
		this._taskSystemListeners = undefined;
		this._outputChannel = this._outputService.getChannel(AbstractTaskService.OutputChannelId)!;
		this._providers = new Map<number, ITaskProvider>();
		this._providerTypes = new Map<number, string>();
		this._taskSystemInfos = new Map<string, ITaskSystemInfo[]>();
		this._register(this._contextService.onDidChangeWorkspaceFolders(() => {
			const folderSetup = this._computeWorkspaceFolderSetup();
			if (this.executionEngine !== folderSetup[2]) {
				this._disposeTaskSystemListeners();
				this._taskSystem = undefined;
			}
			this._updateSetup(folderSetup);
			return this._updateWorkspaceTasks(TaskRunSource.FolderOpen);
		}));
		this._register(this._configurationService.onDidChangeConfiguration(() => {
			if (!this._taskSystem && !this._workspaceTasksPromise) {
				return;
			}

			if (!this._taskSystem || this._taskSystem instanceof TerminalTaskSystem) {
				this._outputChannel.clear();
			}

			this._setTaskLRUCacheLimit();
			return this._updateWorkspaceTasks(TaskRunSource.ConfigurationChange);
		}));
		this._taskRunningState = TASK_RUNNING_STATE.bindTo(_contextKeyService);
		this._onDidStateChange = this._register(new Emitter());
		this._registerCommands().then(() => TaskCommandsRegistered.bindTo(this._contextKeyService).set(true));
		ServerlessWebContext.bindTo(this._contextKeyService).set(Platform.isWeb && !remoteAgentService.getConnection()?.remoteAuthority);
		this._configurationResolverService.contributeVariable('defaultBuildTask', async (): Promise<string | undefined> => {
			let tasks = await this._getTasksForGroup(TaskGroup.Build);
			if (tasks.length > 0) {
				const { none, defaults } = this._splitPerGroupType(tasks);
				if (defaults.length === 1) {
					return defaults[0]._label;
				} else if (defaults.length + none.length > 0) {
					tasks = defaults.concat(none);
				}
			}

			let entry: ITaskQuickPickEntry | null | undefined;
			if (tasks && tasks.length > 0) {
				entry = await this._showQuickPick(tasks, nls.localize('TaskService.pickBuildTaskForLabel', 'Select the build task (there is no default build task defined)'));
			}

			const task: Task | undefined | null = entry ? entry.task : undefined;
			if (!task) {
				return undefined;
			}
			return task._label;
		});
		this._lifecycleService.onBeforeShutdown(e => {
			this._willRestart = e.reason !== ShutdownReason.RELOAD;
		});
		this._register(this.onDidStateChange(e => {
			if ((this._willRestart || e.exitReason === TerminalExitReason.User) && e.taskId) {
				this.removePersistentTask(e.taskId);
			} else if (e.kind === TaskEventKind.Start && e.__task && e.__task.getWorkspaceFolder()) {
				this._setPersistentTask(e.__task);
			}
		}));
		this._waitForSupportedExecutions = new Promise(resolve => {
			once(this._onDidRegisterSupportedExecutions.event)(() => resolve());
		});
		if (this._terminalService.getReconnectedTerminals('Task')?.length) {
			this._attemptTaskReconnection();
		} else {
			this._register(this._terminalService.onDidChangeConnectionState(() => {
				if (this._terminalService.getReconnectedTerminals('Task')?.length) {
					this._attemptTaskReconnection();
				}
			}));
		}

		this._upgrade();
	}

	public registerSupportedExecutions(custom?: boolean, shell?: boolean, process?: boolean) {
		if (custom !== undefined) {
			const customContext = CustomExecutionSupportedContext.bindTo(this._contextKeyService);
			customContext.set(custom);
		}
		const isVirtual = !!VirtualWorkspaceContext.getValue(this._contextKeyService);
		if (shell !== undefined) {
			const shellContext = ShellExecutionSupportedContext.bindTo(this._contextKeyService);
			shellContext.set(shell && !isVirtual);
		}
		if (process !== undefined) {
			const processContext = ProcessExecutionSupportedContext.bindTo(this._contextKeyService);
			processContext.set(process && !isVirtual);
		}
		this._onDidRegisterSupportedExecutions.fire();
	}

	private _attemptTaskReconnection(): void {
		if (this._lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
			this._tasksReconnected = true;
			this._storageService.remove(AbstractTaskService.PersistentTasks_Key, StorageScope.WORKSPACE);
		}
		if (!this._configurationService.getValue(TaskSettingId.Reconnection) || this._tasksReconnected) {
			this._tasksReconnected = true;
			return;
		}
		this._getTaskSystem();
		this.getWorkspaceTasks().then(async () => {
			this._tasksReconnected = await this._reconnectTasks();
		});
	}

	private async _reconnectTasks(): Promise<boolean> {
		const tasks = await this.getSavedTasks('persistent');
		if (!tasks.length) {
			return true;
		}
		for (const task of tasks) {
			if (ConfiguringTask.is(task)) {
				const resolved = await this.tryResolveTask(task);
				if (resolved) {
					this.run(resolved, undefined, TaskRunSource.Reconnect);
				}
			} else {
				this.run(task, undefined, TaskRunSource.Reconnect);
			}
		}
		return true;
	}

	public get onDidStateChange(): Event<ITaskEvent> {
		return this._onDidStateChange.event;
	}

	public get supportsMultipleTaskExecutions(): boolean {
		return this.inTerminal();
	}

	private async _registerCommands(): Promise<void> {
		CommandsRegistry.registerCommand({
			id: 'workbench.action.tasks.runTask',
			handler: async (accessor, arg) => {
				if (await this._trust()) {
					this._runTaskCommand(arg);
				}
			},
			description: {
				description: 'Run Task',
				args: [{
					name: 'args',
					isOptional: true,
					description: nls.localize('runTask.arg', "Filters the tasks shown in the quickpick"),
					schema: {
						anyOf: [
							{
								type: 'string',
								description: nls.localize('runTask.label', "The task's label or a term to filter by")
							},
							{
								type: 'object',
								properties: {
									type: {
										type: 'string',
										description: nls.localize('runTask.type', "The contributed task type")
									},
									task: {
										type: 'string',
										description: nls.localize('runTask.task', "The task's label or a term to filter by")
									}
								}
							}
						]
					}
				}]
			}
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.reRunTask', async (accessor, arg) => {
			if (await this._trust()) {
				this._reRunTaskCommand();
			}
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.restartTask', async (accessor, arg) => {
			if (await this._trust()) {
				this._runRestartTaskCommand(arg);
			}
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.terminate', async (accessor, arg) => {
			if (await this._trust()) {
				this._runTerminateCommand(arg);
			}
		});
		CommandsRegistry.registerCommand('workbench.action.tasks.showLog', () => {
			this._showOutput();
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.build', async () => {
			if (await this._trust()) {
				this._runBuildCommand();
			}
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.test', async () => {
			if (await this._trust()) {
				this._runTestCommand();
			}
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.configureTaskRunner', async () => {
			if (await this._trust()) {
				this._runConfigureTasks();
			}
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.configureDefaultBuildTask', async () => {
			if (await this._trust()) {
				this._runConfigureDefaultBuildTask();
			}
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.configureDefaultTestTask', async () => {
			if (await this._trust()) {
				this._runConfigureDefaultTestTask();
			}
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.showTasks', async () => {
			if (await this._trust()) {
				return this.runShowTasks();
			}
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.toggleProblems', () => this._commandService.executeCommand(Markers.TOGGLE_MARKERS_VIEW_ACTION_ID));

		CommandsRegistry.registerCommand('workbench.action.tasks.openUserTasks', async () => {
			const resource = this._getResourceForKind(TaskSourceKind.User);
			if (resource) {
				this._openTaskFile(resource, TaskSourceKind.User);
			}
		});

		CommandsRegistry.registerCommand('workbench.action.tasks.openWorkspaceFileTasks', async () => {
			const resource = this._getResourceForKind(TaskSourceKind.WorkspaceFile);
			if (resource) {
				this._openTaskFile(resource, TaskSourceKind.WorkspaceFile);
			}
		});
	}

	private get workspaceFolders(): IWorkspaceFolder[] {
		if (!this._workspaceFolders) {
			this._updateSetup();
		}
		return this._workspaceFolders!;
	}

	private get ignoredWorkspaceFolders(): IWorkspaceFolder[] {
		if (!this._ignoredWorkspaceFolders) {
			this._updateSetup();
		}
		return this._ignoredWorkspaceFolders!;
	}

	protected get executionEngine(): ExecutionEngine {
		if (this._executionEngine === undefined) {
			this._updateSetup();
		}
		return this._executionEngine!;
	}

	private get schemaVersion(): JsonSchemaVersion {
		if (this._schemaVersion === undefined) {
			this._updateSetup();
		}
		return this._schemaVersion!;
	}

	private get showIgnoreMessage(): boolean {
		if (this._showIgnoreMessage === undefined) {
			this._showIgnoreMessage = !this._storageService.getBoolean(AbstractTaskService.IgnoreTask010DonotShowAgain_key, StorageScope.WORKSPACE, false);
		}
		return this._showIgnoreMessage;
	}

	private _getActivationEvents(type: string | undefined): string[] {
		const result: string[] = [];
		result.push('onCommand:workbench.action.tasks.runTask');
		if (type) {
			// send a specific activation event for this task type
			result.push(`onTaskType:${type}`);
		} else {
			// send activation events for all task types
			for (const definition of TaskDefinitionRegistry.all()) {
				result.push(`onTaskType:${definition.taskType}`);
			}
		}
		return result;
	}

	private async _activateTaskProviders(type: string | undefined): Promise<void> {
		// We need to first wait for extensions to be registered because we might read
		// the `TaskDefinitionRegistry` in case `type` is `undefined`
		await this._extensionService.whenInstalledExtensionsRegistered();

		await Promise.all(
			this._getActivationEvents(type).map(activationEvent => this._extensionService.activateByEvent(activationEvent))
		);
	}

	private _updateSetup(setup?: [IWorkspaceFolder[], IWorkspaceFolder[], ExecutionEngine, JsonSchemaVersion, IWorkspace | undefined]): void {
		if (!setup) {
			setup = this._computeWorkspaceFolderSetup();
		}
		this._workspaceFolders = setup[0];
		if (this._ignoredWorkspaceFolders) {
			if (this._ignoredWorkspaceFolders.length !== setup[1].length) {
				this._showIgnoreMessage = undefined;
			} else {
				const set: Set<string> = new Set();
				this._ignoredWorkspaceFolders.forEach(folder => set.add(folder.uri.toString()));
				for (const folder of setup[1]) {
					if (!set.has(folder.uri.toString())) {
						this._showIgnoreMessage = undefined;
						break;
					}
				}
			}
		}
		this._ignoredWorkspaceFolders = setup[1];
		this._executionEngine = setup[2];
		this._schemaVersion = setup[3];
		this._workspace = setup[4];
	}

	protected _showOutput(runSource: TaskRunSource = TaskRunSource.User): void {
		if (!VirtualWorkspaceContext.getValue(this._contextKeyService) && ((runSource === TaskRunSource.User) || (runSource === TaskRunSource.ConfigurationChange))) {
			this._notificationService.prompt(Severity.Warning, nls.localize('taskServiceOutputPrompt', 'There are task errors. See the output for details.'),
				[{
					label: nls.localize('showOutput', "Show output"),
					run: () => {
						this._outputService.showChannel(this._outputChannel.id, true);
					}
				}]);
		}
	}

	protected _disposeTaskSystemListeners(): void {
		if (this._taskSystemListeners) {
			dispose(this._taskSystemListeners);
			this._taskSystemListeners = undefined;
		}
	}

	public registerTaskProvider(provider: ITaskProvider, type: string): IDisposable {
		if (!provider) {
			return {
				dispose: () => { }
			};
		}
		const handle = AbstractTaskService._nextHandle++;
		this._providers.set(handle, provider);
		this._providerTypes.set(handle, type);
		return {
			dispose: () => {
				this._providers.delete(handle);
				this._providerTypes.delete(handle);
			}
		};
	}

	get hasTaskSystemInfo(): boolean {
		const infosCount = Array.from(this._taskSystemInfos.values()).flat().length;
		// If there's a remoteAuthority, then we end up with 2 taskSystemInfos,
		// one for each extension host.
		if (this._environmentService.remoteAuthority) {
			return infosCount > 1;
		}
		return infosCount > 0;
	}

	public registerTaskSystem(key: string, info: ITaskSystemInfo): void {
		// Ideally the Web caller of registerRegisterTaskSystem would use the correct key.
		// However, the caller doesn't know about the workspace folders at the time of the call, even though we know about them here.
		if (info.platform === Platform.Platform.Web) {
			key = this.workspaceFolders.length ? this.workspaceFolders[0].uri.scheme : key;
		}
		if (!this._taskSystemInfos.has(key)) {
			this._taskSystemInfos.set(key, [info]);
		} else {
			const infos = this._taskSystemInfos.get(key)!;
			if (info.platform === Platform.Platform.Web) {
				// Web infos should be pushed last.
				infos.push(info);
			} else {
				infos.unshift(info);
			}
		}

		if (this.hasTaskSystemInfo) {
			this._onDidChangeTaskSystemInfo.fire();
		}
	}

	private _getTaskSystemInfo(key: string): ITaskSystemInfo | undefined {
		const infos = this._taskSystemInfos.get(key);
		return (infos && infos.length) ? infos[0] : undefined;
	}

	public extensionCallbackTaskComplete(task: Task, result: number): Promise<void> {
		if (!this._taskSystem) {
			return Promise.resolve();
		}
		return this._taskSystem.customExecutionComplete(task, result);
	}

	/**
	 * Get a subset of workspace tasks that match a certain predicate.
	 */
	private async _findWorkspaceTasks(predicate: (task: ConfiguringTask | Task, workspaceFolder: IWorkspaceFolder) => boolean): Promise<(ConfiguringTask | Task)[]> {
		const result: (ConfiguringTask | Task)[] = [];

		const tasks = await this.getWorkspaceTasks();
		for (const [, workspaceTasks] of tasks) {
			if (workspaceTasks.configurations) {
				for (const taskName in workspaceTasks.configurations.byIdentifier) {
					const task = workspaceTasks.configurations.byIdentifier[taskName];
					if (predicate(task, workspaceTasks.workspaceFolder)) {
						result.push(task);
					}
				}
			}
			if (workspaceTasks.set) {
				for (const task of workspaceTasks.set.tasks) {
					if (predicate(task, workspaceTasks.workspaceFolder)) {
						result.push(task);
					}
				}
			}
		}
		return result;
	}

	private async _findWorkspaceTasksInGroup(group: TaskGroup, isDefault: boolean): Promise<(ConfiguringTask | Task)[]> {
		return this._findWorkspaceTasks((task) => {
			const taskGroup = task.configurationProperties.group;
			if (taskGroup && typeof taskGroup !== 'string') {
				return (taskGroup._id === group._id && (!isDefault || !!taskGroup.isDefault));
			}
			return false;
		});
	}

	public async getTask(folder: IWorkspace | IWorkspaceFolder | string, identifier: string | ITaskIdentifier, compareId: boolean = false): Promise<Task | undefined> {
		if (!(await this._trust())) {
			return;
		}
		const name = Types.isString(folder) ? folder : isWorkspaceFolder(folder) ? folder.name : folder.configuration ? resources.basename(folder.configuration) : undefined;
		if (this.ignoredWorkspaceFolders.some(ignored => ignored.name === name)) {
			return Promise.reject(new Error(nls.localize('TaskServer.folderIgnored', 'The folder {0} is ignored since it uses task version 0.1.0', name)));
		}
		const key: string | KeyedTaskIdentifier | undefined = !Types.isString(identifier)
			? TaskDefinition.createTaskIdentifier(identifier, console)
			: identifier;

		if (key === undefined) {
			return Promise.resolve(undefined);
		}

		// Try to find the task in the workspace
		const requestedFolder = TaskMap.getKey(folder);
		const matchedTasks = await this._findWorkspaceTasks((task, workspaceFolder) => {
			const taskFolder = TaskMap.getKey(workspaceFolder);
			if (taskFolder !== requestedFolder && taskFolder !== USER_TASKS_GROUP_KEY) {
				return false;
			}
			return task.matches(key, compareId);
		});
		matchedTasks.sort(task => task._source.kind === TaskSourceKind.Extension ? 1 : -1);
		if (matchedTasks.length > 0) {
			// Nice, we found a configured task!
			const task = matchedTasks[0];
			if (ConfiguringTask.is(task)) {
				return this.tryResolveTask(task);
			} else {
				return task;
			}
		}

		// We didn't find the task, so we need to ask all resolvers about it
		const map = await this._getGroupedTasks();
		let values = map.get(folder);
		values = values.concat(map.get(USER_TASKS_GROUP_KEY));

		if (!values) {
			return undefined;
		}
		values = values.filter(task => task.matches(key, compareId)).sort(task => task._source.kind === TaskSourceKind.Extension ? 1 : -1);
		return values.length > 0 ? values[0] : undefined;
	}

	public async tryResolveTask(configuringTask: ConfiguringTask): Promise<Task | undefined> {
		if (!(await this._trust())) {
			return;
		}
		await this._activateTaskProviders(configuringTask.type);
		let matchingProvider: ITaskProvider | undefined;
		let matchingProviderUnavailable: boolean = false;
		for (const [handle, provider] of this._providers) {
			const providerType = this._providerTypes.get(handle);
			if (configuringTask.type === providerType) {
				if (providerType && !this._isTaskProviderEnabled(providerType)) {
					matchingProviderUnavailable = true;
					continue;
				}
				matchingProvider = provider;
				break;
			}
		}

		if (!matchingProvider) {
			if (matchingProviderUnavailable) {
				this._outputChannel.append(nls.localize(
					'TaskService.providerUnavailable',
					'Warning: {0} tasks are unavailable in the current environment.\n',
					configuringTask.configures.type
				));
			}
			return;
		}

		// Try to resolve the task first
		try {
			const resolvedTask = await matchingProvider.resolveTask(configuringTask);
			if (resolvedTask && (resolvedTask._id === configuringTask._id)) {
				return TaskConfig.createCustomTask(resolvedTask, configuringTask);
			}
		} catch (error) {
			// Ignore errors. The task could not be provided by any of the providers.
		}

		// The task couldn't be resolved. Instead, use the less efficient provideTask.
		const tasks = await this.tasks({ type: configuringTask.type });
		for (const task of tasks) {
			if (task._id === configuringTask._id) {
				return TaskConfig.createCustomTask(<ContributedTask>task, configuringTask);
			}
		}

		return;
	}

	protected abstract _versionAndEngineCompatible(filter?: ITaskFilter): boolean;

	public async tasks(filter?: ITaskFilter): Promise<Task[]> {
		if (!(await this._trust())) {
			return [];
		}
		if (!this._versionAndEngineCompatible(filter)) {
			return Promise.resolve<Task[]>([]);
		}
		return this._getGroupedTasks(filter).then((map) => {
			if (!filter || !filter.type) {
				return map.all();
			}
			const result: Task[] = [];
			map.forEach((tasks) => {
				for (const task of tasks) {
					if (ContributedTask.is(task) && ((task.defines.type === filter.type) || (task._source.label === filter.type))) {
						result.push(task);
					} else if (CustomTask.is(task)) {
						if (task.type === filter.type) {
							result.push(task);
						} else {
							const customizes = task.customizes();
							if (customizes && customizes.type === filter.type) {
								result.push(task);
							}
						}
					}
				}
			});
			return result;
		});
	}

	public taskTypes(): string[] {
		const types: string[] = [];
		if (this._isProvideTasksEnabled()) {
			for (const definition of TaskDefinitionRegistry.all()) {
				if (this._isTaskProviderEnabled(definition.taskType)) {
					types.push(definition.taskType);
				}
			}
		}
		return types;
	}

	public createSorter(): TaskSorter {
		return new TaskSorter(this._contextService.getWorkspace() ? this._contextService.getWorkspace().folders : []);
	}

	private _isActive(): Promise<boolean> {
		if (!this._taskSystem) {
			return Promise.resolve(false);
		}
		return this._taskSystem.isActive();
	}

	public async getActiveTasks(): Promise<Task[]> {
		if (!this._taskSystem) {
			return [];
		}
		return this._taskSystem.getActiveTasks();
	}

	public async getBusyTasks(): Promise<Task[]> {
		if (!this._taskSystem) {
			return [];
		}
		return this._taskSystem.getBusyTasks();
	}

	public getRecentlyUsedTasksV1(): LRUCache<string, string> {
		if (this._recentlyUsedTasksV1) {
			return this._recentlyUsedTasksV1;
		}
		const quickOpenHistoryLimit = this._configurationService.getValue<number>(QUICKOPEN_HISTORY_LIMIT_CONFIG);
		this._recentlyUsedTasksV1 = new LRUCache<string, string>(quickOpenHistoryLimit);

		const storageValue = this._storageService.get(AbstractTaskService.RecentlyUsedTasks_Key, StorageScope.WORKSPACE);
		if (storageValue) {
			try {
				const values: string[] = JSON.parse(storageValue);
				if (Array.isArray(values)) {
					for (const value of values) {
						this._recentlyUsedTasksV1.set(value, value);
					}
				}
			} catch (error) {
				// Ignore. We use the empty result
			}
		}
		return this._recentlyUsedTasksV1;
	}

	private _getTasksFromStorage(type: 'persistent' | 'historical'): LRUCache<string, string> {
		return type === 'persistent' ? this._getPersistentTasks() : this._getRecentTasks();
	}

	private _getRecentTasks(): LRUCache<string, string> {
		if (this._recentlyUsedTasks) {
			return this._recentlyUsedTasks;
		}
		const quickOpenHistoryLimit = this._configurationService.getValue<number>(QUICKOPEN_HISTORY_LIMIT_CONFIG);
		this._recentlyUsedTasks = new LRUCache<string, string>(quickOpenHistoryLimit);

		const storageValue = this._storageService.get(AbstractTaskService.RecentlyUsedTasks_KeyV2, StorageScope.WORKSPACE);
		if (storageValue) {
			try {
				const values: [string, string][] = JSON.parse(storageValue);
				if (Array.isArray(values)) {
					for (const value of values) {
						this._recentlyUsedTasks.set(value[0], value[1]);
					}
				}
			} catch (error) {
				// Ignore. We use the empty result
			}
		}
		return this._recentlyUsedTasks;
	}

	private _getPersistentTasks(): LRUCache<string, string> {
		if (this._persistentTasks) {
			return this._persistentTasks;
		}
		//TODO: should this # be configurable?
		this._persistentTasks = new LRUCache<string, string>(10);
		const storageValue = this._storageService.get(AbstractTaskService.PersistentTasks_Key, StorageScope.WORKSPACE);
		if (storageValue) {
			try {
				const values: [string, string][] = JSON.parse(storageValue);
				if (Array.isArray(values)) {
					for (const value of values) {
						this._persistentTasks.set(value[0], value[1]);
					}
				}
			} catch (error) {
				// Ignore. We use the empty result
			}
		}
		return this._persistentTasks;
	}

	private _getFolderFromTaskKey(key: string): { folder: string | undefined; isWorkspaceFile: boolean | undefined } {
		const keyValue: { folder: string | undefined; id: string | undefined } = JSON.parse(key);
		return {
			folder: keyValue.folder, isWorkspaceFile: keyValue.id?.endsWith(TaskSourceKind.WorkspaceFile)
		};
	}

	public async getSavedTasks(type: 'persistent' | 'historical'): Promise<(Task | ConfiguringTask)[]> {
		const folderMap: IStringDictionary<IWorkspaceFolder> = Object.create(null);
		this.workspaceFolders.forEach(folder => {
			folderMap[folder.uri.toString()] = folder;
		});
		const folderToTasksMap: Map<string, any> = new Map();
		const workspaceToTaskMap: Map<string, any> = new Map();
		const storedTasks = this._getTasksFromStorage(type);
		const tasks: (Task | ConfiguringTask)[] = [];

		function addTaskToMap(map: Map<string, any>, folder: string | undefined, task: any) {
			if (folder && !map.has(folder)) {
				map.set(folder, []);
			}
			if (folder && (folderMap[folder] || (folder === USER_TASKS_GROUP_KEY)) && task) {
				map.get(folder).push(task);
			}
		}
		for (const entry of storedTasks.entries()) {
			const key = entry[0];
			const task = JSON.parse(entry[1]);
			const folderInfo = this._getFolderFromTaskKey(key);
			addTaskToMap(folderInfo.isWorkspaceFile ? workspaceToTaskMap : folderToTasksMap, folderInfo.folder, task);
		}

		const readTasksMap: Map<string, (Task | ConfiguringTask)> = new Map();

		async function readTasks(that: AbstractTaskService, map: Map<string, any>, isWorkspaceFile: boolean) {
			for (const key of map.keys()) {
				const custom: CustomTask[] = [];
				const customized: IStringDictionary<ConfiguringTask> = Object.create(null);
				const taskConfigSource = (folderMap[key]
					? (isWorkspaceFile
						? TaskConfig.TaskConfigSource.WorkspaceFile : TaskConfig.TaskConfigSource.TasksJson)
					: TaskConfig.TaskConfigSource.User);
				await that._computeTasksForSingleConfig(folderMap[key] ?? await that._getAFolder(), {
					version: '2.0.0',
					tasks: map.get(key)
				}, TaskRunSource.System, custom, customized, taskConfigSource, true);
				custom.forEach(task => {
					const taskKey = task.getRecentlyUsedKey();
					if (taskKey) {
						readTasksMap.set(taskKey, task);
					}
				});
				for (const configuration in customized) {
					const taskKey = customized[configuration].getRecentlyUsedKey();
					if (taskKey) {
						readTasksMap.set(taskKey, customized[configuration]);
					}
				}
			}
		}
		await readTasks(this, folderToTasksMap, false);
		await readTasks(this, workspaceToTaskMap, true);
		for (const key of storedTasks.keys()) {
			if (readTasksMap.has(key)) {
				tasks.push(readTasksMap.get(key)!);
			}
		}
		return tasks;
	}

	public removeRecentlyUsedTask(taskRecentlyUsedKey: string) {
		if (this._getTasksFromStorage('historical').has(taskRecentlyUsedKey)) {
			this._getTasksFromStorage('historical').delete(taskRecentlyUsedKey);
			this._saveRecentlyUsedTasks();
		}
	}

	public removePersistentTask(key: string) {
		if (this._getTasksFromStorage('persistent').has(key)) {
			this._getTasksFromStorage('persistent').delete(key);
			this._savePersistentTasks();
		}
	}

	private _setTaskLRUCacheLimit() {
		const quickOpenHistoryLimit = this._configurationService.getValue<number>(QUICKOPEN_HISTORY_LIMIT_CONFIG);
		if (this._recentlyUsedTasks) {
			this._recentlyUsedTasks.limit = quickOpenHistoryLimit;
		}
	}

	private async _setRecentlyUsedTask(task: Task): Promise<void> {
		let key = task.getRecentlyUsedKey();
		if (!InMemoryTask.is(task) && key) {
			const customizations = this._createCustomizableTask(task);
			if (ContributedTask.is(task) && customizations) {
				const custom: CustomTask[] = [];
				const customized: IStringDictionary<ConfiguringTask> = Object.create(null);
				await this._computeTasksForSingleConfig(task._source.workspaceFolder ?? this.workspaceFolders[0], {
					version: '2.0.0',
					tasks: [customizations]
				}, TaskRunSource.System, custom, customized, TaskConfig.TaskConfigSource.TasksJson, true);
				for (const configuration in customized) {
					key = customized[configuration].getRecentlyUsedKey()!;
				}
			}
			this._getTasksFromStorage('historical').set(key, JSON.stringify(customizations));
			this._saveRecentlyUsedTasks();
		}
	}

	private _saveRecentlyUsedTasks(): void {
		if (!this._recentlyUsedTasks) {
			return;
		}
		const quickOpenHistoryLimit = this._configurationService.getValue<number>(QUICKOPEN_HISTORY_LIMIT_CONFIG);
		// setting history limit to 0 means no LRU sorting
		if (quickOpenHistoryLimit === 0) {
			return;
		}
		let keys = [...this._recentlyUsedTasks.keys()];
		if (keys.length > quickOpenHistoryLimit) {
			keys = keys.slice(0, quickOpenHistoryLimit);
		}
		const keyValues: [string, string][] = [];
		for (const key of keys) {
			keyValues.push([key, this._recentlyUsedTasks.get(key, Touch.None)!]);
		}
		this._storageService.store(AbstractTaskService.RecentlyUsedTasks_KeyV2, JSON.stringify(keyValues), StorageScope.WORKSPACE, StorageTarget.USER);
	}

	private async _setPersistentTask(task: Task): Promise<void> {
		if (!this._configurationService.getValue(TaskSettingId.Reconnection)) {
			return;
		}
		let key = task.getRecentlyUsedKey();
		if (!InMemoryTask.is(task) && key) {
			const customizations = this._createCustomizableTask(task);
			if (ContributedTask.is(task) && customizations) {
				const custom: CustomTask[] = [];
				const customized: IStringDictionary<ConfiguringTask> = Object.create(null);
				await this._computeTasksForSingleConfig(task._source.workspaceFolder ?? this.workspaceFolders[0], {
					version: '2.0.0',
					tasks: [customizations]
				}, TaskRunSource.System, custom, customized, TaskConfig.TaskConfigSource.TasksJson, true);
				for (const configuration in customized) {
					key = customized[configuration].getRecentlyUsedKey()!;
				}
			}
			if (!task.configurationProperties.isBackground) {
				return;
			}
			this._getTasksFromStorage('persistent').set(key, JSON.stringify(customizations));
			this._savePersistentTasks();
		}
	}

	private _savePersistentTasks(): void {
		if (!this._persistentTasks) {
			return;
		}
		const keys = [...this._persistentTasks.keys()];
		const keyValues: [string, string][] = [];
		for (const key of keys) {
			keyValues.push([key, this._persistentTasks.get(key, Touch.None)!]);
		}
		this._storageService.store(AbstractTaskService.PersistentTasks_Key, JSON.stringify(keyValues), StorageScope.WORKSPACE, StorageTarget.USER);
	}

	private _openDocumentation(): void {
		this._openerService.open(URI.parse('https://code.visualstudio.com/docs/editor/tasks#_defining-a-problem-matcher'));
	}

	private async _findSingleWorkspaceTaskOfGroup(group: TaskGroup): Promise<ITaskSummary | undefined> {
		const tasksOfGroup = await this._findWorkspaceTasksInGroup(group, true);
		if ((tasksOfGroup.length === 1) && (typeof tasksOfGroup[0].configurationProperties.group !== 'string') && tasksOfGroup[0].configurationProperties.group?.isDefault) {
			let resolvedTask: Task | undefined;
			if (ConfiguringTask.is(tasksOfGroup[0])) {
				resolvedTask = await this.tryResolveTask(tasksOfGroup[0]);
			} else {
				resolvedTask = tasksOfGroup[0];
			}
			if (resolvedTask) {
				return this.run(resolvedTask, undefined, TaskRunSource.User);
			}
		}
		return undefined;
	}

	private async _build(): Promise<ITaskSummary> {
		const tryBuildShortcut = await this._findSingleWorkspaceTaskOfGroup(TaskGroup.Build);
		if (tryBuildShortcut) {
			return tryBuildShortcut;
		}
		return this._getGroupedTasksAndExecute();
	}

	private async _runTest(): Promise<ITaskSummary> {
		const tryTestShortcut = await this._findSingleWorkspaceTaskOfGroup(TaskGroup.Test);
		if (tryTestShortcut) {
			return tryTestShortcut;
		}

		return this._getGroupedTasksAndExecute(true);
	}

	private async _getGroupedTasksAndExecute(test?: boolean): Promise<ITaskSummary> {
		const tasks = await this._getGroupedTasks();
		const runnable = this._createRunnableTask(tasks, test ? TaskGroup.Test : TaskGroup.Build);
		if (!runnable || !runnable.task) {
			if (test) {
				if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
					throw new TaskError(Severity.Info, nls.localize('TaskService.noTestTask1', 'No test task defined. Mark a task with \'isTestCommand\' in the tasks.json file.'), TaskErrors.NoTestTask);
				} else {
					throw new TaskError(Severity.Info, nls.localize('TaskService.noTestTask2', 'No test task defined. Mark a task with as a \'test\' group in the tasks.json file.'), TaskErrors.NoTestTask);
				}
			} else {
				if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
					throw new TaskError(Severity.Info, nls.localize('TaskService.noBuildTask1', 'No build task defined. Mark a task with \'isBuildCommand\' in the tasks.json file.'), TaskErrors.NoBuildTask);
				} else {
					throw new TaskError(Severity.Info, nls.localize('TaskService.noBuildTask2', 'No build task defined. Mark a task with as a \'build\' group in the tasks.json file.'), TaskErrors.NoBuildTask);
				}
			}
		}
		let executeTaskResult: ITaskSummary;
		try {
			executeTaskResult = await this._executeTask(runnable.task, runnable.resolver, TaskRunSource.User);
		} catch (error) {
			this._handleError(error);
			return Promise.reject(error);
		}
		return executeTaskResult;
	}

	public async run(task: Task | undefined, options?: IProblemMatcherRunOptions, runSource: TaskRunSource = TaskRunSource.System): Promise<ITaskSummary | undefined> {
		if (!(await this._trust())) {
			return;
		}
		if (!task) {
			throw new TaskError(Severity.Info, nls.localize('TaskServer.noTask', 'Task to execute is undefined'), TaskErrors.TaskNotFound);
		}
		const resolver = this._createResolver();
		let executeTaskResult: ITaskSummary | undefined;
		try {
			if (options && options.attachProblemMatcher && this._shouldAttachProblemMatcher(task) && !InMemoryTask.is(task)) {
				const taskToExecute = await this._attachProblemMatcher(task);
				if (taskToExecute) {
					executeTaskResult = await this._executeTask(taskToExecute, resolver, runSource);
				}
			} else {
				executeTaskResult = await this._executeTask(task, resolver, runSource);
			}
			return executeTaskResult;
		} catch (error) {
			this._handleError(error);
			return Promise.reject(error);
		}
	}

	private _isProvideTasksEnabled(): boolean {
		const settingValue = this._configurationService.getValue(TaskSettingId.AutoDetect);
		return settingValue === 'on';
	}

	private _isProblemMatcherPromptEnabled(type?: string): boolean {
		const settingValue = this._configurationService.getValue(PROBLEM_MATCHER_NEVER_CONFIG);
		if (Types.isBoolean(settingValue)) {
			return !settingValue;
		}
		if (type === undefined) {
			return true;
		}
		const settingValueMap: IStringDictionary<boolean> = <any>settingValue;
		return !settingValueMap[type];
	}

	private _getTypeForTask(task: Task): string {
		let type: string;
		if (CustomTask.is(task)) {
			const configProperties: TaskConfig.IConfigurationProperties = task._source.config.element;
			type = (<any>configProperties).type;
		} else {
			type = task.getDefinition()!.type;
		}
		return type;
	}

	private _shouldAttachProblemMatcher(task: Task): boolean {
		const enabled = this._isProblemMatcherPromptEnabled(this._getTypeForTask(task));
		if (enabled === false) {
			return false;
		}
		if (!this._canCustomize(task)) {
			return false;
		}
		if (task.configurationProperties.group !== undefined && task.configurationProperties.group !== TaskGroup.Build) {
			return false;
		}
		if (task.configurationProperties.problemMatchers !== undefined && task.configurationProperties.problemMatchers.length > 0) {
			return false;
		}
		if (ContributedTask.is(task)) {
			return !task.hasDefinedMatchers && !!task.configurationProperties.problemMatchers && (task.configurationProperties.problemMatchers.length === 0);
		}
		if (CustomTask.is(task)) {
			const configProperties: TaskConfig.IConfigurationProperties = task._source.config.element;
			return configProperties.problemMatcher === undefined && !task.hasDefinedMatchers;
		}
		return false;
	}

	private async _updateNeverProblemMatcherSetting(type: string): Promise<void> {
		const current = this._configurationService.getValue(PROBLEM_MATCHER_NEVER_CONFIG);
		if (current === true) {
			return;
		}
		let newValue: IStringDictionary<boolean>;
		if (current !== false) {
			newValue = <any>current;
		} else {
			newValue = Object.create(null);
		}
		newValue[type] = true;
		return this._configurationService.updateValue(PROBLEM_MATCHER_NEVER_CONFIG, newValue);
	}

	private async _attachProblemMatcher(task: ContributedTask | CustomTask): Promise<Task | undefined> {
		interface IProblemMatcherPickEntry extends IQuickPickItem {
			matcher: INamedProblemMatcher | undefined;
			never?: boolean;
			learnMore?: boolean;
			setting?: string;
		}
		let entries: QuickPickInput<IProblemMatcherPickEntry>[] = [];
		for (const key of ProblemMatcherRegistry.keys()) {
			const matcher = ProblemMatcherRegistry.get(key);
			if (matcher.deprecated) {
				continue;
			}
			if (matcher.name === matcher.label) {
				entries.push({ label: matcher.name, matcher: matcher });
			} else {
				entries.push({
					label: matcher.label,
					description: `$${matcher.name}`,
					matcher: matcher
				});
			}
		}
		if (entries.length === 0) {
			return;
		}
		entries = entries.sort((a, b) => {
			if (a.label && b.label) {
				return a.label.localeCompare(b.label);
			} else {
				return 0;
			}
		});
		entries.unshift({ type: 'separator', label: nls.localize('TaskService.associate', 'associate') });
		let taskType: string;
		if (CustomTask.is(task)) {
			const configProperties: TaskConfig.IConfigurationProperties = task._source.config.element;
			taskType = (<any>configProperties).type;
		} else {
			taskType = task.getDefinition().type;
		}
		entries.unshift(
			{ label: nls.localize('TaskService.attachProblemMatcher.continueWithout', 'Continue without scanning the task output'), matcher: undefined },
			{ label: nls.localize('TaskService.attachProblemMatcher.never', 'Never scan the task output for this task'), matcher: undefined, never: true },
			{ label: nls.localize('TaskService.attachProblemMatcher.neverType', 'Never scan the task output for {0} tasks', taskType), matcher: undefined, setting: taskType },
			{ label: nls.localize('TaskService.attachProblemMatcher.learnMoreAbout', 'Learn more about scanning the task output'), matcher: undefined, learnMore: true }
		);
		const problemMatcher = await this._quickInputService.pick(entries, { placeHolder: nls.localize('selectProblemMatcher', 'Select for which kind of errors and warnings to scan the task output') });
		if (!problemMatcher) {
			return task;
		}
		if (problemMatcher.learnMore) {
			this._openDocumentation();
			return undefined;
		}
		if (problemMatcher.never) {
			this.customize(task, { problemMatcher: [] }, true);
			return task;
		}
		if (problemMatcher.matcher) {
			const newTask = task.clone();
			const matcherReference = `$${problemMatcher.matcher.name}`;
			const properties: ICustomizationProperties = { problemMatcher: [matcherReference] };
			newTask.configurationProperties.problemMatchers = [matcherReference];
			const matcher = ProblemMatcherRegistry.get(problemMatcher.matcher.name);
			if (matcher && matcher.watching !== undefined) {
				properties.isBackground = true;
				newTask.configurationProperties.isBackground = true;
			}
			this.customize(task, properties, true);
			return newTask;
		}
		if (problemMatcher.setting) {
			await this._updateNeverProblemMatcherSetting(problemMatcher.setting);
		}
		return task;
	}

	private async _getTasksForGroup(group: TaskGroup): Promise<Task[]> {
		const groups = await this._getGroupedTasks();
		const result: Task[] = [];
		groups.forEach(tasks => {
			for (const task of tasks) {
				const configTaskGroup = TaskGroup.from(task.configurationProperties.group);
				if (configTaskGroup?._id === group._id) {
					result.push(task);
				}
			}
		});
		return result;
	}

	public needsFolderQualification(): boolean {
		return this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
	}

	private _canCustomize(task: Task): boolean {
		if (this.schemaVersion !== JsonSchemaVersion.V2_0_0) {
			return false;
		}
		if (CustomTask.is(task)) {
			return true;
		}
		if (ContributedTask.is(task)) {
			return !!task.getWorkspaceFolder();
		}
		return false;
	}

	private async _formatTaskForJson(resource: URI, task: TaskConfig.ICustomTask | TaskConfig.IConfiguringTask): Promise<string> {
		let reference: IReference<IResolvedTextEditorModel> | undefined;
		let stringValue: string = '';
		try {
			reference = await this._textModelResolverService.createModelReference(resource);
			const model = reference.object.textEditorModel;
			const { tabSize, insertSpaces } = model.getOptions();
			const eol = model.getEOL();
			let stringified = toFormattedString(task, { eol, tabSize, insertSpaces });
			const regex = new RegExp(eol + (insertSpaces ? ' '.repeat(tabSize) : '\\t'), 'g');
			stringified = stringified.replace(regex, eol + (insertSpaces ? ' '.repeat(tabSize * 3) : '\t\t\t'));
			const twoTabs = insertSpaces ? ' '.repeat(tabSize * 2) : '\t\t';
			stringValue = twoTabs + stringified.slice(0, stringified.length - 1) + twoTabs + stringified.slice(stringified.length - 1);
		} finally {
			reference?.dispose();
		}
		return stringValue;
	}

	private async _openEditorAtTask(resource: URI | undefined, task: TaskConfig.ICustomTask | TaskConfig.IConfiguringTask | string | undefined, configIndex: number = -1): Promise<boolean> {
		if (resource === undefined) {
			return Promise.resolve(false);
		}
		const fileContent = await this._fileService.readFile(resource);
		const content = fileContent.value;
		if (!content || !task) {
			return false;
		}
		const contentValue = content.toString();
		let stringValue: string | undefined;
		if (configIndex !== -1) {
			const json: TaskConfig.IExternalTaskRunnerConfiguration = this._configurationService.getValue<TaskConfig.IExternalTaskRunnerConfiguration>('tasks', { resource });
			if (json.tasks && (json.tasks.length > configIndex)) {
				stringValue = await this._formatTaskForJson(resource, json.tasks[configIndex]);
			}
		}
		if (!stringValue) {
			if (typeof task === 'string') {
				stringValue = task;
			} else {
				stringValue = await this._formatTaskForJson(resource, task);
			}
		}

		const index = contentValue.indexOf(stringValue);
		let startLineNumber = 1;
		for (let i = 0; i < index; i++) {
			if (contentValue.charAt(i) === '\n') {
				startLineNumber++;
			}
		}
		let endLineNumber = startLineNumber;
		for (let i = 0; i < stringValue.length; i++) {
			if (stringValue.charAt(i) === '\n') {
				endLineNumber++;
			}
		}
		const selection = startLineNumber > 1 ? { startLineNumber, startColumn: startLineNumber === endLineNumber ? 4 : 3, endLineNumber, endColumn: startLineNumber === endLineNumber ? undefined : 4 } : undefined;

		await this._editorService.openEditor({
			resource,
			options: {
				pinned: false,
				forceReload: true, // because content might have changed
				selection,
				selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport
			}
		});
		return !!selection;
	}

	private _createCustomizableTask(task: ContributedTask | CustomTask | ConfiguringTask): TaskConfig.ICustomTask | TaskConfig.IConfiguringTask | undefined {
		let toCustomize: TaskConfig.ICustomTask | TaskConfig.IConfiguringTask | undefined;
		const taskConfig = CustomTask.is(task) || ConfiguringTask.is(task) ? task._source.config : undefined;
		if (taskConfig && taskConfig.element) {
			toCustomize = { ...(taskConfig.element) };
		} else if (ContributedTask.is(task)) {
			toCustomize = {
			};
			const identifier: TaskConfig.ITaskIdentifier = Object.assign(Object.create(null), task.defines);
			delete identifier['_key'];
			Object.keys(identifier).forEach(key => (<any>toCustomize)![key] = identifier[key]);
			if (task.configurationProperties.problemMatchers && task.configurationProperties.problemMatchers.length > 0 && Types.isStringArray(task.configurationProperties.problemMatchers)) {
				toCustomize.problemMatcher = task.configurationProperties.problemMatchers;
			}
			if (task.configurationProperties.group) {
				toCustomize.group = TaskConfig.GroupKind.to(task.configurationProperties.group);
			}
		}
		if (!toCustomize) {
			return undefined;
		}
		if (toCustomize.problemMatcher === undefined && task.configurationProperties.problemMatchers === undefined || (task.configurationProperties.problemMatchers && task.configurationProperties.problemMatchers.length === 0)) {
			toCustomize.problemMatcher = [];
		}
		if (task._source.label !== 'Workspace') {
			toCustomize.label = task.configurationProperties.identifier;
		} else {
			toCustomize.label = task._label;
		}
		toCustomize.detail = task.configurationProperties.detail;
		return toCustomize;
	}

	public async customize(task: ContributedTask | CustomTask | ConfiguringTask, properties?: ICustomizationProperties, openConfig?: boolean): Promise<void> {
		if (!(await this._trust())) {
			return;
		}

		const workspaceFolder = task.getWorkspaceFolder();
		if (!workspaceFolder) {
			return Promise.resolve(undefined);
		}
		const configuration = this._getConfiguration(workspaceFolder, task._source.kind);
		if (configuration.hasParseErrors) {
			this._notificationService.warn(nls.localize('customizeParseErrors', 'The current task configuration has errors. Please fix the errors first before customizing a task.'));
			return Promise.resolve<void>(undefined);
		}

		const fileConfig = configuration.config;
		const toCustomize = this._createCustomizableTask(task);
		if (!toCustomize) {
			return Promise.resolve(undefined);
		}
		const index: number | undefined = CustomTask.is(task) ? task._source.config.index : undefined;
		if (properties) {
			for (const property of Object.getOwnPropertyNames(properties)) {
				const value = (<any>properties)[property];
				if (value !== undefined && value !== null) {
					(<any>toCustomize)[property] = value;
				}
			}
		}

		if (!fileConfig) {
			const value = {
				version: '2.0.0',
				tasks: [toCustomize]
			};
			let content = [
				'{',
				nls.localize('tasksJsonComment', '\t// See https://go.microsoft.com/fwlink/?LinkId=733558 \n\t// for the documentation about the tasks.json format'),
			].join('\n') + JSON.stringify(value, null, '\t').substr(1);
			const editorConfig = this._configurationService.getValue<any>();
			if (editorConfig.editor.insertSpaces) {
				content = content.replace(/(\n)(\t+)/g, (_, s1, s2) => s1 + ' '.repeat(s2.length * editorConfig.editor.tabSize));
			}
			await this._textFileService.create([{ resource: workspaceFolder.toResource('.vscode/tasks.json'), value: content }]);
		} else {
			// We have a global task configuration
			if ((index === -1) && properties) {
				if (properties.problemMatcher !== undefined) {
					fileConfig.problemMatcher = properties.problemMatcher;
					await this._writeConfiguration(workspaceFolder, 'tasks.problemMatchers', fileConfig.problemMatcher, task._source.kind);
				} else if (properties.group !== undefined) {
					fileConfig.group = properties.group;
					await this._writeConfiguration(workspaceFolder, 'tasks.group', fileConfig.group, task._source.kind);
				}
			} else {
				if (!Array.isArray(fileConfig.tasks)) {
					fileConfig.tasks = [];
				}
				if (index === undefined) {
					fileConfig.tasks.push(toCustomize);
				} else {
					fileConfig.tasks[index] = toCustomize;
				}
				await this._writeConfiguration(workspaceFolder, 'tasks.tasks', fileConfig.tasks, task._source.kind);
			}
		}

		if (openConfig) {
			this._openEditorAtTask(this._getResourceForTask(task), toCustomize);
		}
	}

	private _writeConfiguration(workspaceFolder: IWorkspaceFolder, key: string, value: any, source?: string): Promise<void> | undefined {
		let target: ConfigurationTarget | undefined = undefined;
		switch (source) {
			case TaskSourceKind.User: target = ConfigurationTarget.USER; break;
			case TaskSourceKind.WorkspaceFile: target = ConfigurationTarget.WORKSPACE; break;
			default: if (this._contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
				target = ConfigurationTarget.WORKSPACE;
			} else if (this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
				target = ConfigurationTarget.WORKSPACE_FOLDER;
			}
		}
		if (target) {
			return this._configurationService.updateValue(key, value, { resource: workspaceFolder.uri }, target);
		} else {
			return undefined;
		}
	}

	private _getResourceForKind(kind: string): URI | undefined {
		this._updateSetup();
		switch (kind) {
			case TaskSourceKind.User: {
				return resources.joinPath(resources.dirname(this._preferencesService.userSettingsResource), 'tasks.json');
			}
			case TaskSourceKind.WorkspaceFile: {
				if (this._workspace && this._workspace.configuration) {
					return this._workspace.configuration;
				}
			}
			default: {
				return undefined;
			}
		}
	}

	private _getResourceForTask(task: CustomTask | ConfiguringTask | ContributedTask): URI {
		if (CustomTask.is(task)) {
			let uri = this._getResourceForKind(task._source.kind);
			if (!uri) {
				const taskFolder = task.getWorkspaceFolder();
				if (taskFolder) {
					uri = taskFolder.toResource(task._source.config.file);
				} else {
					uri = this.workspaceFolders[0].uri;
				}
			}
			return uri;
		} else {
			return task.getWorkspaceFolder()!.toResource('.vscode/tasks.json');
		}
	}

	public async openConfig(task: CustomTask | ConfiguringTask | undefined): Promise<boolean> {
		let resource: URI | undefined;
		if (task) {
			resource = this._getResourceForTask(task);
		} else {
			resource = (this._workspaceFolders && (this._workspaceFolders.length > 0)) ? this._workspaceFolders[0].toResource('.vscode/tasks.json') : undefined;
		}
		return this._openEditorAtTask(resource, task ? task._label : undefined, task ? task._source.config.index : -1);
	}

	private _createRunnableTask(tasks: TaskMap, group: TaskGroup): { task: Task; resolver: ITaskResolver } | undefined {
		interface IResolverData {
			id: Map<string, Task>;
			label: Map<string, Task>;
			identifier: Map<string, Task>;
		}

		const resolverData: Map<string, IResolverData> = new Map();
		const workspaceTasks: Task[] = [];
		const extensionTasks: Task[] = [];
		tasks.forEach((tasks, folder) => {
			let data = resolverData.get(folder);
			if (!data) {
				data = {
					id: new Map<string, Task>(),
					label: new Map<string, Task>(),
					identifier: new Map<string, Task>()
				};
				resolverData.set(folder, data);
			}
			for (const task of tasks) {
				data.id.set(task._id, task);
				data.label.set(task._label, task);
				if (task.configurationProperties.identifier) {
					data.identifier.set(task.configurationProperties.identifier, task);
				}
				if (group && task.configurationProperties.group === group) {
					if (task._source.kind === TaskSourceKind.Workspace) {
						workspaceTasks.push(task);
					} else {
						extensionTasks.push(task);
					}
				}
			}
		});
		const resolver: ITaskResolver = {
			resolve: async (uri: URI | string, alias: string) => {
				const data = resolverData.get(typeof uri === 'string' ? uri : uri.toString());
				if (!data) {
					return undefined;
				}
				return data.id.get(alias) || data.label.get(alias) || data.identifier.get(alias);
			}
		};
		if (workspaceTasks.length > 0) {
			if (workspaceTasks.length > 1) {
				this._outputChannel.append(nls.localize('moreThanOneBuildTask', 'There are many build tasks defined in the tasks.json. Executing the first one.\n'));
			}
			return { task: workspaceTasks[0], resolver };
		}
		if (extensionTasks.length === 0) {
			return undefined;
		}

		// We can only have extension tasks if we are in version 2.0.0. Then we can even run
		// multiple build tasks.
		if (extensionTasks.length === 1) {
			return { task: extensionTasks[0], resolver };
		} else {
			const id: string = UUID.generateUuid();
			const task: InMemoryTask = new InMemoryTask(
				id,
				{ kind: TaskSourceKind.InMemory, label: 'inMemory' },
				id,
				'inMemory',
				{ reevaluateOnRerun: true },
				{
					identifier: id,
					dependsOn: extensionTasks.map((extensionTask) => { return { uri: extensionTask.getWorkspaceFolder()!.uri, task: extensionTask._id }; }),
					name: id
				}
			);
			return { task, resolver };
		}
	}

	private _createResolver(grouped?: TaskMap): ITaskResolver {
		interface ResolverData {
			label: Map<string, Task>;
			identifier: Map<string, Task>;
			taskIdentifier: Map<string, Task>;
		}

		let resolverData: Map<string, ResolverData> | undefined;

		async function quickResolve(that: AbstractTaskService, uri: URI | string, identifier: string | ITaskIdentifier) {
			const foundTasks = await that._findWorkspaceTasks((task: Task | ConfiguringTask): boolean => {
				const taskUri = ((ConfiguringTask.is(task) || CustomTask.is(task)) ? task._source.config.workspaceFolder?.uri : undefined);
				const originalUri = (typeof uri === 'string' ? uri : uri.toString());
				if (taskUri?.toString() !== originalUri) {
					return false;
				}
				if (Types.isString(identifier)) {
					return ((task._label === identifier) || (task.configurationProperties.identifier === identifier));
				} else {
					const keyedIdentifier = task.getDefinition(true);
					const searchIdentifier = TaskDefinition.createTaskIdentifier(identifier, console);
					return (searchIdentifier && keyedIdentifier) ? (searchIdentifier._key === keyedIdentifier._key) : false;
				}
			});
			if (foundTasks.length === 0) {
				return undefined;
			}
			const task = foundTasks[0];
			if (ConfiguringTask.is(task)) {
				return that.tryResolveTask(task);
			}
			return task;
		}

		async function getResolverData(that: AbstractTaskService) {
			if (resolverData === undefined) {
				resolverData = new Map();
				(grouped || await that._getGroupedTasks()).forEach((tasks, folder) => {
					let data = resolverData!.get(folder);
					if (!data) {
						data = { label: new Map<string, Task>(), identifier: new Map<string, Task>(), taskIdentifier: new Map<string, Task>() };
						resolverData!.set(folder, data);
					}
					for (const task of tasks) {
						data.label.set(task._label, task);
						if (task.configurationProperties.identifier) {
							data.identifier.set(task.configurationProperties.identifier, task);
						}
						const keyedIdentifier = task.getDefinition(true);
						if (keyedIdentifier !== undefined) {
							data.taskIdentifier.set(keyedIdentifier._key, task);
						}
					}
				});
			}
			return resolverData;
		}

		async function fullResolve(that: AbstractTaskService, uri: URI | string, identifier: string | ITaskIdentifier) {
			const allResolverData = await getResolverData(that);
			const data = allResolverData.get(typeof uri === 'string' ? uri : uri.toString());
			if (!data) {
				return undefined;
			}
			if (Types.isString(identifier)) {
				return data.label.get(identifier) || data.identifier.get(identifier);
			} else {
				const key = TaskDefinition.createTaskIdentifier(identifier, console);
				return key !== undefined ? data.taskIdentifier.get(key._key) : undefined;
			}
		}

		return {
			resolve: async (uri: URI | string, identifier: string | ITaskIdentifier | undefined) => {
				if (!identifier) {
					return undefined;
				}
				if ((resolverData === undefined) && (grouped === undefined)) {
					return (await quickResolve(this, uri, identifier)) ?? fullResolve(this, uri, identifier);
				} else {
					return fullResolve(this, uri, identifier);
				}
			}
		};
	}

	private async _saveBeforeRun(): Promise<boolean> {
		enum SaveBeforeRunConfigOptions {
			Always = 'always',
			Never = 'never',
			Prompt = 'prompt'
		}

		const saveBeforeRunTaskConfig: SaveBeforeRunConfigOptions = this._configurationService.getValue(TaskSettingId.SaveBeforeRun);

		if (saveBeforeRunTaskConfig === SaveBeforeRunConfigOptions.Never) {
			return false;
		} else if (saveBeforeRunTaskConfig === SaveBeforeRunConfigOptions.Prompt && this._editorService.editors.some(e => e.isDirty())) {
			const dialogOptions = await this._dialogService.show(
				Severity.Info,
				nls.localize('TaskSystem.saveBeforeRun.prompt.title', 'Save all editors?'),
				[nls.localize('saveBeforeRun.save', 'Save'), nls.localize('saveBeforeRun.dontSave', 'Don\'t save')],
				{
					detail: nls.localize('detail', "Do you want to save all editors before running the task?"),
					cancelId: 1
				}
			);

			if (dialogOptions.choice !== 0) {
				return false;
			}
		}
		await this._editorService.saveAll({ reason: SaveReason.AUTO });
		return true;
	}

	private async _executeTask(task: Task, resolver: ITaskResolver, runSource: TaskRunSource): Promise<ITaskSummary> {
		let taskToRun: Task = task;
		const qualifiedLabel = task.getQualifiedLabel();
		if (this._inProgressTasks.has(qualifiedLabel)) {
			this._logService.info('Prevented duplicate task from running', qualifiedLabel);
			return { exitCode: 0 };
		}
		this._inProgressTasks.add(qualifiedLabel);
		if (await this._saveBeforeRun()) {
			await this._configurationService.reloadConfiguration();
			await this._updateWorkspaceTasks();
			const taskFolder = task.getWorkspaceFolder();
			const taskIdentifier = task.configurationProperties.identifier;
			// Since we save before running tasks, the task may have changed as part of the save.
			// However, if the TaskRunSource is not User, then we shouldn't try to fetch the task again
			// since this can cause a new'd task to get overwritten with a provided task.
			taskToRun = ((taskFolder && taskIdentifier && (runSource === TaskRunSource.User))
				? await this.getTask(taskFolder, taskIdentifier) : task) ?? task;
		}
		await ProblemMatcherRegistry.onReady();
		const executeResult = runSource === TaskRunSource.Reconnect ? this._getTaskSystem().reconnect(taskToRun, resolver) : this._getTaskSystem().run(taskToRun, resolver);
		if (executeResult) {
			this._inProgressTasks.delete(qualifiedLabel);
			return this._handleExecuteResult(executeResult, runSource);
		}
		this._inProgressTasks.delete(qualifiedLabel);
		return { exitCode: 0 };
	}

	private async _handleExecuteResult(executeResult: ITaskExecuteResult, runSource?: TaskRunSource): Promise<ITaskSummary> {
		if (runSource === TaskRunSource.User) {
			await this._setRecentlyUsedTask(executeResult.task);
		}
		if (executeResult.kind === TaskExecuteKind.Active) {
			const active = executeResult.active;
			if (active && active.same) {
				if (this._taskSystem?.isTaskVisible(executeResult.task)) {
					const message = nls.localize('TaskSystem.activeSame.noBackground', 'The task \'{0}\' is already active.', executeResult.task.getQualifiedLabel());
					const lastInstance = this._getTaskSystem().getLastInstance(executeResult.task) ?? executeResult.task;
					this._notificationService.prompt(Severity.Warning, message,
						[{
							label: nls.localize('terminateTask', "Terminate Task"),
							run: () => this.terminate(lastInstance)
						},
						{
							label: nls.localize('restartTask', "Restart Task"),
							run: () => this._restart(lastInstance)
						}],
						{ sticky: true }
					);
				} else {
					this._taskSystem?.revealTask(executeResult.task);
				}
			} else {
				throw new TaskError(Severity.Warning, nls.localize('TaskSystem.active', 'There is already a task running. Terminate it first before executing another task.'), TaskErrors.RunningTask);
			}
		}
		this._setRecentlyUsedTask(executeResult.task);
		return executeResult.promise;
	}

	private async _restart(task: Task): Promise<void> {
		if (!this._taskSystem) {
			return;
		}
		const response = await this._taskSystem.terminate(task);
		if (response.success) {
			try {
				await this.run(task);
			} catch {
				// eat the error, we don't care about it here
			}
		} else {
			this._notificationService.warn(nls.localize('TaskSystem.restartFailed', 'Failed to terminate and restart task {0}', Types.isString(task) ? task : task.configurationProperties.name));
		}
	}

	public async terminate(task: Task): Promise<ITaskTerminateResponse> {
		if (!(await this._trust())) {
			return { success: true, task: undefined };
		}

		if (!this._taskSystem) {
			return { success: true, task: undefined };
		}
		this._inProgressTasks.delete(task.getQualifiedLabel());
		return this._taskSystem.terminate(task);
	}

	private _terminateAll(): Promise<ITaskTerminateResponse[]> {
		if (!this._taskSystem) {
			return Promise.resolve<ITaskTerminateResponse[]>([]);
		}
		return this._taskSystem.terminateAll();
	}

	protected _createTerminalTaskSystem(): ITaskSystem {
		return new TerminalTaskSystem(
			this._terminalService, this._terminalGroupService, this._outputService, this._paneCompositeService, this._viewsService, this._markerService,
			this._modelService, this._configurationResolverService,
			this._contextService, this._environmentService,
			AbstractTaskService.OutputChannelId, this._fileService, this._terminalProfileResolverService,
			this._pathService, this._viewDescriptorService, this._logService, this._configurationService, this._notificationService,
			this, this._instantiationService,
			(workspaceFolder: IWorkspaceFolder | undefined) => {
				if (workspaceFolder) {
					return this._getTaskSystemInfo(workspaceFolder.uri.scheme);
				} else if (this._taskSystemInfos.size > 0) {
					const infos = Array.from(this._taskSystemInfos.entries());
					const notFile = infos.filter(info => info[0] !== Schemas.file);
					if (notFile.length > 0) {
						return notFile[0][1][0];
					}
					return infos[0][1][0];
				} else {
					return undefined;
				}
			}
		);
	}

	protected abstract _getTaskSystem(): ITaskSystem;

	private _isTaskProviderEnabled(type: string) {
		const definition = TaskDefinitionRegistry.get(type);
		return !definition || !definition.when || this._contextKeyService.contextMatchesRules(definition.when);
	}

	private async _getGroupedTasks(filter?: ITaskFilter): Promise<TaskMap> {
		const type = filter?.type;
		const needsRecentTasksMigration = this._needsRecentTasksMigration();
		await this._activateTaskProviders(filter?.type);
		const validTypes: IStringDictionary<boolean> = Object.create(null);
		TaskDefinitionRegistry.all().forEach(definition => validTypes[definition.taskType] = true);
		validTypes['shell'] = true;
		validTypes['process'] = true;
		const contributedTaskSets = await new Promise<ITaskSet[]>(resolve => {
			const result: ITaskSet[] = [];
			let counter: number = 0;
			const done = (value: ITaskSet | undefined) => {
				if (value) {
					result.push(value);
				}
				if (--counter === 0) {
					resolve(result);
				}
			};
			const error = (error: any) => {
				try {
					if (error && Types.isString(error.message)) {
						this._outputChannel.append('Error: ');
						this._outputChannel.append(error.message);
						this._outputChannel.append('\n');
						this._showOutput();
					} else {
						this._outputChannel.append('Unknown error received while collecting tasks from providers.\n');
						this._showOutput();
					}
				} finally {
					if (--counter === 0) {
						resolve(result);
					}
				}
			};
			if (this._isProvideTasksEnabled() && (this.schemaVersion === JsonSchemaVersion.V2_0_0) && (this._providers.size > 0)) {
				let foundAnyProviders = false;
				for (const [handle, provider] of this._providers) {
					const providerType = this._providerTypes.get(handle);
					if ((type === undefined) || (type === providerType)) {
						if (providerType && !this._isTaskProviderEnabled(providerType)) {
							continue;
						}
						foundAnyProviders = true;
						counter++;
						provider.provideTasks(validTypes).then((taskSet: ITaskSet) => {
							// Check that the tasks provided are of the correct type
							for (const task of taskSet.tasks) {
								if (task.type !== this._providerTypes.get(handle)) {
									this._outputChannel.append(nls.localize('unexpectedTaskType', "The task provider for \"{0}\" tasks unexpectedly provided a task of type \"{1}\".\n", this._providerTypes.get(handle), task.type));
									if ((task.type !== 'shell') && (task.type !== 'process')) {
										this._showOutput();
									}
									break;
								}
							}
							return done(taskSet);
						}, error);
					}
				}
				if (!foundAnyProviders) {
					resolve(result);
				}
			} else {
				resolve(result);
			}
		});

		const result: TaskMap = new TaskMap();
		const contributedTasks: TaskMap = new TaskMap();

		for (const set of contributedTaskSets) {
			for (const task of set.tasks) {
				const workspaceFolder = task.getWorkspaceFolder();
				if (workspaceFolder) {
					contributedTasks.add(workspaceFolder, task);
				}
			}
		}

		try {
			const customTasks = await this.getWorkspaceTasks();
			const customTasksKeyValuePairs = Array.from(customTasks);
			const customTasksPromises = customTasksKeyValuePairs.map(async ([key, folderTasks]) => {
				const contributed = contributedTasks.get(key);
				if (!folderTasks.set) {
					if (contributed) {
						result.add(key, ...contributed);
					}
					return;
				}

				if (this._contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
					result.add(key, ...folderTasks.set.tasks);
				} else {
					const configurations = folderTasks.configurations;
					const legacyTaskConfigurations = folderTasks.set ? this._getLegacyTaskConfigurations(folderTasks.set) : undefined;
					const customTasksToDelete: Task[] = [];
					if (configurations || legacyTaskConfigurations) {
						const unUsedConfigurations: Set<string> = new Set<string>();
						if (configurations) {
							Object.keys(configurations.byIdentifier).forEach(key => unUsedConfigurations.add(key));
						}
						for (const task of contributed) {
							if (!ContributedTask.is(task)) {
								continue;
							}
							if (configurations) {
								const configuringTask = configurations.byIdentifier[task.defines._key];
								if (configuringTask) {
									unUsedConfigurations.delete(task.defines._key);
									result.add(key, TaskConfig.createCustomTask(task, configuringTask));
								} else {
									result.add(key, task);
								}
							} else if (legacyTaskConfigurations) {
								const configuringTask = legacyTaskConfigurations[task.defines._key];
								if (configuringTask) {
									result.add(key, TaskConfig.createCustomTask(task, configuringTask));
									customTasksToDelete.push(configuringTask);
								} else {
									result.add(key, task);
								}
							} else {
								result.add(key, task);
							}
						}
						if (customTasksToDelete.length > 0) {
							const toDelete = customTasksToDelete.reduce<IStringDictionary<boolean>>((map, task) => {
								map[task._id] = true;
								return map;
							}, Object.create(null));
							for (const task of folderTasks.set.tasks) {
								if (toDelete[task._id]) {
									continue;
								}
								result.add(key, task);
							}
						} else {
							result.add(key, ...folderTasks.set.tasks);
						}

						const unUsedConfigurationsAsArray = Array.from(unUsedConfigurations);

						const unUsedConfigurationPromises = unUsedConfigurationsAsArray.map(async (value) => {
							const configuringTask = configurations!.byIdentifier[value];
							if (type && (type !== configuringTask.configures.type)) {
								return;
							}

							let requiredTaskProviderUnavailable: boolean = false;

							for (const [handle, provider] of this._providers) {
								const providerType = this._providerTypes.get(handle);
								if (configuringTask.type === providerType) {
									if (providerType && !this._isTaskProviderEnabled(providerType)) {
										requiredTaskProviderUnavailable = true;
										continue;
									}

									try {
										const resolvedTask = await provider.resolveTask(configuringTask);
										if (resolvedTask && (resolvedTask._id === configuringTask._id)) {
											result.add(key, TaskConfig.createCustomTask(resolvedTask, configuringTask));
											return;
										}
									} catch (error) {
										// Ignore errors. The task could not be provided by any of the providers.
									}
								}
							}

							if (requiredTaskProviderUnavailable) {
								this._outputChannel.append(nls.localize(
									'TaskService.providerUnavailable',
									'Warning: {0} tasks are unavailable in the current environment.\n',
									configuringTask.configures.type
								));
							} else {
								this._outputChannel.append(nls.localize(
									'TaskService.noConfiguration',
									'Error: The {0} task detection didn\'t contribute a task for the following configuration:\n{1}\nThe task will be ignored.\n',
									configuringTask.configures.type,
									JSON.stringify(configuringTask._source.config.element, undefined, 4)
								));
								this._showOutput();
							}
						});

						await Promise.all(unUsedConfigurationPromises);
					} else {
						result.add(key, ...folderTasks.set.tasks);
						result.add(key, ...contributed);
					}
				}
			});

			await Promise.all(customTasksPromises);
			if (needsRecentTasksMigration) {
				// At this point we have all the tasks and can migrate the recently used tasks.
				await this._migrateRecentTasks(result.all());
			}
			return result;
		} catch {
			// If we can't read the tasks.json file provide at least the contributed tasks
			const result: TaskMap = new TaskMap();
			for (const set of contributedTaskSets) {
				for (const task of set.tasks) {
					const folder = task.getWorkspaceFolder();
					if (folder) {
						result.add(folder, task);
					}
				}
			}
			return result;
		}
	}

	private _getLegacyTaskConfigurations(workspaceTasks: ITaskSet): IStringDictionary<CustomTask> | undefined {
		let result: IStringDictionary<CustomTask> | undefined;
		function getResult(): IStringDictionary<CustomTask> {
			if (result) {
				return result;
			}
			result = Object.create(null);
			return result!;
		}
		for (const task of workspaceTasks.tasks) {
			if (CustomTask.is(task)) {
				const commandName = task.command && task.command.name;
				// This is for backwards compatibility with the 0.1.0 task annotation code
				// if we had a gulp, jake or grunt command a task specification was a annotation
				if (commandName === 'gulp' || commandName === 'grunt' || commandName === 'jake') {
					const identifier = KeyedTaskIdentifier.create({
						type: commandName,
						task: task.configurationProperties.name
					});
					getResult()[identifier._key] = task;
				}
			}
		}
		return result;
	}

	public async getWorkspaceTasks(runSource: TaskRunSource = TaskRunSource.User): Promise<Map<string, IWorkspaceFolderTaskResult>> {
		if (!(await this._trust())) {
			return new Map();
		}
		await this._waitForSupportedExecutions;
		if (this._workspaceTasksPromise) {
			return this._workspaceTasksPromise;
		}
		return this._updateWorkspaceTasks(runSource);
	}

	private _updateWorkspaceTasks(runSource: TaskRunSource = TaskRunSource.User): Promise<Map<string, IWorkspaceFolderTaskResult>> {
		this._workspaceTasksPromise = this._computeWorkspaceTasks(runSource);
		return this._workspaceTasksPromise;
	}

	private async _getAFolder(): Promise<IWorkspaceFolder> {
		let folder = this.workspaceFolders.length > 0 ? this.workspaceFolders[0] : undefined;
		if (!folder) {
			const userhome = await this._pathService.userHome();
			folder = new WorkspaceFolder({ uri: userhome, name: resources.basename(userhome), index: 0 });
		}
		return folder;
	}

	protected async _computeWorkspaceTasks(runSource: TaskRunSource = TaskRunSource.User): Promise<Map<string, IWorkspaceFolderTaskResult>> {
		const promises: Promise<IWorkspaceFolderTaskResult | undefined>[] = [];
		for (const folder of this.workspaceFolders) {
			promises.push(this._computeWorkspaceFolderTasks(folder, runSource).then((value) => value, () => undefined));
		}
		const values = await Promise.all(promises);
		const result = new Map<string, IWorkspaceFolderTaskResult>();
		for (const value of values) {
			if (value) {
				result.set(value.workspaceFolder.uri.toString(), value);
			}
		}

		const folder = await this._getAFolder();
		if (this._contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
			const workspaceFileTasks = await this._computeWorkspaceFileTasks(folder, runSource).then((value) => value, () => undefined);
			if (workspaceFileTasks && this._workspace && this._workspace.configuration) {
				result.set(this._workspace.configuration.toString(), workspaceFileTasks);
			}
		}

		const userTasks = await this._computeUserTasks(folder, runSource).then((value) => value, () => undefined);
		if (userTasks) {
			result.set(USER_TASKS_GROUP_KEY, userTasks);
		}
		return result;
	}

	private get _jsonTasksSupported(): boolean {
		return ShellExecutionSupportedContext.getValue(this._contextKeyService) === true && ProcessExecutionSupportedContext.getValue(this._contextKeyService) === true;
	}

	private async _computeWorkspaceFolderTasks(workspaceFolder: IWorkspaceFolder, runSource: TaskRunSource = TaskRunSource.User): Promise<IWorkspaceFolderTaskResult> {
		const workspaceFolderConfiguration = (this._executionEngine === ExecutionEngine.Process ? await this._computeLegacyConfiguration(workspaceFolder) : await this._computeConfiguration(workspaceFolder));
		if (!workspaceFolderConfiguration || !workspaceFolderConfiguration.config || workspaceFolderConfiguration.hasErrors) {
			return Promise.resolve({ workspaceFolder, set: undefined, configurations: undefined, hasErrors: workspaceFolderConfiguration ? workspaceFolderConfiguration.hasErrors : false });
		}
		await ProblemMatcherRegistry.onReady();
		const taskSystemInfo: ITaskSystemInfo | undefined = this._getTaskSystemInfo(workspaceFolder.uri.scheme);
		const problemReporter = new ProblemReporter(this._outputChannel);
		const parseResult = TaskConfig.parse(workspaceFolder, undefined, taskSystemInfo ? taskSystemInfo.platform : Platform.platform, workspaceFolderConfiguration.config!, problemReporter, TaskConfig.TaskConfigSource.TasksJson, this._contextKeyService);
		let hasErrors = false;
		if (!parseResult.validationStatus.isOK() && (parseResult.validationStatus.state !== ValidationState.Info)) {
			hasErrors = true;
			this._showOutput(runSource);
		}
		if (problemReporter.status.isFatal()) {
			problemReporter.fatal(nls.localize('TaskSystem.configurationErrors', 'Error: the provided task configuration has validation errors and can\'t not be used. Please correct the errors first.'));
			return { workspaceFolder, set: undefined, configurations: undefined, hasErrors };
		}
		let customizedTasks: { byIdentifier: IStringDictionary<ConfiguringTask> } | undefined;
		if (parseResult.configured && parseResult.configured.length > 0) {
			customizedTasks = {
				byIdentifier: Object.create(null)
			};
			for (const task of parseResult.configured) {
				customizedTasks.byIdentifier[task.configures._key] = task;
			}
		}
		if (!this._jsonTasksSupported && (parseResult.custom.length > 0)) {
			console.warn('Custom workspace tasks are not supported.');
		}
		return { workspaceFolder, set: { tasks: this._jsonTasksSupported ? parseResult.custom : [] }, configurations: customizedTasks, hasErrors };
	}

	private _testParseExternalConfig(config: TaskConfig.IExternalTaskRunnerConfiguration | undefined, location: string): { config: TaskConfig.IExternalTaskRunnerConfiguration | undefined; hasParseErrors: boolean } {
		if (!config) {
			return { config: undefined, hasParseErrors: false };
		}
		const parseErrors: string[] = (config as any).$parseErrors;
		if (parseErrors) {
			let isAffected = false;
			for (const parseError of parseErrors) {
				if (/tasks\.json$/.test(parseError)) {
					isAffected = true;
					break;
				}
			}
			if (isAffected) {
				this._outputChannel.append(nls.localize({ key: 'TaskSystem.invalidTaskJsonOther', comment: ['Message notifies of an error in one of several places there is tasks related json, not necessarily in a file named tasks.json'] }, 'Error: The content of the tasks json in {0} has syntax errors. Please correct them before executing a task.\n', location));
				this._showOutput();
				return { config, hasParseErrors: true };
			}
		}
		return { config, hasParseErrors: false };
	}

	private async _computeWorkspaceFileTasks(workspaceFolder: IWorkspaceFolder, runSource: TaskRunSource = TaskRunSource.User): Promise<IWorkspaceFolderTaskResult> {
		if (this._executionEngine === ExecutionEngine.Process) {
			return this._emptyWorkspaceTaskResults(workspaceFolder);
		}
		const workspaceFileConfig = this._getConfiguration(workspaceFolder, TaskSourceKind.WorkspaceFile);
		const configuration = this._testParseExternalConfig(workspaceFileConfig.config, nls.localize('TasksSystem.locationWorkspaceConfig', 'workspace file'));
		const customizedTasks: { byIdentifier: IStringDictionary<ConfiguringTask> } = {
			byIdentifier: Object.create(null)
		};

		const custom: CustomTask[] = [];
		await this._computeTasksForSingleConfig(workspaceFolder, configuration.config, runSource, custom, customizedTasks.byIdentifier, TaskConfig.TaskConfigSource.WorkspaceFile);
		const engine = configuration.config ? TaskConfig.ExecutionEngine.from(configuration.config) : ExecutionEngine.Terminal;
		if (engine === ExecutionEngine.Process) {
			this._notificationService.warn(nls.localize('TaskSystem.versionWorkspaceFile', 'Only tasks version 2.0.0 permitted in workspace configuration files.'));
			return this._emptyWorkspaceTaskResults(workspaceFolder);
		}
		return { workspaceFolder, set: { tasks: custom }, configurations: customizedTasks, hasErrors: configuration.hasParseErrors };
	}

	private async _computeUserTasks(workspaceFolder: IWorkspaceFolder, runSource: TaskRunSource = TaskRunSource.User): Promise<IWorkspaceFolderTaskResult> {
		if (this._executionEngine === ExecutionEngine.Process) {
			return this._emptyWorkspaceTaskResults(workspaceFolder);
		}
		const userTasksConfig = this._getConfiguration(workspaceFolder, TaskSourceKind.User);
		const configuration = this._testParseExternalConfig(userTasksConfig.config, nls.localize('TasksSystem.locationUserConfig', 'user settings'));
		const customizedTasks: { byIdentifier: IStringDictionary<ConfiguringTask> } = {
			byIdentifier: Object.create(null)
		};

		const custom: CustomTask[] = [];
		await this._computeTasksForSingleConfig(workspaceFolder, configuration.config, runSource, custom, customizedTasks.byIdentifier, TaskConfig.TaskConfigSource.User);
		const engine = configuration.config ? TaskConfig.ExecutionEngine.from(configuration.config) : ExecutionEngine.Terminal;
		if (engine === ExecutionEngine.Process) {
			this._notificationService.warn(nls.localize('TaskSystem.versionSettings', 'Only tasks version 2.0.0 permitted in user settings.'));
			return this._emptyWorkspaceTaskResults(workspaceFolder);
		}
		return { workspaceFolder, set: { tasks: custom }, configurations: customizedTasks, hasErrors: configuration.hasParseErrors };
	}

	private _emptyWorkspaceTaskResults(workspaceFolder: IWorkspaceFolder): IWorkspaceFolderTaskResult {
		return { workspaceFolder, set: undefined, configurations: undefined, hasErrors: false };
	}

	private async _computeTasksForSingleConfig(workspaceFolder: IWorkspaceFolder | undefined, config: TaskConfig.IExternalTaskRunnerConfiguration | undefined, runSource: TaskRunSource, custom: CustomTask[], customized: IStringDictionary<ConfiguringTask>, source: TaskConfig.TaskConfigSource, isRecentTask: boolean = false): Promise<boolean> {
		if (!config || !workspaceFolder) {
			return false;
		}
		const taskSystemInfo: ITaskSystemInfo | undefined = workspaceFolder ? this._getTaskSystemInfo(workspaceFolder.uri.scheme) : undefined;
		const problemReporter = new ProblemReporter(this._outputChannel);
		if (!taskSystemInfo) {
			problemReporter.fatal(nls.localize('TaskSystem.workspaceFolderError', 'Workspace folder was undefined'));
			return true;
		}
		const parseResult = TaskConfig.parse(workspaceFolder, this._workspace, taskSystemInfo ? taskSystemInfo.platform : Platform.platform, config, problemReporter, source, this._contextKeyService, isRecentTask);
		let hasErrors = false;
		if (!parseResult.validationStatus.isOK() && (parseResult.validationStatus.state !== ValidationState.Info)) {
			this._showOutput(runSource);
			hasErrors = true;
		}
		if (problemReporter.status.isFatal()) {
			problemReporter.fatal(nls.localize('TaskSystem.configurationErrors', 'Error: the provided task configuration has validation errors and can\'t not be used. Please correct the errors first.'));
			return hasErrors;
		}
		if (parseResult.configured && parseResult.configured.length > 0) {
			for (const task of parseResult.configured) {
				customized[task.configures._key] = task;
			}
		}
		if (!this._jsonTasksSupported && (parseResult.custom.length > 0)) {
			console.warn('Custom workspace tasks are not supported.');
		} else {
			for (const task of parseResult.custom) {
				custom.push(task);
			}
		}
		return hasErrors;
	}

	private _computeConfiguration(workspaceFolder: IWorkspaceFolder): Promise<IWorkspaceFolderConfigurationResult> {
		const { config, hasParseErrors } = this._getConfiguration(workspaceFolder);
		return Promise.resolve<IWorkspaceFolderConfigurationResult>({ workspaceFolder, config, hasErrors: hasParseErrors });
	}

	protected abstract _computeLegacyConfiguration(workspaceFolder: IWorkspaceFolder): Promise<IWorkspaceFolderConfigurationResult>;

	private _computeWorkspaceFolderSetup(): [IWorkspaceFolder[], IWorkspaceFolder[], ExecutionEngine, JsonSchemaVersion, IWorkspace | undefined] {
		const workspaceFolders: IWorkspaceFolder[] = [];
		const ignoredWorkspaceFolders: IWorkspaceFolder[] = [];
		let executionEngine = ExecutionEngine.Terminal;
		let schemaVersion = JsonSchemaVersion.V2_0_0;
		let workspace: IWorkspace | undefined;
		if (this._contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
			const workspaceFolder: IWorkspaceFolder = this._contextService.getWorkspace().folders[0];
			workspaceFolders.push(workspaceFolder);
			executionEngine = this._computeExecutionEngine(workspaceFolder);
			const telemetryData: { [key: string]: any } = {
				executionEngineVersion: executionEngine
			};
			/* __GDPR__
				"taskService.engineVersion" : {
					"owner": "alexr00",
					"comment": "The engine version of tasks. Used to determine if a user is using a deprecated version.",
					"executionEngineVersion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The engine version of tasks." }
				}
			*/
			this._telemetryService.publicLog('taskService.engineVersion', telemetryData);
			schemaVersion = this._computeJsonSchemaVersion(workspaceFolder);
		} else if (this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			workspace = this._contextService.getWorkspace();
			for (const workspaceFolder of this._contextService.getWorkspace().folders) {
				if (schemaVersion === this._computeJsonSchemaVersion(workspaceFolder)) {
					workspaceFolders.push(workspaceFolder);
				} else {
					ignoredWorkspaceFolders.push(workspaceFolder);
					this._outputChannel.append(nls.localize(
						'taskService.ignoreingFolder',
						'Ignoring task configurations for workspace folder {0}. Multi folder workspace task support requires that all folders use task version 2.0.0\n',
						workspaceFolder.uri.fsPath));
				}
			}
		}
		return [workspaceFolders, ignoredWorkspaceFolders, executionEngine, schemaVersion, workspace];
	}

	private _computeExecutionEngine(workspaceFolder: IWorkspaceFolder): ExecutionEngine {
		const { config } = this._getConfiguration(workspaceFolder);
		if (!config) {
			return ExecutionEngine._default;
		}
		return TaskConfig.ExecutionEngine.from(config);
	}

	private _computeJsonSchemaVersion(workspaceFolder: IWorkspaceFolder): JsonSchemaVersion {
		const { config } = this._getConfiguration(workspaceFolder);
		if (!config) {
			return JsonSchemaVersion.V2_0_0;
		}
		return TaskConfig.JsonSchemaVersion.from(config);
	}

	protected _getConfiguration(workspaceFolder: IWorkspaceFolder, source?: string): { config: TaskConfig.IExternalTaskRunnerConfiguration | undefined; hasParseErrors: boolean } {
		let result;
		if ((source !== TaskSourceKind.User) && (this._contextService.getWorkbenchState() === WorkbenchState.EMPTY)) {
			result = undefined;
		} else {
			const wholeConfig = this._configurationService.inspect<TaskConfig.IExternalTaskRunnerConfiguration>('tasks', { resource: workspaceFolder.uri });
			switch (source) {
				case TaskSourceKind.User: {
					if (wholeConfig.userValue !== wholeConfig.workspaceFolderValue) {
						result = Objects.deepClone(wholeConfig.userValue);
					}
					break;
				}
				case TaskSourceKind.Workspace: result = Objects.deepClone(wholeConfig.workspaceFolderValue); break;
				case TaskSourceKind.WorkspaceFile: {
					if ((this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE)
						&& (wholeConfig.workspaceFolderValue !== wholeConfig.workspaceValue)) {
						result = Objects.deepClone(wholeConfig.workspaceValue);
					}
					break;
				}
				default: result = Objects.deepClone(wholeConfig.workspaceFolderValue);
			}
		}
		if (!result) {
			return { config: undefined, hasParseErrors: false };
		}
		const parseErrors: string[] = (result as any).$parseErrors;
		if (parseErrors) {
			let isAffected = false;
			for (const parseError of parseErrors) {
				if (/tasks\.json$/.test(parseError)) {
					isAffected = true;
					break;
				}
			}
			if (isAffected) {
				this._outputChannel.append(nls.localize('TaskSystem.invalidTaskJson', 'Error: The content of the tasks.json file has syntax errors. Please correct them before executing a task.\n'));
				this._showOutput();
				return { config: undefined, hasParseErrors: true };
			}
		}
		return { config: result, hasParseErrors: false };
	}

	public inTerminal(): boolean {
		if (this._taskSystem) {
			return this._taskSystem instanceof TerminalTaskSystem;
		}
		return this._executionEngine === ExecutionEngine.Terminal;
	}

	public configureAction(): Action {
		const thisCapture: AbstractTaskService = this;
		return new class extends Action {
			constructor() {
				super(ConfigureTaskAction.ID, ConfigureTaskAction.TEXT, undefined, true, () => { thisCapture._runConfigureTasks(); return Promise.resolve(undefined); });
			}
		};
	}

	private _handleError(err: any): void {
		let showOutput = true;
		if (err instanceof TaskError) {
			const buildError = <TaskError>err;
			const needsConfig = buildError.code === TaskErrors.NotConfigured || buildError.code === TaskErrors.NoBuildTask || buildError.code === TaskErrors.NoTestTask;
			const needsTerminate = buildError.code === TaskErrors.RunningTask;
			if (needsConfig || needsTerminate) {
				this._notificationService.prompt(buildError.severity, buildError.message, [{
					label: needsConfig ? ConfigureTaskAction.TEXT : nls.localize('TerminateAction.label', "Terminate Task"),
					run: () => {
						if (needsConfig) {
							this._runConfigureTasks();
						} else {
							this._runTerminateCommand();
						}
					}
				}]);
			} else {
				this._notificationService.notify({ severity: buildError.severity, message: buildError.message });
			}
		} else if (err instanceof Error) {
			const error = <Error>err;
			this._notificationService.error(error.message);
			showOutput = false;
		} else if (Types.isString(err)) {
			this._notificationService.error(<string>err);
		} else {
			this._notificationService.error(nls.localize('TaskSystem.unknownError', 'An error has occurred while running a task. See task log for details.'));
		}
		if (showOutput) {
			this._showOutput();
		}
	}

	private _showDetail(): boolean {
		return this._configurationService.getValue<boolean>(QUICKOPEN_DETAIL_CONFIG);
	}

	private async _createTaskQuickPickEntries(tasks: Task[], group: boolean = false, sort: boolean = false, selectedEntry?: ITaskQuickPickEntry, includeRecents: boolean = true): Promise<ITaskQuickPickEntry[]> {
		let encounteredTasks: { [key: string]: ITaskQuickPickEntry[] } = {};
		if (tasks === undefined || tasks === null || tasks.length === 0) {
			return [];
		}
		const TaskQuickPickEntry = (task: Task): ITaskQuickPickEntry => {
			const newEntry = { label: task._label, description: this.getTaskDescription(task), task, detail: this._showDetail() ? task.configurationProperties.detail : undefined };
			if (encounteredTasks[task._id]) {
				if (encounteredTasks[task._id].length === 1) {
					encounteredTasks[task._id][0].label += ' (1)';
				}
				newEntry.label = newEntry.label + ' (' + (encounteredTasks[task._id].length + 1).toString() + ')';
			} else {
				encounteredTasks[task._id] = [];
			}
			encounteredTasks[task._id].push(newEntry);
			return newEntry;

		};
		function fillEntries(entries: QuickPickInput<ITaskQuickPickEntry>[], tasks: Task[], groupLabel: string): void {
			if (tasks.length) {
				entries.push({ type: 'separator', label: groupLabel });
			}
			for (const task of tasks) {
				const entry: ITaskQuickPickEntry = TaskQuickPickEntry(task);
				entry.buttons = [{ iconClass: ThemeIcon.asClassName(configureTaskIcon), tooltip: nls.localize('configureTask', "Configure Task") }];
				if (selectedEntry && (task === selectedEntry.task)) {
					entries.unshift(selectedEntry);
				} else {
					entries.push(entry);
				}
			}
		}
		let entries: ITaskQuickPickEntry[];
		if (group) {
			entries = [];
			if (tasks.length === 1) {
				entries.push(TaskQuickPickEntry(tasks[0]));
			} else {
				const recentlyUsedTasks = await this.getSavedTasks('historical');
				const recent: Task[] = [];
				const recentSet: Set<string> = new Set();
				let configured: Task[] = [];
				let detected: Task[] = [];
				const taskMap: IStringDictionary<Task> = Object.create(null);
				tasks.forEach(task => {
					const key = task.getCommonTaskId();
					if (key) {
						taskMap[key] = task;
					}
				});
				recentlyUsedTasks.reverse().forEach(recentTask => {
					const key = recentTask.getCommonTaskId();
					if (key) {
						recentSet.add(key);
						const task = taskMap[key];
						if (task) {
							recent.push(task);
						}
					}
				});
				for (const task of tasks) {
					const key = task.getCommonTaskId();
					if (!key || !recentSet.has(key)) {
						if ((task._source.kind === TaskSourceKind.Workspace) || (task._source.kind === TaskSourceKind.User)) {
							configured.push(task);
						} else {
							detected.push(task);
						}
					}
				}
				const sorter = this.createSorter();
				if (includeRecents) {
					fillEntries(entries, recent, nls.localize('recentlyUsed', 'recently used tasks'));
				}
				configured = configured.sort((a, b) => sorter.compare(a, b));
				fillEntries(entries, configured, nls.localize('configured', 'configured tasks'));
				detected = detected.sort((a, b) => sorter.compare(a, b));
				fillEntries(entries, detected, nls.localize('detected', 'detected tasks'));
			}
		} else {
			if (sort) {
				const sorter = this.createSorter();
				tasks = tasks.sort((a, b) => sorter.compare(a, b));
			}
			entries = tasks.map<ITaskQuickPickEntry>(task => TaskQuickPickEntry(task));
		}
		encounteredTasks = {};
		return entries;
	}
	private async _showTwoLevelQuickPick(placeHolder: string, defaultEntry?: ITaskQuickPickEntry, type?: string, name?: string) {
		return this._instantiationService.createInstance(TaskQuickPick).show(placeHolder, defaultEntry, type, name);
	}

	private async _showQuickPick(tasks: Promise<Task[]> | Task[], placeHolder: string, defaultEntry?: ITaskQuickPickEntry, group: boolean = false, sort: boolean = false, selectedEntry?: ITaskQuickPickEntry, additionalEntries?: ITaskQuickPickEntry[], type?: string, name?: string): Promise<ITaskQuickPickEntry | undefined | null> {
		const tokenSource = new CancellationTokenSource();
		const cancellationToken: CancellationToken = tokenSource.token;
		const createEntries = new Promise<QuickPickInput<ITaskQuickPickEntry>[]>((resolve) => {
			if (Array.isArray(tasks)) {
				resolve(this._createTaskQuickPickEntries(tasks, group, sort, selectedEntry));
			} else {
				resolve(tasks.then((tasks) => this._createTaskQuickPickEntries(tasks, group, sort, selectedEntry)));
			}
		});

		const timeout: boolean = await Promise.race([new Promise<boolean>((resolve) => {
			createEntries.then(() => resolve(false));
		}), new Promise<boolean>((resolve) => {
			const timer = setTimeout(() => {
				clearTimeout(timer);
				resolve(true);
			}, 200);
		})]);

		if (!timeout && ((await createEntries).length === 1) && this._configurationService.getValue<boolean>(QUICKOPEN_SKIP_CONFIG)) {
			return (<ITaskQuickPickEntry>(await createEntries)[0]);
		}

		const pickEntries = createEntries.then((entries) => {
			if ((entries.length === 1) && this._configurationService.getValue<boolean>(QUICKOPEN_SKIP_CONFIG)) {
				tokenSource.cancel();
			} else if ((entries.length === 0) && defaultEntry) {
				entries.push(defaultEntry);
			} else if (entries.length > 1 && additionalEntries && additionalEntries.length > 0) {
				entries.push({ type: 'separator', label: '' });
				entries.push(additionalEntries[0]);
			}
			return entries;
		});

		const picker: IQuickPick<ITaskQuickPickEntry> = this._quickInputService.createQuickPick();
		picker.placeholder = placeHolder;
		picker.matchOnDescription = true;
		if (name) {
			picker.value = name;
		}
		picker.onDidTriggerItemButton(context => {
			const task = context.item.task;
			this._quickInputService.cancel();
			if (ContributedTask.is(task)) {
				this.customize(task, undefined, true);
			} else if (CustomTask.is(task)) {
				this.openConfig(task);
			}
		});
		picker.busy = true;
		pickEntries.then(entries => {
			picker.busy = false;
			picker.items = entries;
			picker.show();
		});

		return new Promise<ITaskQuickPickEntry | undefined | null>(resolve => {
			this._register(picker.onDidAccept(async () => {
				let selection = picker.selectedItems ? picker.selectedItems[0] : undefined;
				if (cancellationToken.isCancellationRequested) {
					// canceled when there's only one task
					const task = (await pickEntries)[0];
					if ((<any>task).task) {
						selection = <ITaskQuickPickEntry>task;
					}
				}
				picker.dispose();
				if (!selection) {
					resolve(undefined);
				}
				resolve(selection);
			}));
		});
	}

	private _needsRecentTasksMigration(): boolean {
		return (this.getRecentlyUsedTasksV1().size > 0) && (this._getTasksFromStorage('historical').size === 0);
	}

	private async _migrateRecentTasks(tasks: Task[]) {
		if (!this._needsRecentTasksMigration()) {
			return;
		}
		const recentlyUsedTasks = this.getRecentlyUsedTasksV1();
		const taskMap: IStringDictionary<Task> = Object.create(null);
		tasks.forEach(task => {
			const key = task.getRecentlyUsedKey();
			if (key) {
				taskMap[key] = task;
			}
		});
		const reversed = [...recentlyUsedTasks.keys()].reverse();
		for (const key in reversed) {
			const task = taskMap[key];
			if (task) {
				await this._setRecentlyUsedTask(task);
			}
		}
		this._storageService.remove(AbstractTaskService.RecentlyUsedTasks_Key, StorageScope.WORKSPACE);
	}

	private _showIgnoredFoldersMessage(): Promise<void> {
		if (this.ignoredWorkspaceFolders.length === 0 || !this.showIgnoreMessage) {
			return Promise.resolve(undefined);
		}

		this._notificationService.prompt(
			Severity.Info,
			nls.localize('TaskService.ignoredFolder', 'The following workspace folders are ignored since they use task version 0.1.0: {0}', this.ignoredWorkspaceFolders.map(f => f.name).join(', ')),
			[{
				label: nls.localize('TaskService.notAgain', "Don't Show Again"),
				isSecondary: true,
				run: () => {
					this._storageService.store(AbstractTaskService.IgnoreTask010DonotShowAgain_key, true, StorageScope.WORKSPACE, StorageTarget.USER);
					this._showIgnoreMessage = false;
				}
			}]
		);

		return Promise.resolve(undefined);
	}

	private async _trust(): Promise<boolean> {
		if (ServerlessWebContext && !TaskExecutionSupportedContext) {
			return false;
		}
		await this._workspaceTrustManagementService.workspaceTrustInitialized;
		if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			return (await this._workspaceTrustRequestService.requestWorkspaceTrust(
				{
					message: nls.localize('TaskService.requestTrust', "Listing and running tasks requires that some of the files in this workspace be executed as code.")
				})) === true;
		}
		return true;
	}

	private _runTaskCommand(arg?: any): void {
		const identifier = this._getTaskIdentifier(arg);
		const type = arg && typeof arg !== 'string' && 'type' in arg ? arg.type : undefined;
		const task = arg && typeof arg !== 'string' && 'task' in arg ? arg.task : arg === 'string' ? arg : undefined;
		if (!identifier && !task && !type) {
			return this._doRunTaskCommand();
		}
		this._getGroupedTasks().then(async (grouped) => {
			const tasks = grouped.all();
			const resolver = this._createResolver(grouped);
			const folderURIs: (URI | string)[] = this._contextService.getWorkspace().folders.map(folder => folder.uri);
			if (this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
				folderURIs.push(this._contextService.getWorkspace().configuration!);
			}
			folderURIs.push(USER_TASKS_GROUP_KEY);
			if (identifier) {
				for (const uri of folderURIs) {
					const task = await resolver.resolve(uri, identifier);
					if (task) {
						this.run(task).then(undefined, () => { });
						return;
					}
				}
			}
			const exactMatchTask = tasks.find(t => task && (t.getDefinition(true)?.configurationProperties?.identifier === task || t.configurationProperties?.identifier === task || t._label === task));
			if (exactMatchTask) {
				const id = exactMatchTask.configurationProperties?.identifier || exactMatchTask.getDefinition(true)?.configurationProperties?.identifier;
				if (id) {
					for (const uri of folderURIs) {
						const task = await resolver.resolve(uri, id);
						if (task) {
							this.run(task, { attachProblemMatcher: true }, TaskRunSource.User).then(undefined, () => { });
							return;
						}
					}
				}
			}
			const atLeastOneMatch = tasks.some(t => {
				if (task) {
					if (t._label.includes(task)) {
						if (!type || t.type === type) {
							return true;
						}
					}
				} else if (type && t.type === type || (CustomTask.is(t) && t.customizes()?.type === type)) {
					return true;

				}
				return false;
			});
			return atLeastOneMatch ? this._doRunTaskCommand(tasks, type, task) : this._doRunTaskCommand();
		});
	}

	private _tasksAndGroupedTasks(filter?: ITaskFilter): { tasks: Promise<Task[]>; grouped: Promise<TaskMap> } {
		if (!this._versionAndEngineCompatible(filter)) {
			return { tasks: Promise.resolve<Task[]>([]), grouped: Promise.resolve(new TaskMap()) };
		}
		const grouped = this._getGroupedTasks(filter);
		const tasks = grouped.then((map) => {
			if (!filter || !filter.type) {
				return map.all();
			}
			const result: Task[] = [];
			map.forEach((tasks) => {
				for (const task of tasks) {
					if (ContributedTask.is(task) && task.defines.type === filter.type) {
						result.push(task);
					} else if (CustomTask.is(task)) {
						if (task.type === filter.type) {
							result.push(task);
						} else {
							const customizes = task.customizes();
							if (customizes && customizes.type === filter.type) {
								result.push(task);
							}
						}
					}
				}
			});
			return result;
		});
		return { tasks, grouped };
	}

	private _doRunTaskCommand(tasks?: Task[], type?: string, name?: string): void {
		const pickThen = (task: Task | undefined | null) => {
			if (task === undefined) {
				return;
			}
			if (task === null) {
				this._runConfigureTasks();
			} else {
				this.run(task, { attachProblemMatcher: true }, TaskRunSource.User).then(undefined, reason => {
					// eat the error, it has already been surfaced to the user and we don't care about it here
				});
			}
		};

		const placeholder = nls.localize('TaskService.pickRunTask', 'Select the task to run');

		this._showIgnoredFoldersMessage().then(() => {
			if (this._configurationService.getValue(USE_SLOW_PICKER)) {
				let taskResult: { tasks: Promise<Task[]>; grouped: Promise<TaskMap> } | undefined = undefined;
				if (!tasks) {
					taskResult = this._tasksAndGroupedTasks();
				}
				this._showQuickPick(tasks ? tasks : taskResult!.tasks, placeholder,
					{
						label: '$(plus) ' + nls.localize('TaskService.noEntryToRun', 'Configure a Task'),
						task: null
					},
					true, undefined, undefined, undefined, type, name).
					then((entry) => {
						return pickThen(entry ? entry.task : undefined);
					});
			} else {
				this._showTwoLevelQuickPick(placeholder,
					{
						label: '$(plus) ' + nls.localize('TaskService.noEntryToRun', 'Configure a Task'),
						task: null
					}, type, name).
					then(pickThen);
			}
		});
	}

	private _reRunTaskCommand(): void {

		ProblemMatcherRegistry.onReady().then(() => {
			return this._editorService.saveAll({ reason: SaveReason.AUTO }).then(() => { // make sure all dirty editors are saved
				const executeResult = this._getTaskSystem().rerun();
				if (executeResult) {
					return this._handleExecuteResult(executeResult);
				} else {
					this._doRunTaskCommand();
					return Promise.resolve(undefined);
				}
			});
		});
	}

	/**
	 *
	 * @param tasks - The tasks which need filtering from defaults and non-defaults
	 * @param defaultType - If there are globs want globs in the default list, otherwise only tasks with true
	 * @param taskGlobsInList - This tells splitPerGroupType to filter out globbed tasks (into default), otherwise fall back to boolean
	 * @returns
	 */
	private _splitPerGroupType(tasks: Task[], taskGlobsInList: boolean = false): { none: Task[]; defaults: Task[] } {
		const none: Task[] = [];
		const defaults: Task[] = [];
		for (const task of tasks) {
			// At this point (assuming taskGlobsInList is true) there are tasks with matching globs, so only put those in defaults
			if (taskGlobsInList && typeof (task.configurationProperties.group as TaskGroup).isDefault === 'string') {
				defaults.push(task);
			} else if (!taskGlobsInList && (task.configurationProperties.group as TaskGroup).isDefault === true) {
				defaults.push(task);
			} else {
				none.push(task);
			}
		}
		return { none, defaults };
	}

	private _runTaskGroupCommand(taskGroup: TaskGroup, strings: {
		fetching: string;
		select: string;
		notFoundConfigure: string;
	}, configure: () => void, legacyCommand: () => void): void {
		if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
			legacyCommand();
			return;
		}
		const options: IProgressOptions = {
			location: ProgressLocation.Window,
			title: strings.fetching
		};
		const promise = (async () => {

			let taskGroupTasks: (Task | ConfiguringTask)[] = [];

			async function runSingleTask(task: Task | undefined, problemMatcherOptions: IProblemMatcherRunOptions | undefined, that: AbstractTaskService) {
				that.run(task, problemMatcherOptions, TaskRunSource.User).then(undefined, reason => {
					// eat the error, it has already been surfaced to the user and we don't care about it here
				});
			}
			const chooseAndRunTask = (tasks: Task[]) => {
				this._showIgnoredFoldersMessage().then(() => {
					this._showQuickPick(tasks,
						strings.select,
						{
							label: strings.notFoundConfigure,
							task: null
						},
						true).then((entry) => {
							const task: Task | undefined | null = entry ? entry.task : undefined;
							if (task === undefined) {
								return;
							}
							if (task === null) {
								configure.apply(this);
								return;
							}
							runSingleTask(task, { attachProblemMatcher: true }, this);
						});
				});
			};

			// First check for globs before checking for the default tasks of the task group
			const absoluteURI = EditorResourceAccessor.getOriginalUri(this._editorService.activeEditor);
			if (absoluteURI) {
				const workspaceFolder = this._contextService.getWorkspaceFolder(absoluteURI);
				// fallback to absolute path of the file if it is not in a workspace or relative path cannot be found
				const relativePath = workspaceFolder?.uri ? (resources.relativePath(workspaceFolder.uri, absoluteURI) ?? absoluteURI.path) : absoluteURI.path;

				taskGroupTasks = await this._findWorkspaceTasks((task) => {
					const currentTaskGroup = task.configurationProperties.group;
					if (currentTaskGroup && typeof currentTaskGroup !== 'string' && typeof currentTaskGroup.isDefault === 'string') {
						return (currentTaskGroup._id === taskGroup._id && glob.match(currentTaskGroup.isDefault, relativePath));
					}

					return false;
				});
			}

			const handleMultipleTasks = (areGlobTasks: boolean) => {
				return this._getTasksForGroup(taskGroup).then((tasks) => {
					if (tasks.length > 0) {
						// If we're dealing with tasks that were chosen because of a glob match,
						// then put globs in the defaults and everything else in none
						const { none, defaults } = this._splitPerGroupType(tasks, areGlobTasks);
						if (defaults.length === 1) {
							runSingleTask(defaults[0], undefined, this);
							return;
						} else if (defaults.length + none.length > 0) {
							tasks = defaults.concat(none);
						}
					}

					// At this this point there are multiple tasks.
					chooseAndRunTask(tasks);
				});
			};

			const resolveTaskAndRun = (taskGroupTask: Task | ConfiguringTask) => {
				if (ConfiguringTask.is(taskGroupTask)) {
					this.tryResolveTask(taskGroupTask).then(resolvedTask => {
						runSingleTask(resolvedTask, undefined, this);
					});
				} else {
					runSingleTask(taskGroupTask, undefined, this);
				}
			};

			// A single default glob task was returned, just run it directly
			if (taskGroupTasks.length === 1) {
				return resolveTaskAndRun(taskGroupTasks[0]);
			}

			// If there's multiple globs that match we want to show the quick picker for those tasks
			// We will need to call splitPerGroupType putting globs in defaults and the remaining tasks in none.
			// We don't need to carry on after here
			if (taskGroupTasks.length > 1) {
				return handleMultipleTasks(true);
			}

			// If no globs are found or matched fallback to checking for default tasks of the task group
			if (!taskGroupTasks.length) {
				taskGroupTasks = await this._findWorkspaceTasksInGroup(taskGroup, false);
			}

			// A single default task was returned, just run it directly
			if (taskGroupTasks.length === 1) {
				return resolveTaskAndRun(taskGroupTasks[0]);
			}

			// Multiple default tasks returned, show the quickPicker
			return handleMultipleTasks(false);
		})();
		this._progressService.withProgress(options, () => promise);
	}

	private _runBuildCommand(): void {
		return this._runTaskGroupCommand(TaskGroup.Build, {
			fetching: nls.localize('TaskService.fetchingBuildTasks', 'Fetching build tasks...'),
			select: nls.localize('TaskService.pickBuildTask', 'Select the build task to run'),
			notFoundConfigure: nls.localize('TaskService.noBuildTask', 'No build task to run found. Configure Build Task...')
		}, this._runConfigureDefaultBuildTask, this._build);
	}

	private _runTestCommand(): void {
		return this._runTaskGroupCommand(TaskGroup.Test, {
			fetching: nls.localize('TaskService.fetchingTestTasks', 'Fetching test tasks...'),
			select: nls.localize('TaskService.pickTestTask', 'Select the test task to run'),
			notFoundConfigure: nls.localize('TaskService.noTestTaskTerminal', 'No test task to run found. Configure Tasks...')
		}, this._runConfigureDefaultTestTask, this._runTest);
	}

	private _runTerminateCommand(arg?: any): void {
		if (arg === 'terminateAll') {
			this._terminateAll();
			return;
		}
		const runQuickPick = (promise?: Promise<Task[]>) => {
			this._showQuickPick(promise || this.getActiveTasks(),
				nls.localize('TaskService.taskToTerminate', 'Select a task to terminate'),
				{
					label: nls.localize('TaskService.noTaskRunning', 'No task is currently running'),
					task: undefined
				},
				false, true,
				undefined,
				[{
					label: nls.localize('TaskService.terminateAllRunningTasks', 'All Running Tasks'),
					id: 'terminateAll',
					task: undefined
				}]
			).then(entry => {
				if (entry && entry.id === 'terminateAll') {
					this._terminateAll();
				}
				const task: Task | undefined | null = entry ? entry.task : undefined;
				if (task === undefined || task === null) {
					return;
				}
				this.terminate(task);
			});
		};
		if (this.inTerminal()) {
			const identifier = this._getTaskIdentifier(arg);
			let promise: Promise<Task[]>;
			if (identifier !== undefined) {
				promise = this.getActiveTasks();
				promise.then((tasks) => {
					for (const task of tasks) {
						if (task.matches(identifier)) {
							this.terminate(task);
							return;
						}
					}
					runQuickPick(promise);
				});
			} else {
				runQuickPick();
			}
		} else {
			this._isActive().then((active) => {
				if (active) {
					this._terminateAll().then((responses) => {
						// the output runner has only one task
						const response = responses[0];
						if (response.success) {
							return;
						}
						if (response.code && response.code === TerminateResponseCode.ProcessNotFound) {
							this._notificationService.error(nls.localize('TerminateAction.noProcess', 'The launched process doesn\'t exist anymore. If the task spawned background tasks exiting VS Code might result in orphaned processes.'));
						} else {
							this._notificationService.error(nls.localize('TerminateAction.failed', 'Failed to terminate running task'));
						}
					});
				}
			});
		}
	}

	private _runRestartTaskCommand(arg?: any): void {
		const runQuickPick = (promise?: Promise<Task[]>) => {
			this._showQuickPick(promise || this.getActiveTasks(),
				nls.localize('TaskService.taskToRestart', 'Select the task to restart'),
				{
					label: nls.localize('TaskService.noTaskToRestart', 'No task to restart'),
					task: null
				},
				false, true
			).then(entry => {
				const task: Task | undefined | null = entry ? entry.task : undefined;
				if (task === undefined || task === null) {
					return;
				}
				this._restart(task);
			});
		};
		if (this.inTerminal()) {
			const identifier = this._getTaskIdentifier(arg);
			let promise: Promise<Task[]>;
			if (identifier !== undefined) {
				promise = this.getActiveTasks();
				promise.then((tasks) => {
					for (const task of tasks) {
						if (task.matches(identifier)) {
							this._restart(task);
							return;
						}
					}
					runQuickPick(promise);
				});
			} else {
				runQuickPick();
			}
		} else {
			this.getActiveTasks().then((activeTasks) => {
				if (activeTasks.length === 0) {
					return;
				}
				const task = activeTasks[0];
				this._restart(task);
			});
		}
	}

	private _getTaskIdentifier(arg?: string | ITaskIdentifier): string | KeyedTaskIdentifier | undefined {
		let result: string | KeyedTaskIdentifier | undefined = undefined;
		if (Types.isString(arg)) {
			result = arg;
		} else if (arg && Types.isString((arg as ITaskIdentifier).type)) {
			result = TaskDefinition.createTaskIdentifier(arg as ITaskIdentifier, console);
		}
		return result;
	}

	private _configHasTasks(taskConfig?: TaskConfig.IExternalTaskRunnerConfiguration): boolean {
		return !!taskConfig && !!taskConfig.tasks && taskConfig.tasks.length > 0;
	}

	private _openTaskFile(resource: URI, taskSource: string) {
		let configFileCreated = false;
		this._fileService.stat(resource).then((stat) => stat, () => undefined).then(async (stat) => {
			const fileExists: boolean = !!stat;
			const configValue = this._configurationService.inspect<TaskConfig.IExternalTaskRunnerConfiguration>('tasks');
			let tasksExistInFile: boolean;
			let target: ConfigurationTarget;
			switch (taskSource) {
				case TaskSourceKind.User: tasksExistInFile = this._configHasTasks(configValue.userValue); target = ConfigurationTarget.USER; break;
				case TaskSourceKind.WorkspaceFile: tasksExistInFile = this._configHasTasks(configValue.workspaceValue); target = ConfigurationTarget.WORKSPACE; break;
				default: tasksExistInFile = this._configHasTasks(configValue.workspaceFolderValue); target = ConfigurationTarget.WORKSPACE_FOLDER;
			}
			let content;
			if (!tasksExistInFile) {
				const pickTemplateResult = await this._quickInputService.pick(getTaskTemplates(), { placeHolder: nls.localize('TaskService.template', 'Select a Task Template') });
				if (!pickTemplateResult) {
					return Promise.resolve(undefined);
				}
				content = pickTemplateResult.content;
				const editorConfig = this._configurationService.getValue() as any;
				if (editorConfig.editor.insertSpaces) {
					content = content.replace(/(\n)(\t+)/g, (_, s1, s2) => s1 + ' '.repeat(s2.length * editorConfig.editor.tabSize));
				}
				configFileCreated = true;
			}

			if (!fileExists && content) {
				return this._textFileService.create([{ resource, value: content }]).then(result => {
					return result[0].resource;
				});
			} else if (fileExists && (tasksExistInFile || content)) {
				if (content) {
					this._configurationService.updateValue('tasks', json.parse(content), target);
				}
				return stat?.resource;
			}
			return undefined;
		}).then((resource) => {
			if (!resource) {
				return;
			}
			this._editorService.openEditor({
				resource,
				options: {
					pinned: configFileCreated // pin only if config file is created #8727
				}
			});
		});
	}

	private _isTaskEntry(value: IQuickPickItem): value is IQuickPickItem & { task: Task } {
		const candidate: IQuickPickItem & { task: Task } = value as any;
		return candidate && !!candidate.task;
	}

	private _isSettingEntry(value: IQuickPickItem): value is IQuickPickItem & { settingType: string } {
		const candidate: IQuickPickItem & { settingType: string } = value as any;
		return candidate && !!candidate.settingType;
	}

	private _configureTask(task: Task) {
		if (ContributedTask.is(task)) {
			this.customize(task, undefined, true);
		} else if (CustomTask.is(task)) {
			this.openConfig(task);
		} else if (ConfiguringTask.is(task)) {
			// Do nothing.
		}
	}

	private _handleSelection(selection: TaskQuickPickEntryType | undefined) {
		if (!selection) {
			return;
		}
		if (this._isTaskEntry(selection)) {
			this._configureTask(selection.task);
		} else if (this._isSettingEntry(selection)) {
			const taskQuickPick = this._instantiationService.createInstance(TaskQuickPick);
			taskQuickPick.handleSettingOption(selection.settingType);
		} else if (selection.folder && (this._contextService.getWorkbenchState() !== WorkbenchState.EMPTY)) {
			this._openTaskFile(selection.folder.toResource('.vscode/tasks.json'), TaskSourceKind.Workspace);
		} else {
			const resource = this._getResourceForKind(TaskSourceKind.User);
			if (resource) {
				this._openTaskFile(resource, TaskSourceKind.User);
			}
		}
	}

	public getTaskDescription(task: Task | ConfiguringTask): string | undefined {
		let description: string | undefined;
		if (task._source.kind === TaskSourceKind.User) {
			description = nls.localize('taskQuickPick.userSettings', 'User');
		} else if (task._source.kind === TaskSourceKind.WorkspaceFile) {
			description = task.getWorkspaceFileName();
		} else if (this.needsFolderQualification()) {
			const workspaceFolder = task.getWorkspaceFolder();
			if (workspaceFolder) {
				description = workspaceFolder.name;
			}
		}
		return description;
	}

	private async _runConfigureTasks(): Promise<void> {
		if (!(await this._trust())) {
			return;
		}

		let taskPromise: Promise<TaskMap>;
		if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
			taskPromise = this._getGroupedTasks();
		} else {
			taskPromise = Promise.resolve(new TaskMap());
		}

		const stats = this._contextService.getWorkspace().folders.map<Promise<IFileStatWithPartialMetadata | undefined>>((folder) => {
			return this._fileService.stat(folder.toResource('.vscode/tasks.json')).then(stat => stat, () => undefined);
		});

		const createLabel = nls.localize('TaskService.createJsonFile', 'Create tasks.json file from template');
		const openLabel = nls.localize('TaskService.openJsonFile', 'Open tasks.json file');
		const tokenSource = new CancellationTokenSource();
		const cancellationToken: CancellationToken = tokenSource.token;
		const entries = Promise.all(stats).then((stats) => {
			return taskPromise.then((taskMap) => {
				const entries: QuickPickInput<TaskQuickPickEntryType>[] = [];
				let configuredCount = 0;
				let tasks = taskMap.all();
				if (tasks.length > 0) {
					tasks = tasks.sort((a, b) => a._label.localeCompare(b._label));
					for (const task of tasks) {
						const entry = { label: TaskQuickPick.getTaskLabelWithIcon(task), task, description: this.getTaskDescription(task), detail: this._showDetail() ? task.configurationProperties.detail : undefined };
						TaskQuickPick.applyColorStyles(task, entry, this._themeService);
						entries.push(entry);
						if (!ContributedTask.is(task)) {
							configuredCount++;
						}
					}
				}
				const needsCreateOrOpen = (configuredCount === 0);
				// If the only configured tasks are user tasks, then we should also show the option to create from a template.
				if (needsCreateOrOpen || (taskMap.get(USER_TASKS_GROUP_KEY).length === configuredCount)) {
					const label = stats[0] !== undefined ? openLabel : createLabel;
					if (entries.length) {
						entries.push({ type: 'separator' });
					}
					entries.push({ label, folder: this._contextService.getWorkspace().folders[0] });
				}
				if ((entries.length === 1) && !needsCreateOrOpen) {
					tokenSource.cancel();
				}
				return entries;
			});
		});

		const timeout: boolean = await Promise.race([new Promise<boolean>((resolve) => {
			entries.then(() => resolve(false));
		}), new Promise<boolean>((resolve) => {
			const timer = setTimeout(() => {
				clearTimeout(timer);
				resolve(true);
			}, 200);
		})]);

		if (!timeout && ((await entries).length === 1) && this._configurationService.getValue<boolean>(QUICKOPEN_SKIP_CONFIG)) {
			const entry: any = <any>((await entries)[0]);
			if (entry.task) {
				this._handleSelection(entry);
				return;
			}
		}

		const entriesWithSettings = entries.then(resolvedEntries => {
			resolvedEntries.push(...TaskQuickPick.allSettingEntries(this._configurationService));
			return resolvedEntries;
		});

		this._quickInputService.pick(entriesWithSettings,
			{ placeHolder: nls.localize('TaskService.pickTask', 'Select a task to configure') }, cancellationToken).
			then(async (selection) => {
				if (cancellationToken.isCancellationRequested) {
					// canceled when there's only one task
					const task = (await entries)[0];
					if ((<any>task).task) {
						selection = <TaskQuickPickEntryType>task;
					}
				}
				this._handleSelection(selection);
			});
	}

	private _runConfigureDefaultBuildTask(): void {
		if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
			this.tasks().then((tasks => {
				if (tasks.length === 0) {
					this._runConfigureTasks();
					return;
				}
				const entries: QuickPickInput<TaskQuickPickEntryType>[] = [];
				let selectedTask: Task | undefined;
				let selectedEntry: TaskQuickPickEntryType | undefined;
				this._showIgnoredFoldersMessage().then(() => {
					for (const task of tasks) {
						const taskGroup: TaskGroup | undefined = TaskGroup.from(task.configurationProperties.group);
						if (taskGroup && taskGroup.isDefault && taskGroup._id === TaskGroup.Build._id) {
							const label = nls.localize('TaskService.defaultBuildTaskExists', '{0} is already marked as the default build task', TaskQuickPick.getTaskLabelWithIcon(task, task.getQualifiedLabel()));
							selectedTask = task;
							selectedEntry = { label, task, description: this.getTaskDescription(task), detail: this._showDetail() ? task.configurationProperties.detail : undefined };
							TaskQuickPick.applyColorStyles(task, selectedEntry, this._themeService);
						} else {
							const entry = { label: TaskQuickPick.getTaskLabelWithIcon(task), task, description: this.getTaskDescription(task), detail: this._showDetail() ? task.configurationProperties.detail : undefined };
							TaskQuickPick.applyColorStyles(task, entry, this._themeService);
							entries.push(entry);
						}
					}
					if (selectedEntry) {
						entries.unshift(selectedEntry);
					}
					const tokenSource = new CancellationTokenSource();
					const cancellationToken: CancellationToken = tokenSource.token;
					this._quickInputService.pick(entries,
						{ placeHolder: nls.localize('TaskService.pickTask', 'Select a task to configure') }, cancellationToken).
						then(async (entry) => {
							if (cancellationToken.isCancellationRequested) {
								// canceled when there's only one task
								const task = (await entries)[0];
								if ((<any>task).task) {
									entry = <TaskQuickPickEntryType>task;
								}
							}
							const task: Task | undefined | null = entry && 'task' in entry ? entry.task : undefined;
							if ((task === undefined) || (task === null)) {
								return;
							}
							if (task === selectedTask && CustomTask.is(task)) {
								this.openConfig(task);
							}
							if (!InMemoryTask.is(task)) {
								this.customize(task, { group: { kind: 'build', isDefault: true } }, true).then(() => {
									if (selectedTask && (task !== selectedTask) && !InMemoryTask.is(selectedTask)) {
										this.customize(selectedTask, { group: 'build' }, false);
									}
								});
							}
						});
					this._quickInputService.pick(entries, {
						placeHolder: nls.localize('TaskService.pickDefaultBuildTask', 'Select the task to be used as the default build task')
					}).
						then((entry) => {
							const task: Task | undefined | null = entry && 'task' in entry ? entry.task : undefined;
							if ((task === undefined) || (task === null)) {
								return;
							}
							if (task === selectedTask && CustomTask.is(task)) {
								this.openConfig(task);
							}
							if (!InMemoryTask.is(task)) {
								this.customize(task, { group: { kind: 'build', isDefault: true } }, true).then(() => {
									if (selectedTask && (task !== selectedTask) && !InMemoryTask.is(selectedTask)) {
										this.customize(selectedTask, { group: 'build' }, false);
									}
								});
							}
						});
				});
			}));
		} else {
			this._runConfigureTasks();
		}
	}

	private _runConfigureDefaultTestTask(): void {
		if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
			this.tasks().then((tasks => {
				if (tasks.length === 0) {
					this._runConfigureTasks();
					return;
				}
				let selectedTask: Task | undefined;
				let selectedEntry: ITaskQuickPickEntry;

				for (const task of tasks) {
					const taskGroup: TaskGroup | undefined = TaskGroup.from(task.configurationProperties.group);
					if (taskGroup && taskGroup.isDefault && taskGroup._id === TaskGroup.Test._id) {
						selectedTask = task;
						break;
					}
				}
				if (selectedTask) {
					selectedEntry = {
						label: nls.localize('TaskService.defaultTestTaskExists', '{0} is already marked as the default test task.', selectedTask.getQualifiedLabel()),
						task: selectedTask,
						detail: this._showDetail() ? selectedTask.configurationProperties.detail : undefined
					};
				}

				this._showIgnoredFoldersMessage().then(() => {
					this._showQuickPick(tasks,
						nls.localize('TaskService.pickDefaultTestTask', 'Select the task to be used as the default test task'), undefined, true, false, selectedEntry).then((entry) => {
							const task: Task | undefined | null = entry ? entry.task : undefined;
							if (!task) {
								return;
							}
							if (task === selectedTask && CustomTask.is(task)) {
								this.openConfig(task);
							}
							if (!InMemoryTask.is(task)) {
								this.customize(task, { group: { kind: 'test', isDefault: true } }, true).then(() => {
									if (selectedTask && (task !== selectedTask) && !InMemoryTask.is(selectedTask)) {
										this.customize(selectedTask, { group: 'test' }, false);
									}
								});
							}
						});
				});
			}));
		} else {
			this._runConfigureTasks();
		}
	}

	public async runShowTasks(): Promise<void> {
		const activeTasksPromise: Promise<Task[]> = this.getActiveTasks();
		const activeTasks: Task[] = await activeTasksPromise;
		let group: string | undefined;
		if (activeTasks.length === 1) {
			this._taskSystem!.revealTask(activeTasks[0]);
		} else if (activeTasks.length && activeTasks.every((task) => {
			if (InMemoryTask.is(task)) {
				return false;
			}

			if (!group) {
				group = task.command.presentation?.group;
			}
			return task.command.presentation?.group && (task.command.presentation.group === group);
		})) {
			this._taskSystem!.revealTask(activeTasks[0]);
		} else {
			this._showQuickPick(activeTasksPromise,
				nls.localize('TaskService.pickShowTask', 'Select the task to show its output'),
				{
					label: nls.localize('TaskService.noTaskIsRunning', 'No task is running'),
					task: null
				},
				false, true
			).then((entry) => {
				const task: Task | undefined | null = entry ? entry.task : undefined;
				if (task === undefined || task === null) {
					return;
				}
				this._taskSystem!.revealTask(task);
			});
		}
	}

	private async _createTasksDotOld(folder: IWorkspaceFolder): Promise<[URI, URI] | undefined> {
		const tasksFile = folder.toResource('.vscode/tasks.json');
		if (await this._fileService.exists(tasksFile)) {
			const oldFile = tasksFile.with({ path: `${tasksFile.path}.old` });
			await this._fileService.copy(tasksFile, oldFile, true);
			return [oldFile, tasksFile];
		}
		return undefined;
	}

	private _upgradeTask(task: Task, suppressTaskName: boolean, globalConfig: { windows?: ICommandUpgrade; osx?: ICommandUpgrade; linux?: ICommandUpgrade }): TaskConfig.ICustomTask | TaskConfig.IConfiguringTask | undefined {
		if (!CustomTask.is(task)) {
			return;
		}
		const configElement: any = {
			label: task._label
		};
		const oldTaskTypes = new Set(['gulp', 'jake', 'grunt']);
		if (Types.isString(task.command.name) && oldTaskTypes.has(task.command.name)) {
			configElement.type = task.command.name;
			configElement.task = task.command.args![0];
		} else {
			if (task.command.runtime === RuntimeType.Shell) {
				configElement.type = RuntimeType.toString(RuntimeType.Shell);
			}
			if (task.command.name && !suppressTaskName && !globalConfig.windows?.command && !globalConfig.osx?.command && !globalConfig.linux?.command) {
				configElement.command = task.command.name;
			} else if (suppressTaskName) {
				configElement.command = task._source.config.element.command;
			}
			if (task.command.args && (!Array.isArray(task.command.args) || (task.command.args.length > 0))) {
				if (!globalConfig.windows?.args && !globalConfig.osx?.args && !globalConfig.linux?.args) {
					configElement.args = task.command.args;
				} else {
					configElement.args = task._source.config.element.args;
				}
			}
		}

		if (task.configurationProperties.presentation) {
			configElement.presentation = task.configurationProperties.presentation;
		}
		if (task.configurationProperties.isBackground) {
			configElement.isBackground = task.configurationProperties.isBackground;
		}
		if (task.configurationProperties.problemMatchers) {
			configElement.problemMatcher = task._source.config.element.problemMatcher;
		}
		if (task.configurationProperties.group) {
			configElement.group = task.configurationProperties.group;
		}

		task._source.config.element = configElement;
		const tempTask = new CustomTask(task._id, task._source, task._label, task.type, task.command, task.hasDefinedMatchers, task.runOptions, task.configurationProperties);
		const configTask = this._createCustomizableTask(tempTask);
		if (configTask) {
			return configTask;
		}
		return;
	}

	private async _upgrade(): Promise<void> {
		if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
			return;
		}

		if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			this._register(Event.once(this._workspaceTrustManagementService.onDidChangeTrust)(isTrusted => {
				if (isTrusted) {
					this._upgrade();
				}
			}));
			return;
		}

		const tasks = await this._getGroupedTasks();
		const fileDiffs: [URI, URI][] = [];
		for (const folder of this.workspaceFolders) {
			const diff = await this._createTasksDotOld(folder);
			if (diff) {
				fileDiffs.push(diff);
			}
			if (!diff) {
				continue;
			}

			const configTasks: (TaskConfig.ICustomTask | TaskConfig.IConfiguringTask)[] = [];
			const suppressTaskName = !!this._configurationService.getValue(TasksSchemaProperties.SuppressTaskName, { resource: folder.uri });
			const globalConfig = {
				windows: <ICommandUpgrade>this._configurationService.getValue(TasksSchemaProperties.Windows, { resource: folder.uri }),
				osx: <ICommandUpgrade>this._configurationService.getValue(TasksSchemaProperties.Osx, { resource: folder.uri }),
				linux: <ICommandUpgrade>this._configurationService.getValue(TasksSchemaProperties.Linux, { resource: folder.uri })
			};
			tasks.get(folder).forEach(task => {
				const configTask = this._upgradeTask(task, suppressTaskName, globalConfig);
				if (configTask) {
					configTasks.push(configTask);
				}
			});
			this._taskSystem = undefined;
			this._workspaceTasksPromise = undefined;
			await this._writeConfiguration(folder, 'tasks.tasks', configTasks);
			await this._writeConfiguration(folder, 'tasks.version', '2.0.0');
			if (this._configurationService.getValue(TasksSchemaProperties.ShowOutput, { resource: folder.uri })) {
				await this._configurationService.updateValue(TasksSchemaProperties.ShowOutput, undefined, { resource: folder.uri });
			}
			if (this._configurationService.getValue(TasksSchemaProperties.IsShellCommand, { resource: folder.uri })) {
				await this._configurationService.updateValue(TasksSchemaProperties.IsShellCommand, undefined, { resource: folder.uri });
			}
			if (this._configurationService.getValue(TasksSchemaProperties.SuppressTaskName, { resource: folder.uri })) {
				await this._configurationService.updateValue(TasksSchemaProperties.SuppressTaskName, undefined, { resource: folder.uri });
			}
		}
		this._updateSetup();

		this._notificationService.prompt(Severity.Warning,
			fileDiffs.length === 1 ?
				nls.localize('taskService.upgradeVersion', "The deprecated tasks version 0.1.0 has been removed. Your tasks have been upgraded to version 2.0.0. Open the diff to review the upgrade.")
				: nls.localize('taskService.upgradeVersionPlural', "The deprecated tasks version 0.1.0 has been removed. Your tasks have been upgraded to version 2.0.0. Open the diffs to review the upgrade."),
			[{
				label: fileDiffs.length === 1 ? nls.localize('taskService.openDiff', "Open diff") : nls.localize('taskService.openDiffs', "Open diffs"),
				run: async () => {
					for (const upgrade of fileDiffs) {
						await this._editorService.openEditor({
							original: { resource: upgrade[0] },
							modified: { resource: upgrade[1] }
						});
					}
				}
			}]
		);
	}
}
