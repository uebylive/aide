/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as http from 'http';
import { SidecarDiagnosticsRequest, SidecarGoToDefinitionRequest, SidecarOpenFileToolRequest } from './types';
import { Position, Range } from 'vscode';
import { getDiagnosticsFromEditor } from './diagnostics';
import { openFileEditor } from './openFile';
import { goToDefinition } from './goToDefinition';

// Helper function to read the request body
function readRequestBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk.toString();
		});
		req.on('end', () => {
			resolve(body);
		});
		req.on('error', (err) => {
			reject(err);
		});
	});
}

// Async handler function to handle incoming requests
export async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
	try {
		if (req.method === 'POST' && req.url === '/diagnostics') {
			const body = await readRequestBody(req);
			console.log('body from post request for diagnostics');
			console.log(body);
			console.log('log after post for diagnostics');
			const diagnosticsBody: SidecarDiagnosticsRequest = JSON.parse(body);
			const selectionRange = new Range(new Position(diagnosticsBody.range.startPosition.line, diagnosticsBody.range.startPosition.character), new Position(diagnosticsBody.range.endPosition.line, diagnosticsBody.range.endPosition.character));
			const diagnosticsFromEditor = getDiagnosticsFromEditor(diagnosticsBody.fs_file_path, selectionRange);
			// Process the diagnostics request asynchronously
			const response = {
				'diagnostics': diagnosticsFromEditor,
			};

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(response));
		} else if (req.method === 'POST' && req.url === '/file_open') {
			const body = await readRequestBody(req);
			const openFileRequest: SidecarOpenFileToolRequest = JSON.parse(body);
			const response = await openFileEditor(openFileRequest);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(response));
		} else if (req.method === 'POST' && req.url === 'go_to_definition') {
			const body = await readRequestBody(req);
			const request: SidecarGoToDefinitionRequest = JSON.parse(body);
			const response = await goToDefinition(request);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(response));
		} else {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ reply: 'gg' }));
		}
	} catch (err) {
		console.error(err);
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Internal Server Error' }));
	}
}
