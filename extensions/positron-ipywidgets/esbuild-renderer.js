/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
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
	additionalOptions: {
		// TODO: Do we still need this if we can use vscode-jupyter-ipywidgets?
		//       It ends up being a 5.1 MB file so ideally we can avoid it.
		loader: {
			'.svg': 'dataurl',
			'.ttf': 'dataurl',
			'.woff': 'dataurl',
			'.woff2': 'dataurl',
			'.eot': 'dataurl',
		},
	}
}, process.argv);
