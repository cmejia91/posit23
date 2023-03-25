/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from 'vs/base/common/uuid';
import { EnvironmentVariable } from 'vs/workbench/services/languageRuntime/common/languageRuntimeEnvironmentClient';

/**
 * EnvironmentVariableItem class.
 */
export class EnvironmentVariableItem {
	//#region Private Properties

	/**
	 * Gets the environment variable.
	 */
	private readonly _environmentVariable: EnvironmentVariable;

	/**
	 * Gets or sets the children.
	 */
	private _children: EnvironmentVariableItem[] | undefined = undefined;

	//#endregion Private Properties

	//#region Public Properties

	/**
	 * Gets the identifier.
	 */
	readonly id = generateUuid();

	/**
	 * Gets the name.
	 */
	get name() {
		return this._environmentVariable.data.name;
	}

	/**
	 * Gets the value.
	 */
	get value() {
		return this._environmentVariable.data.value;
	}

	/**
	 * Gets the kind of value.
	 */
	get kind() {
		return this._environmentVariable.data.kind;
	}

	/**
	 * Gets the number of elements in the value, if applicable.
	 */
	get length() {
		return this._environmentVariable.data.length;
	}

	/**
	 * Gets the size of the variable's value, in bytes.
	 */
	get size() {
		return this._environmentVariable.data.size;
	}

	/**
	 * Gets the type summary of value for display.
	 */
	get type() {
		return this._environmentVariable.data.type;
	}

	/**
	 * Gets a value which indicates whether the variable contains child variables.
	 */
	get hasChildren() {
		return this._environmentVariable.data.has_children;
	}

	/**
	 * Gets a value which indicates whether the value is truncated.
	 */
	get isTruncated() {
		return this._environmentVariable.data.is_truncated;
	}

	/**
	 * Gets or sets a value which indicates whether the environment variable is expanded.
	 */
	expanded: boolean = false;

	//#endregion Public Properties

	//#region Constructor

	/**
	 * Constructor.
	 * @param name The environment variable.
	 */
	constructor(environmentVariable: EnvironmentVariable) {
		this._environmentVariable = environmentVariable;
	}

	//#endregion Constructor

	//#region Public Methods

	/**
	 * Loads the children.
	 */
	async loadChildren(): Promise<EnvironmentVariableItem[] | undefined> {
		// If the environment variable has no children, return undefined.
		if (!this.hasChildren) {
			return undefined;
		}

		// If the children have already been loaded, return them.
		if (this._children) {
			return this._children;
		}

		// Asynchronously load the children.
		const environmentClientList = await this._environmentVariable.getChildren();
		const children: EnvironmentVariableItem[] = [];
		environmentClientList.variables.map(environmentVariable => {
			children.push(new EnvironmentVariableItem(environmentVariable));
		});

		// Set the children and return them.
		this._children = children;
		return this._children;
	}

	//#endregion Public Methods
}
