/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commands, ExtensionContext, interactive, TextDocument, window, workspace, languages, modelSelection, env } from 'vscode';

import { loadOrSaveToStorage } from './storage/types';
import logger from './logger';
import postHogClient from './posthog/client';
import { TrackCodeSymbolChanges } from './activeChanges/trackCodeSymbolChanges';
import { getGitCurrentHash, getGitRepoName } from './git/helper';
import { debug } from './subscriptions/debug';
import { copySettings } from './utilities/copySettings';
import { readTestSuiteRunCommand } from './utilities/activeDirectories';
import { activateExtensions, getExtensionsInDirectory } from './utilities/activateLSP';
import { ActiveFilesTracker } from './activeChanges/activeFilesTracker';
import { CodeSymbolInformationEmbeddings } from './utilities/types';
import { CodeSymbolsLanguageCollection } from './languages/codeSymbolsLanguageCollection';
import { getUniqueId, getUserId, shouldUseExactMatching } from './utilities/uniqueId';
import { readCustomSystemInstruction } from './utilities/systemInstruction';
import { RepoRef, RepoRefBackend, SideCarClient } from './sidecar/client';
import { startSidecarBinary } from './utilities/setupSidecarBinary';
import { CSInteractiveEditorSessionProvider } from './completions/providers/editorSessionProvider';
import { ProjectContext } from './utilities/workspaceContext';
import { CSChatAgentProvider, CSChatSessionProvider } from './completions/providers/chatprovider';
import { reportIndexingPercentage } from './utilities/reportIndexingUpdate';
import { getOpenAIApiKey } from './utilities/getOpenAIKey';
import { AideQuickFix } from './quickActions/fix';
import { aideCommands } from './inlineCompletion/commands';
import { startupStatusBar } from './inlineCompletion/statusBar';
import { createInlineCompletionItemProvider } from './completions/create-inline-completion-item-provider';
import { parseAllVisibleDocuments } from './completions/text-processing/treeSitter/parseTree';
import { changedActiveDocument, getRelevantFiles, shouldTrackFile } from './utilities/openTabs';


export async function activate(context: ExtensionContext) {
	// Project root here
	const uniqueUserId = getUniqueId();
	const userId = getUserId();
	console.log('User id:' + userId);
	logger.info(`[CodeStory]: ${uniqueUserId} Activating extension with storage: ${context.globalStorageUri}`);
	postHogClient?.capture({
		distinctId: getUniqueId(),
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
		console.log(
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
	const openAIKey = getOpenAIApiKey();

	// We also get some context about the workspace we are in and what we are
	// upto
	const projectContext = new ProjectContext();
	await projectContext.collectContext();

	postHogClient?.capture({
		distinctId: await getUniqueId(),
		event: 'activated_lsp',
		properties: {
			repoName,
			repoHash,
		}
	});

	// Get model selection configuration
	const modelConfiguration = await modelSelection.getConfiguration();
	const execPath = process.execPath;
	console.log('Exec path:' + execPath);
	console.log('Model configuration:' + JSON.stringify(modelConfiguration));
	// Setup the sidecar client here
	const sidecarUrl = await startSidecarBinary(context.globalStorageUri.fsPath, env.appRoot);
	// allow-any-unicode-next-line
	// window.showInformationMessage(`Sidecar binary 🦀 started at ${sidecarUrl}`);
	const sidecarClient = new SideCarClient(sidecarUrl, openAIKey, modelConfiguration);

	// we want to send the open tabs here to the sidecar
	const openTextDocuments = await getRelevantFiles();
	openTextDocuments.forEach((openTextDocument) => {
		// not awaiting here so we can keep loading the extension in the background
		if (shouldTrackFile(openTextDocument.uri)) {
			sidecarClient.documentOpen(openTextDocument.uri.fsPath, openTextDocument.contents, openTextDocument.language);
		}
	});
	// Setup the current repo representation here
	const currentRepo = new RepoRef(
		// We assume the root-path is the one we are interested in
		rootPath,
		RepoRefBackend.local,
	);
	// setup the callback for the model configuration
	modelSelection.onDidChangeConfiguration((config) => {
		sidecarClient.updateModelConfiguration(config);
		console.log('Model configuration updated:' + JSON.stringify(config));
	});
	await sidecarClient.indexRepositoryIfNotInvoked(currentRepo);
	// Show the indexing percentage on startup
	await reportIndexingPercentage(sidecarClient, currentRepo);

	// register the inline code completion provider
	await createInlineCompletionItemProvider(
		{
			triggerNotice: notice => {
				console.log(notice);
			},
			sidecarClient,
		}
	);
	// register the commands here for inline completion
	aideCommands();
	// set the status bar as well
	startupStatusBar();

	// Now setup the indexer collection
	const codeSymbolsLanguageCollection = new CodeSymbolsLanguageCollection();

	// Get the storage object here
	const codeStoryStorage = await loadOrSaveToStorage(context.globalStorageUri.fsPath, rootPath);
	logger.info(codeStoryStorage);
	logger.info(rootPath);
	// Active files tracker
	const activeFilesTracker = new ActiveFilesTracker();
	// Get the test-suite command
	const testSuiteRunCommand = readTestSuiteRunCommand();


	// Register the semantic search command here
	commands.registerCommand('codestory.semanticSearch', async (prompt: string): Promise<CodeSymbolInformationEmbeddings[]> => {
		logger.info('[semanticSearch][extension] We are executing semantic search :' + prompt);
		postHogClient?.capture({
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
		const results = await sidecarClient.getSemanticSearchResult(
			prompt,
			currentRepo,
		);
		return results;
	});

	// Register the quick action providers
	const aideQuickFix = new AideQuickFix();
	languages.registerCodeActionsProvider('*', aideQuickFix);

	// Register chat provider
	const chatSessionProvider = new CSChatSessionProvider();
	const interactiveEditorSessionProvider = new CSInteractiveEditorSessionProvider(
		sidecarClient,
		currentRepo,
		rootPath ?? '',
		shouldUseExactMatching(),
	);
	const interactiveSession = interactive.registerInteractiveSessionProvider(
		'cs-chat', chatSessionProvider
	);
	const interactiveEditorSession = interactive.registerInteractiveEditorSessionProvider(
		interactiveEditorSessionProvider,
	);
	context.subscriptions.push(interactiveEditorSession);
	context.subscriptions.push(interactiveSession);

	const chatAgentProvider = new CSChatAgentProvider(
		rootPath, repoName, repoHash,
		codeSymbolsLanguageCollection,
		testSuiteRunCommand, activeFilesTracker, uniqueUserId,
		agentSystemInstruction, sidecarClient, currentRepo, projectContext,
	);
	context.subscriptions.push(chatAgentProvider);

	context.subscriptions.push(
		debug(
			// TODO(codestory): Fix this properly later on
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

	const trackCodeSymbolChanges = new TrackCodeSymbolChanges(
		codeSymbolsLanguageCollection,
		rootPath ?? '',
		logger
	);

	// Also track the documents when they were last opened
	// context.subscriptions.push(
	workspace.onDidOpenTextDocument(async (doc) => {
		const uri = doc.uri;
		await trackCodeSymbolChanges.fileOpened(uri);
		// TODO(skcd): we want to send the file open event to the sidecar client
		if (shouldTrackFile(uri)) {
			await sidecarClient.documentOpen(uri.fsPath, doc.getText(), doc.languageId);
		}
	});

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
	window.onDidChangeActiveTextEditor(async (editor) => {
		activeFilesTracker.onDidChangeActiveTextEditor(editor);
		// if we are going to change the active text editor, then we should tell
		// the sidecar about it
		await changedActiveDocument(editor, sidecarClient);
	});

	// Register feedback commands
	context.subscriptions.push(
		commands.registerCommand('codestory.feedback', async () => {
			// Redirect to Discord server link
			await commands.executeCommand('vscode.open', 'https://discord.gg/FdKXRDGVuz');
		})
	);

	// Now we are going to also parse all the open editors
	window.onDidChangeVisibleTextEditors(parseAllVisibleDocuments);

	// Listen to all the files which are changing, so we can keep our tree sitter cache hot
	workspace.onDidChangeTextDocument(async (event) => {
		const documentUri = event.document.uri;
		// if its a schema type, then skip tracking it
		if (documentUri.scheme === 'vscode') {
			return;
		}
		console.log('[extension] onDidChangeTextDocument event::', event.document.uri.scheme);
		// TODO(skcd): we want to send the file change event to the sidecar over here
		await sidecarClient.documentContentChange(
			event.document.uri.fsPath,
			event.contentChanges,
			event.document.getText(),
			event.document.languageId,
		);
	});
}
