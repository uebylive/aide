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


export function createTrigrams(text: string): string[] {
	let chars = Array.from(text);
	const result: string[] = [];
	while (chars.length > 0) {
		switch (chars.length) {
			case 1:
			case 2:
			case 3:
				result.push(chars.join(''));
				chars = [];
				break;
			default:
				result.push(chars.slice(0, 3).join(''));
				chars.shift();
				break;
		}
	}
	return result;
}


// generates permutations for the cases of the string which are present
// this helps with matching
export function casePermutations(s: string): string[] {
	const chars = Array.from(s).map(c => c.toLowerCase());

	if (chars.length > 31) {
		throw new Error('Input too long');
	}

	const numChars = chars.length;
	let mask = 0;
	const endMask = 1 << numChars;

	const nonAsciiMask = chars
		.map((c, i) => c === c.toUpperCase() ? 1 << i : 0)
		.reduce((a, e) => a | e, 0);

	const result: string[] = [];

	while (mask < endMask) {
		if ((mask & nonAsciiMask) === 0) {
			const permutation = chars
				.map((c, i) => (mask & (1 << i)) ? c.toUpperCase() : c)
				.join('');

			result.push(permutation);
		}

		mask++;
	}

	return result;
}
