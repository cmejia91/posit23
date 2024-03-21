/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { useState } from 'react';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ILanguageRuntimeMetadata, ILanguageRuntimeService } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { IRuntimeSessionService } from 'vs/workbench/services/runtimeSession/common/runtimeSessionService';
import { IRuntimeStartupService } from 'vs/workbench/services/runtimeStartup/common/runtimeStartupService';
import { NewProjectWizardStep } from 'vs/workbench/browser/positronModalDialogs/newProjectWizard/steps/newProjectWizardStep';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

/**
 * NewProjectWizardServices interface. Defines the set of services that are required by the New
 * Project Wizard.
 */
export interface NewProjectWizardServices {
	fileDialogService: IFileDialogService;
	languageRuntimeService: ILanguageRuntimeService;
	runtimeSessionService: IRuntimeSessionService;
	runtimeStartupService: IRuntimeStartupService;
	layoutService: IWorkbenchLayoutService;
	keybindingService: IKeybindingService;
}

export interface NewProjectWizardStateProps {
	readonly services: NewProjectWizardServices;
	readonly parentFolder: string;
}

export enum NewProjectType {
	PythonProject = 'Python Project',
	RProject = 'R Project',
	JupyterNotebook = 'Jupyter Notebook'
}

export interface NewProjectConfiguration {
	readonly selectedRuntime: ILanguageRuntimeMetadata;
	readonly projectType: NewProjectType | '';
	readonly projectName: string;
	readonly parentFolder: string;
	readonly initGitRepo: boolean;
	readonly openInNewWindow: boolean;
	readonly pythonEnvType?: string;
}

/**
 * The Positron action bar state.
 */
export interface NewProjectWizardState extends NewProjectWizardServices {
	projectConfig: NewProjectConfiguration;
	wizardSteps: NewProjectWizardStep[]; // TODO: remove: this is for debugging
	currentStep: NewProjectWizardStep;
	setProjectConfig(config: NewProjectConfiguration): void;
	goToNextStep: (step: NewProjectWizardStep) => void;
	goToPreviousStep: () => void;
	// const okButtonTitle = localize('positronNewProjectWizard.createButtonTitle', "Create");
}

/**
 * The usePositronActionBarState custom hook.
 * @param services A PositronActionBarServices that contains the Positron action bar services.
 * @returns The hook.
 */
export const useNewProjectWizardState = (
	props: NewProjectWizardStateProps
): NewProjectWizardState => {
	// Hooks.
	const [projectConfig, setProjectConfig] = useState<NewProjectConfiguration>({
		selectedRuntime: props.services.languageRuntimeService.registeredRuntimes[0],
		projectType: '',
		projectName: '',
		parentFolder: props.parentFolder ?? '',
		initGitRepo: false,
		openInNewWindow: true,
		pythonEnvType: ''
	});

	const [wizardSteps, setWizardSteps] = useState([NewProjectWizardStep.ProjectTypeSelection]);
	const [currentStep, setCurrentStep] = useState(NewProjectWizardStep.ProjectTypeSelection);

	const goToNextStep = (step: NewProjectWizardStep) => {
		setWizardSteps([...wizardSteps, step]);
		setCurrentStep(step);
	};

	const goToPreviousStep = () => {
		const steps = wizardSteps;
		steps.pop();
		setWizardSteps(steps);
		if (steps.length === 0) {
			setCurrentStep(NewProjectWizardStep.None);
			return;
		}
		setCurrentStep(steps[steps.length - 1]);
	};

	// Return the New Project Wizard state.
	return {
		...props.services,
		projectConfig,
		wizardSteps, // TODO: remove: this is for debugging
		currentStep,
		setProjectConfig,
		goToNextStep,
		goToPreviousStep,
	};
};
