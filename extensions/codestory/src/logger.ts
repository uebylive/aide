import { window } from "vscode";
import { createLogger, format } from "winston";
// @ts-ignore
import VSCTransport from "winston-vscode";

const transport = new VSCTransport({
  window: window,
  name: "CodeStory",
});

const logger = createLogger({
  level: "info",
  format: format.combine(
    format.splat(),
    format.printf(({ message }: { message: string }) => {
      return message;
    })
  ),
  transports: [transport],
});

export default logger;
