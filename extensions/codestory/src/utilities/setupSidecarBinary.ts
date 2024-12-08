/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { downloadSidecarZip } from './gcpBucket';
import { sidecarURL, sidecarUseSelfRun } from './sidecarUrl';
import { unzip } from './unzip';

const exec = promisify(cp.exec);

async function healthCheck(): Promise<boolean> {
	try {
		const response = await fetch(`${sidecarURL()}/api/health`);
		if (response.status === 200) {
			return true;
		} else {
			return false;
		}
	} catch (e) {
		return false;
	}
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

export async function startSidecarBinary(extensionBasePath: string) {
	const hc = await healthCheck();
	if (hc) {
		vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Connected);
	} else {
		vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Unavailable);
	}

	const shouldUseSelfRun = sidecarUseSelfRun();
	if (shouldUseSelfRun) {
		return;
	}

	const zipDestination = path.join(extensionBasePath, 'sidecar_zip.zip');
	const extractedDestination = path.join(extensionBasePath, 'sidecar_bin');
	const webserverPath = path.join(extractedDestination, 'target', 'release', os.platform() === 'win32' ? 'webserver.exe' : 'webserver');

	if (!fs.existsSync(webserverPath)) {
		console.log('Downloading sidecar binary');
		vscode.sidecar.setDownloadStatus({ downloading: true, update: false });
		await downloadSidecarZip(zipDestination);
		console.log('Unzipping sidecar binary');
		unzip(zipDestination, extractedDestination);
		console.log('Deleting zip file');
		fs.unlinkSync(zipDestination);
		vscode.sidecar.setDownloadStatus({ downloading: false, update: false });
	}

	console.log('Running sidecar binary');
	vscode.sidecar.setRunningStatus(vscode.SidecarRunningStatus.Starting);
	await runSideCarBinary(webserverPath);
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
