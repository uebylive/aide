import { messageHandler } from "@estruyf/vscode/dist/client";

export const handleOpenFile = (filePath: string, lineStart: number) => {
  messageHandler.send("openFile", { filePath, lineStart });
};
