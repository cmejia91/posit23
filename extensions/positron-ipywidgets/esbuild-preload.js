/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
const path = require('path');

const srcDir = path.join(__dirname, 'preload');
const outDir = path.join(__dirname, 'preload-out');

require('../esbuild-webview-common').run({
	entryPoints: [
		path.join(srcDir, 'index.ts'),
	],
	srcDir,
	outdir: outDir,
	additionalOptions: {
		define: {
			// RequireJS is included by a previous notebook preload script. Some of our dependencies
			// (e.g. backbone) try to use RequireJS's `define` if it's present, but esbuild expects
			// these modules to behave like CommonJS modules. Override the global `define` to
			// undefined to disable this behavior.
			'define': 'undefined',
		},
	},
}, process.argv);
