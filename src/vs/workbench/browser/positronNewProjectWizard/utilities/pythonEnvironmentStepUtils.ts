/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DropDownListBoxItem } from 'vs/workbench/browser/positronComponents/dropDownListBox/dropDownListBoxItem';
import { PythonEnvironmentProvider } from 'vs/workbench/browser/positronNewProjectWizard/interfaces/newProjectWizardEnums';

/**
 * PythonEnvironmentProviderInfo interface.
 */
export interface PythonEnvironmentProviderInfo {
	id: string;
	name: string;
	description: string;
}

/**
 * Constructs the location for the new Python environment based on the parent folder, project name,
 * and environment type.
 * @param parentFolder The parent folder for the new environment.
 * @param projectName The name of the project.
 * @param envType The type of Python environment.
 * @returns The location for the new Python environment.
 */
export const locationForNewEnv = (
	parentFolder: string,
	projectName: string,
	envProviderName: string | undefined,
) => {
	// TODO: this only works for Venv and Conda environments. We'll need to expand on this to add
	// support for other environment types.
	const envDir =
		envProviderName === PythonEnvironmentProvider.Venv
			? '.venv'
			: envProviderName === PythonEnvironmentProvider.Conda
				? '.conda'
				: '';
	return `${parentFolder}/${projectName}/${envDir}`;
};

/**
 * Converts PythonEnvironmentProviderInfo objects to DropDownListBoxItem objects.
 * @param providers The PythonEnvironmentProviderInfo objects to convert.
 * @returns The array of DropDownListBoxItem objects.
 */
export const envProviderInfoToDropDownItems = (
	providers: PythonEnvironmentProviderInfo[]
): DropDownListBoxItem<string, PythonEnvironmentProviderInfo>[] => {
	return providers.map(
		(provider) =>
			new DropDownListBoxItem<string, PythonEnvironmentProviderInfo>({
				identifier: provider.id,
				value: provider,
			})
	);
};

/**
 * Retrieves the name of the environment provider based on the provider ID.
 * @param providerId The ID of the environment provider.
 * @param providers The list of environment providers.
 * @returns The name of the environment provider or undefined if not found.
 */
export const envProviderNameForId = (
	providerId: string | undefined,
	providers: PythonEnvironmentProviderInfo[]
): string | undefined => {
	if (!providerId) {
		return undefined;
	}
	const provider = providers.find((p) => p.id === providerId);
	return provider ? provider.name : undefined;
};
