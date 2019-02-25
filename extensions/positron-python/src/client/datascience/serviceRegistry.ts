// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import { IServiceManager } from '../ioc/types';
import { CodeCssGenerator } from './codeCssGenerator';
import { CommandBroker } from './commandBroker';
import { DataScience } from './datascience';
import { DataScienceCodeLensProvider } from './editor-integration/codelensprovider';
import { CodeWatcher } from './editor-integration/codewatcher';
import { History } from './history';
import { HistoryCommandListener } from './historycommandlistener';
import { HistoryProvider } from './historyProvider';
import { JupyterCommandFactory } from './jupyter/jupyterCommand';
import { JupyterExecutionFactory } from './jupyter/jupyterExecutionFactory';
import { JupyterExporter } from './jupyter/jupyterExporter';
import { JupyterImporter } from './jupyter/jupyterImporter';
import { JupyterServerFactory } from './jupyter/jupyterServerFactory';
import { JupyterServerManager } from './jupyter/jupyterServerManager';
import { JupyterSessionManager } from './jupyter/jupyterSessionManager';
import { JupyterVariables } from './jupyter/jupyterVariables';
import { StatusProvider } from './statusProvider';
import {
    ICodeCssGenerator,
    ICodeWatcher,
    ICommandBroker,
    IDataScience,
    IDataScienceCodeLensProvider,
    IDataScienceCommandListener,
    IHistory,
    IHistoryProvider,
    IJupyterCommandFactory,
    IJupyterExecution,
    IJupyterSessionManager,
    IJupyterVariables,
    INotebookExporter,
    INotebookImporter,
    INotebookServer,
    INotebookServerManager,
    IStatusProvider
} from './types';

export function registerTypes(serviceManager: IServiceManager) {
    serviceManager.addSingleton<IDataScienceCodeLensProvider>(IDataScienceCodeLensProvider, DataScienceCodeLensProvider);
    serviceManager.addSingleton<IDataScience>(IDataScience, DataScience);
    serviceManager.addSingleton<IJupyterExecution>(IJupyterExecution, JupyterExecutionFactory);
    serviceManager.add<IDataScienceCommandListener>(IDataScienceCommandListener, HistoryCommandListener);
    serviceManager.addSingleton<ICommandBroker>(ICommandBroker, CommandBroker);
    serviceManager.addSingleton<IHistoryProvider>(IHistoryProvider, HistoryProvider);
    serviceManager.add<IHistory>(IHistory, History);
    serviceManager.add<INotebookExporter>(INotebookExporter, JupyterExporter);
    serviceManager.add<INotebookImporter>(INotebookImporter, JupyterImporter);
    serviceManager.addSingleton<INotebookServerManager>(INotebookServerManager, JupyterServerManager);
    serviceManager.addSingleton<INotebookServer>(INotebookServer, JupyterServerFactory);
    serviceManager.addSingleton<ICodeCssGenerator>(ICodeCssGenerator, CodeCssGenerator);
    serviceManager.addSingleton<IStatusProvider>(IStatusProvider, StatusProvider);
    serviceManager.addSingleton<IJupyterSessionManager>(IJupyterSessionManager, JupyterSessionManager);
    serviceManager.addSingleton<IJupyterVariables>(IJupyterVariables, JupyterVariables);
    serviceManager.add<ICodeWatcher>(ICodeWatcher, CodeWatcher);
    serviceManager.add<IJupyterCommandFactory>(IJupyterCommandFactory, JupyterCommandFactory);
}
