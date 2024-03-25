/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./newProjectModalDialog';
import * as React from 'react';
import { useRef } from 'react'; // eslint-disable-line no-duplicate-imports
import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { useStateRef } from 'vs/base/browser/ui/react/useStateRef';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Checkbox } from 'vs/base/browser/ui/positronModalDialog/components/checkbox';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { VerticalStack } from 'vs/base/browser/ui/positronModalDialog/components/verticalStack';
import { VerticalSpacer } from 'vs/base/browser/ui/positronModalDialog/components/verticalSpacer';
import { LabeledTextInput } from 'vs/base/browser/ui/positronModalDialog/components/labeledTextInput';
import { LabeledFolderInput } from 'vs/base/browser/ui/positronModalDialog/components/labeledFolderInput';
import { OKCancelModalDialog } from 'vs/base/browser/ui/positronModalDialog/positronOKCancelModalDialog';
import { PositronModalDialogReactRenderer } from 'vs/base/browser/ui/positronModalDialog/positronModalDialogReactRenderer';

/**
 * NewProjectResult interface.
 */
export interface NewProjectResult {
	readonly projectName: string;
	readonly parentFolder: string;
	readonly newWindow: boolean;
}

/**
 * Shows the NewProjectModalDialog.
 * @param accessor The services accessor.
 * @returns A promise that resolves when the dialog is dismissed.
 */
export const showNewProjectModalDialog = async (accessor: ServicesAccessor): Promise<NewProjectResult | undefined> => {
	// Get the services we need for the dialog.
	const fileDialogs = accessor.get(IFileDialogService);
	const layoutService = accessor.get(IWorkbenchLayoutService);

	// Load data we need to present the dialog.
	const parentFolder = (await fileDialogs.defaultFolderPath()).fsPath;

	// Return a promise that resolves when the dialog is done.
	return new Promise<NewProjectResult | undefined>((resolve) => {
		// Create the modal dialog React renderer.
		const positronModalDialogReactRenderer =
			new PositronModalDialogReactRenderer(layoutService.mainContainer);

		// The new project modal dialog component.
		const NewProjectModalDialog = () => {
			// Hooks.
			const [newProjectResult, setNewProjectResult, newProjectResultRef] = useStateRef<NewProjectResult>({
				projectName: '',
				parentFolder,
				newWindow: false
			});
			const projectNameRef = useRef<HTMLInputElement>(undefined!);

			// The accept handler.
			const acceptHandler = () => {
				positronModalDialogReactRenderer.destroy();
				resolve(newProjectResultRef.current);
			};

			// The cancel handler.
			const cancelHandler = () => {
				positronModalDialogReactRenderer.destroy();
				resolve(undefined);
			};

			// The browse handler.
			const browseHandler = async () => {
				// Show the open dialog.
				const uri = await fileDialogs.showOpenDialog({
					defaultUri: newProjectResult.parentFolder ? URI.file(newProjectResult.parentFolder) : undefined,
					canSelectFiles: false,
					canSelectFolders: true
				});

				// If the user made a selection, set the parent directory.
				if (uri?.length) {
					setNewProjectResult({ ...newProjectResult, parentFolder: uri[0].fsPath });
					projectNameRef.current.focus();
				}
			};

			// Render.
			return (
				<OKCancelModalDialog width={400} height={300} title={localize('positronNewProjectModalDialogTitle', "New Project")} accept={acceptHandler} cancel={cancelHandler}>
					<VerticalStack>
						<LabeledTextInput
							ref={projectNameRef}
							label='Project name'
							autoFocus
							value={newProjectResult.projectName}
							onChange={e => setNewProjectResult({ ...newProjectResult, projectName: e.target.value })}
						/>
						<LabeledFolderInput
							label='Create project as subfolder of'
							value={newProjectResult.parentFolder}
							onBrowse={browseHandler}
							onChange={e => setNewProjectResult({ ...newProjectResult, parentFolder: e.target.value })}
						/>
					</VerticalStack>
					<VerticalSpacer>
						<Checkbox label='Open in a new window' onChanged={checked => setNewProjectResult({ ...newProjectResult, newWindow: checked })} />
					</VerticalSpacer>
				</OKCancelModalDialog>
			);
		};

		// Render the modal dialog component.
		positronModalDialogReactRenderer.render(<NewProjectModalDialog />);
	});
};
