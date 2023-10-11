/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export async function* callServerEvent(url: string): AsyncIterableIterator<string> {
	const response = await fetch(url, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			'accept': 'text/event-stream',
		},
	});
	if (response.body === null) {
		return;
	}
	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) {
				break;
			}
			yield value;
		}
	} finally {
		reader.releaseLock();
	}
}
