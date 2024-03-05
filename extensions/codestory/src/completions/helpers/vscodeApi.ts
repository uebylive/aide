/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Contains the vscode apis and the related functions around it neatly wrapped
// up for using while working with the inline autocomplete
import * as vscode from 'vscode';
import * as path from 'path';

function windowsToPosix(windowsPath: string): string {
	let posixPath = windowsPath.split('\\').join('/');
	if (posixPath[1] === ':') {
		posixPath = posixPath.slice(2);
	}
	// posixPath = posixPath.replace(" ", "\\ ");
	return posixPath;
}

function isWindowsLocalButNotRemote(): boolean {
	return (
		vscode.env.remoteName !== undefined &&
		['wsl', 'ssh-remote', 'dev-container', 'attached-container'].includes(
			vscode.env.remoteName
		) &&
		process.platform === 'win32'
	);
}

export function getPathSep(): string {
	return isWindowsLocalButNotRemote() ? '/' : path.sep;
}

export function uriFromFilePath(filepath: string): vscode.Uri {
	if (vscode.env.remoteName) {
		if (isWindowsLocalButNotRemote()) {
			filepath = windowsToPosix(filepath);
		}
		return vscode.Uri.parse(
			`vscode-remote://${vscode.env.remoteName}${filepath}`
		);
	} else {
		return vscode.Uri.file(filepath);
	}
}

export async function gotoDefinition(
	filepath: vscode.Uri,
	position: vscode.Position
): Promise<vscode.Location[]> {
	console.log('invoking goToDefinition');
	console.log(position);
	try {
		const locations: vscode.Location[] = await vscode.commands.executeCommand(
			'vscode.executeImplementationProvider',
			filepath,
			position
		);
		return locations;
	} catch (exception) {
		console.log(exception);
	}
	return [];
}

