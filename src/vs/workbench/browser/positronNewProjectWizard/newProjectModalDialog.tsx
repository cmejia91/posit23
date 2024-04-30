/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { localize } from 'vs/nls';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { NewProjectWizardContextProvider, useNewProjectWizardContext } from 'vs/workbench/browser/positronNewProjectWizard/newProjectWizardContext';
import { ILanguageRuntimeService } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { IRuntimeSessionService } from 'vs/workbench/services/runtimeSession/common/runtimeSessionService';
import { NewProjectWizardConfiguration } from 'vs/workbench/browser/positronNewProjectWizard/newProjectWizardState';
import { NewProjectWizardStepContainer } from 'vs/workbench/browser/positronNewProjectWizard/newProjectWizardStepContainer';
import { IRuntimeStartupService } from 'vs/workbench/services/runtimeStartup/common/runtimeStartupService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { PositronModalReactRenderer } from 'vs/workbench/browser/positronModalReactRenderer/positronModalReactRenderer';
import { PositronModalDialog } from 'vs/workbench/browser/positronComponents/positronModalDialog/positronModalDialog';
import { URI } from 'vs/base/common/uri';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { IFileService } from 'vs/platform/files/common/files';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ILogService } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IPositronNewProjectService, NewProjectConfiguration } from 'vs/workbench/services/positronNewProject/common/positronNewProject';
import { EnvironmentSetupType } from 'vs/workbench/browser/positronNewProjectWizard/interfaces/newProjectWizardEnums';

/**
 * Shows the NewProjectModalDialog.
 */
export const showNewProjectModalDialog = async (
	commandService: ICommandService,
	fileDialogService: IFileDialogService,
	fileService: IFileService,
	keybindingService: IKeybindingService,
	languageRuntimeService: ILanguageRuntimeService,
	layoutService: IWorkbenchLayoutService,
	logService: ILogService,
	openerService: IOpenerService,
	pathService: IPathService,
	positronNewProjectService: IPositronNewProjectService,
	runtimeSessionService: IRuntimeSessionService,
	runtimeStartupService: IRuntimeStartupService,
): Promise<void> => {
	// Create the renderer.
	const renderer = new PositronModalReactRenderer({
		keybindingService,
		layoutService,
		container: layoutService.activeContainer
	});

	// Show the new project modal dialog.
	renderer.render(
		<NewProjectWizardContextProvider
			services={{
				commandService,
				fileDialogService,
				fileService,
				keybindingService,
				languageRuntimeService,
				layoutService,
				logService,
				openerService,
				pathService,
				runtimeSessionService,
				runtimeStartupService,
			}}
			parentFolder={(await fileDialogService.defaultFolderPath()).fsPath}
		>
			<NewProjectModalDialog
				renderer={renderer}
				createProject={async result => {
					// Create the new project folder if it doesn't already exist.
					const folder = URI.file((await pathService.path).join(result.parentFolder, result.projectName));
					if (!(await fileService.exists(folder))) {
						await fileService.createFolder(folder);
					}

					// The python environment type is only relevant if a new environment is being created.
					const pythonEnvType =
						result.pythonEnvSetupType === EnvironmentSetupType.NewEnvironment
							? result.pythonEnvType
							: '';

					// Create the new project configuration.
					const newProjectConfig: NewProjectConfiguration = {
						runtimeId: result.selectedRuntime?.runtimeId || '',
						projectType: result.projectType || '',
						projectFolder: folder.fsPath,
						initGitRepo: result.initGitRepo,
						pythonEnvType: pythonEnvType || '',
						installIpykernel: result.installIpykernel || false,
						useRenv: result.useRenv || false,
					};

					// Store the new project configuration.
					positronNewProjectService.storeNewProjectConfig(newProjectConfig);

					// Any context-dependent work needs to be done before opening the folder
					// because the extension host gets destroyed when a new project is opened,
					// whether the folder is opened in a new window or in the existing window.
					await commandService.executeCommand(
						'vscode.openFolder',
						folder,
						{
							forceNewWindow: result.openInNewWindow,
							forceReuseWindow: !result.openInNewWindow
						}
					);

					// TODO: handle if the new project is the same directory as the current workspace
					// in this case, a window doesn't get opened, so the new project initialization
					// doesn't happen unless we listen to some event. Maybe a different command can be
					// executed to initialize the new project in the current workspace instead of
					// vscode.openFolder.

					// 1) Create the directory for the new project (done above)
					// 2) Set up the initial workspace for the new project
					//   For Python
					//     - If new environment creation is selected, create the .venv/.conda/etc. as appropriate
					//     - If git init selected, create the .gitignore and README.md
					//     - Create an unsaved Python file
					//     - Set the active interpreter to the selected interpreter
					//   For R
					//     - If renv selected, run renv::init()
					//     - Whether or not git init selected, create the .gitignore and README.md
					//     - Create an unsaved R file
					//     - Set the active interpreter to the selected interpreter
					//   For Jupyter Notebook
					//     - If git init selected, create the .gitignore and README.md
					//     - Create an unsaved notebook file
					//     - Set the active interpreter to the selected interpreter

					// Other Thoughts
					//   - Can the interpreter discovery at startup be modified to directly use the selected
					//     interpreter, so that the user doesn't have to wait for the interpreter discovery to
					//     complete before the runtime is started?
				}}
			/>
		</NewProjectWizardContextProvider>
	);
};

interface NewProjectModalDialogProps {
	renderer: PositronModalReactRenderer;
	createProject: (result: NewProjectWizardConfiguration) => Promise<void>;
}

/**
 * NewProjectModalDialog component.
 * @returns The rendered component.
 */
const NewProjectModalDialog = (props: NewProjectModalDialogProps) => {
	const projectState = useNewProjectWizardContext();

	// The accept handler.
	const acceptHandler = async () => {
		props.renderer.dispose();
		await props.createProject(projectState.projectConfig);
	};

	// The cancel handler.
	const cancelHandler = () => {
		props.renderer.dispose();
	};

	// Render.
	return (
		<PositronModalDialog
			renderer={props.renderer}
			width={700} height={520}
			title={(() => localize('positronNewProjectWizard.title', "Create New Project"))()}
			onAccept={acceptHandler}
			onCancel={cancelHandler}
		>
			<NewProjectWizardStepContainer cancel={cancelHandler} accept={acceptHandler} />
		</PositronModalDialog>
	);
};
