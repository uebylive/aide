/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { gt } from 'semver';
import * as vscode from 'vscode';
import { downloadSidecarZip } from './gcpBucket';
import { killProcessOnPort } from './killPort';
import { sidecarURL, sidecarUseSelfRun } from './sidecarUrl';
import { unzip } from './unzip';

const updateBaseURL = `https://aide-updates.codestory.ai/api/update/sidecar`;

// Add function to detect WSL environment
async function isWSLEnvironment(): Promise<boolean> {
	if (os.platform() !== 'win32') {
		return false;
	}

	try {
		const content = await vscode.workspace.fs.readFile(vscode.Uri.file('/proc/version'));
		return content.toString().toLowerCase().includes('microsoft');
	} catch {
		return false;
	}
}

let wslTunnel: vscode.Tunnel | undefined;

async function getHealthCheckURL(): Promise<string> {
	if (await isWSLEnvironment() && wslTunnel) {
		const localAddress = typeof wslTunnel.localAddress === 'string'
			? wslTunnel.localAddress
			: `${wslTunnel.localAddress.host}:${wslTunnel.localAddress.port}`;
		return `http://${localAddress}/api/health`;
	}
	return `${sidecarURL()}/api/health`;
}

async function healthCheck(): Promise<boolean> {
	try {
		const healthCheckURL = await getHealthCheckURL();
		// console.log('Performing health check at:', healthCheckURL);
		const response = await fetch(healthCheckURL);
		const isHealthy = response.status === 200;
		// console.log('Health check result:', { status: response.status, healthy: isHealthy });
		return isHealthy;
	} catch (e) {
		console.error('Health check failed with error:', e);
		return false;
	}
}


type VersionAPIResponse = {
	version_hash: string;
	package_version?: string; // Optional for backward compatibility
};

async function versionCheck(): Promise<VersionAPIResponse | undefined> {
	try {
		const response = await fetch(`${sidecarURL()}/api/version`);
		if (response.status === 200) {
			const versionData = await response.json() as VersionAPIResponse;
			vscode.sidecar.setVersion(versionData.package_version ?? 'unknown');
			return versionData;
		} else {
			return undefined;
		}
	} catch (e) {
		console.error(e);
		return undefined;
	}
}

type UpdateAPIResponse = {
	version_hash: string;
	package_version: string;
	timestamp: string;
};

async function checkForUpdates(
	zipDestination: string,
	extractedDestination: string
) {
	const currentVersionResponse = await versionCheck();
	if (!currentVersionResponse) {
		console.log('Unable to check sidecar version');
		return;
	} else if (!currentVersionResponse.package_version) {
		console.log('Current sidecar version is unknown, fetching the latest');
		// At the time of shipping new version, this will be undefined. In this case, fetch the latest.
		await fetchSidecarWithProgress(zipDestination, extractedDestination);
		return;
	}

	const platform = process.platform;
	const architecture = process.arch;
	const updateURL = `${updateBaseURL}/${platform}-${architecture}`;
	const response = await fetch(updateURL);
	if (response.status === 200) {
		const data = await response.json() as UpdateAPIResponse;
		if (gt(data.package_version, currentVersionResponse.package_version)) {
			console.log(`New sidecar version available: ${data.package_version}`);
			await fetchSidecarWithProgress(zipDestination, extractedDestination, data.package_version);
		} else {
			console.log(`Current sidecar version is up to date: ${currentVersionResponse.package_version}`);
			return;
		}
	} else {
		console.error('Failed to check for updates');
		return;
	}
}

async function fetchSidecarWithProgress(
	zipDestination: string,
	extractedDestination: string,
	version: string = 'latest'
) {
	try {
		console.log('Downloading sidecar binary, version: ' + version);
		vscode.sidecar.setDownloadStatus({ downloading: true, update: version !== 'latest' });

		try {
			await downloadSidecarZip(zipDestination, version);
		} catch (error) {
			console.error('Failed to download sidecar binary:', error);
			throw new Error(`Failed to download sidecar binary: ${error.message}`);
		}

		console.log('Unzipping sidecar binary from ' + zipDestination + ' to ' + extractedDestination);
		try {
			await unzip(zipDestination, extractedDestination);
		} catch (error) {
			console.error('Failed to extract sidecar binary:', error);
			// Clean up the zip file if it exists
			if (fs.existsSync(zipDestination)) {
				try {
					fs.unlinkSync(zipDestination);
				} catch (cleanupError) {
					console.warn('Failed to clean up zip file after extraction error:', cleanupError);
				}
			}
			throw new Error(`Failed to extract sidecar binary: ${error.message}`);
		}

		console.log('Deleting zip file from ' + zipDestination);
		try {
			fs.unlinkSync(zipDestination);
		} catch (error) {
			console.warn('Failed to delete zip file:', error);
			// Non-fatal error, continue execution
		}

		vscode.sidecar.setDownloadStatus({ downloading: false, update: version !== 'latest' });
	} catch (error) {
		vscode.sidecar.setDownloadStatus({ downloading: false, update: version !== 'latest' });
		vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Unavailable);
		throw error; // Re-throw to be handled by caller
	}
}

async function retryHealthCheck(maxAttempts: number = 15, intervalMs: number = 1000): Promise<boolean> {
	console.log(`Starting health check retries (max ${maxAttempts} attempts, ${intervalMs}ms interval)`);
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		console.log(`Health check attempt ${attempt}/${maxAttempts}`);
		const isHealthy = await healthCheck();
		if (isHealthy) {
			console.log('Health check succeeded on attempt', attempt);
			return true;
		}
		if (attempt < maxAttempts) {
			console.log(`Waiting ${intervalMs}ms before next attempt...`);
			await new Promise(resolve => setTimeout(resolve, intervalMs));
		}
	}
	console.error('Health check failed after', maxAttempts, 'attempts');
	return false;
}

export async function setupSidecar(extensionBasePath: string): Promise<vscode.Disposable> {
	const zipDestination = path.join(extensionBasePath, 'sidecar_zip.zip');
	const extractedDestination = path.join(extensionBasePath, 'sidecar_bin');

	await startSidecarBinary(extensionBasePath);

	// Asynchronously check for updates
	checkForUpdates(zipDestination, extractedDestination);

	// Set up recurring health check every 5 seconds
	const healthCheckInterval = setInterval(async () => {
		const isHealthy = await healthCheck();
		if (isHealthy) {
			vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Connected);
			versionCheck();
		} else {
			vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Unavailable);
		}
	}, 5000);

	// Clean up interval when extension is deactivated
	return vscode.Disposable.from({ dispose: () => clearInterval(healthCheckInterval) });
}

export async function startSidecarBinary(extensionBasePath: string) {
	const zipDestination = path.join(extensionBasePath, 'sidecar_zip.zip');
	const extractedDestination = path.join(extensionBasePath, 'sidecar_bin');
	const webserverPath = path.join(extractedDestination, 'target', 'release', os.platform() === 'win32' ? 'webserver.exe' : 'webserver');

	const hc = await healthCheck();
	if (hc) {
		vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Connected);
		versionCheck();
	} else if (!sidecarUseSelfRun()) {
		vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Unavailable);

		if (!fs.existsSync(webserverPath)) {
			try {
				// Fetch the latest sidecar binary
				await fetchSidecarWithProgress(zipDestination, extractedDestination);
			} catch (error) {
				console.error('Failed to set up sidecar binary:', error);
				vscode.window.showErrorMessage(`Failed to set up sidecar: ${error.message}`);
				return;
			}
		}

		console.log('Running sidecar binary');
		vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Starting);
		try {
			await runSideCarBinary(webserverPath);
		} catch (error) {
			console.error('Failed to run sidecar binary:', error);
			vscode.window.showErrorMessage(`Failed to start sidecar: ${error.message}`);
			vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Unavailable);
			return;
		}
	} else {
		// Use self-running sidecar
		return;
	}
}

async function runSideCarBinary(webserverPath: string) {
	console.log('Starting sidecar binary at path:', webserverPath);
	try {
		const process = cp.spawn(webserverPath, [], {
			stdio: 'pipe',
			detached: true
		});

		process.stdout?.on('data', (data) => {
			console.log(`[Sidecar] ${data.toString().trim()}`);
		});

		process.stderr?.on('data', (data) => {
			console.error(`[Sidecar Error] ${data.toString().trim()}`);
		});

		process.on('error', (error) => {
			console.error('Sidecar process error:', {
				name: error.name,
				message: error.message,
				stack: error.stack
			});
			throw error;
		});

		process.on('exit', (code, signal) => {
			console.log('Sidecar process exited:', { code, signal });
		});

		if (await isWSLEnvironment()) {
			console.log('WSL environment detected, setting up tunnel...');
			try {
				wslTunnel = await vscode.workspace.openTunnel({
					remoteAddress: { port: 42424, host: 'localhost' },
					localAddressPort: 42424
				});
				console.log('WSL tunnel created:', {
					localAddress: wslTunnel.localAddress,
					remoteAddress: wslTunnel.remoteAddress
				});
			} catch (error) {
				console.error('WSL tunnel creation failed:', error);
				throw error;
			}
		}
	} catch (error) {
		console.error('Sidecar binary startup failed:', {
			error,
			path: webserverPath,
			exists: fs.existsSync(webserverPath),
			permissions: fs.statSync(webserverPath).mode
		});
		throw new Error('Failed to start sidecar binary. Please check logs for details.');
	}

	console.log('Waiting for sidecar to become healthy...');
	const hc = await retryHealthCheck();
	if (!hc) {
		console.error('Sidecar failed to become healthy after startup');
		throw new Error('Sidecar binary failed to start after multiple attempts');
	}

	vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Connected);
	// Trigger version check to send the sidecar version to the editor
	versionCheck();
	console.log('Sidecar binary startup completed successfully');
}

export async function restartSidecarBinary(extensionBasePath: string) {
	console.log('Initiating sidecar binary restart...');
	try {
		const url = sidecarURL();
		const port = parseInt(url.split(':').at(-1) ?? '42424');
		console.log('Attempting to kill sidecar process on port:', port);

		vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Restarting);
		await killProcessOnPort(port);
		console.log('Successfully killed process on port:', port);

		if (wslTunnel) {
			console.log('Cleaning up WSL tunnel...');
			await wslTunnel.dispose();
			wslTunnel = undefined;
			console.log('WSL tunnel cleaned up');
		}
	} catch (error) {
		console.warn('Error during sidecar shutdown:', error);
	}

	vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Unavailable);
	console.log('Starting new sidecar process...');

	vscode.sidecar.setDownloadStatus({ downloading: false, update: false });
	await startSidecarBinary(extensionBasePath);
	console.log('Sidecar restart completed');
}
