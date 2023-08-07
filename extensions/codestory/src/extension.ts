import { commands, ExtensionContext } from "vscode";
import { ChatViewPanel } from "./panels/ChatViewPanel";

export function activate(context: ExtensionContext) {
  // Create the show chat view command and add to extension context
  const showChatViewCommand = commands.registerCommand("webview.showChatView", () => {
    ChatViewPanel.render(context.extensionUri);
  });
  context.subscriptions.push(showChatViewCommand);
}
