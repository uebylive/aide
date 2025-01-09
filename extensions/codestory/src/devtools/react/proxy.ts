/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import httpProxy from 'http-proxy';
import { Socket } from 'node:net';
import { parse, parseFragment, defaultTreeAdapter, serialize } from 'parse5';
import * as zlib from 'zlib';

const pageRegex = /^\.?\/([^.]*$|[^.]+\.html)$/;
const makeScript = (location: string) => `<script src="${location}"></script>`;

// Cleanup function to remove all listeners and close
// the server and proxy before retrying or failing.
function cleanup(
	proxy: httpProxy<http.IncomingMessage, http.ServerResponse<http.IncomingMessage>>,
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>
) {
	// Remove all listeners
	proxy.removeAllListeners();
	server.removeAllListeners();

	// Attempt to close the server and proxy. This ensures we free the port.
	try {
		server.close();
	} catch (e) {
		console.error(e);
	}
	try {
		proxy.close();
	} catch (e) {
		console.error(e);
	}
}

function pipeThrough(serverResponse: http.ServerResponse<http.IncomingMessage>, proxyResponse: http.IncomingMessage) {
	serverResponse.writeHead(proxyResponse.statusCode || 200, proxyResponse.headers);
	proxyResponse.pipe(serverResponse);
}

function startInterceptingDocument(
	proxy: httpProxy<http.IncomingMessage, http.ServerResponse<http.IncomingMessage>>,
	reactDevtoolsPort: number
) {
	// Intercept the response
	proxy.on('proxyRes', (proxyRes, req, res) => {
		const bodyChunks: Uint8Array[] = [];

		proxyRes.on('data', (chunk) => {
			bodyChunks.push(chunk);
		});

		proxyRes.on('end', () => {
			const contentType = proxyRes.headers['content-type'] || '';
			const isHtml = contentType.toLowerCase().includes('text/html');
			const isPage = req.url && req.url.match(pageRegex);

			// No HTML or doesn't look like a page to inject -> just pipe
			if (!isHtml || !isPage) {
				const buffer = Buffer.concat(bodyChunks);
				res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
				res.end(buffer);
				return;
			}

			const contentEncoding = (proxyRes.headers['content-encoding'] || '').toLowerCase();
			const rawBuffer = Buffer.concat(bodyChunks);

			let decompressedBuffer: Buffer;
			try {
				if (contentEncoding.includes('gzip')) {
					decompressedBuffer = zlib.gunzipSync(rawBuffer);
				} else if (contentEncoding.includes('deflate')) {
					decompressedBuffer = zlib.inflateSync(rawBuffer);
				} else if (contentEncoding.includes('br')) {
					decompressedBuffer = zlib.brotliDecompressSync(rawBuffer);
				} else {
					// no known compression -> pass through
					decompressedBuffer = rawBuffer;
				}
			} catch (e) {
				// If we fail decompression, just pass along the raw data
				// or handle the error however you like.
				console.error('Decompression error:', e);
				res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
				res.end(rawBuffer);
				return;
			}

			// Now we can safely parse the HTML
			const originalBody = decompressedBuffer.toString('utf8');
			const document = parse(originalBody);
			const htmlNode = document.childNodes.find(node => node.nodeName === 'html');

			if (!htmlNode || !defaultTreeAdapter.isElementNode(htmlNode)) {
				console.log('No html node found');
				pipeThrough(res, proxyRes);
				return;
			}

			const headNode = htmlNode.childNodes.find(node => node.nodeName === 'head');
			if (!headNode || !defaultTreeAdapter.isElementNode(headNode)) {
				console.log('No head node found');
				pipeThrough(res, proxyRes);
				return;
			}

			// Insert our script into the <head>
			const scriptFragment = parseFragment(makeScript(`http://localhost:${reactDevtoolsPort}`));
			const scriptNode = scriptFragment.childNodes[0];
			const firstChild = defaultTreeAdapter.getFirstChild(headNode);
			if (firstChild) {
				defaultTreeAdapter.insertBefore(headNode, scriptNode, firstChild);
			} else {
				defaultTreeAdapter.appendChild(headNode, scriptNode);
			}

			// Re-serialize the HTML
			const modifiedBody = serialize(document);

			// Prepare the final headers
			const headers = { ...proxyRes.headers };
			delete headers['transfer-encoding'];
			delete headers['content-encoding']; // Remove old content-encoding header
			headers['content-length'] = Buffer.byteLength(modifiedBody).toString();

			// Send the updated response
			(res as http.ServerResponse).writeHead(proxyRes.statusCode || 200, headers);
			(res as http.ServerResponse).end(modifiedBody);
		});
	});
}

type ProxyResult = {
	listenPort: number;
	cleanup: () => void;
};

export function proxy(port: number, reactDevtoolsPort = 8097): Promise<ProxyResult> {
	const maxAttempts = 10;
	let attempt = 0;
	let listenPort = 8000;

	function tryListen(resolve: (result: ProxyResult) => void, reject: (reason?: any) => void) {
		// Create a new proxy and server on each attempt
		const proxy = httpProxy.createProxyServer({
			target: `http://localhost:${port}`,
			selfHandleResponse: true,
		});

		const server = http.createServer(
			(req: http.IncomingMessage, res: http.ServerResponse<http.IncomingMessage> & { req: http.IncomingMessage }) => {
				proxy.web(req, res);
			}
		);

		// Handle proxy errors
		proxy.on('error', (err: Error, _req: http.IncomingMessage, res: Socket | http.ServerResponse<http.IncomingMessage>) => {
			console.error('Proxy error:', err);
			if (res instanceof http.ServerResponse) {
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				res.end('An error occurred while processing the proxy request.');
			}
		});


		// Handle server "listening" event
		server.once('listening', () => {
			startInterceptingDocument(proxy, reactDevtoolsPort);
			resolve({
				listenPort,
				cleanup: cleanup.bind(null, proxy, server)
			});
		});

		// Handle server "error" event (e.g., port in use)
		server.once('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
				// Cleanup current attempt
				cleanup(proxy, server);
				// Increment and retry
				attempt++;
				listenPort++;
				tryListen(resolve, reject);
			} else {
				// No more retries or different error
				cleanup(proxy, server);
				reject(err);
			}
		});

		server.listen(listenPort);
	}

	return new Promise(tryListen);
}
