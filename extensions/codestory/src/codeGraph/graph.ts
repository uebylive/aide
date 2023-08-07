// We have to generate the graph of the codebase here, so we can query for nodes

import { getCodeSymbolList } from "../storage/indexer";
import { TSMorphProjectManagement, parseFileUsingTsMorph } from "../utilities/parseTypescript";
import { CodeSymbolInformation } from "../utilities/types";



export class CodeGraph {
    private _nodes: CodeSymbolInformation[];

    constructor(nodes: CodeSymbolInformation[]) {
        this._nodes = nodes;
    }

    public getNodeByLastName(
        lastName: string,
    ): CodeSymbolInformation[] | null {
        const nodes = this._nodes.filter(
            (node) => {
                const symbolName = node.symbolName;
                const splittedSymbolName = symbolName.split('.').reverse();
                let accumulator = "";
                for (let index = 0; index < splittedSymbolName.length; index++) {
                    const element = splittedSymbolName[index];
                    if (index === 0) {
                        accumulator = element;
                        if (symbolName === "src.codeGraph.embeddingsSearch.cosineSimilarity") {
                            console.log("What are we searching for", accumulator, lastName);
                        }
                        if (accumulator === lastName) {
                            return true;
                        }
                    } else {
                        accumulator = `${element}.${accumulator}`;
                        if (symbolName === "src.codeGraph.embeddingsSearch.cosineSimilarity") {
                            console.log("What are we searching for", accumulator, lastName);
                        }
                        if (accumulator === lastName) {
                            return true;
                        }
                    }
                }
                return false;
            },
        );
        if (nodes.length === 0) {
            return null;
        }
        return nodes;
    }
}

export const generateCodeGraph = (
    projectManagement: TSMorphProjectManagement,
): CodeGraph => {
    const finalNodeList: CodeSymbolInformation[] = [];
    projectManagement.directoryToProjectMapping.forEach(async (project, workingDirectory) => {
        const codeSymbolInformationList = await getCodeSymbolList(
            project,
            workingDirectory,
        );
        finalNodeList.push(...codeSymbolInformationList);
    });
    return new CodeGraph(finalNodeList);
}