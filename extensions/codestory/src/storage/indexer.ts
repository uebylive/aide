/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Project } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';

import {
	CodeStoryStorage,
	saveCodeStoryStorageObjectToStorage,
	saveCodeStoryStorageToStorage,
} from './types';
import { CodeSymbolInformation, CodeSymbolInformationEmbeddings } from '../utilities/types';
import { TSMorphProjectManagement, parseFileUsingTsMorph } from '../utilities/parseTypescript';
import { generateEmbedding } from '../llm/embeddings/openai';
import { ExtensionContext, Uri, languages, workspace } from 'vscode';
import { getFilesTrackedInWorkingDirectory, getGitCurrentHash, getGitRepoName } from '../git/helper';
import logger from '../logger';
import EventEmitter = require('events');
import { generateContextForEmbedding } from '../utilities/embeddingsHelpers';
import { PythonServer } from '../utilities/pythonServerClient';
import { GoLangParser } from '../languages/goCodeSymbols';
// import logger from '../logger';

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

export async function storeCodeSymbolDescriptionToLocalStorage(
	codeSymbolName: string,
	remoteSession: string,
	globalStorageUri: string,
	data: CodeSymbolInformationEmbeddings
) {
	const filePath = path.join(
		globalStorageUri,
		remoteSession,
		'code_symbol',
		'descriptions',
		codeSymbolName
	);
	await ensureDirectoryExists(filePath);
	console.log('Writing to file: ' + filePath);
	// Now we have ensured the directory exists we can safely write to it
	await fs.promises
		.writeFile(filePath, JSON.stringify(data))
		.then(() => {
			console.log('Successfully wrote file: ' + filePath);
		})
		.catch((err) => {
			console.error('Error writing file: ' + err.toString());
		});
}


export async function loadCodeSymbolDescriptionFromLocalStorage(
	globalStorageUri: string,
	remoteSession: string,
	emitter: EventEmitter,
): Promise<CodeSymbolInformationEmbeddings[]> {
	const directoryPath = path.join(
		globalStorageUri,
		remoteSession,
		'code_symbol',
		'descriptions',
	);
	const files = await fs.promises.readdir(directoryPath);
	const codeSymbolInformationEmbeddingsList: CodeSymbolInformationEmbeddings[] = [];
	for (let index = 0; index < files.length; index++) {
		const file = files[index];
		logger.info(index);
		logger.info(file);
		const filePath = path.join(directoryPath, file);
		logger.info(filePath);
		const fileContent = fs.readFileSync(filePath);
		try {
			const codeSymbolInformationEmbeddings = JSON.parse(fileContent.toString()) as CodeSymbolInformationEmbeddings;
			emitter.emit('partialData', codeSymbolInformationEmbeddings);
			codeSymbolInformationEmbeddingsList.push(codeSymbolInformationEmbeddings);
		} catch (error) {
			logger.info('[indexing_start] error');
			logger.info(error);
		}
	}
	logger.info('[indexing_start] loaded from files');
	return codeSymbolInformationEmbeddingsList;
}


export const getCodeSymbolList = async (
	project: Project,
	workingDirectory: string
): Promise<CodeSymbolInformation[]> => {
	const sourceFiles = project.getSourceFiles();
	const codeSymbolInformationList: CodeSymbolInformation[] = [];
	for (let index = 0; index < sourceFiles.length; index++) {
		console.log(`Parsing file ${index} of ${sourceFiles.length} value: ${sourceFiles[index].getFilePath()}`);
		try {
			const sourceFile = sourceFiles[index];
			const sourceFilePath = sourceFile.getFilePath();
			console.log(`[parsed_code_symbol_list] Got file ${index} of ${sourceFiles.length} value: ${sourceFiles[index].getFilePath()}`);
			const codeSymbolInformation = await parseFileUsingTsMorph(
				sourceFilePath,
				project,
				workingDirectory,
				sourceFilePath
			);
			console.log(`[parsed_code_symbol_list] Parsing complete ${index} of ${sourceFiles.length} value: ${sourceFiles[index].getFilePath()}`);
			codeSymbolInformationList.push(...codeSymbolInformation);
			console.log(`[parsed_code_symbol_list] Parsed file ${index} of ${sourceFiles.length} value: ${sourceFiles[index].getFilePath()}`);
		} catch (error) {
			console.log(`[parsed_code_symbol_list] Error parsing file ${index} of ${sourceFiles.length} value: ${sourceFiles[index].getFilePath()}`);
			console.log(error);
		}
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
		const relativePath = filePath.replace(workingDirectory, '');
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


const generateAndStoreEmbeddingsForGolangFiles = async (
	goLangParser: GoLangParser,
	workingDirectory: string,
	filesToTrack: string[],
	emitter: EventEmitter,
	globalStorageUri: string,
): Promise<CodeSymbolInformationEmbeddings[]> => {
	console.log('[golang] Generating symbols');
	const finalCodeSymbolWithEmbeddings: CodeSymbolInformationEmbeddings[] = [];
	for (let index = 0; index < filesToTrack.length; index++) {
		const filePath = filesToTrack[index];
		if (!filePath.endsWith('.go')) {
			continue;
		}
		logger.info('[golang][generateSymbols][without-dependency][indexer] ' + filePath);
		const _ = await goLangParser.parseFileWithoutDependency(
			filePath,
		);
		console.log('[golang][generateSymbols] ' + filePath);
	}

	for (let index = 0; index < filesToTrack.length; index++) {
		const filePath = filesToTrack[index];
		if (!filePath.endsWith('.go')) {
			continue;
		}
		logger.info('[golang][generateSymbols][with-dependency][indexer] ' + filePath);
		const codeSymbolsWithDependencies = await goLangParser.parseFileWithDependencies(
			filePath,
		);
		logger.info('[golang][generateSymbols][dependencies] ' + filePath);
		const codeSymbolsWithEmbeddings = await generateAndStoreEmbeddings(
			codeSymbolsWithDependencies,
			workingDirectory,
			globalStorageUri
		);
		codeSymbolsWithEmbeddings.forEach((codeSymbolsWithEmbeddings) => {
			emitter.emit('partialData', codeSymbolsWithEmbeddings);
		});
		finalCodeSymbolWithEmbeddings.push(...codeSymbolsWithEmbeddings);
	}
	return finalCodeSymbolWithEmbeddings;
};


const generateAndStoreEmbeddingsForPythonFiles = async (
	pythonClient: PythonServer,
	workingDirectory: string,
	filesToTrack: string[],
	emitter: EventEmitter,
	globalStorageUri: string,
): Promise<CodeSymbolInformationEmbeddings[]> => {
	const finalCodeSymbolWithEmbeddings: CodeSymbolInformationEmbeddings[] = [];
	for (let index = 0; index < filesToTrack.length; index++) {
		const filePath = filesToTrack[index];
		if (!filePath.endsWith('.py')) {
			continue;
		}
		const codeSymbols = await pythonClient.parseFile(
			filePath,
		);
		const codeSymbolWithEmbeddingsForProject = await generateAndStoreEmbeddings(
			codeSymbols,
			workingDirectory,
			globalStorageUri
		);
		codeSymbolWithEmbeddingsForProject.forEach((codeSymbolWithEmbeddings) => {
			emitter.emit('partialData', codeSymbolWithEmbeddings);
		});
		finalCodeSymbolWithEmbeddings.push(...codeSymbolWithEmbeddingsForProject);
	}
	return finalCodeSymbolWithEmbeddings;
};


const checkIfProjectWasIndexed = (
	globalStorageUri: string,
	remoteSession: string,
): boolean => {
	const directoryPath = path.join(
		globalStorageUri,
		remoteSession,
		'code_symbol',
		'descriptions',
	);
	if (fs.existsSync(directoryPath)) {
		return true;
	}
	return false;
};


export const indexRepository = async (
	storage: CodeStoryStorage,
	projectManagement: TSMorphProjectManagement,
	pythonClient: PythonServer,
	goLangParser: GoLangParser,
	globalStorageUri: string,
	workingDirectory: string,
	emitter: EventEmitter,
): Promise<CodeSymbolInformationEmbeddings[]> => {
	// One way to do this would be that we walk along the whole repo and index
	// it
	// After which is the repo is already indexed, then we should figure out
	// how to take care of deletions and moved files, these are the most important
	// ones
	// TODO(codestory): We need to only look at the changes later and index them
	// for now this is fine.
	const filesToTrack = await getFilesTrackedInWorkingDirectory(workingDirectory);
	let codeSymbolWithEmbeddings: CodeSymbolInformationEmbeddings[] = [];

	const repoName = await getGitRepoName(workingDirectory);
	logger.info('[indexing_start] Starting indexing', storage.isIndexed);
	// We also need to check if the storage directory exists, if it does not
	// then we have to retrigger the indexing again
	const wasProjectIndexed = checkIfProjectWasIndexed(
		globalStorageUri,
		repoName,
	);
	if (!storage.isIndexed || !wasProjectIndexed) {
		// logger.info('[indexing_start] Starting indexing');
		// Start re-indexing right now.
		for (const [workingDirectory, project] of projectManagement.directoryToProjectMapping) {
			const codeSymbolInformationList = await getCodeSymbolList(project, workingDirectory);
			const codeSymbolWithEmbeddingsForProject = await generateAndStoreEmbeddings(
				codeSymbolInformationList,
				workingDirectory,
				globalStorageUri
			);
			for (const codeSymbolWithEmbeddings of codeSymbolWithEmbeddingsForProject) {
				logger.info('[indexing_start] Starting indexing for project');
				logger.info(codeSymbolWithEmbeddings.codeSymbolInformation.symbolName);
				emitter.emit('partialData', codeSymbolWithEmbeddings);
			}
			codeSymbolWithEmbeddings.push(...codeSymbolWithEmbeddingsForProject);
		}
		// parse the python files
		const pythonSymbols = await generateAndStoreEmbeddingsForPythonFiles(
			pythonClient,
			workingDirectory,
			filesToTrack,
			emitter,
			globalStorageUri,
		);
		const goLangSymbols = await generateAndStoreEmbeddingsForGolangFiles(
			goLangParser,
			workingDirectory,
			filesToTrack,
			emitter,
			globalStorageUri,
		);
		codeSymbolWithEmbeddings.push(...goLangSymbols);
		codeSymbolWithEmbeddings.push(...pythonSymbols);
		storage.lastIndexedRepoHash = await getGitCurrentHash(workingDirectory);
		storage.isIndexed = true;
		await saveCodeStoryStorageObjectToStorage(globalStorageUri, storage, workingDirectory);
	} else {
		// TODO(codestory): Only look at the delta and re-index these files which have changed.
		const currentHash = await getGitCurrentHash(workingDirectory);
		logger.info('[indexing_start] hash for current checkout');
		logger.info(currentHash);
		logger.info(storage.lastIndexedRepoHash);
		if (currentHash !== storage.lastIndexedRepoHash) {
			// We need to re-index the repo
			// TODO(codestory): Repeated code here, we need to clean it up
			for (const [workingDirectory, project] of projectManagement.directoryToProjectMapping) {
				const codeSymbolInformationList = await getCodeSymbolList(project, workingDirectory);
				logger.info('[indexing_start] Starting indexing for project');
				const codeSymbolWithEmbeddingsForProject = await generateAndStoreEmbeddings(
					codeSymbolInformationList,
					workingDirectory,
					globalStorageUri
				);
				emitter.emit('partialData', codeSymbolWithEmbeddingsForProject);
				codeSymbolWithEmbeddings.push(...codeSymbolWithEmbeddingsForProject);
			}
			// parse the python files
			const pythonSymbols = await generateAndStoreEmbeddingsForPythonFiles(
				pythonClient,
				workingDirectory,
				filesToTrack,
				emitter,
				globalStorageUri,
			);
			const golangSymbols = await generateAndStoreEmbeddingsForGolangFiles(
				goLangParser,
				workingDirectory,
				filesToTrack,
				emitter,
				globalStorageUri,
			);
			codeSymbolWithEmbeddings.push(...golangSymbols);
			codeSymbolWithEmbeddings.push(...pythonSymbols);
			storage.lastIndexedRepoHash = await getGitCurrentHash(workingDirectory);
			storage.isIndexed = true;
			await saveCodeStoryStorageObjectToStorage(globalStorageUri, storage, workingDirectory);
		} else {
			// We should load all the code symbols with embeddings from the local storage
			// and return it
			logger.info('[indexing_start] Loading from local storage');
			codeSymbolWithEmbeddings = await loadCodeSymbolDescriptionFromLocalStorage(
				globalStorageUri,
				repoName,
				emitter,
			);
			logger.info('[indexing_start] Loaded from local storage');
		}
	}
	return codeSymbolWithEmbeddings;
};
