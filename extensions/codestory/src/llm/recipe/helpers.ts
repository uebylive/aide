import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from "openai";
import { EmbeddingsSearch } from "../../codeGraph/embeddingsSearch";
import { getCodeSymbolList } from "../../storage/indexer";
import { TSMorphProjectManagement, parseFileUsingTsMorph } from "../../utilities/parseTypescript";
import { CodeSymbolInformation, FileCodeSymbolInformation } from "../../utilities/types";
import { CodeModificationContextAndDiff, CodeSymbolModificationInstruction, NewFileContentAndDiffResponse, TextExecutionHarness, generateModifyCodeHallucinationPrompt, generateNewFileContentAndDiffResponseParser, generateTestExecutionPrompt, generateTestScriptGenerationPrompt, modifyCodeSnippetPrompt, newFileContentAndDiffPrompt, parseCodeModificationResponse, parseTestExecutionFinalSetupResponse, parseTestPlanResponseForHarness } from "./prompts";
import { CodeGraph } from "../../codeGraph/graph";

import * as fs from 'fs';
import { generateChatCompletion } from "./debugging";
import { ToolingEventCollection } from "../../timeline/events/collection";
import { runCommandAsync } from "../../utilities/commandRunner";

export const generateCodeSymbolsForQueries = async (
    queries: string[],
    embeddingsSearch: EmbeddingsSearch
): Promise<CodeSymbolInformation[]> => {
    const alreadySeenSymbols: Set<string> = new Set();
    const finalCodeSymbolList: CodeSymbolInformation[] = [];
    for (let index = 0; index < queries.length; index++) {
        const query = queries[index];
        const codeSymbols = await embeddingsSearch.generateNodesRelevantForUser(query);
        console.log(`We found ${codeSymbols.length} code symbols for query ${query}`);
        console.log(codeSymbols.map(
            (codeSymbol) => codeSymbol.codeSymbolInformation.symbolName
        ));
        for (let index = 0; index < codeSymbols.length; index++) {
            const codeSymbol = codeSymbols[index];
            if (!alreadySeenSymbols.has(codeSymbol.codeSymbolInformation.symbolName)) {
                alreadySeenSymbols.add(codeSymbol.codeSymbolInformation.symbolName);
                finalCodeSymbolList.push(codeSymbol.codeSymbolInformation);
            }
        }
    }
    return finalCodeSymbolList;
};

export const generateFileInformationSummary = async (
    codeSymbolInformationList: CodeSymbolInformation[],
    tsMorphProjects: TSMorphProjectManagement,
    workingDirectory: string
): Promise<FileCodeSymbolInformation[]> => {
    // We want to get all the files being referenced here and then take all
    // the code symbols from there and pass it to the prompt for searching
    const fileCodeSymbolInformationList: FileCodeSymbolInformation[] = [];
    const fileSet: Set<string> = new Set();
    for (let index = 0; index < codeSymbolInformationList.length; index++) {
        fileSet.add(codeSymbolInformationList[index].fsFilePath);
    }

    const fileList: string[] = Array.from(fileSet);

    // Now that we have the fspath for each of them, we can generate the
    // file code symbol information
    for (let index = 0; index < fileList.length; index++) {
        const project = tsMorphProjects.getTsMorphProjectForFile(fileList[index]);
        if (!project) {
            continue;
        }
        const codeSymbols = parseFileUsingTsMorph(
            fileList[index],
            project,
            workingDirectory,
            fileList[index]
        );
        fileCodeSymbolInformationList.push({
            filePath: fileList[index],
            codeSymbols: codeSymbols,
            workingDirectory: workingDirectory,
        });
    }
    return fileCodeSymbolInformationList;
};

const formatFileInformationForPrompt = (
    fileCodeSymbolInformationList: FileCodeSymbolInformation
): string => {
    let prompt = `<file_path>${fileCodeSymbolInformationList.filePath}</file_path>\n`;
    fileCodeSymbolInformationList.codeSymbols.forEach((codeSymbol) => {
        prompt += `<code_symbol_name>${codeSymbol.symbolName}</code_symbol_name>\n`;
        // Now we need to split and add the code snippet here
        const splittedCodeSnippet = codeSymbol.codeSnippet.code.split("\n");
        prompt += "<snippet>\n";
        splittedCodeSnippet.forEach((codeSnippetLine) => {
            prompt += `${codeSnippetLine}\n`;
        });
        prompt += "</snippet>\n";
    });
    return prompt;
};

export const formatFileInformationListForPrompt = async (
    fileCodeSymbolInformationList: FileCodeSymbolInformation[]
): Promise<string> => {
    let relevantCodeSnippetPrompt = "<relevant_code_snippets_with_information>";
    for (let index = 0; index < fileCodeSymbolInformationList.length; index++) {
        relevantCodeSnippetPrompt +=
            formatFileInformationForPrompt(fileCodeSymbolInformationList[index]) + "\n";
    }
    relevantCodeSnippetPrompt += "</relevant_code_snippets_with_information>";
    return relevantCodeSnippetPrompt;
};


export const readFileContents = async (
    filePath: string,
): Promise<string> => {
    // Read the file from the location in the directory
    return fs.readFileSync(filePath, 'utf8');
};


export const writeFileContents = async (
    filePath: string,
    fileContent: string,
): Promise<void> => {
    return fs.writeFileSync(filePath, fileContent);
}


export const generateModificationInputForCodeSymbol = async (
    codeSymbolModificationInstruction: CodeSymbolModificationInstruction,
    previousMessages: ChatCompletionRequestMessage[],
    codeGraph: CodeGraph
): Promise<CodeModificationContextAndDiff | null> => {
    const possibleCodeNodes = codeGraph.getNodeByLastName(
        codeSymbolModificationInstruction.codeSymbolName
    );
    if (!possibleCodeNodes) {
        console.log("We were unable to find possible code nodes");
        return null;
    }
    const codeSymbol = possibleCodeNodes[0];
    let fileCode = await readFileContents(codeSymbol.fsFilePath);

    // Now supporting big files for now, so we just return null here
    if (fileCode.split("\n").length > 500) {
        console.log("File is too large to parse");
        return null;
    };

    const promptForModification = modifyCodeSnippetPrompt(
        fileCode,
        codeSymbol.codeSnippet.code,
        codeSymbolModificationInstruction.instructions,
        codeSymbol.fsFilePath,
    );

    const messages = [...previousMessages];
    messages.push(...generateModifyCodeHallucinationPrompt());
    messages.push(
        {
            content: promptForModification,
            role: ChatCompletionRequestMessageRoleEnum.User,
        }
    );

    console.log("[generateModificationInputForCodeSymbol] What is the prompt", messages);
    const completion = await generateChatCompletion(messages);
    return parseCodeModificationResponse(completion?.message?.content ?? "");
};


export const generateModifiedFileContentAfterDiff = async (
    codeModificationInput: CodeSymbolModificationInstruction,
    modificationContext: CodeModificationContextAndDiff,
    codeGraph: CodeGraph,
    previousMessages: ChatCompletionRequestMessage[],
): Promise<NewFileContentAndDiffResponse | null> => {
    const possibleCodeNodes = codeGraph.getNodeByLastName(
        codeModificationInput.codeSymbolName
    );
    if (!possibleCodeNodes) {
        return null;
    }
    const codeSymbol = possibleCodeNodes[0];
    let fileCode = await readFileContents(codeSymbol.fsFilePath);
    // Now supporting big files for now, so we just return null here
    if (fileCode.split("\n").length > 500) {
        return null;
    };

    const promptForModification = newFileContentAndDiffPrompt(
        codeSymbol.fsFilePath,
        fileCode,
        codeModificationInput.instructions,
        modificationContext.codeDiff,
        modificationContext.codeModification,
    );

    const messages = [...previousMessages];
    messages.push(...generateModifyCodeHallucinationPrompt());
    messages.push(
        {
            content: promptForModification,
            role: ChatCompletionRequestMessageRoleEnum.User,
        }
    );

    const completion = await generateChatCompletion(messages);
    return generateNewFileContentAndDiffResponseParser(
        completion?.message?.content ?? "",
    );
};


export const getFilePathForCodeNode = (
    codeSymbolNameMaybe: string,
    codeGraph: CodeGraph,
): string | null => {
    const codeNodes = codeGraph.getNodeByLastName(codeSymbolNameMaybe);
    if (!codeNodes) {
        return null;
    }
    return codeNodes[0].fsFilePath;
};

const getCodeNodeForName = (
    codeSymbolNameMaybe: string,
    codeGraph: CodeGraph,
): CodeSymbolInformation | null => {
    const codeNodes = codeGraph.getNodeByLastName(codeSymbolNameMaybe);
    if (!codeNodes) {
        return null;
    }
    return codeNodes[0];
};

export const generateTestScriptForChange = async (
    codeSymbolNameMaybe: string,
    codeGraph: CodeGraph,
    codeModificationContext: CodeModificationContextAndDiff,
    previousMessages: ChatCompletionRequestMessage[],
    moduleName: string,
    previousFileContent: string,
): Promise<TextExecutionHarness | null> => {
    const codeNode = getCodeNodeForName(
        codeSymbolNameMaybe,
        codeGraph,
    );
    if (!codeNode) {
        return null;
    }
    const newFileContent = await readFileContents(codeNode.fsFilePath);
    const prompt = generateTestScriptGenerationPrompt(
        "jest",
        codeNode.fsFilePath,
        codeNode.symbolName,
        newFileContent,
        codeModificationContext.codeDiff,
        codeModificationContext.codeModification,
        moduleName,
    );
    const messages = [...previousMessages];
    messages.push({
        content: prompt,
        role: ChatCompletionRequestMessageRoleEnum.User,
    });
    const response = await generateChatCompletion(messages);
    return parseTestPlanResponseForHarness(
        response?.message?.content ?? "",
        codeSymbolNameMaybe,
    );
};

export const stripPrefix = (input: string, prefix: string): string => {
    if (input.startsWith(prefix)) {
        return input.slice(prefix.length);
    }
    return input;
};


export const executeTestHarness = async (
    testPlan: TextExecutionHarness,
    previousMessages: ChatCompletionRequestMessage[],
    toolingEventCollection: ToolingEventCollection,
    executionEventId: string,
    codeSymbolNameMaybe: string,
    codeGraph: CodeGraph,
    tsMorphProjects: TSMorphProjectManagement,
    workingDirectory: string,
): Promise<number> => {
    const codeNode = getCodeNodeForName(
        codeSymbolNameMaybe,
        codeGraph,
    );
    if (!codeNode) {
        return 1;
    }

    const project = tsMorphProjects.getTsMorphProjectForFile(codeNode.fsFilePath);
    if (!project) {
        return 1;
    }

    // We also need the new code symbol content so we are going to parse it
    // from the file
    const newCodeSymbolNodes = parseFileUsingTsMorph(
        codeNode.fsFilePath,
        project,
        workingDirectory,
        codeNode.fsFilePath,
    );

    const newCodeSymbolNode = newCodeSymbolNodes.find((node) => {
        // Here we have to match based on the last suffix of the code symbol
        // when split by the dot
        const splittedCodeSymbolName = node.symbolName.split(".").reverse();
        let accumulator = "";
        for (let index = 0; index < splittedCodeSymbolName.length; index++) {
            const element = splittedCodeSymbolName[index];
            if (index === 0) {
                accumulator = element;
            } else {
                accumulator = `${element}.${accumulator}`;
            }
            if (accumulator === codeNode.symbolName) {
                return true;
            }
        }
    });

    if (!newCodeSymbolNode) {
        return 1;
    }

    const prompt = generateTestExecutionPrompt(
        "jest",
        testPlan.imports,
        codeSymbolNameMaybe,
        newCodeSymbolNode.codeSnippet.code,
        testPlan.planForTestScriptGeneration,
        testPlan.testScript,
    );

    const messages = [...previousMessages];
    messages.push({
        content: prompt,
        role: ChatCompletionRequestMessageRoleEnum.User,
    });
    const response = await generateChatCompletion(messages);
    const testSetupFinalResult = parseTestExecutionFinalSetupResponse(
        response?.message?.content ?? "",
    );

    if (!testSetupFinalResult) {
        return 1;
    }

    // Now we write to the file so we can test it out
    await writeFileContents(
        testPlan.testFileLocation,
        testSetupFinalResult?.testScript ?? "",
    );

    console.log("Whats the test plan");
    console.log(testPlan);
    console.log('======');

    // Send out the file save event
    toolingEventCollection.saveFileEvent(
        testPlan.testFileLocation,
        codeSymbolNameMaybe,
        executionEventId,
    );

    // Now we are going to execute the test harness here using "jest" command
    const { stdout, stderr, exitCode } = await runCommandAsync(
        workingDirectory,
        "jest",
        [testPlan.testFileLocation],
    );

    // Now send a terminal event about this
    toolingEventCollection.terminalEvent(
        codeSymbolNameMaybe,
        testPlan.testFileLocation,
        stdout,
        stderr,
        exitCode,
        ["jest", testPlan.testFileLocation],
        executionEventId,
    );
    return exitCode;
};
