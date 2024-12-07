/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';

export function unzip(source: string, destinationDir: string) {
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
			cp.spawnSync('unzip', ['-o', source, '-d', `${destinationDir}`]);
		}
	} else {
		// tar does not create extractDir by default
		if (!fs.existsSync(destinationDir)) {
			fs.mkdirSync(destinationDir);
		}
		cp.spawnSync('tar', ['-xzf', source, '-C', destinationDir, '--strip-components', '1']);
	}
}
