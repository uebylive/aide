/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Here I want to get the remote url of the current repo
// and also the hash we are on
import { spawn } from 'child_process';
import { realpathSync } from 'fs';
import { resolve } from 'path';
// import logger from '../logger';
import { execCommand, runCommandAsync } from '../utilities/commandRunner';
import logger from '../logger';
import { runCommand } from '../utilities/setupAntonBackend';

export const getGitRepoName = async (workingDirectory: string): Promise<string> => {
	// Log the pwd here
	try {
		const currentWorkingDirectory = realpathSync(resolve('.'));
		// logger.info('codestory');
		// logger.info(currentWorkingDirectory);
		const { stdout } = await runCommandAsync(workingDirectory, 'git', [
			'rev-parse',
			'--show-toplevel',
		]);
		const tolLevelName = stdout.trim().split('/').pop() || '';
		const data = await runCommandAsync(workingDirectory, 'basename', [tolLevelName]);
		return data.stdout.trim();
	} catch (error) {
		return 'codestory-error-no-git';
	}
};

export const getGitRemoteUrl = async (workingDirectory: string): Promise<string> => {
	try {
		const { stdout } = await runCommandAsync(workingDirectory, 'git', [
			'remote',
			'get-url',
			'origin',
		]);
		return stdout.trim();
	} catch (error) {
		return 'codestory-error-no-git';
	}
};

export const getGitCurrentHash = async (workingDirectory: string): Promise<string> => {
	try {
		const { stdout } = await runCommandAsync(workingDirectory, 'git', ['rev-parse', 'HEAD']);
		logger.info('Whats the stdout');
		logger.info(stdout);
		return stdout.trim();
	} catch (error) {
		return 'codestory-error-no-git';
	}
};

export const getFilesTrackedInWorkingDirectory = async (workingDirectory: string): Promise<string[]> => {
	try {
		const { stdout } = await runCommandAsync(workingDirectory, 'git', ['ls-files']);
		logger.info('Whats the stdout');
		logger.info(stdout);
		const fileList = stdout.trim().split('\n').filter((x) => x.length > 0);
		// now we join the working directory with the file name
		const filesWithWorkingDirectory = fileList.map((file) => {
			return `${workingDirectory}/${file}`;
		});
		return filesWithWorkingDirectory;
	} catch (error) {
		return [];
	}
};


// Returns the files which were touched in the last 2 weeks
export const getFilesInLastCommit = async (workingDirectory: string): Promise<string[]> => {
	// command we have to run is the following:
	const stdout = await execCommand(
		'git log --pretty="%H" --since="2 weeks ago" | while read commit_hash; do git diff-tree --no-commit-id --name-only -r $commit_hash; done | sort | uniq -c | sort -rn',
		workingDirectory,
	);
	console.log(stdout);
	// Now we want to parse this output out, its always in the form of
	// {num_times} {file_path} and the file path here is relative to the working
	// directory
	const splitLines = stdout.split('\n');
	for (let index = 0; index < splitLines.length; index++) {
		const lineInfo = splitLines[index].trim();
		if (lineInfo.length === 0) {
			continue;
		}
		// split it on the space in between
		const splitLineInfo = lineInfo.split(' ');
		const numTimes = splitLineInfo[0];
		const filePath = splitLineInfo.slice(1).join(' ');
		console.log(`${filePath} occurs ${numTimes} times`);
	}
	return [];
};

// Example usage:
// (async () => {
//     const remoteUrl = await getGitRemoteUrl();
//     console.log(remoteUrl);
//     const repoHash = await getGitCurrentHash();
//     console.log(repoHash);
//     const repoName = await getGitRepoName();
//     console.log(repoName);
// })();
