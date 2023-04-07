/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILanguageRuntime } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { IEnvironmentVariableItem } from 'vs/workbench/services/positronEnvironment/common/interfaces/environmentVariableItem';
import { IEnvironmentVariableGroup } from 'vs/workbench/services/positronEnvironment/common/interfaces/environmentVariableGroup';

// Create the decorator for the Positron environment service (used in dependency injection).
export const IPositronEnvironmentService = createDecorator<IPositronEnvironmentService>('positronEnvironmentService');

/**
 * PositronEnvironmentState enumeration.
 */
export const enum PositronEnvironmentState {
	Uninitialized = 'Uninitialized',
	Starting = 'Starting',
	Busy = 'Busy',
	Ready = 'Ready',
	Offline = 'Offline',
	Exiting = 'Exiting',
	Exited = 'Exited'
}

/**
 * PositronEnvironmentGrouping enumeration.
 */
export const enum PositronEnvironmentGrouping {
	None,
	Kind,
	Size
}

/**
 * PositronEnvironmentSorting enumeration.
 */
export const enum PositronEnvironmentSorting {
	Name,
	Size
}

/**
 * IPositronEnvironmentService interface.
 */
export interface IPositronEnvironmentService {
	// Needed for service branding in dependency injector.
	readonly _serviceBrand: undefined;

	/**
	 * Gets the Positron environment instances.
	 */
	readonly positronEnvironmentInstances: IPositronEnvironmentInstance[];

	/**
	 * Gets the active Positron environment instance.
	 */
	readonly activePositronEnvironmentInstance?: IPositronEnvironmentInstance;

	/**
	 * The onDidStartPositronEnvironmentInstance event.
	 */
	readonly onDidStartPositronEnvironmentInstance: Event<IPositronEnvironmentInstance>;

	/**
	 * The onDidChangeActivePositronEnvironmentInstance event.
	 */
	readonly onDidChangeActivePositronEnvironmentInstance: Event<IPositronEnvironmentInstance | undefined>;

	/**
	 * Placeholder that gets called to "initialize" the PositronEnvironmentService.
	 */
	initialize(): void;
}

/**
 * IPositronEnvironmentInstance interface.
 */
export interface IPositronEnvironmentInstance {
	/**
	 * Gets the runtime for the Positron environment instance.
	 */
	readonly runtime: ILanguageRuntime;

	/**
	 * Gets the state.
	 */
	readonly state: PositronEnvironmentState;

	/**
	 * Gets or sets the grouping.
	 */
	grouping: PositronEnvironmentGrouping;

	/**
	 * Gets or sets the sorting.
	 */
	sorting: PositronEnvironmentSorting;

	/**
	 * The onDidChangeState event.
	 */
	readonly onDidChangeState: Event<PositronEnvironmentState>;

	/**
	 * The onDidChangeEnvironmentGrouping event.
	 */
	readonly onDidChangeEnvironmentGrouping: Event<PositronEnvironmentGrouping>;

	/**
	 * The onDidChangeEnvironmentSorting event.
	 */
	readonly onDidChangeEnvironmentSorting: Event<PositronEnvironmentSorting>;

	/**
	 * The onDidChangeEntries event.
	 */
	readonly onDidChangeEntries: Event<(IEnvironmentVariableGroup | IEnvironmentVariableItem)[]>;

	/**
	 * Requests a refresh of the environment.
	 */
	requestRefresh(): void;

	/**
	 * Requests clearing the environment.
	 * @param includeHiddenObjects A value which indicates whether to include hidden objects.
	 */
	requestClear(includeHiddenObjects: boolean): void;

	/**
	 * Requests the deletion of one or more environment variables.
	 * @param names The names of the variables to delete
	 */
	requestDelete(names: string[]): void;

	/**
	 * Expands an environment variable group.
	 * @param id The identifier of the environment variable group to expand.
	 */
	expandEnvironmentVariableGroup(id: string): void;

	/**
	 * Collapses an environment variable group.
	 * @param id The identifier of the environment variable group to collapse.
	 */
	collapseEnvironmentVariableGroup(id: string): void;

	/**
	 * Expands an environment variable.
	 * @param path The path of the environment variable to expand.
	 */
	expandEnvironmentVariable(path: string): void;

	/**
	 * Collapses an environment variable.
	 * @param path The path of the environment variable to collapse.
	 */
	collapseEnvironmentVariable(path: string): void;
}
