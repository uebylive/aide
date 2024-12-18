/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
const path = require('path');
const fs = require('fs');

const srcDir = path.join(__dirname, 'src', 'simpleBrowser', 'preview');
const outDir = path.join(__dirname, 'out', 'simpleBrowser', 'preview');

require('../esbuild-webview-common').run({
	entryPoints: {
		'index': path.join(srcDir, 'index.ts'),
		'codicon': path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		loader: {
			'.ttf': 'dataurl',
		}
	}
}, process.argv);


// The build hash is available in the metafile
const buildHash = result.metafile.hash;

// You can write it to a file or use it directly
const hashContent = `export const ESBUILD_HASH = "${buildHash}";`;

// Write to a file or use it as needed
fs.writeFileSync(
	path.join(options.outdir, 'build-hash.js'),
	hashContent
);
