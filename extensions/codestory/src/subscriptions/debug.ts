import { v4 as uuidv4 } from 'uuid';
import { commands } from "vscode";
import { EmbeddingsSearch } from "../codeGraph/embeddingsSearch";
import { CodeGraph } from "../codeGraph/graph";
import { ChatViewPanel } from "../panels/ChatViewPanel";
import { TSMorphProjectManagement } from "../utilities/parseTypescript";
import { MessageHandlerData } from "@estruyf/vscode";
import { debuggingFlow } from "../llm/recipe/debugging";
import { ToolingEventCollection } from '../timeline/events/collection';
import logger from '../logger';

export const debug = (
    provider: ChatViewPanel,
    embeddingIndex: EmbeddingsSearch,
    tsMorphProjectManagement: TSMorphProjectManagement,
    codeGraph: CodeGraph,
    repoName: string,
    repoHash: string,
    workingDirectory: string,
) => {
    return commands.registerCommand(
        "codestory.debug",
        async ({ payload, ...message }: MessageHandlerData<PromptState>) => {
            logger.info("[CodeStory] Debugging");
            logger.info(payload);
            const toolingEventCollection = new ToolingEventCollection(
                `/tmp/${uuidv4()}`,
                codeGraph,
                provider,
                message.command,
            );
            await debuggingFlow(
                payload.prompt,
                toolingEventCollection,
                codeGraph,
                embeddingIndex,
                tsMorphProjectManagement,
                workingDirectory,
            );
        }
    );
};