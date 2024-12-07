/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

export async function killProcessOnPort(port: number, method: string = 'tcp') {
	if (process.platform === 'win32') {
		const netstatResult = await exec('netstat -nao');
		const { stdout } = netstatResult;
		if (!stdout) { return netstatResult; }

		const outputLines = stdout.split('\n');
		// The second white-space delimited column of netstat output is the local port,
		// which is the only port we care about.
		// The regex here will match only the local port column of the output
		const localPortPattern = new RegExp(`^ *${method.toUpperCase()} *[^ ]*:${port}`, 'gm');
		const matchingPortLines = outputLines.filter(line => line.match(localPortPattern));

		const processIds = matchingPortLines.reduce<string[]>((accumulator, currentLine) => {
			const pidMatch = currentLine.match(/(\d*)\w*(\n|$)/gm);
			return pidMatch && pidMatch[0] && !accumulator.includes(pidMatch[0])
				? accumulator.concat(pidMatch[0])
				: accumulator;
		}, []);

		return exec(`TaskKill /F /PID ${processIds.join(' /PID ')}`);
	}

	const lsofResult = await exec('lsof -i -P');
	const { stdout: lsofOutput } = lsofResult;
	if (!lsofOutput) { return lsofResult; }

	const lsofLines = lsofOutput.split('\n');
	const processExists = lsofLines.filter((line) => line.match(new RegExp(`:*${port}`))).length > 0;

	if (!processExists) {
		return Promise.reject(new Error('No process running on port'));
	}

	return exec(
		`lsof -i ${method === 'udp' ? 'udp' : 'tcp'}:${port} | grep ${method === 'udp' ? 'UDP' : 'LISTEN'} | awk '{print $2}' | xargs kill -9`
	);
}
