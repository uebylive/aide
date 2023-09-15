/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

export async function ensureDirectoryExists(filePath: string): Promise<void> {
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
