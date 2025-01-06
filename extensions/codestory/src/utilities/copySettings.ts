/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { commands, env, ProgressLocation, Uri, window } from 'vscode';
import { Logger } from 'winston';

const cwd = process.env['VSCODE_CWD'] || process.cwd();

export type VSCodeVariant = 'aide-old' | 'vscode' | 'cursor' | 'windsurf' | 'vscodium' | 'vscode-insiders' | 'vscodium-insiders';

interface EditorPaths {
	configDir: string;
	extensionsDir: string;
	displayName: string;
}

interface ExtensionMetadata {
	namespace: string;
	name: string;
	version: string;
}

interface ExtensionInstallResult {
	success: boolean;
	message: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function retry<T>(
	operation: () => Promise<T>,
	retries: number = MAX_RETRIES,
	delay: number = RETRY_DELAY
): Promise<T> {
	let lastError: Error | undefined;
	for (let i = 0; i < retries; i++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (i < retries - 1) {
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
	}
	throw new Error(lastError?.message || 'Operation failed after multiple retries');
}

interface OpenVSXResponse {
	downloads: {
		universal?: string;
		linux?: {
			x64?: string;
			arm64?: string;
		};
		darwin?: {
			x64?: string;
			arm64?: string;
		};
		win32?: {
			x64?: string;
			arm64?: string;
			ia32?: string;
		};
	};
	files: {
		download: string;
	};
}

function getPlatformInfo() {
	const platform = os.platform();
	const arch = os.arch();
	return { platform, arch };
}

// Helper function to download files
async function downloadFileToFolder(url: string, destFolder: string, filename: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download from ${url}: ${response.statusText}`);
	}

	const destPath = path.join(destFolder, filename);
	const buffer = Buffer.from(await response.arrayBuffer());
	fs.writeFileSync(destPath, buffer);
	return destPath;
}

type EditorConfig = {
	displayName: string;
	configDirName: string;
	extensionsDirName: string;
};

// Map of editor variants to their configuration details
const EDITOR_CONFIGS: Record<VSCodeVariant, EditorConfig> = {
	vscode: {
		displayName: 'VS Code',
		configDirName: 'Code',
		extensionsDirName: '.vscode'
	},
	cursor: {
		displayName: 'Cursor',
		configDirName: 'Cursor',
		extensionsDirName: '.cursor'
	},
	'windsurf': {
		displayName: 'Windsurf',
		configDirName: 'Windsurf',
		extensionsDirName: '.windsurf'
	},
	vscodium: {
		displayName: 'VSCodium',
		configDirName: 'VSCodium',
		extensionsDirName: '.vscode-oss'
	},
	'vscode-insiders': {
		displayName: 'VS Code Insiders',
		configDirName: 'Code - Insiders',
		extensionsDirName: '.vscode-insiders'
	},
	'vscodium-insiders': {
		displayName: 'VSCodium Insiders',
		configDirName: 'VSCodium-Insiders',
		extensionsDirName: '.vscode-oss-insiders'
	},
	'aide-old': {
		displayName: 'Aide (older version)',
		configDirName: 'Aide',
		extensionsDirName: '.vscode-oss'
	}
};

function getSourceEditorPaths(variant: VSCodeVariant): EditorPaths {
	const homeDir = os.homedir();
	const config = EDITOR_CONFIGS[variant];
	const platform = os.platform();

	// Get the base paths from environment variables, similar to how VSCode does it
	let userDataDir: string;

	// 1. Support portable mode
	if (process.env.VSCODE_PORTABLE) {
		userDataDir = path.join(process.env.VSCODE_PORTABLE, 'user-data');
	}
	// 2. Support global VSCODE_APPDATA environment variable
	else if (process.env.VSCODE_APPDATA) {
		userDataDir = path.join(process.env.VSCODE_APPDATA, config.configDirName);
	}
	// 3. Otherwise check per platform
	else {
		let appDataPath: string;
		switch (platform) {
			case 'win32':
				appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE || homeDir, 'AppData', 'Roaming');
				userDataDir = appDataPath;
				break;
			case 'darwin':
				userDataDir = path.join(homeDir, 'Library', 'Application Support');
				break;
			case 'linux':
				userDataDir = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
				break;
			default:
				throw new Error('Platform not supported');
		}
	}

	// Use the environment variable for extensions if available
	const extensionsDir = process.env.VSCODE_EXTENSIONS
		? process.env.VSCODE_EXTENSIONS
		: path.join(homeDir, config.extensionsDirName, 'extensions');

	// Construct the config directory path and resolve against cwd if not absolute
	let configDir = path.join(userDataDir, config.configDirName, 'User');
	if (!path.isAbsolute(configDir)) {
		configDir = path.resolve(cwd, configDir);
	}

	return {
		configDir,
		extensionsDir,
		displayName: config.displayName
	};
}

function getDestinationEditorPaths(product: IProductConfiguration): EditorPaths {
	const homeDir = os.homedir();
	const platform = os.platform();

	// Handle development mode by appending -dev to dataFolderName
	const isDevMode = process.env.VSCODE_DEV === '1';
	const dataFolderName = isDevMode ? `${product.dataFolderName}-dev` : product.dataFolderName;

	// In development mode, both config and extensions are in the dev folder
	if (isDevMode) {
		const devDir = path.join(homeDir, dataFolderName);
		return {
			configDir: path.join(devDir, 'User'),
			extensionsDir: path.join(devDir, 'extensions'),
			displayName: product.nameLong || product.nameShort || 'Aide'
		};
	}

	let userDataDir: string;
	// 1. Support portable mode
	if (process.env.VSCODE_PORTABLE) {
		userDataDir = path.join(process.env.VSCODE_PORTABLE, 'user-data');
	}
	// 2. Support global VSCODE_APPDATA environment variable
	else if (process.env.VSCODE_APPDATA) {
		userDataDir = process.env.VSCODE_APPDATA;
	}
	// 3. Otherwise check per platform
	else {
		let appDataPath: string;
		switch (platform) {
			case 'win32':
				appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE || homeDir, 'AppData', 'Roaming');
				userDataDir = appDataPath;
				break;
			case 'darwin':
				userDataDir = path.join(homeDir, 'Library', 'Application Support');
				break;
			case 'linux':
				userDataDir = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
				break;
			default:
				throw new Error('Platform not supported');
		}
	}

	// Use the environment variable for extensions if available
	const extensionsDir = process.env.VSCODE_EXTENSIONS
		? process.env.VSCODE_EXTENSIONS
		: path.join(homeDir, dataFolderName, 'extensions');

	// Construct the config directory path and resolve against cwd if not absolute
	let configDir = path.join(userDataDir, product.applicationName || dataFolderName, 'User');
	if (!path.isAbsolute(configDir)) {
		configDir = path.resolve(cwd, configDir);
	}

	return {
		configDir,
		extensionsDir,
		displayName: product.nameLong || product.nameShort || 'Aide'
	};
}

// Helper function to ensure directory exists
function ensureDir(dir: string): void {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

// Helper function to copy file if it exists
async function copyFileIfExists(src: string, dest: string, logger: Logger): Promise<void> {
	try {
		if (fs.existsSync(src)) {
			ensureDir(path.dirname(dest));
			fs.copyFileSync(src, dest);
		}
	} catch (error) {
		logger.error(`Error copying file from ${src} to ${dest}`, error);
		throw error;
	}
}

export interface IProductConfiguration {
	dataFolderName: string;
	nameShort?: string;
	nameLong?: string;
	applicationName?: string;
}

function getProductConfiguration(): IProductConfiguration {
	const content = fs.readFileSync(path.join(env.appRoot, 'product.json')).toString();
	return JSON.parse(content) as IProductConfiguration;
}

export const copySettings = async (logger: Logger) => {
	// Show quick pick for editor selection
	const editorChoice = await window.showQuickPick(
		[
			{ label: 'VS Code', value: 'vscode' as VSCodeVariant },
			{ label: 'Cursor', value: 'cursor' as VSCodeVariant },
			{ label: 'Windsurf', value: 'windsurf' as VSCodeVariant },
			{ label: 'VSCodium', value: 'vscodium' as VSCodeVariant },
			{ label: 'VS Code Insiders', value: 'vscode-insiders' as VSCodeVariant },
			{ label: 'VSCodium Insiders', value: 'vscodium-insiders' as VSCodeVariant }
		],
		{
			placeHolder: 'Select your previous editor',
			title: 'Import Settings From'
		}
	);

	if (!editorChoice) {
		return; // User cancelled
	}

	await copySettingsWithProgress(editorChoice.value, logger);
};

export const migrateFromVSCodeOSS = async (logger: Logger): Promise<void> => {
	const product = getProductConfiguration();
	const destEditorPaths = getDestinationEditorPaths(product);

	// Check if settings.json exists in the new location
	const newSettingsPath = path.join(destEditorPaths.configDir, 'settings.json');

	let shouldMigrate = false;

	if (!fs.existsSync(newSettingsPath)) {
		shouldMigrate = true;
	} else {
		try {
			const settingsContent = fs.readFileSync(newSettingsPath, 'utf8');
			if (!settingsContent.trim()) {
				shouldMigrate = true;
			} else {
				const settingsJson = JSON.parse(settingsContent);
				// Check if the JSON object has any keys
				if (Object.keys(settingsJson).length === 0) {
					shouldMigrate = true;
				}
			}
		} catch (error) {
			// If there's an error reading or parsing the file, assume it's corrupted and migrate
			logger.warn('Error reading settings file, will attempt migration', error);
			shouldMigrate = true;
		}
	}

	if (shouldMigrate) {
		logger.info('No settings found in new location, attempting migration from .vscode-oss');

		const oldAideVariant: VSCodeVariant = 'aide-old';
		try {
			await copySettingsWithProgress(oldAideVariant, logger);
		} catch (error) {
			logger.error('Failed to migrate settings from .vscode-oss', error);
			// Don't show error to user as this is an automatic migration
		}
	}
};

export const copySettingsWithProgress = async (
	variant: VSCodeVariant,
	logger: Logger
) => {
	const product = getProductConfiguration();
	const editorConfig = EDITOR_CONFIGS[variant];

	await window.withProgress({
		location: ProgressLocation.Notification,
		title: `Importing from ${editorConfig.displayName}`,
		cancellable: true
	}, async (progress, token) => {
		try {
			const sourceEditorPaths = getSourceEditorPaths(variant);
			const destEditorPaths = getDestinationEditorPaths(product);

			progress.report({ message: 'Preparing directories...', increment: 10 });

			const destConfigDir = destEditorPaths.configDir;
			const destExtDir = destEditorPaths.extensionsDir;

			// Add logging to help debug the paths
			logger.info(`Source config directory: ${sourceEditorPaths.configDir}`);
			logger.info(`Destination config directory: ${destConfigDir}`);
			logger.info(`Data folder name from product.json: ${product.dataFolderName}`);
			logger.info(`Using destination extensions directory: ${destExtDir}`);
			logger.info(`Development mode: ${process.env.VSCODE_DEV === '1'}`);

			// Ensure destination directories exist
			ensureDir(destConfigDir);
			ensureDir(destExtDir);

			progress.report({ message: 'Copying settings and keybindings...', increment: 20 });

			// Copy settings and keybindings
			await copyFileIfExists(
				path.join(sourceEditorPaths.configDir, 'settings.json'),
				path.join(destConfigDir, 'settings.json'),
				logger
			);

			await copyFileIfExists(
				path.join(sourceEditorPaths.configDir, 'keybindings.json'),
				path.join(destConfigDir, 'keybindings.json'),
				logger
			);

			progress.report({ message: 'Scanning for installed extensions...', increment: 10 });

			// Handle extensions
			const allDirs = fs.readdirSync(sourceEditorPaths.extensionsDir).filter(file => {
				const fullPath = path.join(sourceEditorPaths.extensionsDir, file);
				return fs.statSync(fullPath).isDirectory();
			});

			const totalExtensions = allDirs.length;
			let installedCount = 0;

			progress.report({ message: `Installing extensions (0/${totalExtensions})...`, increment: 10 });

			const results: { extension: string; result: ExtensionInstallResult }[] = [];
			let successCount = 0;

			for (const dir of allDirs) {
				if (token.isCancellationRequested) {
					window.showInformationMessage('Import process was cancelled');
					return;
				}

				const extensionInfo = parseExtensionFolder(dir);
				if (!extensionInfo) {
					logger.error(`Failed to parse extension directory: ${dir}`);
					continue;
				}

				progress.report({
					message: `Installing extension ${extensionInfo.namespace}.${extensionInfo.name} (${++installedCount}/${totalExtensions})`,
					increment: (50 / totalExtensions)
				});

				const result = await installExtensionFromOpenVSX(extensionInfo, destExtDir, logger);
				results.push({
					extension: `${extensionInfo.namespace}.${extensionInfo.name}`,
					result
				});

				if (result.success) {
					successCount++;
				}
			}

			// Show summary after all extensions are processed
			const failedCount = results.length - successCount;
			if (failedCount > 0) {
				const failedExtensions = results
					.filter(r => !r.result.success)
					.map(r => `${r.extension}: ${r.result.message}`)
					.join('\n');

				void window.showWarningMessage(
					`Completed with ${failedCount} failed extensions. Check output for details.`,
					'Show Details'
				).then(selection => {
					if (selection === 'Show Details') {
						// Create and show output channel with details
						const channel = window.createOutputChannel('Extension Import Results');
						channel.appendLine('Failed Extensions:');
						channel.appendLine(failedExtensions);
						channel.show();
					}
				});
			}

			// Show completion message
			void window.withProgress({
				location: ProgressLocation.Notification,
				title: 'Settings import complete!',
			}, async (progress) => {
				progress.report({ increment: 100 });
				// Auto-hide after 3 seconds
				await new Promise(resolve => setTimeout(resolve, 3000));
			});
		} catch (error) {
			window.showErrorMessage('Error during import process');
			logger.error('Error during import process', error);
			throw error;
		}
	});
};

async function installExtensionFromOpenVSX(
	extensionInfo: ExtensionMetadata,
	destDir: string,
	logger: Logger
): Promise<ExtensionInstallResult> {
	const { namespace, name } = extensionInfo;
	let vsixPath: string | undefined;
	let installAttempted = false;

	try {
		// Fetch extension metadata from OpenVSX with retry
		const response = await retry(async () => {
			const resp = await fetch(`https://open-vsx.org/api/${namespace}/${name}/latest`);
			if (resp.status === 429) {
				throw new Error('Rate limit exceeded');
			}
			if (!resp.ok) {
				if (resp.status === 404) {
					return { notFound: true, response: resp };
				}
				throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
			}
			return { notFound: false, response: resp };
		});

		if (response.notFound) {
			logger.warn(`Extension ${namespace}.${name} not found on OpenVSX, skipping...`);
			return {
				success: false,
				message: `Extension ${namespace}.${name} not available on OpenVSX`
			};
		}

		const metadata: OpenVSXResponse = await response.response.json();
		const { platform, arch } = getPlatformInfo();

		// Determine the best download URL based on platform and architecture
		let downloadUrl: string | undefined;

		// First try platform-specific build
		if (metadata.downloads[platform as keyof typeof metadata.downloads]) {
			const platformDownloads = metadata.downloads[platform as keyof typeof metadata.downloads] as Record<string, string>;
			downloadUrl = platformDownloads[arch];
		}

		// Fallback to universal build if platform-specific not found
		if (!downloadUrl) {
			downloadUrl = metadata.downloads.universal || metadata.files?.download;
		}

		if (!downloadUrl) {
			return {
				success: false,
				message: `No compatible version found for ${namespace}.${name} (${platform}-${arch})`
			};
		}

		// Download and install the extension with retry
		const tempFilename = `${namespace}.${name}.vsix`;
		vsixPath = await retry(() => downloadFileToFolder(downloadUrl!, destDir, tempFilename));

		installAttempted = true;
		await commands.executeCommand(
			'workbench.extensions.command.installFromVSIX',
			Uri.file(vsixPath)
		);

		logger.info(`Successfully installed ${namespace}.${name} from OpenVSX (${platform}-${arch})`);

		return {
			success: true,
			message: `Successfully installed ${namespace}.${name}`
		};

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		logger.error(`Failed to install ${namespace}.${name}: ${errorMessage}`);

		return {
			success: false,
			message: installAttempted ?
				`Failed to install ${namespace}.${name}: Installation error` :
				`Failed to download ${namespace}.${name}: ${errorMessage}`
		};
	} finally {
		// Cleanup temporary file
		if (vsixPath && fs.existsSync(vsixPath)) {
			try {
				fs.unlinkSync(vsixPath);
			} catch (error) {
				logger.warn(`Failed to cleanup temporary file ${vsixPath}`, error);
			}
		}
	}
}

function parseExtensionFolder(extensionFolderName: string): ExtensionMetadata | null {
	// Support both formats:
	// publisher.extension-1.2.3
	// publisher.extension-1.2.3-universal
	const regex = /^([a-zA-Z0-9\-]+)\.([a-zA-Z0-9\-]+)-(\d+\.\d+\.\d+(?:-[a-zA-Z0-9\-]+)?)/;
	const match = extensionFolderName.match(regex);

	if (!match) {
		return null;
	}

	return {
		namespace: match[1],
		name: match[2],
		version: match[3]
	};
}
