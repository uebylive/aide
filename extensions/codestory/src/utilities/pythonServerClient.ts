// Contains class and methods which allow us to talk to the python server
// running in the background.

import { generateEmbedding } from '../llm/embeddings/openai';
import { generateContextForEmbedding } from './embeddingsHelpers';
import { CodeSymbolInformation, CodeSymbolInformationEmbeddings, FileCodeSymbolInformation } from './types';
import axios from "axios";

const PORT = 42424;


export class PythonServer {
	private _serverUrl: string;
	constructor(serverUrl: string) {
		this._serverUrl = serverUrl;
	}

	async parseFile(filePath: string): Promise<CodeSymbolInformationEmbeddings[]> {
		const endpoint = `${this._serverUrl}/api/get_file_information_for_plugin`;
		try {
			const { data } = await axios.post(endpoint, {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				file_path: filePath,
			});
			const codeSymbols = JSON.parse(data)["code_symbols"] as CodeSymbolInformation[];
			const codeSymbolWithEmbeddings: CodeSymbolInformationEmbeddings[] = [];
			for (const codeSymbol of codeSymbols) {
				codeSymbolWithEmbeddings.push({
					codeSymbolInformation: codeSymbol,
					codeSymbolEmbedding: await generateEmbedding(generateContextForEmbedding(
						codeSymbol.codeSnippet.code,
						codeSymbol.fsFilePath,
						codeSymbol.globalScope,
					)),
				});
			}
			return codeSymbolWithEmbeddings;
		} catch (e) {
			console.log(e);
		}
		return [];
	}
}


// void (async () => {
// 	const server = new PythonServer(`http://localhost:${PORT}`);
// 	const result = await server.parseFile("/Users/skcd/scratch/anton/anton/server/start_server.py");
// 	console.log(result);
// })();
