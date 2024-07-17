/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Locator } from '@playwright/test';
import { Code } from '../code';
import { QuickAccess } from '../quickaccess';
import { PositronBaseElement, PositronTextElement } from './positronBaseElement';

// Project Name & Location Step
const PROJECT_WIZARD_PROJECT_NAME_INPUT =
	'div[id="wizard-sub-step-project-name"] .wizard-sub-step-input input.text-input';

// Selector for the currently open dropdown popup items in the project wizard
const PROJECT_WIZARD_DROPDOWN_POPUP_ITEMS =
	'div.positron-modal-popup-children button.positron-button.item';

/*
 *  Reuseable Positron new project wizard functionality for tests to leverage.
 */
export class PositronNewProjectWizard {
	projectTypeStep: ProjectWizardProjectTypeStep;
	projectNameLocationStep: ProjectWizardProjectNameLocationStep;
	rConfigurationStep: ProjectWizardRConfigurationStep;
	pythonConfigurationStep: ProjectWizardPythonConfigurationStep;
	currentOrNewWindowSelectionModal: CurrentOrNewWindowSelectionModal;

	cancelButton: PositronBaseElement;
	nextButton: PositronBaseElement;
	backButton: PositronBaseElement;
	disabledCreateButton: PositronBaseElement;

	constructor(private code: Code, private quickaccess: QuickAccess) {
		this.projectTypeStep = new ProjectWizardProjectTypeStep(this.code);
		this.projectNameLocationStep = new ProjectWizardProjectNameLocationStep(
			this.code
		);
		this.rConfigurationStep = new ProjectWizardRConfigurationStep(
			this.code
		);
		this.pythonConfigurationStep = new ProjectWizardPythonConfigurationStep(
			this.code
		);
		this.currentOrNewWindowSelectionModal =
			new CurrentOrNewWindowSelectionModal(this.code);

		this.cancelButton = new PositronBaseElement(
			'div.right-actions > button.positron-button.button.action-bar-button[tabindex="0"][role="button"]',
			this.code
		);
		this.nextButton = new PositronBaseElement(
			'button.positron-button.button.action-bar-button.default[tabindex="0"][role="button"]',
			this.code
		);
		this.backButton = new PositronBaseElement(
			'div.left-actions > button.positron-button.button.action-bar-button[tabindex="0"][role="button"]',
			this.code
		);
		this.disabledCreateButton = new PositronBaseElement(
			'button.positron-button.button.action-bar-button.default.disabled[tabindex="0"][disabled][role="button"][aria-disabled="true"]',
			this.code
		);
	}

	async startNewProject() {
		await this.quickaccess.runCommand(
			'positron.workbench.action.newProject',
			{ keepOpen: false }
		);
	}
}

class ProjectWizardProjectTypeStep {
	pythonProjectButton: PositronBaseElement;
	rProjectButton: PositronBaseElement;
	jupyterNotebookButton: PositronBaseElement;

	constructor(private code: Code) {
		this.pythonProjectButton = new PositronBaseElement(
			'[id="Python Project"]',
			this.code
		);
		this.rProjectButton = new PositronBaseElement(
			'[id="R Project"]',
			this.code
		);
		this.jupyterNotebookButton = new PositronBaseElement(
			'[id="Jupyter Notebook"]',
			this.code
		);
	}
}

class ProjectWizardProjectNameLocationStep {
	projectNameInput: Locator;

	constructor(private code: Code) {
		this.projectNameInput = this.code.driver.getLocator(
			PROJECT_WIZARD_PROJECT_NAME_INPUT
		);
	}

	async appendToProjectName(text: string) {
		await this.code.waitForActiveElement(PROJECT_WIZARD_PROJECT_NAME_INPUT);
		await this.projectNameInput.page().keyboard.type(text);
	}
}

class ProjectWizardRConfigurationStep {
	renvCheckbox: PositronBaseElement;

	constructor(private code: Code) {
		this.renvCheckbox = new PositronBaseElement(
			'div.renv-configuration > div.checkbox',
			this.code
		);
	}
}

class ProjectWizardPythonConfigurationStep {
	newEnvRadioButton: PositronBaseElement;
	existingEnvRadioButton: PositronBaseElement;
	envProviderDropdown: Locator;
	selectedInterpreterPath: PositronTextElement;
	interpreterFeedback: PositronTextElement;
	interpreterDropdown: Locator;

	constructor(private code: Code) {
		this.newEnvRadioButton = new PositronBaseElement(
			'div[id="wizard-step-set-up-python-environment"] div[id="wizard-sub-step-pythonenvironment-howtosetupenv"] radio-button-input.[id="newEnvironment"]',
			this.code
		);
		this.existingEnvRadioButton = new PositronBaseElement(
			'div[id="wizard-step-set-up-python-environment"] div[id="wizard-sub-step-pythonenvironment-howtosetupenv"] .radio-button-input[id="existingEnvironment"]',
			this.code
		);
		this.envProviderDropdown = this.code.driver.getLocator(
			'div[id="wizard-sub-step-python-environment"] .wizard-sub-step-input button.drop-down-list-box'
		);
		this.selectedInterpreterPath = new PositronTextElement(
			'div[id="wizard-sub-step-python-interpreter"] .wizard-sub-step-input button.drop-down-list-box .dropdown-entry-subtitle',
			this.code
		);
		this.interpreterFeedback = new PositronTextElement(
			'div[id="wizard-sub-step-python-interpreter"] .wizard-sub-step-feedback .wizard-formatted-text',
			this.code
		);
		this.interpreterDropdown = this.code.driver.getLocator(
			'div[id="wizard-sub-step-python-interpreter"] .wizard-sub-step-input button.drop-down-list-box'
		);
	}

	/**
	 * Selects the specified environment provider in the project wizard environment provider dropdown.
	 * @param provider The environment provider to select.
	 */
	async selectEnvProvider(provider: string) {
		// Open the dropdown
		await this.envProviderDropdown.click();

		// Try to find the env provider in the dropdown
		try {
			await this.code.waitForElement(
				PROJECT_WIZARD_DROPDOWN_POPUP_ITEMS
			);
			await this.code.driver
				.getLocator(
					`${PROJECT_WIZARD_DROPDOWN_POPUP_ITEMS} div.dropdown-entry-title:text-is("${provider}")`
				)
				.click();
			return Promise.resolve();
		} catch (error) {
			return Promise.reject(
				`Could not find env provider in project wizard dropdown: ${error}`
			);
		}
	}

	/**
	 * Selects the interpreter corresponding to the given path in the project wizard interpreter
	 * dropdown.
	 * @param interpreterPath The path of the interpreter to select in the dropdown.
	 * @returns A promise that resolves once the interpreter is selected, or rejects if the interpreter is not found.
	 */
	async selectInterpreterByPath(interpreterPath: string) {
		// Open the dropdown
		await this.interpreterDropdown.click();

		// Try to find the interpreterPath in the dropdown and click the entry if found
		try {
			await this.code.waitForElement(
				PROJECT_WIZARD_DROPDOWN_POPUP_ITEMS
			);
			await this.code.driver
				.getLocator(
					`${PROJECT_WIZARD_DROPDOWN_POPUP_ITEMS} div.dropdown-entry-subtitle:text-is("${interpreterPath}")`
				)
				.click();
			return Promise.resolve();
		} catch (error) {
			// Couldn't find the path of the interpreter in the dropdown
			return Promise.reject(
				`Could not find interpreter path in project wizard dropdown: ${error}`
			);
		}
	}
}

class CurrentOrNewWindowSelectionModal {
	currentWindowButton: PositronBaseElement;

	constructor(private code: Code) {
		this.currentWindowButton = new PositronBaseElement(
			'button.positron-button.button.action-bar-button[tabindex="0"][role="button"]',
			this.code
		);
	}
}
