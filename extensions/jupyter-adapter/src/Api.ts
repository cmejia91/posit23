/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit Software, PBC.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as positron from 'positron';

import { JupyterKernelSpec } from './JupyterKernelSpec';
import { LanguageRuntimeAdapter } from './LanguageRuntimeAdapter';

export class Api implements vscode.Disposable {
	constructor(private readonly _context: vscode.ExtensionContext,
		private readonly _channel: vscode.OutputChannel) {
	}

	/**
	 * Create an adapter for a Jupyter-compatible kernel.
	 *
	 * @param kernel A Jupyter kernel spec containing the information needed to start the kernel.
	 * @param languageVersion The version of the language interpreter.
	 * @param kernelVersion The version of the kernel itself.
	 * @param lsp An optional function that returns a client port number for the LSP server to connect to.
	 * @returns A LanguageRuntimeAdapter that wraps the kernel.
	 */
	adaptKernel(kernel: JupyterKernelSpec,
		languageId: string,
		languageVersion: string,
		kernelVersion: string,
		lsp: () => Promise<number> | null,
		startupBehavior: positron.LanguageRuntimeStartupBehavior = positron.LanguageRuntimeStartupBehavior.Implicit): positron.LanguageRuntime {

		return new LanguageRuntimeAdapter(
			this._context, kernel, languageId, languageVersion, kernelVersion, lsp, this._channel, startupBehavior);
	}

	dispose() {
	}
}
