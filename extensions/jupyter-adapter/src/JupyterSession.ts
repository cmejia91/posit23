/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { JupyterConnectionSpec } from './JupyterConnectionSpec';
import { findAvailablePort } from './PortFinder';

/**
 * JupyterSessionState is the state of a running Jupyter session that is
 * persisted to disk.
 */
export interface JupyterSessionState {
	/** The Jupyter session identifier; sent as part of every message */
	sessionId: string;

	/** The log file the kernel is writing to */
	logFile: string;

	/** The profile file the kernel is writing to */
	profileFile?: string;

	/** The connection file specifying the ZeroMQ ports, signing keys, etc. */
	connectionFile: string;

	/** The ID of the kernel's process, or 0 if the process is not running */
	processId: number;
}

export class JupyterSession implements vscode.Disposable {
	public readonly spec: JupyterConnectionSpec;
	public readonly state: JupyterSessionState;

	constructor(state: JupyterSessionState) {
		// Read the connection file and parse it into a connection spec
		const conn = fs.readFileSync(state.connectionFile, 'utf8');
		this.spec = JSON.parse(conn);
		this.state = state;
	}

	dispose() {
		// Remove the connection file
		if (fs.existsSync(this.state.connectionFile)) {
			fs.unlinkSync(this.state.connectionFile);
		}
		// Note that we don't remove the log file, so we can still see what
		// happened if the kernel crashed or failed to start.
	}

	get key(): string {
		return this.spec.key;
	}

	get sessionId(): string {
		return this.state.sessionId;
	}

	get logFile(): string {
		return this.state.logFile;
	}

	get portsInUse(): Array<number> {
		return [
			this.spec.control_port,
			this.spec.shell_port,
			this.spec.stdin_port,
			this.spec.iopub_port,
			this.spec.hb_port
		];
	}
}

export async function createJupyterSession(): Promise<JupyterSession> {
	// Array of bound ports
	const ports: Array<number> = [];
	const maxTries = 25;

	// Create connection definition, allocating new ports as needed
	const conn: JupyterConnectionSpec = {
		control_port: await findAvailablePort(ports, maxTries),
		shell_port: await findAvailablePort(ports, maxTries),
		stdin_port: await findAvailablePort(ports, maxTries),
		iopub_port: await findAvailablePort(ports, maxTries),
		hb_port: await findAvailablePort(ports, maxTries),
		signature_scheme: 'hmac-sha256',
		ip: '127.0.0.1',
		transport: 'tcp',
		key: crypto.randomBytes(16).toString('hex')
	};

	// Write the connection definition to a file
	const tempdir = os.tmpdir();
	const sep = path.sep;
	const kerneldir = fs.mkdtempSync(`${tempdir}${sep}kernel-`);
	const connectionFile = path.join(kerneldir, 'connection.json');
	const logFile = path.join(kerneldir, 'kernel.log');
	const profileFile = path.join(kerneldir, 'kernel-profile.log');

	return new Promise((resolve, reject) => {
		fs.writeFile(connectionFile, JSON.stringify(conn), (err) => {
			if (err) {
				reject(err);
			} else {
				resolve(new JupyterSession({
					connectionFile,
					logFile,
					profileFile,
					sessionId: crypto.randomBytes(16).toString('hex'),
					processId: 0
				}));
			}
		});
	});
}
