/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable class-methods-use-this */
/* eslint-disable global-require */
/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Socket } from 'net';
import * as path from 'path';
import * as fs from 'fs';
// eslint-disable-next-line import/no-unresolved
import * as positron from 'positron';
import * as vscode from 'vscode';
import { Disposable, DocumentFilter, LanguageClient, LanguageClientOptions, ServerOptions, StreamInfo } from 'vscode-languageclient/node';

import { compare } from 'semver';
import { EXTENSION_ROOT_DIR, PYTHON_LANGUAGE } from '../../common/constants';
import { IConfigurationService, IInstaller, InstallerResponse, Product, Resource } from '../../common/types';
import { InstallOptions } from '../../common/installer/types';
import { IInterpreterService } from '../../interpreter/contracts';
import { IServiceContainer } from '../../ioc/types';
import { traceError, traceVerbose } from '../../logging';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { PythonVersion } from '../../pythonEnvironments/info/pythonVersion';
import { ProgressReporting } from '../progress';
import { ILanguageServerProxy } from '../types';

// Load the Python icon.
const base64EncodedIconSvg = fs.readFileSync(path.join(EXTENSION_ROOT_DIR, 'resources', 'branding', 'python-icon.svg')).toString('base64');

/**
 * Positron's variant of JediLanguageServerProxy. On start up it registers Python runtimes
 * with our Jupyter Adapter, combining both a Jedi based LSP and IPyKernel for enhanced
 * code completions. Language Client start is controlled by our Jupyter Adapter.
 *
 * Note that LSP connections are made over TCP.
 */
export class PositronJediLanguageServerProxy implements ILanguageServerProxy {

    private readonly disposables: Disposable[] = [];

    private readonly languageClients: LanguageClient[] = [];

    private extensionVersion: string | undefined;

    private readonly installer: IInstaller;

    // Using a process to install modules avoids using the terminal service,
    // which has issues waiting for the outcome of the install.
    private readonly installOptions: InstallOptions = { installAsProcess: true };

    constructor(
        private readonly serviceContainer: IServiceContainer,
        private readonly interpreterService: IInterpreterService,
        private configService: IConfigurationService
    ) {
        // Get the version of this extension from package.json so that we can
        // describe the implementation version to the kernel adapter
        try {
            const packageJson = require('../../../../package.json');
            this.extensionVersion = packageJson.version;
        } catch (e) {
            traceVerbose("Unable to read package.json to determine our extension version", e);
        }

        this.installer = this.serviceContainer.get<IInstaller>(IInstaller);
    }

    // ILanguageServerProxy API

    public async start(
        resource: Resource,
        interpreter: PythonEnvironment | undefined,
        options: LanguageClientOptions,
    ): Promise<void> {

        // Determine if our Jupyter Adapter extension is installed
        const ext = vscode.extensions.getExtension('vscode.jupyter-adapter');
        if (!ext) {
            const msg = `Could not find Jupyter Adapter extension; can't register Python kernels.`;
            vscode.window.showErrorMessage(msg);
            return;
        }

        // Extend LSP support to include unsaved editors
        options.documentSelector = this.initDocumentSelector(options.documentSelector as DocumentFilter[]);

        // Offer to install the ipykernel module for the preferred interpreter, if it is missing
        const hasKernel = await this.installer.isInstalled(Product.ipykernel, interpreter);
        if (!hasKernel) {
            const response = await this.installer.promptToInstall(Product.ipykernel,
                interpreter, undefined, undefined, this.installOptions);
            if (response === InstallerResponse.Installed) {
                traceVerbose(`Successfully installed ipykernel for ${interpreter?.displayName}`);
            }
        }

        // Register available python interpreters as language runtimes with our Jupyter Adapter
        this.withActiveExtention(ext, async () => {
            await this.registerLanguageRuntimes(ext, resource, interpreter, options);
        });
    }

    public loadExtension(): void {
        // Not used.
    }

    public async stop(): Promise<void> {

        // Dispose of any runtimes and related resources
        while (this.disposables.length > 0) {
            const r = this.disposables.shift()!;
            r.dispose();
        }

        // Dispose of any language clients
        for (const client of this.languageClients) {
            try {
                await client.stop();
                await client.dispose();
            } catch (ex) {
                traceError('Stopping language client failed', ex);
            }
        }
    }

    public dispose(): void {
        this.stop().ignoreErrors();
    }

    /**
     * Generalize LSP support to any scheme that is for the language 'python'.
     */
    private initDocumentSelector(selector: DocumentFilter[]): DocumentFilter[] {
        return selector.concat([{ language: PYTHON_LANGUAGE }]);
    }

    /**
     * Register available python environments as a language runtime with the Jupyter Adapter.
     */
    private async registerLanguageRuntimes(
        ext: vscode.Extension<any>,
        resource: Resource,
        preferredInterpreter: PythonEnvironment | undefined,
        options: LanguageClientOptions
    ): Promise<void> {

        // Sort the available interpreters, favoring the active interpreter (if one is available)
        let interpreters: PythonEnvironment[] = this.interpreterService.getInterpreters();
        interpreters = this.sortInterpreters(interpreters, preferredInterpreter);

        // Check if debug should be enabled for the language server
        const settings = this.configService.getSettings(resource);
        const debug = settings.languageServerDebug;

        // Register each interpreter as a language runtime
        const portfinder = require('portfinder');
        let debugPort;
        for (const interpreter of interpreters) {

            // If required, also locate an available port for the debugger
            if (debug) {
                if (debugPort === undefined) {
                    debugPort = 5678; // Default port for debugpy
                }
                debugPort = await portfinder.getPortPromise({ port: debugPort });
            }

            const runtime: vscode.Disposable = await this.registerLanguageRuntime(ext, interpreter, debugPort, options);
            this.disposables.push(runtime);

            if (debugPort !== undefined) {
                debugPort += 1;
            }
        }
    }

    /**
     * Register our Jedi LSP as a language runtime with our Jupyter Adapter extension.
     * The LSP will find an available port to start via TCP, and the Jupyter Adapter will configure
     * IPyKernel with a connection file.
     */
    private async registerLanguageRuntime(
        ext: vscode.Extension<any>,
        interpreter: PythonEnvironment,
        debugPort: number | undefined,
        options: LanguageClientOptions): Promise<Disposable> {

        // Determine if the ipykernel module is installed
        const hasKernel = await this.installer.isInstalled(Product.ipykernel, interpreter);
        const startupBehavior = hasKernel ? positron.LanguageRuntimeStartupBehavior.Implicit : positron.LanguageRuntimeStartupBehavior.Explicit;

        // Customize Jedi LSP entrypoint that adds a resident IPyKernel
        const displayName = interpreter.displayName + (hasKernel ? ' (ipykernel)' : '');
        const command = interpreter.path;
        const pythonVersion = interpreter.version?.raw;
        const lsScriptPath = path.join(EXTENSION_ROOT_DIR, 'pythonFiles', 'positron_language_server.py');
        const args = [command, lsScriptPath, '-f', '{connection_file}', '--logfile', '{log_file}']
        if (debugPort) {
            args.push(`--debugport=${debugPort}`);
        }
        const kernelSpec = {
            path: interpreter.path,
            argv: args,
            display_name: `${displayName}`,
            language: 'Python', // Used as metadata.languageName
            metadata: { debugger: false }
        };
        traceVerbose(`Configuring Jedi LSP with IPyKernel using args '${args}'`);

        // Create an adapter for the kernel as our language runtime
        const runtime: positron.LanguageRuntime = ext.exports.adaptKernel(kernelSpec,
            PYTHON_LANGUAGE,
            pythonVersion,
            this.extensionVersion,
            base64EncodedIconSvg,
            '>>>',
            '...',
            startupBehavior,
            (port: number) => this.startClient(options, port));

        // Register our language runtime provider
        return positron.runtime.registerLanguageRuntime(runtime);
    }

    // Returns a sorted copy of the array of Python environments, in descending order
    private sortInterpreters(interpreters: PythonEnvironment[], preferredInterpreter: PythonEnvironment | undefined): PythonEnvironment[] {
        const copy: PythonEnvironment[] = [...interpreters];
        copy.sort((a: PythonEnvironment, b: PythonEnvironment) => {

            // Favor preferred interpreter, if specified, in descending order
            if (preferredInterpreter) {
                if (preferredInterpreter.id === a.id) return -1;
                if (preferredInterpreter.id === b.id) return 1;
            }

            // Compare versions in descending order
            const av: string = this.getVersionString(a.version);
            const bv: string = this.getVersionString(b.version);
            return -compare(av, bv);
        });
        return copy;
    }

    /**
     * Formats python version info as a semver string, adapted from
     * common/utils/version to work with PythonVersion instances.
     */
    private getVersionString(info: PythonVersion | undefined): string {
        if (!info) { return '0' };
        if (info.major < 0) {
            return '';
        }
        if (info.minor < 0) {
            return `${info.major}`;
        }
        if (info.patch < 0) {
            return `${info.major}.${info.minor}`;
        }
        return `${info.major}.${info.minor}.${info.patch}`;
    }

    /**
     * Start the language client
     */
    private async startClient(clientOptions: LanguageClientOptions, port: number): Promise<void> {

        // Configure language client to connect to LSP via TCP on start
        const serverOptions: ServerOptions = async () => this.getServerOptions(port);
        const client = new LanguageClient(PYTHON_LANGUAGE, 'Positron Python Jedi', serverOptions, clientOptions);
        this.registerHandlers(client);
        await client.start();
        this.languageClients.push(client);
    }

    /**
     * An async function used by the LanguageClient to establish a connection to the LSP on start.
     * Several attempts to connect are made given recently spawned servers may not be ready immediately
     * for client connections.
     * @param port the LSP port
     */
    private async getServerOptions(port: number): Promise<StreamInfo> {

        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        const maxAttempts = 20;
        const baseDelay = 50;
        const multiplier = 1.5;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            // Retry up to five times then start to back-off
            const interval = attempt < 6 ? baseDelay : baseDelay * multiplier * attempt;
            if (attempt > 0) {
                await delay(interval);
            }

            try {
                // Try to connect to LSP port
                const socket: Socket = await this.tryToConnect(port);
                return { reader: socket, writer: socket };
            } catch (error: any) {
                if (error?.code === 'ECONNREFUSED') {
                    traceVerbose(`Error '${error.message}' on connection attempt '${attempt}' to Jedi LSP on port '${port}', will retry`);
                } else {
                    throw error;
                }
            }
        }

        throw new Error(`Failed to create TCP connection to Jedi LSP on port ${port} after multiple attempts`);
    }

    /**
     * Attempts to establish a TCP socket connection to the given port
     * @param port the server port to connect to
     */
    private async tryToConnect(port: number): Promise<Socket> {
        return new Promise((resolve, reject) => {
            const socket = new Socket();
            socket.on('ready', () => {
                resolve(socket);
            });
            socket.on('error', (error) => {
                reject(error);
            });
            socket.connect(port);
        });
    }

    private registerHandlers(client: LanguageClient) {
        const progressReporting = new ProgressReporting(client);
        this.disposables.push(progressReporting);
    }

    private withActiveExtention(ext: vscode.Extension<any>, callback: () => void) {
        if (ext.isActive) {
            callback();
        } else {
            ext.activate().then(callback);
        }
    }
}
