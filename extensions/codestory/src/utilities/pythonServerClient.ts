/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateEmbedding } from '../llm/embeddings/openai';
import { generateContextForEmbedding } from './embeddingsHelpers';
import { CodeSymbolInformation, CodeSymbolInformationEmbeddings, FileCodeSymbolInformation } from './types';
import axios from 'axios';

const PORT = 42424;


export class PythonServer {
	private _serverUrl: string;
	constructor(serverUrl: string) {
		this._serverUrl = serverUrl;
	}

	async parseFile(filePath: string): Promise<CodeSymbolInformation[]> {
		const endpoint = `${this._serverUrl}/api/get_file_information_for_plugin`;
		try {
			const { data } = await axios.post(endpoint, {
				file_path: filePath,
			});
			console.log('Whats the data after parsing the file');
			console.log(data);
			const codeSymbols = JSON.parse(data).code_symbols as CodeSymbolInformation[];
			console.log('How many code symbols do we have: ' + codeSymbols.length);
			return codeSymbols;
		} catch (e) {
			console.log(e);
			return [];
		}
		return [];
	}
}


// void (async () => {
// 	const server = new PythonServer(`http://localhost:${PORT}`);
// 	const result = await server.parseFile('/Users/skcd/scratch/anton/anton/server/start_server.py');
// 	console.log(result);
// })();
