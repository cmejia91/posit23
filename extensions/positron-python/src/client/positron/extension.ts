/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// eslint-disable-next-line import/no-unresolved
import * as positron from 'positron';
import { PythonExtension } from '../api/types';
import { IDisposableRegistry, IInstaller, InstallerResponse, Product, ProductInstallStatus } from '../common/types';
import { IInterpreterService } from '../interpreter/contracts';
import { IServiceContainer } from '../ioc/types';
import { traceError, traceInfo } from '../logging';
import { PythonRuntimeManager } from './manager';
import { createPythonRuntimeMetadata } from './runtime';
import { IPYKERNEL_VERSION, MINIMUM_PYTHON_VERSION } from '../common/constants';
import { InstallOptions } from '../common/installer/types';

export async function activatePositron(
    activatedPromise: Promise<void>,
    pythonApi: PythonExtension,
    serviceContainer: IServiceContainer,
): Promise<void> {
    try {
        traceInfo('activatePositron: creating runtime manager');
        const manager = new PythonRuntimeManager(serviceContainer, pythonApi, activatedPromise);

        // Register the Python runtime discoverer (to find all available runtimes) with positron.
        traceInfo('activatePositron: registering python runtime manager');
        positron.runtime.registerLanguageRuntimeManager(manager);

        // Wait for all extension components to be activated before registering event listeners
        traceInfo('activatePositron: awaiting extension activation');
        await activatedPromise;

        const registerRuntime = async (interpreterPath: string) => {
            if (!manager.registeredPythonRuntimes.has(interpreterPath)) {
                // Get the interpreter corresponding to the new runtime.
                const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
                const interpreter = await interpreterService.getInterpreterDetails(interpreterPath);
                // Create the runtime and register it with Positron.
                if (interpreter) {
                    // Set recommendedForWorkspace to false, since we change the active runtime
                    // in the onDidChangeActiveEnvironmentPath listener.
                    const runtime = await createPythonRuntimeMetadata(interpreter, serviceContainer, false);
                    // Register the runtime with Positron.
                    manager.registerLanguageRuntime(runtime);
                } else {
                    traceError(`Could not register runtime due to an invalid interpreter path: ${interpreterPath}`);
                }
            }
        };
        // If the interpreter is changed via the Python extension, select the corresponding
        // language runtime in Positron.
        const disposables = serviceContainer.get<IDisposableRegistry>(IDisposableRegistry);
        disposables.push(
            pythonApi.environments.onDidChangeActiveEnvironmentPath(async (event) => {
                // Select the new runtime.
                await registerRuntime(event.path);
                const runtimeMetadata = manager.registeredPythonRuntimes.get(event.path);
                if (runtimeMetadata) {
                    positron.runtime.selectLanguageRuntime(runtimeMetadata.runtimeId);
                } else {
                    traceError(`Tried to switch to a language runtime that has not been registered: ${event.path}`);
                }
            }),
        );
        // If a new runtime is registered via the Python extension, create and register a corresponding language runtime.
        disposables.push(
            pythonApi.environments.onDidChangeEnvironments(async (event) => {
                if (event.type === 'add') {
                    const interpreterPath = event.env.path;
                    await registerRuntime(interpreterPath);
                }
            }),
        );
        // Register a command to check if ipykernel is installed for a given interpreter.
        disposables.push(
            vscode.commands.registerCommand('python.isIpykernelInstalled', async (pythonPath: string) => {
                const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
                const interpreter = await interpreterService.getInterpreterDetails(pythonPath);
                if (interpreter) {
                    const installer = serviceContainer.get<IInstaller>(IInstaller);
                    const hasCompatibleKernel = await installer.isProductVersionCompatible(
                        Product.ipykernel,
                        IPYKERNEL_VERSION,
                        interpreter,
                    );
                    return hasCompatibleKernel === ProductInstallStatus.Installed;
                }
                traceError(
                    `Could not check if ipykernel is installed due to an invalid interpreter path: ${pythonPath}`,
                );
                return false;
            }),
        );
        // Register a command to install ipykernel for a given interpreter.
        disposables.push(
            vscode.commands.registerCommand('python.installIpykernel', async (pythonPath: string) => {
                const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
                const interpreter = await interpreterService.getInterpreterDetails(pythonPath);
                if (interpreter) {
                    const installer = serviceContainer.get<IInstaller>(IInstaller);
                    // Using a process to install modules avoids using the terminal service,
                    // which has issues waiting for the outcome of the install.
                    const installOptions: InstallOptions = { installAsProcess: true };
                    const installResult = await installer.install(
                        Product.ipykernel,
                        interpreter,
                        undefined,
                        undefined,
                        installOptions,
                    );
                    if (installResult !== InstallerResponse.Installed) {
                        traceError(
                            `Could not install ipykernel for interpreter: ${pythonPath}. Install result - ${installResult}`,
                        );
                    }
                } else {
                    traceError(`Could not install ipykernel due to an invalid interpreter path: ${pythonPath}`);
                }
            }),
        );
        // Register a command to get the minimum version of python supported by the extension.
        disposables.push(
            vscode.commands.registerCommand(
                'python.getMinimumPythonVersion',
                (): string => MINIMUM_PYTHON_VERSION.raw,
            ),
        );
        traceInfo('activatePositron: done!');
    } catch (ex) {
        traceError('activatePositron() failed.', ex);
    }
}
