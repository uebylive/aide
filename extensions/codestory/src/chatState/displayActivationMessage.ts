/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

async function* activationCodeIterator() {
	while (true) {
		yield 'Please provide an activation code';
	}
}

async function displayMessages() {
	const iterator = activationCodeIterator();
	for await (const message of iterator) {
		console.log(message);
		// You can add a delay here if needed
		await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay
	}
}
