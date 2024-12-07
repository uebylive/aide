/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Storage } from '@google-cloud/storage';
import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const bucketName = 'sidecar-bin';
const source = os.platform() === 'win32' ? 'windows/sidecar.zip' : os.platform() === 'darwin' ? 'mac/sidecar.zip' : 'linux/sidecar.zip';

function ensureDirectoryExists(filePath: string): void {
	const parentDir = path.dirname(filePath);
	try {
		fs.mkdirSync(parentDir, { recursive: true });
	} catch (error) {
		// Only throw if the error is not "directory already exists"
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
			throw error;
		}
	}
}

export const downloadSidecarZip = async (destination: string) => {
	ensureDirectoryExists(destination);

	try {
		const storage = new Storage();
		await storage.bucket(bucketName).file(source).download({ destination });
	} catch (e) {
		await downloadUsingURL(source, destination);
	}
};


const downloadUsingURL = async (source: string, destination: string) => {
	const url = `https://storage.googleapis.com/${bucketName}/${source}`;
	const response = await axios.get(url, { responseType: 'stream' });
	const writer = fs.createWriteStream(destination);

	response.data.pipe(writer);

	return new Promise((resolve, reject) => {
		writer.on('finish', resolve);
		writer.on('error', reject);
	});
};
