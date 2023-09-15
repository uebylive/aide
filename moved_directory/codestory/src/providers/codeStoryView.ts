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
} from 'vscode';

import { getNonce } from '../utilities/getNonce';
import { getUri } from '../utilities/getUri';
import { MessageHandlerData } from '@estruyf/vscode';

export class CodeStoryViewProvider implements WebviewViewProvider {
	public static readonly viewType = 'codestory.webView';
	private _view?: WebviewView;
	private _previousState: {
		previousTimestamp: number;
		state: boolean;
	};

	constructor(
		private readonly _extensionUri: Uri,
		startTime: Date
	) {
		this._previousState = {
			previousTimestamp: startTime.getTime(),
			state: true,
		};
	}

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
				Uri.joinPath(this._extensionUri, 'webview-ui-sideview/build'),
			],
		};

		webviewView.webview.html = this._getWebviewContent(webviewView.webview, this._extensionUri);
		webviewView.onDidChangeVisibility((e) => {
			// this._logger.appendLine(
			//     `[webview] visibility changed to ${JSON.stringify(e)} ${webviewView.viewType} ${webviewView.visible
			//     }}`
			// );
			const visibility = webviewView.visible;
			if (!visibility && this._previousState.state) {
				const timeDuration = new Date().getTime() - this._previousState.previousTimestamp;
				// This means that we had a session which started and then ended, so log
				// the duration of that timestamp on our end
				// log(
				//     'webview_duration',
				//     LogSeverity.DEBUG,
				//     {
				//         eventType: 'webview_duration',
				//         timeDuration,
				//     },
				//     this._logger
				// );
				// this._logger.appendLine(`[webview] webview_duration ${timeDuration} `);
				this._previousState = {
					previousTimestamp: new Date().getTime(),
					state: false,
				};
			} else if (visibility && !this._previousState.state) {
				this._previousState = {
					previousTimestamp: new Date().getTime(),
					state: true,
				};
			} else {
				// this._logger.appendLine(
				//     `[webview] visibility did not change ${JSON.stringify(e)} ${webviewView.viewType} ${webviewView.visible
				//     }}`
				// );
			}
		});
		webviewView.onDidDispose((e) => {
			// this._logger.appendLine(`[webview] disposed ${JSON.stringify(e)}`);
		});

		this._setWebviewMessageListener(webviewView.webview);
	}

	public getView(): WebviewView | undefined {
		return this._view;
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
		const stylesUri = getUri(webview, extensionUri, ['webview-ui-sideview', 'build', 'assets', 'index.css']);
		// The JS file from the React build output
		const scriptUri = getUri(webview, extensionUri, ['webview-ui-sideview', 'build', 'assets', 'index.js']);

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
		webview.onDidReceiveMessage((message: MessageHandlerData<unknown>) => {
			const { command } = message;
			switch (command) {
				case 'healthCheck':
					commands.executeCommand('codestory.healthCheck', message);
					break;
				case 'getChangelog':
					commands.executeCommand('codestory.getChangelog', message);
					break;
				case 'search':
					commands.executeCommand('codestory.search', message);
					break;
				case 'openFile':
					commands.executeCommand('codestory.openFile', message);
					break;
				case 'openFileTreeView':
					commands.executeCommand('codestory.openFileTreeView', message);
				case 'gitCommit':
					commands.executeCommand('codestory.gitCommit', message);
				case 'startCodeReview':
					commands.executeCommand('codestory.startCodeReview', message);
				case 'openFileForReview':
					commands.executeCommand('codestory.openFileForReview', message);
				default:
					break;
			}
		});
	}
}
