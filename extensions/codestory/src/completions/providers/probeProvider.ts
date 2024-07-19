/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as uuid from 'uuid';
import * as vscode from 'vscode';

import { reportAgentEventsToChat } from '../../chatState/convertStreamToMessage';
import postHogClient from '../../posthog/client';
import { applyEdits } from '../../server/applyEdits';
import { handleRequest } from '../../server/requestHandler';
import { SideCarAgentEvent, SidecarApplyEditsRequest } from '../../server/types';
import { SideCarClient } from '../../sidecar/client';
import { getInviteCode } from '../../utilities/getInviteCode';
import { getUniqueId } from '../../utilities/uniqueId';

export class AideProbeProvider implements vscode.Disposable {
	private _sideCarClient: SideCarClient;
	private _editorUrl: string | undefined;
	private active: boolean = false;

	private _requestHandler: http.Server | null = null;
	private _openResponseStream: vscode.ProbeResponseStream | undefined;

	private async isPortOpen(port: number): Promise<boolean> {
		return new Promise((resolve, _) => {
			const s = net.createServer();
			s.once('error', (err) => {
				s.close();
				// @ts-ignore
				if (err['code'] === 'EADDRINUSE') {
					resolve(false);
				} else {
					resolve(false); // or throw error!!
					// reject(err);
				}
			});
			s.once('listening', () => {
				resolve(true);
				s.close();
			});
			s.listen(port);
		});
	}

	private async getNextOpenPort(startFrom: number = 42423) {
		let openPort: number | null = null;
		while (startFrom < 65535 || !!openPort) {
			if (await this.isPortOpen(startFrom)) {
				openPort = startFrom;
				break;
			}
			startFrom++;
		}
		return openPort;
	}

	constructor(
		sideCarClient: SideCarClient,
	) {
		this._sideCarClient = sideCarClient;

		// Server for the sidecar to talk to the editor
		this._requestHandler = http.createServer(
			handleRequest(this.provideEdit.bind(this))
		);
		this.getNextOpenPort().then((port) => {
			if (port === null) {
				throw new Error('Could not find an open port');
			}

			// can still grab it by listenting to port 0
			this._requestHandler?.listen(port);
			const editorUrl = `http://localhost:${port}`;
			// console.log('editorUrl', editorUrl);
			this._editorUrl = editorUrl;
			// console.log(this._editorUrl);
		});

		vscode.aideProbe.registerProbeResponseProvider(
			'aideProbeProvider',
			{
				provideProbeResponse: this.provideProbeResponse.bind(this),
				onDidUserAction(action) {
					postHogClient?.capture({
						distinctId: getUniqueId(),
						event: action.action.type,
						properties: {
							platform: os.platform(),
							requestId: action.sessionId,
						},
					});
				}
			}
		);

		this.checkActivation();

		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('aide')) {
				this.checkActivation();
			}
		});
	}

	private checkActivation() {
		this.active = Boolean(getInviteCode());
	}

	async provideEdit(request: SidecarApplyEditsRequest) {
		if (!this._openResponseStream) {
			return;
		}

		applyEdits(request, this._openResponseStream);
	}

	private async provideProbeResponse(request: vscode.ProbeRequest, response: vscode.ProbeResponseStream, token: vscode.CancellationToken) {
		if (!this._editorUrl) {
			return;
		}

		this._openResponseStream = response;
		let { query } = request;
		// console.log('userQuery', query);
		query = query.trim();

		const startTime = process.hrtime();

		postHogClient?.capture({
			distinctId: getUniqueId(),
			event: 'probe_requested',
			properties: {
				platform: os.platform(),
				query,
				requestId: request.requestId,
			},
		});

		if (!this.active) {
			response.markdown('Please add your invite under `"aide.probeInviteCode"` in your settings.');
			return {};
		}

		const threadId = uuid.v4();

		let probeResponse: AsyncIterableIterator<SideCarAgentEvent>;
		if (request.editMode) {
			probeResponse = this._sideCarClient.startAgentCodeEdit(query, request.references, this._editorUrl, threadId);
		} else {
			probeResponse = this._sideCarClient.startAgentProbe(query, request.references, this._editorUrl, threadId);
		}

		/* // Use dummy data: Start
		const extensionRoot = vscode.extensions.getExtension('codestory-ghost.codestoryai')?.extensionPath;
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
		if (!extensionRoot || !workspaceRoot) {
			return {};
		}

		const that = this;
		const jsonArr = readJsonFile(`${extensionRoot}/src/completions/providers/dummydata.json`);
		const probeResponse = (async function* (arr) {
			for (const original of arr) {
				const itemString = JSON.stringify(original).replace(/\/Users\/nareshr\/github\/codestory\/sidecar/g, workspaceRoot);
				const item = JSON.parse(itemString) as SideCarAgentEvent;
				if ('request_id' in item && item.event.SymbolEventSubStep && item.event.SymbolEventSubStep.event.Edit) {
					const editSubStep = item.event.SymbolEventSubStep.event.Edit;
					if (editSubStep.EditCode) {
						const editEvent = editSubStep.EditCode;
						that.provideEdit({
							fs_file_path: editEvent.fs_file_path,
							selected_range: editEvent.range,
							edited_content: editEvent.new_code
						});
					}
				}
				yield item;
			}
		})(jsonArr);
		// Use dummy data: End */

		await reportAgentEventsToChat(request.editMode, probeResponse, response, threadId, token, this._sideCarClient);

		const endTime = process.hrtime(startTime);
		postHogClient?.capture({
			distinctId: getUniqueId(),
			event: 'probe_completed',
			properties: {
				platform: os.platform(),
				query,
				timeElapsed: `${endTime[0]}s ${endTime[1] / 1000000}ms`,
				requestId: request.requestId,
			},
		});

		return {};
	}

	dispose() {
		this._requestHandler?.close();
	}
}
