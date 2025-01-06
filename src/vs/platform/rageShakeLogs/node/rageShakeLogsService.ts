/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IFile, zip } from '../../../base/node/zip.js';
import * as path from '../../../base/common/path.js';
import * as pfs from '../../../base/node/pfs.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IRageShakeLogsService } from '../common/rageShake.js';

export class RageShakeLogsService extends Disposable implements IRageShakeLogsService {
	_serviceBrand: undefined;

	constructor(@IEnvironmentService private readonly environmentService: IEnvironmentService) {
		super();
	}

	private async collectFiles(uri: URI): Promise<IFile[]> {

		const collectFilesFromDirectory = async (dir: string): Promise<string[]> => {
			let entries = await pfs.Promises.readdir(dir);
			entries = entries.map(e => path.join(dir, e));
			const stats = await Promise.all(entries.map(e => fs.promises.stat(e)));
			let promise: Promise<string[]> = Promise.resolve([]);
			stats.forEach((stat, index) => {
				const entry = entries[index];
				if (stat.isFile()) {
					promise = promise.then(result => ([...result, entry]));
				}
				if (stat.isDirectory()) {
					promise = promise
						.then(result => collectFilesFromDirectory(entry)
							.then(files => ([...result, ...files])));
				}
			});
			return promise;
		};

		const files = await collectFilesFromDirectory(uri.fsPath);
		return files.map(f => ({ path: uri.fsPath, localPath: f }));
	}

	async getLatestLogs(): Promise<string> {
		const latestLogsUri = this.environmentService.logsHome;
		const files = await this.collectFiles(latestLogsUri);
		const zipResultPath = await zip(`${latestLogsUri.fsPath}.zip`, files);
		return zipResultPath;
	}
}
