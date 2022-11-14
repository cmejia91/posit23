/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const path = require('path');
const withDefaults = require('../shared.webpack.config');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = withDefaults({
	context: __dirname,
	entry: {
		extension: './src/extension.ts',
	},
	plugins: [
		...withDefaults.nodePlugins(__dirname),
		new CopyWebpackPlugin({
			patterns: [
				{
					from: './amalthea/target/debug/ark',
					to: './bin/ark'
				},
			],
		}),
	],
});
