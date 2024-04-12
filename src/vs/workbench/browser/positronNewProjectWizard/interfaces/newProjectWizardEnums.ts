/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/**
 * The NewProjectWizardStep enum is a list of steps in the New Project Wizard.
 * Each step corresponds to a component that should be rendered for that step.
 *
 * New steps can be added to this enum as needed.
 */
export enum NewProjectWizardStep {
	None = 'none',
	ProjectTypeSelection = 'projectTypeSelection',
	ProjectNameLocation = 'projectNameLocation',
	PythonEnvironment = 'pythonEnvironment',
	RConfiguration = 'rConfiguration'
}

/**
 * The EnvironmentSetupType enum includes the types of environment setup options.
 * - NewEnvironment: Create a new environment.
 * - ExistingEnvironment: Use an existing environment.
 */
export enum EnvironmentSetupType {
	NewEnvironment = 'newEnvironment',
	ExistingEnvironment = 'existingEnvironment'
}

/**
 * PythonEnvironmentType enum includes the types of Python environments.
 * - Venv: A virtual environment.
 * - Conda: A conda environment.
 * TODO: retrieve these values from the appropriate extensions/services?
 */
export enum PythonEnvironmentType {
	Venv = 'Venv',
	Conda = 'Conda'
}

/**
 * NewProjectType enum. Defines the types of projects that can be created.
 * TODO: localize. Since this is an enum, we can't use the localize function
 * because computed values must be numbers (not strings). So we'll probably need to
 * turn this into an object with keys and values, maybe also using something like
 * satisfies Readonly<Record<string, string>>.
 */
export enum NewProjectType {
	PythonProject = 'Python Project',
	RProject = 'R Project',
	JupyterNotebook = 'Jupyter Notebook'
}
