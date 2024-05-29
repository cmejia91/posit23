/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./projectTypeStep';

// React.
import * as React from 'react';
import { PropsWithChildren, useState } from 'react';  // eslint-disable-line no-duplicate-imports

// Other dependencies.
import { localize } from 'vs/nls';
import { useNewProjectWizardContext } from 'vs/workbench/browser/positronNewProjectWizard/newProjectWizardContext';
import { NewProjectWizardStep } from 'vs/workbench/browser/positronNewProjectWizard/interfaces/newProjectWizardEnums';
import { NewProjectWizardStepProps } from 'vs/workbench/browser/positronNewProjectWizard/interfaces/newProjectWizardStepProps';
import { OKCancelBackNextActionBar } from 'vs/workbench/browser/positronComponents/positronModalDialog/components/okCancelBackNextActionBar';
import { ProjectTypeGroup } from 'vs/workbench/browser/positronNewProjectWizard/components/projectTypeGroup';
import { checkProjectName } from 'vs/workbench/browser/positronNewProjectWizard/utilities/projectNameUtils';

/**
 * The ProjectTypeStep component is the first step in the new project wizard, used to
 * determine the type of project to create.
 * @param props The NewProjectWizardStepProps
 * @returns The rendered component
 */
export const ProjectTypeStep = (props: PropsWithChildren<NewProjectWizardStepProps>) => {
	// State.
	const context = useNewProjectWizardContext();

	// Hooks.
	const [selectedProjectType, setSelectedProjectType] = useState(context.projectType);

	// Set the projectType and initialize the default project name if applicable,
	// then navigate to the ProjectNameLocation step.
	const nextStep = async () => {
		if (!selectedProjectType) {
			// If no project type is selected, return. This shouldn't happen since the Next button should
			// be disabled if no project type is selected.
			return;
		}
		// If the project type has changed or the project name is empty, initialize the project name.
		if (
			context.projectType !== selectedProjectType ||
			context.projectName === ''
		) {
			// The default project name is 'my' + projectType without spaces, eg. 'myPythonProject'.
			const defaultProjectName =
				localize(
					'positron.newProjectWizard.projectTypeStep.defaultProjectNamePrefix',
					"my"
				) + selectedProjectType.replace(/\s/g, '');
			context.projectType = selectedProjectType;
			context.projectName = defaultProjectName;
			context.projectNameFeedback = await checkProjectName(
				defaultProjectName,
				context.parentFolder,
				context.services.pathService,
				context.services.fileService
			);
		}
		props.next(NewProjectWizardStep.ProjectNameLocation);
	};

	// Render.
	return (
		<div className='project-type-selection-step'>
			<div
				className='project-type-selection-step-title'
				id='project-type-selection-step-title'
			>
				{(() =>
					localize(
						'positronNewProjectWizard.projectTypeStepTitle',
						"Project Type"
					))()}
			</div>
			<div
				className='project-type-selection-step-description'
				id='project-type-selection-step-description'
			>
				{(() =>
					localize(
						'positronNewProjectWizard.projectTypeStepDescription',
						"Select the type of project to create."
					))()}
			</div>
			<ProjectTypeGroup
				name='projectType'
				labelledBy='project-type-selection-step-title'
				describedBy='project-type-selection-step-description'
				selectedProjectId={selectedProjectType}
				onSelectionChanged={(projectType) =>
					setSelectedProjectType(projectType)
				}
			/>
			<OKCancelBackNextActionBar
				cancelButtonConfig={{
					onClick: props.cancel,
				}}
				nextButtonConfig={{
					onClick: nextStep,
					disable: !selectedProjectType,
				}}
			/>
		</div>
	);
};
