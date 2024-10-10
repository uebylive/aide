/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as os from 'os';
import * as vscode from 'vscode';

import { createInlineCompletionItemProvider } from './completions/create-inline-completion-item-provider';
import { AideAgentSessionProvider } from './completions/providers/aideAgentProvider';
import { getGitCurrentHash, getGitRepoName } from './git/helper';
import { aideCommands } from './inlineCompletion/commands';
import { startupStatusBar } from './inlineCompletion/statusBar';
import logger from './logger';
import postHogClient from './posthog/client';
import { AideQuickFix } from './quickActions/fix';
import { RepoRef, RepoRefBackend, SideCarClient } from './sidecar/client';
import { loadOrSaveToStorage } from './storage/types';
import { copySettings } from './utilities/copySettings';
import { getRelevantFiles, shouldTrackFile } from './utilities/openTabs';
import { checkReadonlyFSMode } from './utilities/readonlyFS';
import { reportIndexingPercentage } from './utilities/reportIndexingUpdate';
import { startSidecarBinary } from './utilities/setupSidecarBinary';
import { readCustomSystemInstruction } from './utilities/systemInstruction';
import { CodeSymbolInformationEmbeddings } from './utilities/types';
import { getUniqueId } from './utilities/uniqueId';
import { ProjectContext } from './utilities/workspaceContext';
import { CSEventHandler } from './csEvents/csEventHandler';
import { RecentEditsRetriever } from './server/editedFiles';
// import { GENERATE_PLAN } from './completions/providers/generatePlan';
// import { OPEN_FILES_VARIABLE } from './completions/providers/openFiles';
import { AidePlanTimer } from './utilities/planTimer';

export let SIDECAR_CLIENT: SideCarClient | null = null;

export async function activate(context: vscode.ExtensionContext) {
	// Project root here
	const uniqueUserId = getUniqueId();
	logger.info(`[CodeStory]: ${uniqueUserId} Activating extension with storage: ${context.globalStorageUri}`);
	postHogClient?.capture({
		distinctId: getUniqueId(),
		event: 'extension_activated',
		properties: {
			platform: os.platform(),
		},
	});

	const registerPreCopyCommand = vscode.commands.registerCommand(
		'webview.preCopySettings',
		async () => {
			await copySettings(vscode.env.appRoot, logger);
		}
	);
	context.subscriptions.push(registerPreCopyCommand);
	let rootPath = vscode.workspace.rootPath;
	if (!rootPath) {
		rootPath = '';
	}

	// Create the copy settings from vscode command for the extension
	const registerCopySettingsCommand = vscode.commands.registerCommand(
		'webview.copySettings',
		async () => {
			await copySettings(rootPath ?? '', logger);
		}
	);
	context.subscriptions.push(registerCopySettingsCommand);
	const readonlyFS = checkReadonlyFSMode();
	if (readonlyFS) {
		vscode.window.showErrorMessage('Move Aide to the Applications folder using Finder. More instructions here: [link](https://docs.codestory.ai/troubleshooting#macos-readonlyfs-warning)');
		return;
	}
	const agentSystemInstruction = readCustomSystemInstruction();
	if (agentSystemInstruction === null) {
		console.log(
			'Aide can help you better if you give it custom instructions by going to your settings and setting it in aide.systemInstruction (search for this string in User Settings) and reload vscode for this to take effect by doing Cmd+Shift+P: Developer: Reload Window'
		);
	}

	// Now we get all the required information and log it
	const repoName = await getGitRepoName(
		rootPath,
	);
	const repoHash = await getGitCurrentHash(
		rootPath,
	);

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
	const modelConfiguration = await vscode.modelSelection.getConfiguration();
	// Setup the sidecar client here
	const sidecarUrl = await startSidecarBinary(context.globalStorageUri.fsPath, vscode.env.appRoot);
	// allow-any-unicode-next-line
	// window.showInformationMessage(`Sidecar binary 🦀 started at ${sidecarUrl}`);
	const sidecarClient = new SideCarClient(sidecarUrl, modelConfiguration);
	SIDECAR_CLIENT = sidecarClient;

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
	vscode.modelSelection.onDidChangeConfiguration((config) => {
		sidecarClient.updateModelConfiguration(config);
		// console.log('Model configuration updated:' + JSON.stringify(config));
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

	// Get the storage object here
	const codeStoryStorage = await loadOrSaveToStorage(context.globalStorageUri.fsPath, rootPath);
	logger.info(codeStoryStorage);
	logger.info(rootPath);


	// Register the semantic search command here
	vscode.commands.registerCommand('codestory.semanticSearch', async (prompt: string): Promise<CodeSymbolInformationEmbeddings[]> => {
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
	vscode.languages.registerCodeActionsProvider('*', aideQuickFix);

	// add the recent edits retriver to the subscriptions
	// so we can grab the recent edits very quickly
	const recentEditsRetriever = new RecentEditsRetriever(300 * 1000, vscode.workspace);
	context.subscriptions.push(recentEditsRetriever);

	// starts the aide timer
	const aideTimer = new AidePlanTimer();
	context.subscriptions.push(aideTimer.statusBar());

	// Register the agent session provider
	const agentSessionProvider = new AideAgentSessionProvider(
		currentRepo,
		projectContext,
		sidecarClient,
		rootPath,
		aideTimer,
		recentEditsRetriever
	);
	const editorUrl = agentSessionProvider.editorUrl;
	context.subscriptions.push(agentSessionProvider);

	/*
	const probeProvider = new AideProbeProvider(sidecarClient, rootPath, recentEditsRetriever);
	const editorUrl = probeProvider.editorUrl();
	context.subscriptions.push(probeProvider);
	*/

	// Register feedback commands
	context.subscriptions.push(
		vscode.commands.registerCommand('codestory.feedback', async () => {
			// Redirect to Discord server link
			await vscode.commands.executeCommand('vscode.open', 'https://discord.gg/FdKXRDGVuz');
		})
	);

	// When the selection changes in the editor we should trigger an event
	vscode.window.onDidChangeTextEditorSelection(async (event) => {
		const textEditor = event.textEditor;
		if (shouldTrackFile(textEditor.document.uri)) {
			// track the changed selection over here
			const selections = event.selections;
			if (selections.length !== 0) {
				await csEventHandler.onDidChangeTextDocumentSelection(textEditor.document.uri.fsPath, selections);
			}
		}
	});

	// Listen to all the files which are changing, so we can keep our tree sitter cache hot
	vscode.workspace.onDidChangeTextDocument(async (event) => {
		const documentUri = event.document.uri;
		// if its a schema type, then skip tracking it
		if (documentUri.scheme === 'vscode') {
			return;
		}
		// TODO(skcd): we want to send the file change event to the sidecar over here
		if (shouldTrackFile(documentUri)) {
			await sidecarClient.documentContentChange(
				documentUri.fsPath,
				event.contentChanges,
				event.document.getText(),
				event.document.languageId,
			);
		}
	});

	const diagnosticsListener = vscode.languages.onDidChangeDiagnostics(async (event) => {
		for (const uri of event.uris) {
			// filter out diagnostics which are ONLY errors and warnings
			const diagnostics = vscode.languages.getDiagnostics(uri).filter((diagnostic) => {
				return (diagnostic.severity === vscode.DiagnosticSeverity.Error || diagnostic.severity === vscode.DiagnosticSeverity.Warning);
			});

			// Send diagnostics to sidecar
			try {
				await sidecarClient.sendDiagnostics(uri.toString(), diagnostics);
			} catch (error) {
				// console.error(`Failed to send diagnostics for ${uri.toString()}:`, error);
			}
		}
	});

	// Register the chat agent
	// const chatAgentProvider = new CSChatAgentProvider(
	// 	rootPath, repoName, repoHash,
	// 	uniqueUserId,
	// 	sidecarClient, currentRepo, projectContext, probeProvider, aideTimer
	// );
	// context.subscriptions.push(chatAgentProvider);


	// Registers all the plan variables
	context.subscriptions.push(vscode.aideAgent.registerChatVariableResolver(
		'generatePlan',
		'generatePlan',
		'Generates a plan for execution',
		'Generates a plan for execution',
		false,
		{
			resolve: (_name: string, _context: vscode.ChatVariableContext, _token: vscode.CancellationToken) => {
				return [{
					level: vscode.ChatVariableLevel.Full,
					value: 'generatePlan',
				}];
			}
		},
		'Open files',
		vscode.ThemeIcon.Folder
	));
	context.subscriptions.push(vscode.aideAgent.registerChatVariableResolver(
		'EXECUTE_UNTIL',
		'EXECUTE_UNTIL',
		'Executes the plan until a checkpoint, follow your #EXECUTE_UNTIL with a number so the input should look like: #EXECUTE_UNTIL {number}',
		'Executes the plan until a checkpoint, follow your #EXECUTE_UNTIL with a number so the input should look like: #EXECUTE_UNTIL {number}',
		false,
		{
			resolve: (_name: string, _context: vscode.ChatVariableContext, _token: vscode.CancellationToken) => {
				return [{
					level: vscode.ChatVariableLevel.Full,
					value: 'executeUntil',
				}];
			}
		},
		'Execute the plan until a step',
		vscode.ThemeIcon.Folder,
	));
	context.subscriptions.push(vscode.aideAgent.registerChatVariableResolver(
		'enrichLSP',
		'enrichLSP',
		'Generates step using #enrichLSP diagnostics',
		'Generates step using #enrichLSP diagnostics',
		false,
		{
			resolve: (_name: string, _context: vscode.ChatVariableContext, _token: vscode.CancellationToken) => {
				return [{
					level: vscode.ChatVariableLevel.Full,
					value: 'enrichLSP',
				}];
			}
		},
		'Generates steps using enriched LSP diagnostics',
		vscode.ThemeIcon.Folder,
	));
	context.subscriptions.push(vscode.aideAgent.registerChatVariableResolver(
		'APPEND_TO_PLAN',
		'APPEND_TO_PLAN',
		'Append the user context to the plan',
		'Append the user context to the plan',
		false,
		{
			resolve: (_name: string, _context: vscode.ChatVariableContext, _token: vscode.CancellationToken) => {
				return [{
					level: vscode.ChatVariableLevel.Full,
					value: 'executeUntil',
				}];
			}
		},
		'Append a step to the plan',
		vscode.ThemeIcon.Folder,
	));
	context.subscriptions.push(vscode.aideAgent.registerChatVariableResolver(
		'DROP_PLAN_STEP_FROM',
		'DROP_PLAN_STEP_FROM',
		'Drops the plan from an index, YOU HAVE TO UNDO MANUALLY, the input should look like this: #DROP_PLAN_STEP_FROM {plan_step_index_to_drop_from}',
		'Drops the plan from an index, YOU HAVE TO UNDO MANUALLY, the input should look like this: #DROP_PLAN_STEP_FROM {plan_step_index_to_drop_from}',
		false,
		{
			resolve: (_name: string, _context: vscode.ChatVariableContext, _token: vscode.CancellationToken) => {
				return [{
					level: vscode.ChatVariableLevel.Full,
					value: 'dropPlanFrom',
				}];
			}
		},
		'Drops the plan steps from an index',
		vscode.ThemeIcon.Folder,
	));
	context.subscriptions.push(vscode.aideAgent.registerChatVariableResolver(
		'REFERENCES_CHECK',
		'REFERENCES_CHECK',
		'References check on the files',
		'References check on the files',
		false,
		{
			resolve: (_name: string, _context: vscode.ChatVariableContext, _token: vscode.CancellationToken) => {
				return [{
					level: vscode.ChatVariableLevel.Full,
					value: 'referencesCheck',
				}];
			}
		},
		'References check on the files',
		vscode.ThemeIcon.Folder,
	));

	// Gets access to all the events the editor is throwing our way
	const csEventHandler = new CSEventHandler(context, editorUrl);
	context.subscriptions.push(csEventHandler);

	// const startRecording = vscode.commands.registerCommand(
	// 	'codestory.startRecordingContext',
	// 	async () => {
	// 		await csEventHandler.startRecording();
	// 		console.log('start recording context');
	// 	}
	// );
	// context.subscriptions.push(startRecording);
	// const stopRecording = vscode.commands.registerCommand(
	// 	'codestory.stopRecordingContext',
	// 	async () => {
	// 		const response = await csEventHandler.stopRecording();
	// 		await agentSessionProvider.sendContextRecording(response);
	// 		console.log(JSON.stringify(response));
	// 		console.log('stop recording context');
	// 	}
	// );
	// context.subscriptions.push(stopRecording);

	// toggle deep reasoning
	const deepReasoningBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	deepReasoningBarItem.show();
	deepReasoningBarItem.text = 'o1:false';
	const deepReasoning = vscode.commands.registerCommand(
		'codestory.enableDeepReasoning',
		async () => {
			const codestoryConfiguration = vscode.workspace.getConfiguration('aide');
			const deepReasoning = codestoryConfiguration.get('deepReasoning') as boolean;
			if (deepReasoning) {
				await codestoryConfiguration.update('deepReasoning', false);
				deepReasoningBarItem.text = 'o1:false';
			} else {
				await codestoryConfiguration.update('deepReasoning', true);
				deepReasoningBarItem.text = 'o1:true';
			}
		}
	);
	context.subscriptions.push(deepReasoning);

	vscode.window.onDidChangeActiveTextEditor(async (editor) => {
		if (editor) {
			const activeDocument = editor.document;
			if (activeDocument) {
				const activeDocumentUri = activeDocument.uri;
				if (shouldTrackFile(activeDocumentUri)) {
					// track that changed document over here
					await sidecarClient.documentOpen(
						activeDocumentUri.fsPath,
						activeDocument.getText(),
						activeDocument.languageId
					);
				}
			}
		}
	});

	// shouldn't all listeners have this?
	context.subscriptions.push(diagnosticsListener);
}
