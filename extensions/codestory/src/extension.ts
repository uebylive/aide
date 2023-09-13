/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commands, env, ExtensionContext, interactive, ProgressLocation, TextDocument, window, workspace } from 'vscode';
import { EventEmitter } from 'events';
import winston from 'winston';

import { loadOrSaveToStorage } from './storage/types';
import { getProject } from './utilities/parseTypescript';
import logger from './logger';
import { CodeGraph, generateCodeGraph } from './codeGraph/graph';
import { EmbeddingsSearch } from './searchIndex/embeddingsSearch';
import postHogClient from './posthog/client';
import { CodeStoryViewProvider } from './providers/codeStoryView';
import { healthCheck } from './subscriptions/health';
import { openFile, search } from './subscriptions/search';
import { TrackCodeSymbolChanges } from './activeChanges/trackCodeSymbolChanges';
import { FILE_SAVE_TIME_PERIOD, TimeKeeper } from './subscriptions/timekeeper';
import { fileStateFromPreviousCommit } from './activeChanges/fileStateFromPreviousCommit';
import { CodeBlockChangeDescriptionGenerator } from './activeChanges/codeBlockChangeDescriptionGenerator';
import { triggerCodeSymbolChange } from './activeChanges/timeline';
import { gitCommit } from './subscriptions/gitCommit';
import { getFilesTrackedInWorkingDirectory, getGitCurrentHash, getGitRepoName } from './git/helper';
import { debug } from './subscriptions/debug';
import { copySettings } from './utilities/copySettings';
import { readActiveDirectoriesConfiguration, readTestSuiteRunCommand } from './utilities/activeDirectories';
import { startAidePythonBackend } from './utilities/setupAntonBackend';
import { PythonServer } from './utilities/pythonServerClient';
import { activateExtensions, getExtensionsInDirectory } from './utilities/activateLSP';
import { CSChatProvider } from './providers/chatprovider';
import { ActiveFilesTracker } from './activeChanges/activeFilesTracker';
import { GoLangParser } from './languages/goCodeSymbols';
import { CodeSymbolInformationEmbeddings } from './utilities/types';
import { CodeSymbolsLanguageCollection } from './languages/codeSymbolsLanguageCollection';
import { getUniqueId } from './utilities/uniqueId';
import { SearchIndexCollection } from './searchIndex/collection';
import { DocumentSymbolBasedIndex } from './searchIndex/documentSymbolRepresenatation';


class ProgressiveTrackSymbols {
	private emitter: EventEmitter;

	constructor() {
		this.emitter = new EventEmitter();
	}

	async onLoadFromLastCommit(
		trackCodeSymbolChanges: TrackCodeSymbolChanges,
		workingDirectory: string,
		logger: winston.Logger,
	) {
		const filesChangedFromLastCommit = await fileStateFromPreviousCommit(
			workingDirectory ?? '',
			logger,
		);

		for (const fileChanged of filesChangedFromLastCommit) {
			await trackCodeSymbolChanges.filesChangedSinceLastCommit(
				fileChanged.filePath,
				fileChanged.fileContent,
				this.emitter,
			);
		}
		trackCodeSymbolChanges.statusUpdated = true;
	}

	on(event: string, listener: (...args: any[]) => void) {
		this.emitter.on(event, listener);
	}
}


class ProgressiveGraphBuilder {
	private emitter: EventEmitter;

	constructor() {
		this.emitter = new EventEmitter();
	}

	async loadGraph(
		codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
		workingDirectory: string,
	) {
		await generateCodeGraph(
			codeSymbolsLanguageCollection,
			workingDirectory,
			this.emitter,
		);
	}

	on(event: string, listener: (...args: any[]) => void) {
		this.emitter.on(event, listener);
	}
}

// class ProgressiveIndexer {
// 	private emitter: EventEmitter;

// 	constructor() {
// 		this.emitter = new EventEmitter();
// 	}

// 	async indexRepository(
// 		storage: CodeStoryStorage,
// 		codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
// 		globalStorageUri: string,
// 		workingDirectory: string
// 	) {
// 		await window.withProgress(
// 			{
// 				location: ProgressLocation.Window,
// 				title: '[CodeStory] Indexing repository',
// 				cancellable: false,
// 			},
// 			async () => {
// 				await indexRepository(
// 					storage,
// 					codeSymbolsLanguageCollection,
// 					globalStorageUri,
// 					workingDirectory,
// 					this.emitter
// 				);
// 			}
// 		);
// 	}

// 	on(event: string, listener: (...args: any[]) => void) {
// 		this.emitter.on(event, listener);
// 	}
// }

export async function activate(context: ExtensionContext) {
	// Project root here
	const uniqueUserId = await getUniqueId();
	logger.info(`[CodeStory]: ${uniqueUserId} Activating extension with storage: ${context.globalStorageUri}`);
	postHogClient.capture({
		distinctId: await getUniqueId(),
		event: 'extension_activated',
	});
	let rootPath = workspace.rootPath;
	if (!rootPath) {
		rootPath = '';
	}
	if (rootPath === '') {
		window.showErrorMessage('Please open a folder in VS Code to use CodeStory');
		return;
	}
	// Activate the LSP extensions which are needed for things to work
	await activateExtensions(context, getExtensionsInDirectory(rootPath));
	const repoName = await getGitRepoName(
		rootPath,
	);
	const repoHash = await getGitCurrentHash(
		rootPath,
	);

	postHogClient.capture({
		distinctId: await getUniqueId(),
		event: 'activated_lsp',
		properties: {
			repoName,
			repoHash,
		}
	});

	// Setup python server here
	const serverUrl = await startAidePythonBackend(
		context.globalStorageUri.fsPath,
		rootPath,
		uniqueUserId,
	);
	const pythonServer = new PythonServer(serverUrl);
	// Setup golang parser here
	const goLangParser = new GoLangParser(rootPath ?? '');
	// Ts-morph project management
	const activeDirectories = readActiveDirectoriesConfiguration(rootPath);
	const extensionSet = getExtensionsInDirectory(rootPath);
	const projectManagement = await getProject(activeDirectories, extensionSet, rootPath);

	// Now setup the indexer collection
	const codeSymbolsLanguageCollection = new CodeSymbolsLanguageCollection();
	codeSymbolsLanguageCollection.addCodeIndexerForType('typescript', projectManagement);
	codeSymbolsLanguageCollection.addCodeIndexerForType('python', pythonServer);
	codeSymbolsLanguageCollection.addCodeIndexerForType('go', goLangParser);

	// Get the storage object here
	const codeStoryStorage = await loadOrSaveToStorage(context.globalStorageUri.fsPath, rootPath);
	logger.info(codeStoryStorage);
	logger.info(rootPath);
	// Active files tracker
	const activeFilesTracker = new ActiveFilesTracker();
	// Get the test-suite command
	const testSuiteRunCommand = readTestSuiteRunCommand();

	// Setup the search index collection
	const searchIndexCollection = new SearchIndexCollection(
		rootPath ?? '',
	);
	const embeddingsIndex = new EmbeddingsSearch(
		activeFilesTracker,
		codeSymbolsLanguageCollection,
		context.globalStorageUri.fsPath,
		repoName,
	);
	const documentSymbolIndex = new DocumentSymbolBasedIndex(
		repoName,
		context.globalStorageUri.fsPath,
	);
	searchIndexCollection.addIndexer(embeddingsIndex);
	searchIndexCollection.addIndexer(documentSymbolIndex);
	const filesToTrack = await getFilesTrackedInWorkingDirectory(rootPath ?? '');
	// This is a super fast step which just starts the indexing step
	await searchIndexCollection.startupIndexers(filesToTrack);


	// Register the semantic search command here
	commands.registerCommand('codestory.semanticSearch', async (prompt: string): Promise<CodeSymbolInformationEmbeddings[]> => {
		logger.info('[semanticSearch][extension] We are executing semantic search :' + prompt);
		postHogClient.capture({
			distinctId: await getUniqueId(),
			event: 'search',
			properties: {
				prompt,
				repoName,
				repoHash,
			},
		});
		const results = await embeddingsIndex.generateNodesForUserQuery(prompt);
		return results;
	});

	const progressiveGraphBuilder = new ProgressiveGraphBuilder();
	const codeGraph = new CodeGraph([]);
	progressiveGraphBuilder.on('partialData', (partialData) => {
		codeGraph.addNodes(partialData);
	});
	await progressiveGraphBuilder.loadGraph(
		codeSymbolsLanguageCollection,
		rootPath,
	);

	// Register chat provider
	const chatProvider = new CSChatProvider(
		rootPath, codeGraph, repoName, repoHash,
		embeddingsIndex, codeSymbolsLanguageCollection,
		testSuiteRunCommand, activeFilesTracker, uniqueUserId,
	);
	const interactiveSession = interactive.registerInteractiveSessionProvider(
		'cs-chat', chatProvider
	);
	context.subscriptions.push(interactiveSession);
	await commands.executeCommand('workbench.action.chat.clear');
	await commands.executeCommand('workbench.action.toggleHoverChat.cs-chat');

	context.subscriptions.push(
		debug(
			// TODO(codestory): Fix this properly later on
			chatProvider,
			embeddingsIndex,
			codeSymbolsLanguageCollection,
			codeGraph,
			repoName,
			repoHash,
			rootPath ?? '',
			testSuiteRunCommand,
			activeFilesTracker,
			uniqueUserId,
		)
	);

	// Create the copy settings from vscode command for the extension
	const registerCopySettingsCommand = commands.registerCommand(
		'webview.copySettings',
		async () => {
			await copySettings(rootPath ?? '', logger);
		}
	);

	// Register the codestory view provider
	// Create a new CodeStoryViewProvider instance and register it with the extension's context
	const provider = new CodeStoryViewProvider(context.extensionUri, new Date());
	context.subscriptions.push(
		window.registerWebviewViewProvider(CodeStoryViewProvider.viewType, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		})
	);

	// Now we want to register the HC
	context.subscriptions.push(
		healthCheck(
			context,
			provider,
			repoName,
			repoHash,
			uniqueUserId,
		)
	);
	commands.executeCommand('codestory.healthCheck');

	// We register the search command
	// Semantic search
	context.subscriptions.push(
		search(provider, embeddingsIndex, repoName, repoHash, uniqueUserId),
		openFile(logger)
	);

	const trackCodeSymbolChanges = new TrackCodeSymbolChanges(
		projectManagement,
		pythonServer,
		goLangParser,
		rootPath ?? '',
		logger
	);
	logger.info('[check 6]We are over here');
	const timeKeeperFileSaved = new TimeKeeper(FILE_SAVE_TIME_PERIOD);
	const codeBlockDescriptionGenerator = new CodeBlockChangeDescriptionGenerator(logger);
	logger.info('[check 7]We are over here');
	const progressiveTrackSymbolsOnLoad = new ProgressiveTrackSymbols();
	progressiveTrackSymbolsOnLoad.on('fileChanged', (fileChangedEvent) => {
		trackCodeSymbolChanges.setFileOpenedCodeSymbolTracked(
			fileChangedEvent.filePath,
			fileChangedEvent.codeSymbols
		);
	});
	await progressiveTrackSymbolsOnLoad.onLoadFromLastCommit(
		trackCodeSymbolChanges,
		rootPath ?? '',
		logger,
	);
	logger.info('[check 9]We are over here');

	// Also track the documents when they were last opened
	// context.subscriptions.push(
	workspace.onDidOpenTextDocument(async (doc) => {
		const uri = doc.uri;
		await trackCodeSymbolChanges.fileOpened(uri, logger);
	});

	logger.info('[check 10]We are over here');

	// Now we parse the documents on save as well
	context.subscriptions.push(
		workspace.onDidSaveTextDocument(async (doc) => {
			const uri = doc.uri;
			const fsPath = doc.uri.fsPath;
			await trackCodeSymbolChanges.fileSaved(uri, logger);
			await triggerCodeSymbolChange(
				provider,
				trackCodeSymbolChanges,
				timeKeeperFileSaved,
				fsPath,
				codeBlockDescriptionGenerator,
				logger
			);
		})
	);

	// Add git commit to the subscriptions here
	// Git commit
	context.subscriptions.push(gitCommit(logger, repoName, repoHash, uniqueUserId));
	context.subscriptions.push(registerCopySettingsCommand);

	// Listen for document opened events
	workspace.onDidOpenTextDocument((document: TextDocument) => {
		activeFilesTracker.openTextDocument(document);
	});

	// Listen for document closed events
	workspace.onDidCloseTextDocument((document: TextDocument) => {
		activeFilesTracker.onCloseTextDocument(document);
	});

	// Listen for active editor change events (user navigating between files)
	window.onDidChangeActiveTextEditor((editor) => {
		activeFilesTracker.onDidChangeActiveTextEditor(editor);
	});
}
