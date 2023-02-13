/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { RefType } from './api/git';
import { Model } from './model';

export class GitEditSessionIdentityProvider implements vscode.EditSessionIdentityProvider, vscode.Disposable {

	private providerRegistration: vscode.Disposable;

	constructor(private model: Model) {
		this.providerRegistration = vscode.workspace.registerEditSessionIdentityProvider('file', this);

		vscode.workspace.onWillCreateEditSessionIdentity((e) => {
			e.waitUntil(this._onWillCreateEditSessionIdentity(e.workspaceFolder));
		});
	}

	dispose() {
		this.providerRegistration.dispose();
	}

	async provideEditSessionIdentity(workspaceFolder: vscode.WorkspaceFolder, _token: vscode.CancellationToken): Promise<string | undefined> {
		await this.model.openRepository(path.dirname(workspaceFolder.uri.fsPath));

		const repository = this.model.getRepository(workspaceFolder.uri);
		await repository?.status();

		if (!repository || !repository?.HEAD?.upstream) {
			return undefined;
		}

		return JSON.stringify({
			remote: repository.remotes.find((remote) => remote.name === repository.HEAD?.upstream?.remote)?.pushUrl ?? null,
			ref: repository.HEAD?.upstream?.name ?? null,
			sha: repository.HEAD?.commit ?? null,
		});
	}

	provideEditSessionIdentityMatch(identity1: string, identity2: string): vscode.EditSessionIdentityMatch {
		try {
			const normalizedIdentity1 = normalizeEditSessionIdentity(identity1);
			const normalizedIdentity2 = normalizeEditSessionIdentity(identity2);

			if (normalizedIdentity1.remote === normalizedIdentity2.remote &&
				normalizedIdentity1.ref === normalizedIdentity2.ref &&
				normalizedIdentity1.sha === normalizedIdentity2.sha) {
				// This is a perfect match
				return vscode.EditSessionIdentityMatch.Complete;
			} else if (normalizedIdentity1.remote === normalizedIdentity2.remote &&
				normalizedIdentity1.ref === normalizedIdentity2.ref &&
				normalizedIdentity1.sha !== normalizedIdentity2.sha) {
				// Same branch and remote but different SHA
				return vscode.EditSessionIdentityMatch.Partial;
			} else {
				return vscode.EditSessionIdentityMatch.None;
			}
		} catch (ex) {
			return vscode.EditSessionIdentityMatch.Partial;
		}
	}

	private async _onWillCreateEditSessionIdentity(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
		await this._doPublish(workspaceFolder);
	}

	private async _doPublish(workspaceFolder: vscode.WorkspaceFolder) {
		await this.model.openRepository(path.dirname(workspaceFolder.uri.fsPath));

		const repository = this.model.getRepository(workspaceFolder.uri);
		if (!repository) {
			return;
		}

		await repository.status();

		// If this branch hasn't been published to the remote yet,
		// ensure that it is published before Continue On is invoked
		if (!repository.HEAD?.upstream && repository.HEAD?.type === RefType.Head) {

			const publishBranch = vscode.l10n.t('Publish Branch');
			const selection = await vscode.window.showInformationMessage(
				vscode.l10n.t('The current branch is not published to the remote. Would you like to publish it to access your changes elsewhere?'),
				{ modal: true },
				publishBranch
			);
			if (selection !== publishBranch) {
				throw new vscode.CancellationError();
			}

			await vscode.commands.executeCommand('git.publish');
		}
	}
}

function normalizeEditSessionIdentity(identity: string) {
	let { remote, ref, sha } = JSON.parse(identity);

	if (typeof remote === 'string' && remote.endsWith('.git')) {
		remote = remote.slice(0, remote.length - 4);
	}

	return {
		remote,
		ref,
		sha
	};
}
