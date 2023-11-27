/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ContextKey, activateContextKeys, contexts } from '../context';
import { closeAllEditors, disposeAll } from './utils';

suite('Context', () => {
	const disposables: vscode.Disposable[] = [];
	teardown(async () => {
		await closeAllEditors();
		disposeAll(disposables);
	});
	activateContextKeys(disposables);

	test('Opening an empty Python document', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'python' });
		await vscode.window.showTextDocument(document);

		assertContextsEqual(true, false);
	});

	test('Opening a Python document with code cells', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'python', content: '#%%' });
		await vscode.window.showTextDocument(document);

		assertContextsEqual(true, true);
	});

	test('Adding a code cell to an empty Python document', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'python' });
		const editor = await vscode.window.showTextDocument(document);

		assertContextsEqual(true, false);

		const result = await editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(0, 0), '#%%');
		});
		assert.ok(result);

		assertContextsEqual(true, true);
	});

	test('Removing all code cells from a Python document', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'python', content: '#%%' });
		const editor = await vscode.window.showTextDocument(document);

		assertContextsEqual(true, true);

		await editor.edit((editBuilder) => {
			editBuilder.delete(new vscode.Range(0, 0, 1, 0));
		});

		assertContextsEqual(true, false);
	});

	test('Changing the active editor', async () => {
		const document1 = await vscode.workspace.openTextDocument({ language: 'python', content: '#%%' });
		await vscode.window.showTextDocument(document1);

		assertContextsEqual(true, true);

		const document2 = await vscode.workspace.openTextDocument({ language: 'unknown-language' });
		await vscode.window.showTextDocument(document2);

		assertContextsEqual(false, false);
	});
});

function assertContextsEqual(expectedSupportsCodeCells: boolean, expectedHasCodeCells: boolean): void {
	assert.strictEqual(contexts.get(ContextKey.SupportsCodeCells), expectedSupportsCodeCells,
		`Expected context '${ContextKey.SupportsCodeCells}' to be ${expectedSupportsCodeCells}`);

	assert.strictEqual(contexts.get(ContextKey.HasCodeCells), expectedHasCodeCells,
		`Expected context '${ContextKey.HasCodeCells}' to be ${expectedHasCodeCells}`);
}
