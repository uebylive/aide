import axios from "axios";
import { MessageHandlerData } from "@estruyf/vscode";
import { ExtensionContext, OutputChannel, commands, env } from "vscode";

import { CodeStoryViewProvider } from "../views/codeStoryView";
import postHogClient from "../posthog/client";

export const healthCheck = (
    context: ExtensionContext,
    provider: CodeStoryViewProvider,
    repoName: string,
    repoHash: string,
) => {
    return commands.registerCommand(
        "codestory.healthCheck",
        async (message: MessageHandlerData<HealthState>) => {
            postHogClient.capture({
                distinctId: env.machineId,
                event: "health_check",
                properties: {
                    repoName,
                    repoHash,
                },
            });
            const health: HealthState = { status: "OK" };
            const response: MessageHandlerData<HealthState> = {
                ...message,
                payload: { status: health.status },
            };
            provider.getView()?.webview.postMessage(response);
        }
    );
};
