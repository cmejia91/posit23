/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit, PBC.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryData } from 'vs/base/common/actions';
import { URI } from 'vs/base/common/uri';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { workspacesCategory } from 'vs/workbench/browser/actions/workspaceActions';
import { showNewWorkspaceModalDialog } from 'vs/workbench/browser/positronModalDialogs/newWorkspaceModalDialog';
import { showNewWorkspaceFromGitModalDialog } from 'vs/workbench/browser/positronModalDialogs/newWorkspaceFromGitModalDialog';
import { EnterMultiRootWorkspaceSupportContext } from 'vs/workbench/common/contextkeys';
import { IPathService } from 'vs/workbench/services/path/common/pathService';

export class PositronNewWorkspaceAction extends Action2 {

	static readonly ID = 'positron.workbench.action.newWorkspace';

	constructor() {
		super({
			id: PositronNewWorkspaceAction.ID,
			title: {
				value: localize('positronNewWorkspace', "New Workspace..."),
				mnemonicTitle: localize({ key: 'miPositronNewWorkspace', comment: ['&& denotes a mnemonic'] }, "New W&&orkspace..."),
				original: 'New Workspace...'
			},
			category: workspacesCategory,
			f1: true,
			precondition: EnterMultiRootWorkspaceSupportContext,
			menu: {
				id: MenuId.MenubarFileMenu,
				group: '1_newworkspace',
				order: 4,
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		// Get the services we need to create the new workspace, if the user accept the dialog.
		const commandService = accessor.get(ICommandService);
		const fileService = accessor.get(IFileService);
		const pathService = accessor.get(IPathService);

		// Show the new workspace modal dialog. If the result is undefined, the user canceled the operation.
		const result = await showNewWorkspaceModalDialog(accessor);
		if (!result) {
			return;
		}

		// Create the new workspace.
		const workspaceDir = URI.file((await pathService.path).join(result.parentDirectory, result.directory));
		if (!(await fileService.exists(workspaceDir))) {
			await fileService.createFolder(workspaceDir);
		}
		await commandService.executeCommand(
			'vscode.openFolder',
			workspaceDir,
			{
				forceNewWindow: result.newWindow,
				forceReuseWindow: !result.newWindow
			}
		);
	}
}

export class PositronNewWorkspaceFromGitAction extends Action2 {

	static readonly ID = 'positron.workbench.action.newWorkspaceFromGit';

	constructor() {
		super({
			id: PositronNewWorkspaceFromGitAction.ID,
			title: {
				value: localize('positronNewWorkspaceFromGit', "New Workspace from Git..."),
				mnemonicTitle: localize({ key: 'miPositronNewWorkspaceFromGit', comment: ['&& denotes a mnemonic'] }, "New Workspace from G&&it..."),
				original: 'New Workspace from Git...'
			},
			category: workspacesCategory,
			f1: true,
			precondition: ContextKeyExpr.and(
				EnterMultiRootWorkspaceSupportContext,
				ContextKeyExpr.deserialize('config.git.enabled && !git.missing')
			),
			menu: {
				id: MenuId.MenubarFileMenu,
				group: '1_newworkspace',
				order: 5,
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const configService = accessor.get(IConfigurationService);

		const result = await showNewWorkspaceFromGitModalDialog(accessor);
		if (result?.repo) {
			// temporarily set openAfterClone to facilitate result.newWindow
			// then set it back afterwards
			const kGitOpenAfterClone = 'git.openAfterClone';
			const prevOpenAfterClone = configService.getValue(kGitOpenAfterClone);
			configService.updateValue(kGitOpenAfterClone, result.newWindow ? 'alwaysNewWindow' : 'always');
			try {
				await commandService.executeCommand('git.clone', result.repo, result.parentDirectory);
			} finally {
				configService.updateValue(kGitOpenAfterClone, prevOpenAfterClone);
			}
		}
	}
}

export class PositronOpenWorkspaceInNewWindowAction extends Action2 {

	static readonly ID = 'positron.workbench.action.openWorkspaceInNewWindow';

	constructor() {
		super({
			id: PositronOpenWorkspaceInNewWindowAction.ID,
			title: {
				value: localize('positronOpenWorkspaceInNewWindow', "Open Workspace in New Window..."),
				original: 'Open Workspace in New Window...'
			},
			category: workspacesCategory,
			f1: true,
			precondition: EnterMultiRootWorkspaceSupportContext,
		});
	}

	override async run(accessor: ServicesAccessor, data?: ITelemetryData): Promise<void> {
		const fileDialogService = accessor.get(IFileDialogService);
		return fileDialogService.pickFolderAndOpen({ forceNewWindow: true, telemetryExtraData: data });
	}
}


// --- Actions Registration
registerAction2(PositronNewWorkspaceAction);
registerAction2(PositronNewWorkspaceFromGitAction);
registerAction2(PositronOpenWorkspaceInNewWindowAction);





