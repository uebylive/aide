/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callServerEvent } from './ssestream';
import { ConversationMessage, ConversationMessageOkay } from './types';

export enum RepoRefBackend {
	local = 'local',
	github = 'github',
};


export class RepoRef {
	private _path: String;
	private _backend: RepoRefBackend;

	constructor(
		path: string,
		backend: RepoRefBackend
	) {
		this._path = path;
		this._backend = backend;
	}

	getRepresentation(): string {
		return `${this._backend}/${this._path}`;
	}
}


export class SideCarClient {
	private _url: string;

	constructor(
		url: string
	) {
		this._url = url;
	}

	async searchQuery(query: string, repoRef: RepoRef): Promise<AsyncIterableIterator<string>> {
		// how do we create the url properly here?
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agent/search_agent';
		baseUrl.searchParams.set('reporef', repoRef.getRepresentation());
		baseUrl.searchParams.set('query', query);
		const url = baseUrl.toString();
		const asyncIterableResponse = await callServerEvent(url);
		return asyncIterableResponse;
	}
}


// void (async () => {
// 	const sidecarclient = new SideCarClient('http://127.0.0.1:42424');
// 	const repoRef = new RepoRef('/Users/skcd/scratch/sidecar', RepoRefBackend.local);
// 	const query = "Where does the agent do search?";
// 	console.log("we are over here");
// 	console.log("we have some response here");
// 	const response = await sidecarclient.searchQuery(query, repoRef);
// 	for await (const line of response) {
// 		// Now these responses can be parsed properly, since we are using our
// 		// own reader over sse, sometimes the reader might send multiple events
// 		// in a single line so we should split the lines by \n to get the
// 		// individual lines
// 		console.log(line);
// 		// Is this a good placeholder? probably not, cause we can have instances
// 		// of this inside the string too, but for now lets check if this works as
// 		// want it to
// 		const lineParts = line.split('data:{');
// 		for (const lineSinglePart of lineParts) {
// 			const lineSinglePartTrimmed = lineSinglePart.trim();
// 			if (lineSinglePartTrimmed === '') {
// 				continue;
// 			}
// 			const conversationMessage = JSON.parse('{' + lineSinglePartTrimmed) as ConversationMessageOkay;
// 			console.log(conversationMessage);
// 		}
// 	}
// })();
