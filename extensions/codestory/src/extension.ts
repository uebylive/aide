import { commands, env, ExtensionContext, window } from "vscode";
import { ChatViewPanel } from "./panels/ChatViewPanel";
import { CodeStoryStorage, loadOrSaveToStorage } from "./storage/types";
import { indexRepository } from "./storage/indexer";
import { getProject, TSMorphProjectManagement } from "./utilities/parseTypescript";
import { workspace } from "vscode";
import logger from "./logger";
import { generateCodeGraph } from "./codeGraph/graph";
import { EmbeddingsSearch } from "./codeGraph/embeddingsSearch";
import postHogClient from "./posthog/client";
import { CodeStoryViewProvider } from "./views/codeStoryView";
import { healthCheck } from "./subscriptions/health";
import { openFile, search } from "./subscriptions/search";
import { TrackCodeSymbolChanges } from "./activeChanges/trackCodeSymbolChanges";
import { FILE_SAVE_TIME_PERIOD, TimeKeeper } from "./subscriptions/timekeeper";
import { fileStateFromPreviousCommit } from "./activeChanges/fileStateFromPreviousCommit";
import { CodeBlockChangeDescriptionGenerator } from "./activeChanges/codeBlockChangeDescriptionGenerator";
import { triggerCodeSymbolChange } from "./activeChanges/timeline";
import { gitCommit } from "./subscriptions/gitCommit";
import { getGitCurrentHash, getGitRepoName } from "./git/helper";
import { debug } from "./subscriptions/debug";
import { copySettings } from './utilities/copySettings';


import { EventEmitter } from "events";
import { readActiveDirectoriesConfiguration } from './utilities/activeDirectories';

class ProgressiveIndexer {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
  }

  async indexRepository(
    storage: CodeStoryStorage,
    projectManagement: TSMorphProjectManagement,
    globalStorageUri: string,
    workingDirectory: string,
  ) {
    await indexRepository(
      storage,
      projectManagement,
      globalStorageUri,
      workingDirectory,
      this.emitter,
    );
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }
}

export async function activate(context: ExtensionContext) {
  // Project root here
  logger.info("[CodeStory] Chat view command registered");
  logger.info(context.extensionUri);
  logger.info(context.globalStorageUri.fsPath);
  logger.info("[CodeStory] skcd debugging");
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
  const repoName = await getGitRepoName(
    rootPath,
  );
  const repoHash = await getGitCurrentHash(
    rootPath,
  );
  // Get the storage object here
  const codeStoryStorage = await loadOrSaveToStorage(context.globalStorageUri.fsPath, rootPath);
  logger.info(codeStoryStorage);
  logger.info(rootPath);
  // Ts-morph project management
  const activeDirectories = readActiveDirectoriesConfiguration(
    rootPath,
  );
  logger.info("[CodeStory] Active directories read");
  logger.info(activeDirectories);
  const projectManagement = await getProject(activeDirectories);
  logger.info("[CodeStory] Project management created");

  // Create an instance of the progressive indexer
  const indexer = new ProgressiveIndexer();
  // Re-index or keep going as required (we will boost this tomorrow)
  // const symbolWithEmbeddings = await indexRepository(
  //   codeStoryStorage,
  //   projectManagement,
  //   context.globalStorageUri.fsPath,
  //   rootPath
  // );
  logger.info("[CodeStory] Indexing complete");
  const embeddingsIndex = new EmbeddingsSearch([]);
  indexer.on("partialData", (partialData) => {
    logger.info("[CodeStory] Partial data received");
    // Use partialData to update embeddingsIndex
    embeddingsIndex.updateNodes(partialData);
  });
  indexer.indexRepository(
    codeStoryStorage,
    projectManagement,
    context.globalStorageUri.fsPath,
    rootPath,
  );

  // Get the code graph
  const codeGraph = generateCodeGraph(projectManagement);

  // Create the show chat view command and add to extension context
  const showChatViewCommand = commands.registerCommand("webview.showChatView", () => {
    ChatViewPanel.render(context.extensionUri);
    // Lets register the debug command here
    context.subscriptions.push(
      debug(
        // TODO(codestory): Fix this properly later on
        ChatViewPanel.currentPanel as ChatViewPanel,
        embeddingsIndex,
        projectManagement,
        codeGraph,
        repoName,
        repoHash,
        rootPath ?? "",
      )
    );
  });

  // Create the copy settings from vscode command for the extension
  const registerCopySettingsCommand = commands.registerCommand("webview.copySettings", async () => {
    await copySettings(rootPath ?? "", logger);
  });

  // Register the codestory view provider
  // Create a new ChatGPTViewProvider instance and register it with the extension's context
  const provider = new CodeStoryViewProvider(context.extensionUri, new Date());
  context.subscriptions.push(
    window.registerWebviewViewProvider(CodeStoryViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Now we want to register the HC
  context.subscriptions.push(healthCheck(context, provider, repoName, repoHash));
  commands.executeCommand("codestory.healthCheck");


  // We register the search command
  // Semantic search
  context.subscriptions.push(
    search(
      provider,
      embeddingsIndex,
      repoName,
      repoHash,
    ),
    openFile(
      logger,
    )
  );


  let trackCodeSymbolChanges = new TrackCodeSymbolChanges(projectManagement, rootPath ?? "", logger);
  const timeKeeperFileSaved = new TimeKeeper(FILE_SAVE_TIME_PERIOD);
  const codeBlockDescriptionGenerator = new CodeBlockChangeDescriptionGenerator(
    logger,
  );
  const filesChangedFromLastCommit = await fileStateFromPreviousCommit(
    rootPath ?? "",
    logger,
  );

  for (const fileChanged of filesChangedFromLastCommit) {
    await trackCodeSymbolChanges.filesChangedSinceLastCommit(
      fileChanged.filePath,
      fileChanged.fileContent,
    );
  };

  // Also track the documents when they were last opened
  context.subscriptions.push(
    workspace.onDidOpenTextDocument(async (doc) => {
      const uri = doc.uri;
      await trackCodeSymbolChanges.fileOpened(uri, logger);
    })
  );

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
        logger,
      );
    })
  );

  // Add git commit to the subscriptions here
  // Git commit
  context.subscriptions.push(
    gitCommit(logger, repoName, repoHash),
  );
  context.subscriptions.push(showChatViewCommand);
  context.subscriptions.push(registerCopySettingsCommand);
}
