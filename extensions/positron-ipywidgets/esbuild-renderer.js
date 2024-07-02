/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
const path = require('path');

const srcDir = path.join(__dirname, 'renderer');
const outDir = path.join(__dirname, 'renderer-out');

require('../esbuild-webview-common').run({
	entryPoints: [
		path.join(srcDir, 'index.ts'),
	],
	srcDir,
	outdir: outDir,
}, process.argv);
