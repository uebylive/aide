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

export function forkSignal(signal: AbortSignal): AbortController {
	const controller = new AbortController();
	if (signal.aborted) {
		controller.abort();
	}
	signal.addEventListener('abort', () => controller.abort());
	return controller;
}

export type TypeDefinitionProvider = {
	uri: vscode.Uri;
	range: vscode.Range;
};

export async function typeDefinitionProvider(
	filepath: vscode.Uri,
	position: vscode.Position,
	// TODO(skcd): Fix the maxeventlistener bug here which we are exceeding
	// the limit of 10
	abortController: AbortController,
): Promise<TypeDefinitionProvider[]> {
	console.log('invoking goToDefinition');
	console.log(position);
	const { signal } = abortController;
	const forkedSignal = forkSignal(signal);
	try {
		const locations: vscode.LocationLink[] | undefined = await Promise.race<vscode.LocationLink[] | undefined>([
			vscode.commands.executeCommand(
				'vscode.executeTypeDefinitionProvider',
				filepath,
				position
			),
			new Promise((resolve, reject) => {
				forkedSignal.signal.addEventListener('abort', () => {
					reject(new Error('Aborted'));
				});
				const locationLinks: vscode.LocationLink[] = [];
				resolve(locationLinks);
				return [];
			}),
		]);

		if (signal.aborted) {
			return [];
		}

		if (locations === undefined) {
			return [];
		}

		return Promise.all(locations.map(async (location) => {
			const uri = location.targetUri;
			const range = location.targetRange;
			// we have to always open the text document first, this ends up sending
			// it over to the sidecar as a side-effect but that is fine
			await vscode.workspace.openTextDocument(uri);

			// return the value as we would normally
			return {
				uri,
				range,
			};
		}));
	} catch (exception) {
		console.log(exception);
	}
	return [];
}

