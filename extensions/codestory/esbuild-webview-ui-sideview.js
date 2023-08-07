/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
const path = require('path');

const srcDir = path.join(__dirname, 'webview-ui-sideview');
const outDir = path.join(__dirname, 'webview-ui-sideview/build/assets');

require('../esbuild-webview-common').run({
	entryPoints: [
		path.join(srcDir, 'src/index.tsx'),
	],
	srcDir,
	outdir: outDir,
}, process.argv);
