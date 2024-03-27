/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as http from 'http';

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
		const body = await readRequestBody(req);
		console.log(body);
		// const request = JSON.parse(body);
		// console.log(request);

		// Process the request asynchronously
		const response = {
			'reply': 'gg from vscode',
		};

		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(response));
	} catch (err) {
		console.error(err);
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Internal Server Error' }));
	}
}
