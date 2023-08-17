/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { generateEmbedding } from '../llm/embeddings/openai';
import { CodeSymbolInformationEmbeddings } from '../utilities/types';
import * as math from 'mathjs';

function cosineSimilarity(vecA: number[], vecB: number[]): number {
	console.log('Whats the length of vecA', vecA.length);
	console.log('Whats the length of vecB', vecB.length);
	if (vecA.length !== vecB.length) {
		return -1;
	}

	const dotProduct = math.dot(vecA, vecB);
	const magnitudeA = math.norm(vecA);
	const magnitudeB = math.norm(vecB);

	return dotProduct / ((magnitudeA as number) * (magnitudeB as number));
}

export class EmbeddingsSearch {
	private _nodes: CodeSymbolInformationEmbeddings[];

	constructor(nodes: CodeSymbolInformationEmbeddings[]) {
		this._nodes = nodes;
	}

	public updateNodes(nodes: CodeSymbolInformationEmbeddings) {
		this._nodes.push(nodes);
	}

	public async generateNodesRelevantForUser(
		userQuery: string,
	): Promise<CodeSymbolInformationEmbeddings[]> {
		console.log('[search] Whats the length of all code symbols: ' + this._nodes.length);
		const currentNodes = this._nodes;
		console.log('[search][v2] Whats the length of all code symbols: ' + currentNodes.length);
		const userQueryEmbedding = await generateEmbedding(userQuery);

		const nodesWithSimilarity = currentNodes.map((node) => {
			console.log('Whats the current node we are going to search', node);
			const similarity = cosineSimilarity(
				userQueryEmbedding,
				node.codeSymbolEmbedding,
			);
			return {
				node,
				similarity,
			};
		});

		nodesWithSimilarity.sort((a, b) => {
			return b.similarity - a.similarity;
		});

		return nodesWithSimilarity.slice(0, 10).map((nodeWithSimilarity) => {
			return nodeWithSimilarity.node;
		});
	}
}
