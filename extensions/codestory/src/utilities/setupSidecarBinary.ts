/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { gt } from 'semver';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { downloadSidecarZip } from './gcpBucket';
import { sidecarURL, sidecarUseSelfRun } from './sidecarUrl';
import { unzip } from './unzip';
import { killProcessOnPort } from './killPort';

const exec = promisify(cp.exec);
const updateBaseURL = `https://aide-updates.codestory.ai/api/update/sidecar`;

async function healthCheck(): Promise<boolean> {
	try {
		const response = await fetch(`${sidecarURL()}/api/health`);
		if (response.status === 200) {
			return true;
		} else {
			return false;
		}
	} catch (e) {
		console.error(e);
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
			return response.json();
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
		console.log('Current sidecar version is unknown');
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
	console.log('Downloading sidecar binary, version: ' + version);
	vscode.sidecar.setDownloadStatus({ downloading: true, update: version !== 'latest' });
	await downloadSidecarZip(zipDestination, version);
	console.log('Unzipping sidecar binary');
	unzip(zipDestination, extractedDestination);
	console.log('Deleting zip file');
	fs.unlinkSync(zipDestination);
	vscode.sidecar.setDownloadStatus({ downloading: false, update: version !== 'latest' });
}

async function retryHealthCheck(maxAttempts: number = 15, intervalMs: number = 1000): Promise<boolean> {
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const isHealthy = await healthCheck();
		if (isHealthy) {
			return true;
		}
		if (attempt < maxAttempts) {
			await new Promise(resolve => setTimeout(resolve, intervalMs));
		}
	}
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
	} else if (!sidecarUseSelfRun()) {
		vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Unavailable);

		if (!fs.existsSync(webserverPath)) {
			// Fetch the latest sidecar binary
			await fetchSidecarWithProgress(zipDestination, extractedDestination);
		}

		console.log('Running sidecar binary');
		vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Starting);
		await runSideCarBinary(webserverPath);
	} else {
		// Use self-running sidecar
		return;
	}
}

async function runSideCarBinary(webserverPath: string) {
	if (os.platform() === 'darwin' || os.platform() === 'linux') {
		// Set executable permissions on Unix-like systems (owner: rwx, group: r-x, others: r-x)
		// This is required because the binary may not have executable permissions when extracted from zip
		fs.chmodSync(webserverPath, 0o7_5_5);
	}

	if (os.platform() === 'darwin') {
		// Remove quarantine attribute on macOS to allow binary execution without security warnings
		await exec(`xattr -dr com.apple.quarantine ${webserverPath}`);
	}

	try {
		const process = cp.spawn(webserverPath, [], {
			stdio: 'pipe',
			detached: true
		});

		process.stdout?.on('data', (data) => {
			console.debug(`Sidecar stdout: ${data}`);
		});

		process.stderr?.on('data', (data) => {
			console.error(`Sidecar stderr: ${data}`);
		});

		process.on('error', (error) => {
			console.error('Failed to start sidecar binary:', error);
			throw error;
		});
	} catch (error) {
		console.error('Failed to start sidecar binary:', error);
		throw new Error('Failed to start sidecar binary. Please check logs for details.');
	}

	console.log('Checking sidecar health');
	const hc = await retryHealthCheck();
	if (!hc) {
		throw new Error('Sidecar binary failed to start after multiple attempts');
	}

	vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Connected);
	console.log('Sidecar binary started successfully');
}

export async function restartSidecarBinary(extensionBasePath: string) {
	// First kill the running sidecar process
	try {
		const url = sidecarURL();
		const port = parseInt(url.split(':').at(-1) ?? '42424');
		vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Restarting);
		await killProcessOnPort(port);
	} catch (error) {
		console.warn(error);
	}
	vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Unavailable);

	// Then start a new sidecar process
	vscode.sidecar.setDownloadStatus({ downloading: false, update: false });
	await startSidecarBinary(extensionBasePath);
}
