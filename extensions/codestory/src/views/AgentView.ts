/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
	Webview,
	Uri,
	CancellationToken,
	WebviewView,
	WebviewViewProvider,
	WebviewViewResolveContext,
	commands,
	env,
} from 'vscode';
import { MessageHandlerData } from '@estruyf/vscode';

import postHogClient from '../posthog/client';
import { getNonce } from '../utilities/getNonce';
import { getUri } from '../utilities/getUri';
import { readJSONFromFile } from '../utilities/files';

export class AgentViewProvider implements WebviewViewProvider {
	public static readonly viewType = 'codestory.agentView';
	private _view?: WebviewView;

	constructor(private readonly _extensionUri: Uri) { }

	public resolveWebviewView(
		webviewView: WebviewView,
		_context: WebviewViewResolveContext,
		_token: CancellationToken
	): void | Thenable<void> {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				// Uri.joinPath(this._extensionUri, 'out'),
				Uri.joinPath(this._extensionUri, 'webview-ui/build'),
			],
		};

		webviewView.webview.html = this._getWebviewContent(webviewView.webview, this._extensionUri);

		this._setWebviewMessageListener(webviewView.webview);
	}

	public getView(): WebviewView | undefined {
		return this._view;
	}

	public show() {
		if (this._view) {
			this._view.show();
		}
	}

	/**
	 * Defines and returns the HTML that should be rendered within the webview panel.
	 *
	 * @remarks This is also the place where references to the React webview build files
	 * are created and inserted into the webview HTML.
	 *
	 * @param webview A reference to the extension webview
	 * @param extensionUri The URI of the directory containing the extension
	 * @returns A template string literal containing the HTML that should be
	 * rendered within the webview panel
	 */
	private _getWebviewContent(webview: Webview, extensionUri: Uri) {
		// The CSS file from the React build output
		const stylesUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'index.css']);
		// The JS file from the React build output
		const scriptUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'index.js']);

		const nonce = getNonce();

		// Tip: Install the es6-string-html VS Code extension to enable code highlighting below
		return /*html*/ `
			<!DOCTYPE html>
			<html lang='en'>
			<head>
				<meta charset='UTF-8' />
				<meta name='viewport' content='width=device-width, initial-scale=1.0' />
				<meta http-equiv='Content-Security-Policy' content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; require-trusted-types-for 'script';">
				<link rel='stylesheet' type='text/css' href='${stylesUri}'>
				<title>CodeStory</title>
			</head>
			<body>
				<div id='root'></div>
				<script type='module' nonce='${nonce}' src='${scriptUri}'></script>
			</body>
			</html>
		`;
	}

	/**
	 * Sets up an event listener to listen for messages passed from the webview context and
	 * executes code based on the message that is received.
	 *
	 * @param webview A reference to the extension webview
	 * @param context A reference to the extension context
	 */
	private _setWebviewMessageListener(webview: Webview) {
		webview.onDidReceiveMessage(
			async (message: MessageHandlerData<any>) => {
				const { command, requestId, payload } = message;

				switch (command) {
					case 'readData': {
						const responsePayload = readJSONFromFile();
						webview.postMessage({
							command,
							requestId,
							payload: responsePayload,
						} as MessageHandlerData<Record<string, any>>);
						return;
					}
					case 'sendPrompt': {
						const prompt = payload.prompt;
						postHogClient.capture({
							distinctId: env.machineId,
							event: 'debug_prompt_received',
							properties: {
								prompt: prompt,
							},
						});
						await commands.executeCommand('codestory.debug', message);
						return;
					}
					default:
						return;
				}
			}
		);
	}
}
