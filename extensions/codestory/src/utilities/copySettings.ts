/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//  Copy keybindings.json and settings.json files
// cp ~/Library/Application\ Support/Code/User/keybindings.json ~/Library/Application\ Support/Aide/User
// cp ~/Library/Application\ Support/Code/User/settings.json ~/Library/Application\ Support/Aide/User

import { Logger } from 'winston';
import { window } from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as process from 'process';
import * as path from 'path';
import { runCommandAsync } from './commandRunner';

function copyFiles(srcDirectory: string, destDirectory: string) {
	fs.readdirSync(srcDirectory).forEach(file => {
		const srcFile = path.join(srcDirectory, file);
		const destFile = path.join(destDirectory, file);

		const stat = fs.statSync(srcFile);
		if (stat.isDirectory()) {
			fs.mkdirSync(destFile, { recursive: true });
			copyFiles(srcFile, destFile);
		} else {
			fs.copyFileSync(srcFile, destFile);
		}
	});
}


export const copySettings = async (workingDirectory: string, logger: Logger) => {
	window.showInformationMessage('Copying settings from vscode to aide');
	// We want to execute the cp command above
	// First we want to ensure that ~/.aide exists

	// if the platform is windows we have to gate is specially
	if (os.platform() === 'win32') {
		// Now we write custom code to make this work
		const appDataPath = process.env.APPDATA;
		const userProfilePath = process.env.USERPROFILE;
		try {
			if (appDataPath !== undefined) {
				// copy the settings.json
				const settingsPath = path.join(appDataPath, 'Code', 'User', 'settings.json');
				const destinationPath = path.join(appDataPath, 'Aide', 'User', 'settings.json');
				if (fs.existsSync(settingsPath)) {
					fs.copyFileSync(settingsPath, destinationPath);
				}
			}
		} catch (exception) {
			console.log('error when copying user settings.json', exception);
		}
		try {
			if (appDataPath !== undefined) {
				// copy the keybindings.json
				const keybindingsPath = path.join(appDataPath, 'Code', 'User', 'keybindings.json');
				const destinationKeybindingsPath = path.join(appDataPath, 'Aide', 'User', 'keybindings.json');
				if (fs.existsSync(keybindingsPath)) {
					fs.copyFileSync(keybindingsPath, destinationKeybindingsPath);
				}
			}
		} catch (exception) {
			console.log('error when copying keybindings.json', exception);
		}

		// Now we copy the extensions
		try {
			if (userProfilePath) {
				const keybindingsFolder = path.join(userProfilePath, '.vscode', 'extensions');
				const destinationFolder = path.join(userProfilePath, '.vscode-oss', 'extensions');
				copyFiles(keybindingsFolder, destinationFolder);
			}
		} catch (exception) {
			console.log('error when copying extensions', exception);
		}
		return;
	}


	const homeDir = os.homedir();
	const { exitCode: exitCodeMkdir } = await runCommandAsync(workingDirectory, 'mkdir', ['-p', `${homeDir}/.vscode-oss`]);
	if (exitCodeMkdir !== 0) {
		window.showErrorMessage('Error creating ~/.aide directory');
		logger.error('Error creating ~/.aide directory');
		return;
	}
	const { exitCode } = await runCommandAsync(workingDirectory, 'cp', ['-R', `${homeDir}/.vscode/extensions`, `${homeDir}/.vscode-oss/`]);
	if (exitCode !== 0) {
		window.showErrorMessage('Error copying extensions from vscode to aide');
		logger.error('Error copying extensions from vscode to aide');
		return;
	}

	// Now we can copy over keybindings.json and settings.json
	// We want to ensure that ~/Library/Application\\ Support/Aide/User exists
	// of if its on linux it might be on path: ~/.config/aide
	if (os.platform() === 'linux') {
		const { exitCode: exitCodeMkdirAideUser } = await runCommandAsync(workingDirectory, 'mkdir', ['-p', `${homeDir}/.config/Code/User/`]);
		if (exitCodeMkdirAideUser !== 0) {
			window.showErrorMessage(`Error creating ${homeDir}/.config/Code/User/ directory`);
			logger.error(`Error creating ${homeDir}/.config/Code/User/ directory`);
			return;
		}
		const outputKeybindings = await runCommandAsync(workingDirectory, 'cp', [`${homeDir}/.config/Code/User/keybindings.json`, `${homeDir}/.config/Aide/User`]);
		if (outputKeybindings.exitCode !== 0) {
			window.showErrorMessage('Error copying keybindings from vscode to aide');
			logger.error('Error copying keybindings from vscode to aide');
			return;
		}
		const outputSettings = await runCommandAsync(workingDirectory, 'cp', [`${homeDir}/.config/Code/User/settings.json`, `${homeDir}/.config/Aide/User`]);
		if (outputSettings.exitCode !== 0) {
			window.showErrorMessage('Error copying settings from vscode to aide');
			logger.error('Error copying settings from vscode to aide');
			return;
		}
		window.showInformationMessage('Copied settings from vscode to aide');
		logger.info('Reload your window with Cmd + Shift + P -> Developer: Reload Window');
	} else if (os.platform() === 'darwin') {
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
	}
};
