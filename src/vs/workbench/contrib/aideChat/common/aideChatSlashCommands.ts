/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProgress } from '../../../../platform/progress/common/progress.js';
import { IAideChatMessage } from '../../../../workbench/contrib/aideChat/common/languageModels.js';
import { IAideChatFollowup, IAideChatProgress, IChatResponseProgressFileTreeData } from '../../../../workbench/contrib/aideChat/common/aideChatService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';

//#region slash service, commands etc

export interface IChatSlashData {
	command: string;
	detail: string;
	sortText?: string;

	/**
	 * Whether the command should execute as soon
	 * as it is entered. Defaults to `false`.
	 */
	executeImmediately?: boolean;
}

export interface IChatSlashFragment {
	content: string | { treeData: IChatResponseProgressFileTreeData };
}
export type IChatSlashCallback = { (prompt: string, progress: IProgress<IAideChatProgress>, history: IAideChatMessage[], token: CancellationToken): Promise<{ followUp: IAideChatFollowup[] } | void> };

export const IAideChatSlashCommandService = createDecorator<IAideChatSlashCommandService>('aideChatSlashCommandService');

/**
 * This currently only exists to drive /clear and /help
 */
export interface IAideChatSlashCommandService {
	_serviceBrand: undefined;
	readonly onDidChangeCommands: Event<void>;
	registerSlashCommand(data: IChatSlashData, command: IChatSlashCallback): IDisposable;
	executeCommand(id: string, prompt: string, progress: IProgress<IAideChatProgress>, history: IAideChatMessage[], token: CancellationToken): Promise<{ followUp: IAideChatFollowup[] } | void>;
	getCommands(): Array<IChatSlashData>;
	hasCommand(id: string): boolean;
}

type Tuple = { data: IChatSlashData; command?: IChatSlashCallback };

export class ChatSlashCommandService extends Disposable implements IAideChatSlashCommandService {

	declare _serviceBrand: undefined;

	private readonly _commands = new Map<string, Tuple>();

	private readonly _onDidChangeCommands = this._register(new Emitter<void>());
	readonly onDidChangeCommands: Event<void> = this._onDidChangeCommands.event;

	constructor(@IExtensionService private readonly _extensionService: IExtensionService) {
		super();
	}

	override dispose(): void {
		super.dispose();
		this._commands.clear();
	}

	registerSlashCommand(data: IChatSlashData, command: IChatSlashCallback): IDisposable {
		if (this._commands.has(data.command)) {
			throw new Error(`Already registered a command with id ${data.command}}`);
		}

		this._commands.set(data.command, { data, command });
		this._onDidChangeCommands.fire();

		return toDisposable(() => {
			if (this._commands.delete(data.command)) {
				this._onDidChangeCommands.fire();
			}
		});
	}

	getCommands(): Array<IChatSlashData> {
		return Array.from(this._commands.values(), v => v.data);
	}

	hasCommand(id: string): boolean {
		return this._commands.has(id);
	}

	async executeCommand(id: string, prompt: string, progress: IProgress<IAideChatProgress>, history: IAideChatMessage[], token: CancellationToken): Promise<{ followUp: IAideChatFollowup[] } | void> {
		const data = this._commands.get(id);
		if (!data) {
			throw new Error('No command with id ${id} NOT registered');
		}
		if (!data.command) {
			await this._extensionService.activateByEvent(`onSlash:${id}`);
		}
		if (!data.command) {
			throw new Error(`No command with id ${id} NOT resolved`);
		}

		return await data.command(prompt, progress, history, token);
	}
}
