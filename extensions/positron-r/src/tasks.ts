/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { RRuntimeManager } from './runtime-manager';

export class RPackageTaskProvider implements vscode.TaskProvider {

	async provideTasks() {
		const tasks = getRPackageTasks();
		return tasks;
	}

	resolveTask(_task: vscode.Task): vscode.Task | undefined {
		return undefined;
	}

}

export async function providePackageTasks(context: vscode.ExtensionContext): Promise<void> {
	context.subscriptions.push(
		vscode.tasks.registerTaskProvider('rPackageTask', new RPackageTaskProvider())
	);
}

export async function getRPackageTasks(): Promise<vscode.Task[]> {
	if (!RRuntimeManager.instance.hasLastBinpath()) {
		throw new Error(`No running R runtime to use for R package tasks.`);
	}
	const binpath = RRuntimeManager.instance.getLastBinpath();
	const taskData = [
		{
			task: 'r.task.packageCheck',
			message: vscode.l10n.t('{taskName}', { taskName: 'Check R package' }),
			rcode: 'devtools::check()',
			package: 'devtools'
		},
		{
			task: 'r.task.packageInstall',
			message: vscode.l10n.t('{taskName}', { taskName: 'Install R package' }),
			rcode: 'pak::local_install(upgrade = FALSE)',
			package: 'pak'
		}
	];
	// the explicit quoting treatment is necessary to avoid headaches on Windows, with PowerShell
	const allPackageTasks: PackageTask[] = taskData.map(data => ({
		task: data.task,
		message: data.message,
		shellExecution: new vscode.ShellExecution(
			binpath,
			['-e', { value: data.rcode, quoting: vscode.ShellQuoting.Strong }]
		),
		package: data.package
	}));
	return allPackageTasks.map(task => new vscode.Task(
		{ type: 'rPackageTask', task: task.task, pkg: task.package },
		vscode.TaskScope.Workspace,
		task.message,
		'R',
		task.shellExecution,
		[]
	));
}

type PackageTask = {
	task: string;
	message: string;
	shellExecution: vscode.ShellExecution;
	package?: string;
};
