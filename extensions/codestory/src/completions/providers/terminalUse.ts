import * as vscode from 'vscode';

// execute a command in a terminal
export function executeCommand(command: string): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			const terminal = vscode.window.createTerminal('Command Terminal');
			terminal.show();
			terminal.sendText(command);

			// Optional: Dispose terminal after execution
			const disposable = vscode.window.onDidCloseTerminal(closedTerminal => {
				if (closedTerminal === terminal) {
					disposable.dispose();
					resolve();
				}
			});
		} catch (error) {
			reject(error);
		}
	});
}
