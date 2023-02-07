/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit Software, PBC.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import { arch, platform } from 'os';
import { argv, env, exit } from 'process';

// Make sure that zmq produces arm64 builds where appropriate
if (platform() === 'darwin' && arch() === 'arm64') {
	env['CMAKE_OSX_ARCHITECTURES'] = 'arm64';
}

// Ensure that zeromq is built against the right version of node
const result = spawnSync('electron-rebuild', ['zeromq', ...argv], {
	encoding: 'utf-8',
	stdio: 'inherit'
});

if (result.error || result.status !== 0) {
	console.error(`Error rebuilding zeromq ${result.error ?? ''} [error code ${result.status}]`);
	exit(1);
}
