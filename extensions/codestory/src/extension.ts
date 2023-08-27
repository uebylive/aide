/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commands, env, ExtensionContext, interactive, ProgressLocation, TextDocument, window, workspace } from 'vscode';
import { EventEmitter } from 'events';
import winston from 'winston';

import { CodeStoryStorage, loadOrSaveToStorage } from './storage/types';
import { indexRepository } from './storage/indexer';
import { getProject, TSMorphProjectManagement } from './utilities/parseTypescript';
import logger from './logger';
import { CodeGraph, generateCodeGraph } from './codeGraph/graph';
import { EmbeddingsSearch } from './codeGraph/embeddingsSearch';
import postHogClient from './posthog/client';
import { AgentViewProvider } from './providers/AgentView';
import { CodeStoryViewProvider } from './providers/codeStoryView';
import { healthCheck } from './subscriptions/health';
import { openFile, search } from './subscriptions/search';
import { TrackCodeSymbolChanges } from './activeChanges/trackCodeSymbolChanges';
import { FILE_SAVE_TIME_PERIOD, TimeKeeper } from './subscriptions/timekeeper';
import { fileStateFromPreviousCommit } from './activeChanges/fileStateFromPreviousCommit';
import { CodeBlockChangeDescriptionGenerator } from './activeChanges/codeBlockChangeDescriptionGenerator';
import { triggerCodeSymbolChange } from './activeChanges/timeline';
import { gitCommit } from './subscriptions/gitCommit';
import { getGitCurrentHash, getGitRepoName } from './git/helper';
import { debug } from './subscriptions/debug';
import { copySettings } from './utilities/copySettings';
import { readActiveDirectoriesConfiguration, readTestSuiteRunCommand } from './utilities/activeDirectories';
import { startAidePythonBackend } from './utilities/setupAntonBackend';
import { PythonServer } from './utilities/pythonServerClient';
import { activateExtensions, getExtensionsInDirectory } from './utilities/activateLSP';
import { sendTestSuiteRunCommand } from './utilities/sendTestSuiteCommandPresent';
import { CSChatProvider } from './providers/chatprovider';
import { ActiveFilesTracker } from './activeChanges/activeFilesTracker';
import { GoLangParser } from './languages/goCodeSymbols';
import { CodeSymbolInformationEmbeddings } from './utilities/types';


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
		projectManagement: TSMorphProjectManagement,
		pythonServer: PythonServer,
		goLangParser: GoLangParser,
		workingDirectory: string,
	) {
		await generateCodeGraph(
			projectManagement,
			pythonServer,
			goLangParser,
			workingDirectory,
			this.emitter,
		);
	}

	on(event: string, listener: (...args: any[]) => void) {
		this.emitter.on(event, listener);
	}
}

class ProgressiveIndexer {
	private emitter: EventEmitter;

	constructor() {
		this.emitter = new EventEmitter();
	}

	async indexRepository(
		storage: CodeStoryStorage,
		projectManagement: TSMorphProjectManagement,
		pythonServer: PythonServer,
		goLangParser: GoLangParser,
		globalStorageUri: string,
		workingDirectory: string
	) {
		await window.withProgress(
			{
				location: ProgressLocation.Window,
				title: '[CodeStory] Indexing repository',
				cancellable: false,
			},
			async () => {
				await indexRepository(
					storage,
					projectManagement,
					pythonServer,
					goLangParser,
					globalStorageUri,
					workingDirectory,
					this.emitter
				);
			}
		);
	}

	on(event: string, listener: (...args: any[]) => void) {
		this.emitter.on(event, listener);
	}
}

export async function activate(context: ExtensionContext) {
	// Project root here
	postHogClient.capture({
		distinctId: env.machineId,
		event: "extension_activated",
	});
	let rootPath = workspace.rootPath;
	if (!rootPath) {
		rootPath = "";
	}
	if (rootPath === "") {
		window.showErrorMessage("Please open a folder in VS Code to use CodeStory");
		return;
	}
	await activateExtensions(context, getExtensionsInDirectory(rootPath));
	const repoName = await getGitRepoName(
		rootPath,
	);
	const repoHash = await getGitCurrentHash(
		rootPath,
	);


	// Register chat provider
	const interactiveSession = interactive.registerInteractiveSessionProvider('cs-chat', new CSChatProvider(rootPath, repoName, repoHash));
	context.subscriptions.push(interactiveSession);
	await commands.executeCommand('workbench.action.chat.clear');

	// Register the agent view provider
	const agentViewProvider = new AgentViewProvider(context.extensionUri);
	context.subscriptions.push(
		window.registerWebviewViewProvider(AgentViewProvider.viewType, agentViewProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		})
	);

	// Create the copy settings from vscode command for the extension
	const openAgentViewCommand = commands.registerCommand(
		'codestory.launchAgent',
		async (prompt: string) => {
			agentViewProvider.show();
			await agentViewProvider.getView()?.webview.postMessage({
				command: 'launchAgent',
				payload: { prompt }
			});
		}
	);
	context.subscriptions.push(openAgentViewCommand);

	// Setup python server here
	const serverUrl = await startAidePythonBackend(
		context.globalStorageUri.fsPath,
		rootPath,
	);
	const pythonServer = new PythonServer(serverUrl);
	const goLangParser = new GoLangParser(rootPath ?? '');

	// Get the storage object here
	const codeStoryStorage = await loadOrSaveToStorage(context.globalStorageUri.fsPath, rootPath);
	logger.info(codeStoryStorage);
	logger.info(rootPath);
	// Ts-morph project management
	const activeDirectories = readActiveDirectoriesConfiguration(rootPath);
	const testSuiteRunCommand = readTestSuiteRunCommand();
	logger.info(activeDirectories);
	const extensionSet = getExtensionsInDirectory(rootPath);
	const projectManagement = await getProject(activeDirectories, extensionSet, rootPath);
	// Active files tracker
	const activeFilesTracker = new ActiveFilesTracker();

	// Create an instance of the progressive indexer
	const indexer = new ProgressiveIndexer();
	const embeddingsIndex = new EmbeddingsSearch([]);
	indexer.on('partialData', (partialData) => {
		embeddingsIndex.updateNodes(partialData);
	});
	indexer.indexRepository(
		codeStoryStorage,
		projectManagement,
		pythonServer,
		goLangParser,
		context.globalStorageUri.fsPath,
		rootPath,
	);


	// Register the semantic search command here
	commands.registerCommand('codestory.semanticSearch', async (prompt: string): Promise<CodeSymbolInformationEmbeddings[]> => {
		logger.info('[semanticSearch][extension] We are executing semantic search :' + prompt);
		const results = await embeddingsIndex.generateNodesForUserQuery(prompt, activeFilesTracker);
		return results;
	});

	const progressiveGraphBuilder = new ProgressiveGraphBuilder();
	const codeGraph = new CodeGraph([]);
	progressiveGraphBuilder.on('partialData', (partialData) => {
		codeGraph.addNodes(partialData);
	});
	progressiveGraphBuilder.loadGraph(
		projectManagement,
		pythonServer,
		goLangParser,
		rootPath,
	);

	context.subscriptions.push(
		debug(
			// TODO(codestory): Fix this properly later on
			agentViewProvider,
			embeddingsIndex,
			projectManagement,
			pythonServer,
			codeGraph,
			repoName,
			repoHash,
			rootPath ?? '',
			testSuiteRunCommand,
			activeFilesTracker,
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
	context.subscriptions.push(healthCheck(context, provider, repoName, repoHash));
	commands.executeCommand('codestory.healthCheck');

	// We register the search command
	// Semantic search
	context.subscriptions.push(
		search(provider, embeddingsIndex, repoName, repoHash),
		openFile(logger)
	);

	const trackCodeSymbolChanges = new TrackCodeSymbolChanges(
		projectManagement,
		pythonServer,
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
	// progressiveTrackSymbolsOnLoad.onLoadFromLastCommit(
	//   trackCodeSymbolChanges,
	//   rootPath ?? ',
	//   logger,
	// );
	logger.info('[check 9]We are over here');

	// Also track the documents when they were last opened
	context.subscriptions.push(
		workspace.onDidOpenTextDocument(async (doc) => {
			const uri = doc.uri;
			await trackCodeSymbolChanges.fileOpened(uri, logger);
		})
	);

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

	// const filePath = '/Users/skcd/test_repo/cli/pkg/cmd/org/org.go';
	// const symbols = await getSymbolsFromDocumentUsingLSP(
	// 	'/Users/skcd/Downloads/mugavari-main/internal/pkg/health/heartbeat.go',
	// 	'golang',
	// 	rootPath ?? '',
	// );
	// logger.info(symbols);
	// fs.writeFileSync('/tmp/documentSymbolsSomething', JSON.stringify(symbols), 'utf-8');
	// await parseDependenciesForCodeSymbols(
	// 	filePath,
	// 	rootPath ?? '',
	// );

	// Add git commit to the subscriptions here
	// Git commit
	context.subscriptions.push(gitCommit(logger, repoName, repoHash));
	context.subscriptions.push(registerCopySettingsCommand);
	// Set the test run command here
	sendTestSuiteRunCommand(testSuiteRunCommand, agentViewProvider);

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
