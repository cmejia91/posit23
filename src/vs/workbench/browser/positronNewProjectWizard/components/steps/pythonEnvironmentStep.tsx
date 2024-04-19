/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// React.
import * as React from 'react';
import { PropsWithChildren, useEffect, useState } from 'react';  // eslint-disable-line no-duplicate-imports

// Other dependencies.
import { useNewProjectWizardContext } from 'vs/workbench/browser/positronNewProjectWizard/newProjectWizardContext';
import { NewProjectWizardStepProps } from 'vs/workbench/browser/positronNewProjectWizard/interfaces/newProjectWizardStepProps';
import { localize } from 'vs/nls';
import { RuntimeStartupPhase } from 'vs/workbench/services/runtimeStartup/common/runtimeStartupService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { getEnvTypeEntries, getPythonInterpreterEntries, locationForNewEnv } from 'vs/workbench/browser/positronNewProjectWizard/utilities/pythonEnvironmentStepUtils';
import { PositronWizardStep } from 'vs/workbench/browser/positronNewProjectWizard/components/wizardStep';
import { PositronWizardSubStep } from 'vs/workbench/browser/positronNewProjectWizard/components/wizardSubStep';
import { DropDownListBox, DropDownListBoxEntry } from 'vs/workbench/browser/positronComponents/dropDownListBox/dropDownListBox';
import { RadioButtonItem } from 'vs/workbench/browser/positronComponents/positronModalDialog/components/radioButton';
import { RadioGroup } from 'vs/workbench/browser/positronComponents/positronModalDialog/components/radioGroup';
import { EnvironmentSetupType, LanguageIds, PythonEnvironmentType } from 'vs/workbench/browser/positronNewProjectWizard/interfaces/newProjectWizardEnums';
import { InterpreterEntry } from 'vs/workbench/browser/positronNewProjectWizard/components/steps/pythonInterpreterEntry';
import { DropdownEntry } from 'vs/workbench/browser/positronNewProjectWizard/components/steps/dropdownEntry';
import { InterpreterInfo, getSelectedInterpreter } from 'vs/workbench/browser/positronNewProjectWizard/utilities/interpreterDropDownUtils';
import { WizardFormattedText, WizardFormattedTextType } from 'vs/workbench/browser/positronNewProjectWizard/components/wizardFormattedText';

/**
 * The PythonEnvironmentStep component is specific to Python projects in the new project wizard.
 * @param props The NewProjectWizardStepProps
 * @returns The rendered component
 */
export const PythonEnvironmentStep = (props: PropsWithChildren<NewProjectWizardStepProps>) => {
	// Retrieve the wizard state and project configuration.
	const newProjectWizardState = useNewProjectWizardContext();
	const setProjectConfig = newProjectWizardState.setProjectConfig;
	const projectConfig = newProjectWizardState.projectConfig;
	const keybindingService = newProjectWizardState.keybindingService;
	const layoutService = newProjectWizardState.layoutService;
	const logService = newProjectWizardState.logService;
	const runtimeStartupService = newProjectWizardState.runtimeStartupService;
	const languageRuntimeService = newProjectWizardState.languageRuntimeService;

	// Hooks to manage the startup phase and interpreter entries.
	const [startupPhase, setStartupPhase] = useState(runtimeStartupService.startupPhase);
	const [envSetupType, setEnvSetupType] = useState(
		projectConfig.pythonEnvSetupType ?? EnvironmentSetupType.NewEnvironment
	);
	const [envType, setEnvType] = useState(
		projectConfig.pythonEnvType ?? PythonEnvironmentType.Venv
	);
	const [interpreterEntries, setInterpreterEntries] =
		useState(
			// It's possible that the runtime discovery phase is not complete, so we need to check
			// for that before creating the interpreter entries.
			startupPhase !== RuntimeStartupPhase.Complete ?
				[] :
				getPythonInterpreterEntries(
					runtimeStartupService,
					languageRuntimeService,
					envSetupType,
					envType
				)
		);
	const [selectedInterpreter, setSelectedInterpreter] = useState(
		getSelectedInterpreter(
			projectConfig.selectedRuntime,
			interpreterEntries,
			runtimeStartupService,
			LanguageIds.Python
		)
	);
	const [willInstallIpykernel, setWillInstallIpykernel] = useState(
		projectConfig.installIpykernel ?? false
	);

	const envTypeEntries = getEnvTypeEntries();

	const envSetupRadioButtons: RadioButtonItem[] = [
		new RadioButtonItem({
			identifier: EnvironmentSetupType.NewEnvironment,
			title: localize(
				'pythonEnvironmentStep.newEnvironment.radioLabel',
				'Create a new Python environment (Recommended)'
			)
		}),
		new RadioButtonItem({
			identifier: EnvironmentSetupType.ExistingEnvironment,
			title: localize(
				'pythonEnvironmentStep.existingEnvironment.radioLabel',
				'Use an existing Python installation'
			)
		})
	];

	// Utils
	const getInterpreter = (entries: DropDownListBoxEntry<string, InterpreterInfo>[]) => {
		return getSelectedInterpreter(
			selectedInterpreter,
			entries,
			runtimeStartupService,
			LanguageIds.Python
		);
	};
	const isIpykernelInstalled = (runtimePath: string) => {
		return newProjectWizardState.commandService.executeCommand(
			'python.isIpykernelInstalled',
			runtimePath
		);
	};

	// Handler for when the environment setup type is selected. If the user selects the "existing
	// environment" setup, the env type dropdown will not show and the interpreter entries will be
	// updated to show all existing interpreters. The project configuration is updated as well.
	const onEnvSetupSelected = async (pythonEnvSetupType: EnvironmentSetupType) => {
		// Update the project configuration with the new environment setup type.
		setEnvSetupType(pythonEnvSetupType);

		// Update the interpreter entries dropdown based on the new environment setup type.
		const entries = getPythonInterpreterEntries(
			runtimeStartupService,
			languageRuntimeService,
			pythonEnvSetupType,
			envType
		);
		setInterpreterEntries(entries);

		// Update the default selected interpreter based on the new entries.
		const selectedRuntime = getInterpreter(entries);
		setSelectedInterpreter(selectedRuntime);

		// Update the installIpykernel flag for the selected interpreter.
		let installIpykernel = false;
		if (selectedRuntime) {
			installIpykernel = !(await isIpykernelInstalled(selectedRuntime.runtimePath));
			setWillInstallIpykernel(installIpykernel);
		}

		// Save the changes to the project configuration.
		setProjectConfig({ ...projectConfig, pythonEnvSetupType, selectedRuntime, installIpykernel });
	};

	// Handler for when the environment type is selected. The interpreter entries are updated based
	// on the selected environment type, and the project configuration is updated as well.
	const onEnvTypeSelected = async (pythonEnvType: PythonEnvironmentType) => {
		// Update the project configuration with the new environment type.
		setEnvType(pythonEnvType);

		// Update the interpreter entries dropdown based on the new environment type.
		const entries = getPythonInterpreterEntries(
			runtimeStartupService,
			languageRuntimeService,
			envSetupType,
			pythonEnvType
		);
		setInterpreterEntries(entries);

		// Update the default selected interpreter based on the new entries.
		const selectedRuntime = getInterpreter(entries);
		setSelectedInterpreter(selectedRuntime);

		// Update the installIpykernel flag for the selected interpreter.
		let installIpykernel = false;
		if (selectedRuntime) {
			installIpykernel = !(await isIpykernelInstalled(selectedRuntime.runtimePath));
			setWillInstallIpykernel(installIpykernel);
		}

		// Save the changes to the project configuration.
		setProjectConfig({ ...projectConfig, pythonEnvType, selectedRuntime, installIpykernel });
	};

	// Handler for when the interpreter is selected. The project configuration is updated with the
	// selected interpreter and if ipykernel needs to be installed.
	const onInterpreterSelected = async (identifier: string) => {
		// Update the selected interpreter.
		const selectedRuntime = languageRuntimeService.getRegisteredRuntime(identifier);
		if (!selectedRuntime) {
			// This shouldn't happen, since the DropDownListBox should only allow selection of registered
			// runtimes
			logService.error(`No runtime found for identifier: ${selectedInterpreter}`);
			return;
		}
		setSelectedInterpreter(selectedRuntime);

		// Update the installIpykernel flag for the selected interpreter.
		const installIpykernel = !(await isIpykernelInstalled(selectedRuntime.runtimePath));
		setWillInstallIpykernel(installIpykernel);

		// Save the changes to the project configuration.
		setProjectConfig({ ...projectConfig, selectedRuntime, installIpykernel });
	};

	// Hook to update the interpreter entries when the runtime discovery phase is complete
	useEffect(() => {
		// Create the disposable store for cleanup.
		const disposableStore = new DisposableStore();

		// Add the onDidChangeRuntimeStartupPhase event handler; when the runtime discovery phase
		// is complete, update the interpreter entries.
		disposableStore.add(
			runtimeStartupService.onDidChangeRuntimeStartupPhase(
				async phase => {
					if (phase === RuntimeStartupPhase.Complete) {
						// Update the interpreter entries once the runtime discovery phase is complete.
						const entries = getPythonInterpreterEntries(
							runtimeStartupService,
							languageRuntimeService,
							envSetupType,
							envType
						);
						setInterpreterEntries(entries);

						// Update the default selected interpreter based on the new entries.
						const selectedRuntime = getInterpreter(entries);
						setSelectedInterpreter(selectedRuntime);

						// Update the installIpykernel flag for the selected interpreter.
						let installIpykernel = false;
						if (selectedRuntime) {
							installIpykernel = !(await isIpykernelInstalled(selectedRuntime.runtimePath));
							setWillInstallIpykernel(installIpykernel);
						}

						// Save the changes to the project configuration.
						setProjectConfig({
							...projectConfig,
							pythonEnvType: envType,
							pythonEnvSetupType: envSetupType,
							selectedRuntime,
							installIpykernel
						});
					}
					setStartupPhase(phase);
				}
			)
		);

		// Return the cleanup function that will dispose of the event handlers.
		return () => disposableStore.dispose();
	});

	return (
		<PositronWizardStep
			title={(() => localize(
				'pythonEnvironmentStep.title',
				'Set up Python environment'
			))()}
			backButtonConfig={{ onClick: props.back }}
			cancelButtonConfig={{ onClick: props.cancel }}
			okButtonConfig={{
				onClick: props.accept,
				title: (() => localize(
					'positronNewProjectWizard.createButtonTitle',
					"Create"
				))(),
				disable: !selectedInterpreter
			}}
		>
			<PositronWizardSubStep
				title={(() => localize(
					'pythonEnvironmentSubStep.howToSetUpEnv',
					'How would you like to set up your Python project environment?'
				))()}
				titleId='pythonEnvironment-howToSetUpEnv'
			>
				<RadioGroup
					name='envSetup'
					labelledBy='pythonEnvironment-howToSetUpEnv'
					entries={envSetupRadioButtons}
					initialSelectionId={envSetupType}
					onSelectionChanged={
						identifier => onEnvSetupSelected(identifier as EnvironmentSetupType)
					}
				/>
			</PositronWizardSubStep>
			{envSetupType === EnvironmentSetupType.NewEnvironment ?
				<PositronWizardSubStep
					title={(() => localize(
						'pythonEnvironmentSubStep.label',
						'Python Environment'
					))()}
					description={() =>
						<WizardFormattedText type={WizardFormattedTextType.Info}>
							{(() => localize(
								'pythonEnvironmentSubStep.description',
								'Select an environment type for your project.'
							))()}
							<code>ipykernel</code>
							{(() => localize(
								'pythonInterpreterSubStep.feedback',
								' will be installed for Python language support.'
							))()}
						</WizardFormattedText>
					}
					feedback={() =>
						<WizardFormattedText type={WizardFormattedTextType.Info}>
							{(() => localize(
								'pythonEnvironmentSubStep.feedback',
								'The environment will be created at: ',
							))()}
							<code>
								{locationForNewEnv(
									projectConfig.parentFolder,
									projectConfig.projectName,
									envType
								)}
							</code>
						</WizardFormattedText>
					}
				>
					<DropDownListBox
						keybindingService={keybindingService}
						layoutService={layoutService}
						title={(() => localize(
							'pythonEnvironmentSubStep.dropDown.title',
							'Select an environment type'
						))()}
						entries={envTypeEntries}
						selectedIdentifier={envType}
						createItem={item =>
							<DropdownEntry
								title={item.options.value.envType}
								subtitle={item.options.value.envDescription}
							/>
						}
						onSelectionChanged={item => onEnvTypeSelected(item.options.identifier)}
					/>
				</PositronWizardSubStep> : null
			}
			<PositronWizardSubStep
				title={(() => localize(
					'pythonInterpreterSubStep.title',
					'Python Interpreter'
				))()}
				description={() => localize(
					'pythonInterpreterSubStep.description',
					'Select a Python installation for your project. You can modify this later if you change your mind.'
				)}
				feedback={envSetupType === EnvironmentSetupType.ExistingEnvironment
					&& selectedInterpreter
					&& willInstallIpykernel ?
					() =>
						<WizardFormattedText type={WizardFormattedTextType.Info}>
							<code>ipykernel</code>
							{(() => localize(
								'pythonInterpreterSubStep.feedback',
								' will be installed for Python language support.'
							))()}
						</WizardFormattedText>
					: undefined
				}
			>
				<DropDownListBox
					keybindingService={keybindingService}
					layoutService={layoutService}
					disabled={startupPhase !== RuntimeStartupPhase.Complete}
					title={(() => startupPhase !== RuntimeStartupPhase.Complete ?
						localize(
							'pythonInterpreterSubStep.dropDown.title.loading',
							'Loading interpreters...'
						) :
						localize(
							'pythonInterpreterSubStep.dropDown.title',
							'Select a Python interpreter'
						)
					)()}
					// TODO: if the runtime startup phase is complete, but there are no suitable
					// interpreters, show a message that no suitable interpreters were found and the
					// user should install an interpreter with minimum version
					entries={startupPhase !== RuntimeStartupPhase.Complete ? [] : interpreterEntries}
					selectedIdentifier={selectedInterpreter?.runtimeId}
					createItem={item =>
						<InterpreterEntry interpreterInfo={item.options.value} />
					}
					onSelectionChanged={item =>
						onInterpreterSelected(item.options.identifier)
					}
				/>
			</PositronWizardSubStep>
		</PositronWizardStep>
	);
};
