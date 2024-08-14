/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import postHogClient from '../posthog/client';
import { getUniqueId } from '../utilities/uniqueId';
import { getSymbolNavigationActionTypeLabel } from '../utilities/stringifyEvent';

type UsageRequest = {
	type: 'InlineCompletion' | 'ChatRequest' | 'InlineCodeEdit' | 'AgenticCodeEdit';
	units: number;
	timestamp: Date;
};

const USAGE_EVENTS_KEY = 'codestory.usageEvents';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000; // 1 second

export class CSEventHandler implements vscode.CSEventHandler, vscode.Disposable {
	private _disposable: vscode.Disposable;
	private _subscriptionsAPIBase: string | null = null;

	constructor(private readonly _context: vscode.ExtensionContext) {
		this._disposable = vscode.csevents.registerCSEventHandler(this);

		if (vscode.env.uriScheme === 'aide') {
			this._subscriptionsAPIBase = 'https://api.codestory.ai';
		} else {
			this._subscriptionsAPIBase = 'https://staging-api.codestory.ai';
		}
	}

	handleSymbolNavigation(event: vscode.SymbolNavigationEvent): void {
		const currentWindow = vscode.window.activeTextEditor?.document.uri.fsPath;
		postHogClient?.capture({
			distinctId: getUniqueId(),
			event: 'symbol_navigation',
			properties: {
				action: getSymbolNavigationActionTypeLabel(event.action),
				file_path: event.uri.fsPath,
				current_window: currentWindow,
			},
		});
	}

	async handleAgentCodeEdit(event: { accepted: boolean; added: number; removed: number }): Promise<void> {
		if (!event.accepted) {
			return;
		}

		const usageRequest: UsageRequest = {
			type: 'AgenticCodeEdit',
			units: event.added + event.removed,
			timestamp: new Date(),
		};

		const persistedEvents = this._context.globalState.get<UsageRequest[]>(USAGE_EVENTS_KEY, []);
		persistedEvents.push(usageRequest);
		this._context.globalState.update(USAGE_EVENTS_KEY, persistedEvents);

		this.sendUsageEvents(persistedEvents);
	}

	private async sendUsageEvents(events: UsageRequest[]): Promise<void> {
		await this.sendUsageEventsWithRetry(events, 0);
	}

	private async sendUsageEventsWithRetry(events: UsageRequest[], retryCount: number): Promise<void> {
		if (retryCount >= MAX_RETRIES) {
			console.error('Maximum retries exceeded for sending usage events.');
			return;
		}

		const session = await vscode.csAuthentication.getSession();
		if (!session) {
			console.error('Failed to get authentication session.');
			return;
		}

		const success = await this.sendUsageEvent(events, session);
		if (success) {
			this._context.globalState.update(USAGE_EVENTS_KEY, []);
		} else {
			const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
			console.log(`Failed to send usage events. Retrying in ${delay} ms...`);
			setTimeout(() => this.sendUsageEventsWithRetry(events, retryCount + 1), delay);
		}
	}

	private async sendUsageEvent(events: UsageRequest[], session: vscode.CSAuthenticationSession): Promise<boolean> {
		try {
			const response = await fetch(
				`${this._subscriptionsAPIBase}/v1/usage`,
				{
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${session.accessToken}`,
					},
					method: 'POST',
					body: JSON.stringify({ events }),
				}
			);

			if (response.ok) {
				return true;
			} else if (response.status === 401) {
				await vscode.commands.executeCommand('codestory.refreshTokens');
				return false; // Retry after refreshing token
			} else {
				console.error(`Failed to send usage events. Status code: ${response.status}`);
				return true; // Don't retry for other errors
			}
		} catch (error) {
			console.error('Failed to send usage events:', error);
			return true; // Don't retry on error
		}
	}

	dispose(): void {
		this._disposable.dispose();
	}
}
