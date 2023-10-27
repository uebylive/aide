/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { arc, commands, ExtensionContext, interactive, TextDocument, window, workspace } from 'vscode';
import { EventEmitter } from 'events';
import winston from 'winston';

import { loadOrSaveToStorage } from './storage/types';
import { getProject } from './utilities/parseTypescript';
import logger from './logger';
import { CodeGraph } from './codeGraph/graph';
import postHogClient from './posthog/client';
import { CodeStoryViewProvider } from './providers/codeStoryView';
import { healthCheck } from './subscriptions/health';
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
import { activateExtensions, getExtensionsInDirectory } from './utilities/activateLSP';
import { CSChatProvider } from './providers/chatprovider';
import { ActiveFilesTracker } from './activeChanges/activeFilesTracker';
import { GoLangParser } from './languages/goCodeSymbols';
import { CodeSymbolInformationEmbeddings } from './utilities/types';
import { CodeSymbolsLanguageCollection } from './languages/codeSymbolsLanguageCollection';
import { getUniqueId } from './utilities/uniqueId';
import { LanguageParser } from './languages/languageCodeSymbols';
import { readCustomSystemInstruction } from './utilities/systemInstruction';
import { RepoRef, RepoRefBackend, SideCarClient } from './sidecar/client';
import { readSideCarURL } from './utilities/sidecarUrl';
import { startSidecarBinary } from './utilities/setupSidecarBinary';
import { CSInteractiveEditorSessionProvider } from './providers/editorSessionProvider';


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
		window.showErrorMessage('Please open a folder in Aide to use CodeStory');
		return;
	}
	const agentSystemInstruction = readCustomSystemInstruction();
	if (agentSystemInstruction === null) {
		window.showInformationMessage(
			'Aide can help you better if you give it custom instructions by going to your settings and setting it in aide.systemInstruction (search for this string in User Settings) and reload vscode for this to take effect by doing Cmd+Shift+P: Developer: Reload Window'
		);
	}
	// Activate the LSP extensions which are needed for things to work
	await activateExtensions(context, getExtensionsInDirectory(rootPath));

	// Now we get all the required information and log it
	const repoName = await getGitRepoName(
		rootPath,
	);
	const repoHash = await getGitCurrentHash(
		rootPath,
	);

	// TODO(codestory): Download the rust binary here appropriate for the platform
	// we are on. Similar to how we were doing for Aide binary

	postHogClient.capture({
		distinctId: await getUniqueId(),
		event: 'activated_lsp',
		properties: {
			repoName,
			repoHash,
		}
	});

	// Setup the sidecar client here
	const sidecarUrl = await startSidecarBinary(context.globalStorageUri.fsPath);
	window.showInformationMessage(`Sidecar binary 🦀 started at ${sidecarUrl}`);
	const sidecarClient = new SideCarClient(sidecarUrl);
	// Setup the current repo representation here
	const currentRepo = new RepoRef(
		// We assume the root-path is the one we are interested in
		rootPath,
		RepoRefBackend.local,
	);
	await sidecarClient.indexRepositoryIfNotInvoked(currentRepo);

	// Setup python language parser
	const pythonLanguageParser = new LanguageParser(
		rootPath ?? '',
		'python',
		['py'],
	);
	// Setup golang parser here
	const goLangParser = new GoLangParser(rootPath ?? '');
	// Ts-morph project management
	const activeDirectories = readActiveDirectoriesConfiguration(rootPath);
	const extensionSet = getExtensionsInDirectory(rootPath);
	const projectManagement = await getProject(activeDirectories, extensionSet, rootPath);

	// Now setup the indexer collection
	const codeSymbolsLanguageCollection = new CodeSymbolsLanguageCollection();
	codeSymbolsLanguageCollection.addCodeIndexerForType('typescript', projectManagement);
	codeSymbolsLanguageCollection.addCodeIndexerForType('python', pythonLanguageParser);
	codeSymbolsLanguageCollection.addCodeIndexerForType('go', goLangParser);

	// Get the storage object here
	const codeStoryStorage = await loadOrSaveToStorage(context.globalStorageUri.fsPath, rootPath);
	logger.info(codeStoryStorage);
	logger.info(rootPath);
	// Active files tracker
	const activeFilesTracker = new ActiveFilesTracker();
	// Get the test-suite command
	const testSuiteRunCommand = readTestSuiteRunCommand();


	const filesToTrack = await getFilesTrackedInWorkingDirectory(rootPath ?? '');

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
		// We should be using the searchIndexCollection instead here, but for now
		// embedding search is fine
		// Here we will ping the semantic client instead so we can get the results
		const results = await sidecarClient.getSemanticSearchResult(prompt, currentRepo);
		return results;
	});

	const codeGraph = new CodeGraph(
		activeFilesTracker,
		codeSymbolsLanguageCollection,
		context.globalStorageUri.fsPath,
		repoName,
		rootPath ?? '',
	);
	codeGraph.loadGraph(filesToTrack);

	// Register chat provider
	const chatProvider = new CSChatProvider(
		rootPath, codeGraph, repoName, repoHash,
		codeSymbolsLanguageCollection,
		testSuiteRunCommand, activeFilesTracker, uniqueUserId,
		agentSystemInstruction, sidecarClient, currentRepo,
	);
	const interactiveEditorSessionProvider = new CSInteractiveEditorSessionProvider(sidecarClient, currentRepo, rootPath ?? '');
	const interactiveSession = interactive.registerInteractiveSessionProvider(
		'cs-chat', chatProvider
	);
	const interactiveEditorSession = interactive.registerInteractiveEditorSessionProvider(
		interactiveEditorSessionProvider,
	);
	context.subscriptions.push(interactiveEditorSession);
	context.subscriptions.push(interactiveSession);
	await commands.executeCommand('workbench.action.chat.clear');
	await commands.executeCommand('workbench.action.toggleHoverChat.cs-chat');

	const arcProvider = arc.registerArcProvider('cs-arc', chatProvider);
	context.subscriptions.push(arcProvider);

	context.subscriptions.push(
		debug(
			// TODO(codestory): Fix this properly later on
			chatProvider,
			codeSymbolsLanguageCollection,
			sidecarClient,
			repoName,
			repoHash,
			rootPath ?? '',
			testSuiteRunCommand,
			activeFilesTracker,
			uniqueUserId,
			agentSystemInstruction,
			currentRepo,
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

	const trackCodeSymbolChanges = new TrackCodeSymbolChanges(
		codeSymbolsLanguageCollection,
		rootPath ?? '',
		logger
	);
	const timeKeeperFileSaved = new TimeKeeper(FILE_SAVE_TIME_PERIOD);

	// Keeps track of the symbols which are changing and creates a graph of
	// those changes
	const progressiveTrackSymbolsOnLoad = new ProgressiveTrackSymbols();
	progressiveTrackSymbolsOnLoad.on('fileChanged', (fileChangedEvent) => {
		trackCodeSymbolChanges.setFileOpenedCodeSymbolTracked(
			fileChangedEvent.filePath,
			fileChangedEvent.codeSymbols
		);
	});
	progressiveTrackSymbolsOnLoad.onLoadFromLastCommit(
		trackCodeSymbolChanges,
		rootPath ?? '',
		logger,
	);

	// Also track the documents when they were last opened
	// context.subscriptions.push(
	workspace.onDidOpenTextDocument(async (doc) => {
		const uri = doc.uri;
		await trackCodeSymbolChanges.fileOpened(uri, logger);
	});

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
				new CodeBlockChangeDescriptionGenerator(logger),
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
