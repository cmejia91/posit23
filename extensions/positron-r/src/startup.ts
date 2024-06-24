/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { delay } from './util';

/**
 * Helps a debugger attach to the Ark kernel at startup by adding a notifier
 * file.
 */
export class ArkAttachOnStartup {
	_delayDir?: string;
	_delayFile?: string;

	// Add `--startup-notifier-file` argument to pass a notification file
	// that triggers the actual startup of the kernel
	init(args: Array<String>) {
		this._delayDir = fs.mkdtempSync(`${os.tmpdir()}-JupyterDelayStartup`);
		this._delayFile = path.join(this._delayDir, 'file');

		fs.writeFileSync(this._delayFile!, 'create\n');

		// Push before the `--`, if there is one, because that is a catch all that forwards
		// everything after it straight to R
		let loc = args.findIndex((elt) => elt === '--');

		if (loc === -1) {
			loc = args.length;
		}

		args.splice(loc, 0, '--startup-notifier-file', this._delayFile);
	}

	// This is paired with `init()` and disposes of created resources
	async attach() {
		// Run <f5>
		await vscode.commands.executeCommand('workbench.action.debug.start');

		// Notify the kernel it can now start up
		fs.writeFileSync(this._delayFile!, 'go\n');

		// Give some time before removing the file, no need to await
		delay(100).then(() => {
			fs.rmSync(this._delayDir!, { recursive: true, force: true });
		});
	}
}

/**
 * Helps a debugger attach to the Ark kernel at startup delaying the startup by
 * a given number of seconds.
 */
export class ArkDelayStartup {
	// Add `--startup-delay` argument to pass a delay in
	// seconds before starting up the kernel
	init(args: Array<String>, delay: number) {
		// Push before the `--`, if there is one, because that is a catch all that forwards
		// everything after it straight to R
		let loc = args.findIndex((elt) => elt === '--');

		if (loc === -1) {
			loc = args.length;
		}

		args.splice(loc, 0, '--startup-delay', delay.toString());
	}
}
