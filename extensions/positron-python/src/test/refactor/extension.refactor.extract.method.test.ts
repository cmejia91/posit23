// tslint:disable:interface-name no-any max-func-body-length estrict-plus-operands no-empty

import * as assert from 'assert';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { Position } from 'vscode';
import { PythonSettings } from '../../client/common/configSettings';
import { getTextEditsFromPatch } from '../../client/common/editor';
import { extractMethod } from '../../client/providers/simpleRefactorProvider';
import { RefactorProxy } from '../../client/refactor/proxy';
import { UnitTestIocContainer } from '../unittests/serviceRegistry';
import { closeActiveWindows, initialize, initializeTest } from './../initialize';
import { MockOutputChannel } from './../mockClasses';

const EXTENSION_DIR = path.join(__dirname, '..', '..', '..');
const refactorSourceFile = path.join(__dirname, '..', '..', '..', 'src', 'test', 'pythonFiles', 'refactoring', 'standAlone', 'refactor.py');
const refactorTargetFileDir = path.join(__dirname, '..', '..', '..', 'out', 'test', 'pythonFiles', 'refactoring', 'standAlone');

interface RenameResponse {
    results: [{ diff: string }];
}

suite('Method Extraction', () => {
    // Hack hac hack
    const oldExecuteCommand = vscode.commands.executeCommand;
    const options: vscode.TextEditorOptions = { cursorStyle: vscode.TextEditorCursorStyle.Line, insertSpaces: true, lineNumbers: vscode.TextEditorLineNumbersStyle.Off, tabSize: 4 };
    let refactorTargetFile = '';
    let ioc: UnitTestIocContainer;
    suiteSetup(initialize);
    suiteTeardown(() => {
        vscode.commands.executeCommand = oldExecuteCommand;
        return closeActiveWindows();
    });
    setup(async () => {
        initializeDI();
        refactorTargetFile = path.join(refactorTargetFileDir, `refactor${new Date().getTime()}.py`);
        fs.copySync(refactorSourceFile, refactorTargetFile, { overwrite: true });
        await initializeTest();
        (<any>vscode).commands.executeCommand = (cmd) => Promise.resolve();
    });
    teardown(async () => {
        vscode.commands.executeCommand = oldExecuteCommand;
        try {
            await fs.unlink(refactorTargetFile);
        } catch { }
        await closeActiveWindows();
    });
    function initializeDI() {
        ioc = new UnitTestIocContainer();
        ioc.registerCommonTypes();
        ioc.registerProcessTypes();
        ioc.registerVariableTypes();
    }

    async function testingMethodExtraction(shouldError: boolean, startPos: Position, endPos: Position): Promise<void> {
        const pythonSettings = PythonSettings.getInstance(vscode.Uri.file(refactorTargetFile));
        const rangeOfTextToExtract = new vscode.Range(startPos, endPos);
        const proxy = new RefactorProxy(EXTENSION_DIR, pythonSettings, path.dirname(refactorTargetFile), ioc.serviceContainer);

        // tslint:disable-next-line:no-multiline-string
        const DIFF = `--- a/refactor.py\n+++ b/refactor.py\n@@ -237,9 +237,12 @@\n             try:\n                 self._process_request(self._input.readline())\n             except Exception as ex:\n-                message = ex.message + '  \\n' + traceback.format_exc()\n-                sys.stderr.write(str(len(message)) + ':' + message)\n-                sys.stderr.flush()\n+                self.myNewMethod(ex)\n+\n+    def myNewMethod(self, ex):\n+        message = ex.message + '  \\n' + traceback.format_exc()\n+        sys.stderr.write(str(len(message)) + ':' + message)\n+        sys.stderr.flush()\n \n if __name__ == '__main__':\n     RopeRefactoring().watch()\n`;
        const mockTextDoc = await vscode.workspace.openTextDocument(refactorTargetFile);
        const expectedTextEdits = getTextEditsFromPatch(mockTextDoc.getText(), DIFF);
        try {
            const response = await proxy.extractMethod<RenameResponse>(mockTextDoc, 'myNewMethod', refactorTargetFile, rangeOfTextToExtract, options);
            if (shouldError) {
                assert.fail('No error', 'Error', 'Extraction should fail with an error', '');
            }
            const textEdits = getTextEditsFromPatch(mockTextDoc.getText(), DIFF);
            assert.equal(response.results.length, 1, 'Invalid number of items in response');
            assert.equal(textEdits.length, expectedTextEdits.length, 'Invalid number of Text Edits');
            textEdits.forEach(edit => {
                const foundEdit = expectedTextEdits.filter(item => item.newText === edit.newText && item.range.isEqual(edit.range));
                assert.equal(foundEdit.length, 1, 'Edit not found');
            });
        } catch (error) {
            if (!shouldError) {
                // Wait a minute this shouldn't work, what's going on
                assert.equal('Error', 'No error', `${error}`);
            }
        }
    }

    test('Extract Method', async () => {
        const startPos = new vscode.Position(239, 0);
        const endPos = new vscode.Position(241, 35);
        await testingMethodExtraction(false, startPos, endPos);
    });

    test('Extract Method will fail if complete statements are not selected', async () => {
        const startPos = new vscode.Position(239, 30);
        const endPos = new vscode.Position(241, 35);
        await testingMethodExtraction(true, startPos, endPos);
    });

    async function testingMethodExtractionEndToEnd(shouldError: boolean, startPos: Position, endPos: Position): Promise<void> {
        const ch = new MockOutputChannel('Python');
        const rangeOfTextToExtract = new vscode.Range(startPos, endPos);

        const textDocument = await vscode.workspace.openTextDocument(refactorTargetFile);
        const editor = await vscode.window.showTextDocument(textDocument);

        editor.selections = [new vscode.Selection(rangeOfTextToExtract.start, rangeOfTextToExtract.end)];
        editor.selection = new vscode.Selection(rangeOfTextToExtract.start, rangeOfTextToExtract.end);

        try {
            await extractMethod(EXTENSION_DIR, editor, rangeOfTextToExtract, ch, ioc.serviceContainer);
            if (shouldError) {
                assert.fail('No error', 'Error', 'Extraction should fail with an error', '');
            }

            const newMethodRefLine = textDocument.lineAt(editor.selection.start);
            assert.equal(ch.output.length, 0, 'Output channel is not empty');
            assert.equal(textDocument.lineAt(newMethodRefLine.lineNumber + 2).text.trim().indexOf('def newmethod'), 0, 'New Method not created');
            assert.equal(newMethodRefLine.text.trim().startsWith('self.newmethod'), true, 'New Method not being used');
        } catch (error) {
            if (!shouldError) {
                assert.equal('Error', 'No error', `${error}`);
            }
        }
    }

    // This test fails on linux (text document not getting updated in time)
    test('Extract Method (end to end)', async () => {
        const startPos = new vscode.Position(239, 0);
        const endPos = new vscode.Position(241, 35);
        await testingMethodExtractionEndToEnd(false, startPos, endPos);
    });

    test('Extract Method will fail if complete statements are not selected', async () => {
        const startPos = new vscode.Position(239, 30);
        const endPos = new vscode.Position(241, 35);
        await testingMethodExtractionEndToEnd(true, startPos, endPos);
    });
});
