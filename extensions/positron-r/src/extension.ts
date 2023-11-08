/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as positron from 'positron';

import { registerCommands } from './commands';
import { registerFormatter } from './formatting';
import { providePackageTasks } from './tasks';
import { setContexts } from './contexts';
import { discoverTests } from './testing';
import { rRuntimeProvider } from './provider';
import { RRuntime } from './runtime';
import { registerHtmlWidgets } from './htmlwidgets';

export const Logger = vscode.window.createOutputChannel('Positron R Extension', { log: true });

export function activate(context: vscode.ExtensionContext) {
	const onDidChangeLogLevel = (logLevel: vscode.LogLevel) => {
		Logger.appendLine(vscode.l10n.t('Log level: {0}', vscode.LogLevel[logLevel]));
	};
	context.subscriptions.push(Logger.onDidChangeLogLevel(onDidChangeLogLevel));
	onDidChangeLogLevel(Logger.logLevel);

	const runtimes = new Map<string, RRuntime>();
	positron.runtime.registerLanguageRuntimeProvider(
		'r', rRuntimeProvider(context, runtimes));

	// Set contexts.
	setContexts(context);

	// Register commands.
	registerCommands(context, runtimes);

	// Register HTML widget related resources.
	registerHtmlWidgets();

	// Register formatter.
	registerFormatter(context, runtimes);

	// Provide tasks.
	providePackageTasks(context);

	// Discover R package tests.
	discoverTests(context);

}
