/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//  Copy keybindings.json and settings.json files
// cp ~/Library/Application\ Support/Code/User/keybindings.json ~/Library/Application\ Support/Aide/User
// cp ~/Library/Application\ Support/Code/User/settings.json ~/Library/Application\ Support/Aide/User

import { Logger } from 'winston';
import { window } from 'vscode';
import * as os from 'os';
import { runCommandAsync } from './commandRunner';


export const copySettings = async (workingDirectory: string, logger: Logger) => {
	window.showInformationMessage('Copying settings from vscode to aide');
	// We want to execute the cp command above
	// First we want to ensure that ~/.aide exists
	const homeDir = os.homedir();
	const { exitCode: exitCodeMkdir } = await runCommandAsync(workingDirectory, 'mkdir', ['-p', `${homeDir}/.aide`]);
	if (exitCodeMkdir !== 0) {
		window.showErrorMessage('Error creating ~/.aide directory');
		logger.error('Error creating ~/.aide directory');
		return;
	}
	const { exitCode } = await runCommandAsync(workingDirectory, 'cp', ['-R', `${homeDir}/.vscode/extensions`, `${homeDir}/.aide/`]);
	if (exitCode !== 0) {
		window.showErrorMessage('Error copying extensions from vscode to aide');
		logger.error('Error copying extensions from vscode to aide');
		return;
	}

	// Now we can copy over keybindings.json and settings.json
	// We want to ensure that ~/Library/Application\\ Support/Aide/User exists
	const { exitCode: exitCodeMkdirAideUser } = await runCommandAsync(workingDirectory, 'mkdir', ['-p', `${homeDir}/Library/Application Support/Aide/User`]);
	if (exitCodeMkdirAideUser !== 0) {
		window.showErrorMessage('Error creating ~/Library/Application Support/Aide/User directory');
		logger.error('Error creating ~/Library/Application Support/Aide/User directory');
		return;
	}
	const outputKeybindings = await runCommandAsync(workingDirectory, 'cp', [`${homeDir}/Library/Application Support/Code/User/keybindings.json`, `${homeDir}/Library/Application Support/Aide/User`]);
	if (outputKeybindings.exitCode !== 0) {
		window.showErrorMessage('Error copying keybindings from vscode to aide');
		logger.error('Error copying keybindings from vscode to aide');
		return;
	}
	const outputSettings = await runCommandAsync(workingDirectory, 'cp', [`${homeDir}/Library/Application Support/Code/User/settings.json`, `${homeDir}/Library/Application Support/Aide/User`]);
	if (outputSettings.exitCode !== 0) {
		window.showErrorMessage('Error copying settings from vscode to aide');
		logger.error('Error copying settings from vscode to aide');
		return;
	}
	window.showInformationMessage('Copied settings from vscode to aide');
	logger.info('Reload your window with Cmd + Shift + P -> Developer: Reload Window');
};
