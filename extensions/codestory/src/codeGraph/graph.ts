// We have to generate the graph of the codebase here, so we can query for nodes

import { getFilesTrackedInWorkingDirectory } from '../git/helper';
import { getCodeSymbolList } from "../storage/indexer";
import { TSMorphProjectManagement, parseFileUsingTsMorph } from "../utilities/parseTypescript";
import { PythonServer } from '../utilities/pythonServerClient';
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

const parsePythonFilesForCodeSymbols = async (
    pythonServer: PythonServer,
    workingDirectory: string,
    filesToCheck: string[],
): Promise<CodeSymbolInformation[]> => {
    const codeSymbolInformationList: CodeSymbolInformation[] = [];
    for (let index = 0; index < filesToCheck.length; index++) {
        const file = filesToCheck[index];
        if (!file.endsWith(".py")) {
            continue;
        }
        const code = await pythonServer.parseFile(file);
        console.log("We are over here in python parsing the files");
        console.log(code);
        codeSymbolInformationList.push(...code);
    }
    return codeSymbolInformationList;
};

export const generateCodeGraph = async (
    projectManagement: TSMorphProjectManagement,
    pythonServer: PythonServer,
    workingDirectory: string,
): Promise<CodeGraph> => {
    const filesToTrack = await getFilesTrackedInWorkingDirectory(
        workingDirectory,
    );
    const finalNodeList: CodeSymbolInformation[] = [];
    projectManagement.directoryToProjectMapping.forEach(async (project, workingDirectory) => {
        const codeSymbolInformationList = await getCodeSymbolList(
            project,
            workingDirectory,
        );
        finalNodeList.push(...codeSymbolInformationList);
    });
    const pythonCodeSymbols = await parsePythonFilesForCodeSymbols(
        pythonServer,
        workingDirectory,
        filesToTrack,
    );
    finalNodeList.push(...pythonCodeSymbols);
    return new CodeGraph(finalNodeList);
}
