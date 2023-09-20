/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// First we need to make sure that the output directory exists deeply
// What we want to do here is move the following files to the location in the
// generated file at codestory/out/ folder
// To do this, we want to move src/llm/embeddings/models and
// move src/languages/tree-sitter-go.wasm and src/languages/tree-sitter-python.wasm
// move searchIndex/treeSitterWasm/* to the output directory

import * as fs from 'fs';
import * as path from 'path';

async function ensureDirectoryExists(filePath: string): Promise<void> {
	const parentDir = path.dirname(filePath);

	if (await fs.promises.stat(parentDir).catch(() => null)) {
		// The parent directory already exists, so we don't need to create it
		return;
	}

	// Recursively create the parent directory
	await ensureDirectoryExists(parentDir);

	// Create the directory
	await fs.promises.mkdir(parentDir);
}

async function copyFileOver(source: string, target: string): Promise<void> {
	await ensureDirectoryExists(target);
	await fs.promises.copyFile(source, target);
}

async function copyDirectoryOver(sourceDirectory: string, target: string): Promise<void> {
	await ensureDirectoryExists(target);
	const files = await fs.promises.readdir(sourceDirectory);
	for (const file of files) {
		const source = path.join(sourceDirectory, file);
		const targetPath = path.join(target, file);
		const stat = await fs.promises.stat(source);
		if (stat.isDirectory()) {
			await copyDirectoryOver(source, targetPath);
		} else {
			await copyFileOver(source, targetPath);
		}
	}
}


// Now we can start copying
void (async () => {
	// All of the format source, target
	const filePaths = [
		[
			path.join(__dirname, '..', 'languages', 'tree-sitter-go.wasm'),
			path.join(__dirname, '..', '..', 'out', 'languages', 'tree-sitter-go.wasm'),
		],
		[
			path.join(__dirname, '..', 'languages', 'tree-sitter-python.wasm'),
			path.join(__dirname, '..', '..', 'out', 'languages', 'tree-sitter-python.wasm'),
		],
	];
	const directoryPaths = [
		[
			path.join(__dirname, '..', 'searchIndex', 'treeSitterWasm'),
			path.join(__dirname, '..', '..', 'out', 'searchIndex', 'treeSitterWasm'),
		],
		[
			path.join(__dirname, '..', 'llm', 'embeddings', 'models'),
			path.join(__dirname, '..', '..', 'out', 'llm', 'embeddings', 'models'),
		],
	];

	for (let index = 0; index < filePaths.length; index++) {
		const [source, target] = filePaths[index];
		await copyFileOver(source, target);
	}

	for (let index = 0; index < directoryPaths.length; index++) {
		const [source, target] = directoryPaths[index];
		await copyDirectoryOver(source, target);
	}
})();
