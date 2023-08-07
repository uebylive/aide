import { Project } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

import {
    CodeStoryStorage,
    saveCodeStoryStorageObjectToStorage,
    saveCodeStoryStorageToStorage,
} from "./types";
import { CodeSymbolInformation, CodeSymbolInformationEmbeddings } from "../utilities/types";
import { TSMorphProjectManagement, parseFileUsingTsMorph } from "../utilities/parseTypescript";
import { generateEmbedding } from "../llm/embeddings/openai";
import { ExtensionContext } from "vscode";
import { getGitCurrentHash, getGitRepoName } from "../git/helper";
import logger from "../logger";
// import logger from "../logger";

async function ensureDirectoryExists(filePath: string): Promise<void> {
    const parentDir = path.dirname(filePath);

    if (fs.existsSync(parentDir)) {
        // The parent directory already exists, so we don't need to create it
        return;
    }

    // Recursively create the parent directory
    await ensureDirectoryExists(parentDir);

    // Create the directory
    fs.mkdirSync(parentDir);
}

const generateContextForEmbedding = (
    codeSnippet: string,
    filePath: string,
    scopePart: string | null
): string => {
    return `
        Code snippet:
        ${codeSnippet}
        
        File path it belongs to:
        ${filePath}
        
        Scope part:
        ${scopePart}
    `;
};

export async function storeCodeSymbolDescriptionToLocalStorage(
    codeSymbolName: string,
    remoteSession: string,
    globalStorageUri: string,
    data: CodeSymbolInformationEmbeddings
) {
    const filePath = path.join(
        globalStorageUri,
        remoteSession,
        "code_symbol",
        "descriptions",
        codeSymbolName
    );
    await ensureDirectoryExists(filePath);
    console.log("Writing to file: " + filePath);
    // Now we have ensured the directory exists we can safely write to it
    await fs.promises
        .writeFile(filePath, JSON.stringify(data))
        .then(() => {
            console.log("Successfully wrote file: " + filePath);
        })
        .catch((err) => {
            console.error("Error writing file: " + err.toString());
        });
}


export async function loadCodeSymbolDescriptionFromLocalStorage(
    globalStorageUri: string,
    remoteSession: string,
): Promise<CodeSymbolInformationEmbeddings[]> {
    const directoryPath = path.join(
        globalStorageUri,
        remoteSession,
        "code_symbol",
        "descriptions",
    );
    const files = await fs.promises.readdir(directoryPath);
    logger.info("[indexing_start] loading from files");
    logger.info(files.length);
    const codeSymbolInformationEmbeddingsList: CodeSymbolInformationEmbeddings[] = [];
    for (let index = 0; index < files.length; index++) {
        const file = files[index];
        logger.info(index);
        logger.info(file);
        const filePath = path.join(directoryPath, file);
        logger.info(filePath);
        const fileContent = fs.readFileSync(filePath);
        logger.info("[indexing_start] loaded from file");
        try {
            const codeSymbolInformationEmbeddings = JSON.parse(fileContent.toString()) as CodeSymbolInformationEmbeddings;
            logger.info("[indexing_start] parsed from json");
            codeSymbolInformationEmbeddingsList.push(codeSymbolInformationEmbeddings);
        } catch (error) {
            logger.info("[indexing_start] error");
            logger.info(error);
        }
    }
    logger.info("[indexing_start] loaded from files");
    return codeSymbolInformationEmbeddingsList;
}

export const getCodeSymbolList = async (
    project: Project,
    workingDirectory: string
): Promise<CodeSymbolInformation[]> => {
    const sourceFiles = project.getSourceFiles();
    const codeSymbolInformationList: CodeSymbolInformation[] = [];
    for (let index = 0; index < sourceFiles.length; index++) {
        const sourceFile = sourceFiles[index];
        const sourceFilePath = sourceFile.getFilePath();
        const codeSymbolInformation = parseFileUsingTsMorph(
            sourceFilePath,
            project,
            workingDirectory,
            sourceFilePath
        );
        codeSymbolInformationList.push(...codeSymbolInformation);
    }
    return codeSymbolInformationList;
};

const generateAndStoreEmbeddings = async (
    codeSymbolInformationList: CodeSymbolInformation[],
    workingDirectory: string,
    globalStorageUri: string
): Promise<CodeSymbolInformationEmbeddings[]> => {
    const codeSymbolWithEmbeddings: CodeSymbolInformationEmbeddings[] = [];
    for (let index = 0; index < codeSymbolInformationList.length; index++) {
        const codeSymbol = codeSymbolInformationList[index];
        const codeContent = codeSymbol.codeSnippet.code;
        const filePath = codeSymbol.fsFilePath;
        const scopePart = codeSymbol.globalScope;
        const relativePath = filePath.replace(workingDirectory, "");
        const contextForEmbedding = generateContextForEmbedding(codeContent, relativePath, scopePart);
        // We generate the embeddings here
        const embeddings = await generateEmbedding(contextForEmbedding);
        codeSymbolWithEmbeddings.push({
            codeSymbolInformation: codeSymbol,
            codeSymbolEmbedding: embeddings,
        });
        // We store it locally to our local storage
        await storeCodeSymbolDescriptionToLocalStorage(
            codeSymbol.symbolName,
            await getGitRepoName(workingDirectory),
            globalStorageUri,
            {
                codeSymbolInformation: codeSymbol,
                codeSymbolEmbedding: embeddings,
            }
        );
    }
    return codeSymbolWithEmbeddings;
};


export const indexRepository = async (
    storage: CodeStoryStorage,
    projectManagement: TSMorphProjectManagement,
    globalStorageUri: string,
    workingDirectory: string
): Promise<CodeSymbolInformationEmbeddings[]> => {
    // One way to do this would be that we walk along the whole repo and index
    // it
    // After which is the repo is already indexed, then we should figure out
    // how to take care of deletions and moved files, these are the most important
    // ones
    // TODO(codestory): We need to only look at the changes later and index them
    // for now this is fine.
    let codeSymbolWithEmbeddings: CodeSymbolInformationEmbeddings[] = [];
    logger.info("[indexing_start] Starting indexing", storage.isIndexed);
    if (!storage.isIndexed) {
        // logger.info("[indexing_start] Starting indexing");
        // Start re-indexing right now.
        projectManagement.directoryToProjectMapping.forEach(async (project, workingDirectory) => {
            const codeSymbolInformationList = await getCodeSymbolList(project, workingDirectory);
            const codeSymbolWithEmbeddingsForProject = await generateAndStoreEmbeddings(
                codeSymbolInformationList,
                workingDirectory,
                globalStorageUri
            );
            codeSymbolWithEmbeddings.push(...codeSymbolWithEmbeddingsForProject);
        });
        storage.lastIndexedRepoHash = await getGitCurrentHash(workingDirectory);
        storage.isIndexed = true;
        saveCodeStoryStorageObjectToStorage(globalStorageUri, storage, workingDirectory);
    } else {
        // TODO(codestory): Only look at the delta and re-index these files which have changed.
        const currentHash = await getGitCurrentHash(workingDirectory);
        logger.info("[indexing_start] hash for current checkout");
        logger.info(currentHash);
        logger.info(storage.lastIndexedRepoHash);
        if (currentHash !== storage.lastIndexedRepoHash) {
            // We need to re-index the repo
            // TODO(codestory): Repeated code here, we need to clean it up
            projectManagement.directoryToProjectMapping.forEach(async (project, workingDirectory) => {
                const codeSymbolInformationList = await getCodeSymbolList(project, workingDirectory);
                logger.info("[indexing_start] Starting indexing for project");
                const codeSymbolWithEmbeddingsForProject = await generateAndStoreEmbeddings(
                    codeSymbolInformationList,
                    workingDirectory,
                    globalStorageUri
                );
                codeSymbolWithEmbeddings.push(...codeSymbolWithEmbeddingsForProject);
            });
            storage.lastIndexedRepoHash = await getGitCurrentHash(workingDirectory);
            storage.isIndexed = true;
            saveCodeStoryStorageObjectToStorage(globalStorageUri, storage, workingDirectory);
        } else {
            // We should load all the code symbols with embeddings from the local storage
            // and return it
            const repoName = await getGitRepoName(workingDirectory);
            logger.info("[indexing_start] Loading from local storage");
            codeSymbolWithEmbeddings = await loadCodeSymbolDescriptionFromLocalStorage(
                globalStorageUri,
                repoName,
            );
            logger.info("[indexing_start] Loaded from local storage");
        }
    }
    return codeSymbolWithEmbeddings;
};
