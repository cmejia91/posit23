/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as positron from 'positron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as os from 'os';

import { withActiveExtension } from './util';
import { RRuntime } from './runtime';
import { JupyterKernelSpec, JupyterKernelExtra } from './jupyter-adapter';

// A global instance of the language runtime (and LSP language server) provided
// by this language pack
let runtime: positron.LanguageRuntime;

export function adaptJupyterKernel(context: vscode.ExtensionContext, kernelPath: string) {
	// Check to see whether the Jupyter Adapter extension is installed
	// and active. If so, we can start the language server.
	const ext = vscode.extensions.getExtension('vscode.jupyter-adapter');
	if (!ext) {
		vscode.window.showErrorMessage(`Could not find Jupyter Adapter extension; can't register ARK.`);
		return;
	}

	// We have a kernel path; use the VS Code file system API to see if it exists on disk.
	const fs = require('fs');
	if (!fs.existsSync(kernelPath)) {
		vscode.window.showErrorMessage(`ARK kernel path doesn't exist: ${kernelPath}`);
		return;
	}

	withActiveExtension(ext, () => {
		registerArkKernel(ext!, context, kernelPath as string);
	});
}

function getRVersion(rHome: string): string {
	// Get the version of the R installation
	const { execSync } = require('child_process');
	let rVersion = '';
	try {
		rVersion = execSync(
			`${rHome}/bin/R --vanilla -s -e 'cat(R.Version()$major,R.Version()$minor, sep=".")'`,
			{ shell: '/bin/bash', encoding: 'utf8' })
			.trim();
	} catch (e) {
		console.error(`Error getting R version: ${e}`);
	}
	return rVersion;
}

export function registerArkKernel(ext: vscode.Extension<any>, context: vscode.ExtensionContext, kernelPath: string): void {

	class RInstallation {
		public readonly rHome: string;
		public readonly rVersion: string;

		/**
		 * Represents an installation of R on the user's system.
		 *
		 * @param rHome The path to the R installation's home folder
		 * @param resolved Whether the path has been resolved to a canonical path
		 */
		constructor(rHome: string, resolved: boolean) {
			// Form the canonical path to the R installation by asking R itself
			// for its home directory. This may differ from the path that was
			// passed since the discovered home path may contain symlinks.
			if (resolved) {
				this.rHome = rHome;
			} else {
				try {
					this.rHome = execSync(
						`${rHome}/R RHOME`, { encoding: 'utf8' })
						.trim();
				} catch (e) {
					console.error(`Error running RHOME command for ${rHome}: ${e}`);
					this.rHome = rHome;
				}
			}
			this.rVersion = getRVersion(rHome);
		}
	}

	const rInstallations: Array<RInstallation> = [];

	const { execSync } = require('child_process');

	// Discover R installations.
	// TODO: Needs to handle Linux and Windows
	// TODO: Needs to handle other installation locations (like RSwitch)

	// Check the R Versions folder on macOS. Typically, this only contains one
	// version of R, but it's possible to have multiple versions installed in
	// cases where a third-party utility such as `rig` is used to manage R
	// installations.
	const rVersionsFolder = '/Library/Frameworks/R.framework/Versions';
	if (fs.existsSync(rVersionsFolder)) {
		fs.readdirSync(rVersionsFolder).forEach((version: string) => {
			const rHome = path.join(rVersionsFolder, version, 'Resources');
			if (fs.existsSync(rHome)) {
				// Ensure the R binary actually exists at this path; it's possible that
				// the user has deleted the R installation but left the folder behind.
				const rBin = path.join(rHome, 'bin', 'R');
				if (fs.existsSync(rBin)) {
					rInstallations.push(new RInstallation(rHome, false));
				}
			}
		});
	}

	// Look for an R installation on the $PATH (e.g. installed via Homebrew)
	try {
		// Try R RHOME to get the installation path; run under bash so we get $PATH
		// set as the user would expect.
		const rHome = execSync('R RHOME', { shell: '/bin/bash', encoding: 'utf8' }).trim();
		if (fs.existsSync(rHome)) {
			// Add the R installation to the list (if it's not already there)
			if (rInstallations.filter(r => r.rHome === rHome).length === 0) {
				rInstallations.push(new RInstallation(rHome, true));
			}
		}
	} catch (err) {
		// Just swallow this; it's okay if there's no R on the $PATH
	}

	// Sort the R installations by version number, descending. This ensures that
	// we'll use the most recent version of R if R is installed in multiple
	// places.
	rInstallations.sort((a, b) => {
		return b.rVersion.localeCompare(a.rVersion);
	});

	// Loop over the R installations and create a language runtime for each one.
	//
	// NOTE(Kevin): We previously set DYLD_INSERT_LIBRARIES here, but this appeared
	// to cause issues when running 'ark' through wrapper scripts in some cases.
	// It's not entirely clear, but it looks like (at least on Kevin's machine)
	// we end up with an x86 shell, inside which we attempt to insert an arm64
	// library, and this ends up causing failure to start at all.
	//
	// See:
	//
	//     ./positron/extensions/jupyter-adapter/resources/kernel-wrapper.sh
	//
	// and its usages for more details.
	//
	// Given that DYLD_FALLBACK_LIBRARY_PATH works fine, we just set that below.
	for (const rHome of rInstallations) {

		/* eslint-disable */
		const env = <Record<string, string>>{
			'RUST_BACKTRACE': '1',
			'RUST_LOG': 'trace',
			'R_HOME': rHome.rHome,
			'R_CLI_NUM_COLORS': '256',
		};
		/* eslint-enable */

		if (process.platform === 'darwin') {

			const dyldFallbackLibraryPaths: string[] = [];
			dyldFallbackLibraryPaths.push(`${rHome.rHome}/lib`);

			const defaultDyldFallbackLibraryPath = process.env['DYLD_FALLBACK_LIBRARY_PATH'];
			if (defaultDyldFallbackLibraryPath) {
				dyldFallbackLibraryPaths.push(defaultDyldFallbackLibraryPath);
			}

			// Set the DYLD_FALLBACK_LIBRARY_PATH to include the R installation.
			// This specific environment variable can be blocked from being
			// inherited by child processes on macOS with SIP enabled, so we
			// prefix it with 'POSITRON_' here. The script that starts the
			// kernel will check for this variable and set it as
			// DYLD_FALLBACK_LIBRARY_PATH if it's present.
			env['POSITRON_DYLD_FALLBACK_LIBRARY_PATH'] = dyldFallbackLibraryPaths.join(':');

		}

		// Is the runtime path within the user's home directory?
		const isUserInstallation = rHome.rHome.startsWith(os.homedir());

		// Does the runtime path have 'homebrew' as a component? (we assume that
		// it's a Homebrew installation if it does)
		const isHomebrewInstallation = rHome.rHome.includes('/homebrew/');

		const runtimeSource = isHomebrewInstallation ? 'Homebrew' :
			isUserInstallation ?
				'User' : 'System';

		// Create a kernel spec for this R installation
		const kernelSpec: JupyterKernelSpec = {
			'argv': [
				kernelPath,
				'--connection_file', '{connection_file}',
				'--log', '{log_file}'
			],
			'display_name': `R (${runtimeSource})`, // eslint-disable-line
			'language': 'R',
			'env': env,
		};

		// Get the version of this extension from package.json so we can pass it
		// to the adapter as the implementation version.
		const packageJson = require('../package.json');
		const rVersion = rHome.rVersion ?? '0.0.1';

		// Create a stable ID for the runtime based on the interpreter path and version.
		const digest = crypto.createHash('sha256');
		digest.update(JSON.stringify(kernelSpec));
		digest.update(rVersion);
		const runtimeId = digest.digest('hex').substring(0, 32);

		const metadata: positron.LanguageRuntimeMetadata = {
			runtimeId,
			runtimeName: kernelSpec.display_name,
			runtimePath: rHome.rHome,
			runtimeVersion: packageJson.version,
			runtimeSource,
			languageId: 'r',
			languageName: kernelSpec.language,
			languageVersion: rVersion,
			inputPrompt: '>',
			continuationPrompt: '+',
			base64EncodedIconSvg:
				fs.readFileSync(
					path.join(context.extensionPath, 'resources', 'branding', 'r-icon.svg')
				).toString('base64'),
			startupBehavior: positron.LanguageRuntimeStartupBehavior.Implicit
		};

		const extra: JupyterKernelExtra = {
			attachOnStartup: new ArkAttachOnStartup()
		};

		// Create an adapter for the kernel to fulfill the LanguageRuntime interface.
		runtime = new RRuntime(context, kernelSpec, metadata, ext.exports, extra);

		// Register the language runtime with Positron.
		const disposable = positron.runtime.registerLanguageRuntime(runtime);
		context.subscriptions.push(disposable);
	}
}

class ArkAttachOnStartup {
	_delay_dir?: string;
	_delay_file?: string;

	// Add `--delay-startup` argument to pass a notification file
	// that triggers the actual startup of the kernel
	init(args: Array<String>) {
		this._delay_dir = fs.mkdtempSync(`${os.tmpdir()}-JupyterDelayStartup`);
		this._delay_file = path.join(this._delay_dir, 'file')

		args.push(`--delay-startup ${this._delay_file}`);
	}

	// This is paired with `init()` and disposes of created resources
	async attach() {
		// Run <f5>
		await vscode.commands.executeCommand('workbench.action.debug.start');

		// Notify the kernel it can now start up
		fs.writeFileSync(this._delay_file!, "go\n");

		// Remove notification file
		fs.rmSync(this._delay_dir!, { recursive: true, force: true });
	}
}
