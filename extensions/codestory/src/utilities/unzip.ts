/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as yauzl from 'yauzl';

function isUnzipAvailable(): boolean {
	try {
		cp.execSync('unzip -v', { stdio: 'ignore' });
		return true;
	} catch (e) {
		return false;
	}
}

async function extractZipWithYauzl(zipPath: string, destinationDir: string): Promise<void> {
	return new Promise((resolve, reject) => {
		yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
			if (err) { reject(err); return; }
			if (!zipfile) { reject(new Error('Failed to open zip file')); return; }

			zipfile.on('error', reject);
			zipfile.on('end', resolve);
			zipfile.on('entry', async (entry) => {
				const entryPath = path.join(destinationDir, entry.fileName);
				const entryDir = path.dirname(entryPath);

				// Create directory if it doesn't exist
				if (!fs.existsSync(entryDir)) {
					fs.mkdirSync(entryDir, { recursive: true });
				}

				if (/\/$/.test(entry.fileName)) {
					// Directory entry
					if (!fs.existsSync(entryPath)) {
						fs.mkdirSync(entryPath, { recursive: true });
					}
					zipfile.readEntry();
				} else {
					// File entry
					zipfile.openReadStream(entry, (err, readStream) => {
						if (err) { reject(err); return; }
						if (!readStream) { reject(new Error('Failed to open read stream')); return; }

						const writeStream = fs.createWriteStream(entryPath);
						readStream.pipe(writeStream);
						writeStream.on('finish', () => {
							zipfile.readEntry();
						});
					});
				}
			});

			zipfile.readEntry();
		});
	});
}

export async function unzip(source: string, destinationDir: string): Promise<void> {
	if (source.endsWith('.zip')) {
		if (process.platform === 'win32') {
			cp.spawnSync('powershell.exe', [
				'-NoProfile',
				'-ExecutionPolicy', 'Bypass',
				'-NonInteractive',
				'-NoLogo',
				'-Command',
				`Microsoft.PowerShell.Archive\\Expand-Archive -Path "${source}" -DestinationPath "${destinationDir}"`
			]);
		} else {
			if (isUnzipAvailable()) {
				cp.spawnSync('unzip', ['-o', source, '-d', `${destinationDir}`]);
			} else {
				await extractZipWithYauzl(source, destinationDir);
			}
		}
	} else {
		// tar does not create extractDir by default
		if (!fs.existsSync(destinationDir)) {
			fs.mkdirSync(destinationDir);
		}
		cp.spawnSync('tar', ['-xzf', source, '-C', destinationDir, '--strip-components', '1']);
	}
}
