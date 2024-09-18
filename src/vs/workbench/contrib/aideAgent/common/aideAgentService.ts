/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { WorkspaceEdit } from '../../../../editor/common/languages.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IAideAgentImplementation } from './aideAgent.js';
import { AideAgentModel, AideAgentScope } from './aideAgentModel.js';

export interface IAgentMarkdownContent {
	kind: 'markdownContent';
	content: IMarkdownString;
}

export interface IAgentTextEdit {
	kind: 'textEdit';
	edits: WorkspaceEdit;
}

export interface IAgentTaskDto {
	kind: 'progressTask';
	content: IMarkdownString;
}

export interface IAgentTaskResult {
	kind: 'progressTaskResult';
	content: IMarkdownString | void;
}

export interface IAgentWarningMessage {
	kind: 'warning';
	content: IMarkdownString;
}

export interface IAgentTask extends IAgentTaskDto {
	deferred: DeferredPromise<string | void>;
	progress: (IAgentWarningMessage)[];
	onDidAddProgress: Event<IAgentWarningMessage>;
	add(progress: IAgentWarningMessage): void;

	complete: (result: string | void) => void;
	task: () => Promise<string | void>;
	isSettled: () => boolean;
}

export type IAgentResponseProgress =
	| IAgentMarkdownContent
	| IAgentTextEdit
	| IAgentTask
	| IAgentTaskResult
	| IAgentWarningMessage;

export const IAideAgentService = createDecorator<IAideAgentService>('aideAgentService');

export interface IAideAgentService {
	_serviceBrand: undefined;
	registerAgentProvider(resolver: IAideAgentImplementation): void;

	onDidChangeScope: Event<AideAgentScope>;
	scope: AideAgentScope;
	readonly scopeSelection: number;

	startSession(): AideAgentModel | undefined;
	trigger(message: string): void;
}
