
import { generateEmbedding } from "../llm/embeddings/openai";
import { CodeSymbolInformationEmbeddings } from "../utilities/types";
import * as math from 'mathjs';

function cosineSimilarity(vecA: number[], vecB: number[]): number {
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

    public async generateNodesRelevantForUser(
        userQuery: string,
    ): Promise<CodeSymbolInformationEmbeddings[]> {
        console.log("Whats the length of all code symbols: " + this._nodes.length);
        const userQueryEmbedding = await generateEmbedding(userQuery);

        const nodesWithSimilarity = this._nodes.map((node) => {
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
