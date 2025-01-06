/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { commands, env, Uri, window, ProgressLocation } from 'vscode';
import { Logger } from 'winston';

export type VSCodeVariant = 'vscode' | 'vscodium' | 'insiders';

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

// Map of editor variants to their configuration details
const EDITOR_CONFIGS: Record<VSCodeVariant, {
	displayName: string;
	configDirName: string;
	extensionsDirName: string;
}> = {
	vscode: {
		displayName: 'VS Code',
		configDirName: 'Code',
		extensionsDirName: '.vscode'
	},
	vscodium: {
		displayName: 'VS Codium',
		configDirName: 'VSCodium',
		extensionsDirName: '.vscode-oss'
	},
	insiders: {
		displayName: 'VS Code Insiders',
		configDirName: 'Code - Insiders',
		extensionsDirName: '.vscode-insiders'
	}
};

function getEditorPaths(variant: VSCodeVariant, homeDir: string): EditorPaths {
	const config = EDITOR_CONFIGS[variant];
	const platform = os.platform();

	let configDir: string;
	if (platform === 'win32') {
		const appDataPath = process.env.APPDATA;
		if (!appDataPath) {
			throw new Error('APPDATA environment variable not found');
		}
		configDir = path.join(appDataPath, config.configDirName, 'User');
	} else if (platform === 'darwin') {
		configDir = path.join(homeDir, 'Library/Application Support', config.configDirName, 'User');
	} else {
		configDir = path.join(homeDir, '.config', config.configDirName, 'User');
	}

	const extensionsDir = path.join(
		platform === 'win32' ? process.env.USERPROFILE! : homeDir,
		config.extensionsDirName,
		'extensions'
	);

	return {
		configDir,
		extensionsDir,
		displayName: config.displayName
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
	updateUrl: string;
	commit: string;
	quality: string;
	dataFolderName: string;
	serverApplicationName?: string;
	serverDataFolderName?: string;
}

function getProductConfiguration(): IProductConfiguration {
	const content = fs.readFileSync(path.join(env.appRoot, 'product.json')).toString();
	return JSON.parse(content) as IProductConfiguration;
}

export const copySettings = async (logger: Logger) => {
	const { dataFolderName } = getProductConfiguration();

	// Show quick pick for editor selection
	const editorChoice = await window.showQuickPick(
		[
			{ label: 'VS Code', value: 'vscode' as VSCodeVariant },
			{ label: 'VS Code Insiders', value: 'insiders' as VSCodeVariant },
			{ label: 'VS Codium', value: 'vscodium' as VSCodeVariant }
		],
		{
			placeHolder: 'Select your previous editor',
			title: 'Import Settings From'
		}
	);

	if (!editorChoice) {
		return; // User cancelled
	}

	await window.withProgress({
		location: ProgressLocation.Notification,
		title: `Importing from ${editorChoice.label}`,
		cancellable: true
	}, async (progress, token) => {
		try {
			const homeDir = os.homedir();
			const sourceEditorPaths = getEditorPaths(editorChoice.value, homeDir);

			progress.report({ message: 'Preparing directories...', increment: 10 });

			// Get destination paths using VSCode's env API where possible
			const destConfigDir = path.join(
				os.platform() === 'win32'
					? process.env.APPDATA!
					: os.platform() === 'darwin'
						? path.join(homeDir, 'Library/Application Support')
						: path.join(homeDir, '.config'),
				'Aide',
				'User'
			);

			const destExtDir = path.join(
				os.platform() === 'win32' ? process.env.USERPROFILE! : homeDir,
				dataFolderName,
				'extensions'
			);

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
