// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as fs from 'fs-extra';
import * as getFreePort from 'get-port';
import { IDisposable } from 'monaco-editor';
import * as sinon from 'sinon';
import * as TypeMoq from 'typemoq';
import { EventEmitter, Uri, ViewColumn, WebviewPanel } from 'vscode';
import { noop } from '../../../client/common/utils/misc';
import { INotebookEditor, INotebookEditorProvider } from '../../../client/datascience/types';
import { createTemporaryFile } from '../../utils/fs';
import { mockedVSCodeNamespaces } from '../../vscode-mock';
import { DataScienceIocContainer } from '../dataScienceIocContainer';
import { NotebookEditorUI } from './notebookUi';
import { WebServer } from './webBrowserPanel';

async function openNotebookEditor(
    iocC: DataScienceIocContainer,
    contents: string,
    filePath: string = '/usr/home/test.ipynb'
): Promise<INotebookEditor> {
    const uri = Uri.file(filePath);
    iocC.setFileContents(uri, contents);
    const notebookEditorProvider = iocC.get<INotebookEditorProvider>(INotebookEditorProvider);
    return uri ? notebookEditorProvider.open(uri) : notebookEditorProvider.createNew();
}

async function createNotebookFileWithContents(contents: string, disposables: IDisposable[]): Promise<string> {
    const notebookFile = await createTemporaryFile('.ipynb');
    disposables.push({
        dispose: () => {
            try {
                notebookFile.cleanupCallback.bind(notebookFile);
            } catch {
                noop();
            }
        }
    });
    await fs.writeFile(notebookFile.filePath, contents);
    return notebookFile.filePath;
}

function createWebViewPanel(): WebviewPanel {
    const disposeEventEmitter = new EventEmitter<void>();
    const webViewPanel: Partial<WebviewPanel> = {
        webview: {
            html: ''
            // tslint:disable-next-line: no-any
        } as any,
        reveal: noop,
        onDidDispose: disposeEventEmitter.event.bind(disposeEventEmitter),
        dispose: () => disposeEventEmitter.fire(),
        title: '',
        viewType: '',
        active: true,
        options: {},
        visible: true,
        viewColumn: ViewColumn.Active
    };

    mockedVSCodeNamespaces.window
        ?.setup((w) =>
            w.createWebviewPanel(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny())
        )
        // tslint:disable-next-line: no-any
        .returns(() => webViewPanel as any);

    // tslint:disable-next-line: no-any
    return webViewPanel as any;
}

export async function openNotebook(
    ioc: DataScienceIocContainer,
    disposables: IDisposable[],
    notebookFileContents: string
) {
    const notebookFile = await createNotebookFileWithContents(notebookFileContents, disposables);
    const notebookUI = new NotebookEditorUI();
    disposables.push(notebookUI);
    // Wait for UI to load, i.e. until we get the message `LoadAllCellsComplete`.
    const uiLoaded = notebookUI.waitUntilLoaded();

    const port = await getFreePort({ host: 'localhost' });
    process.env.VSC_PYTHON_DS_UI_PORT = port.toString();

    // Wait for the browser to launch and open the UI.
    // I.e. wait until we open the notebook react ui in browser.
    const originalWaitForConnection = WebServer.prototype.waitForConnection;
    const waitForConnection = sinon.stub(WebServer.prototype, 'waitForConnection');
    waitForConnection.callsFake(async function (this: WebServer) {
        waitForConnection.restore();
        // Hook up the message service with the notebook class.
        // Used to send/receive messages (postOffice) via webSockets in webserver.
        notebookUI._setWebServer(this);

        // Execute base code.
        const promise = originalWaitForConnection.apply(this);

        // Basically we're waiting for web server to wait for connection from browser.
        // We're also waiting for UI to connect to backend Url.
        await Promise.all([notebookUI.loadUI(`http://localhost:${port}/index.nativeEditor.html`), promise]);
    });

    const webViewPanel = createWebViewPanel();
    const notebookEditor = await openNotebookEditor(ioc, notebookFileContents, notebookFile);
    await uiLoaded;
    return { notebookEditor, webViewPanel, notebookUI };
}