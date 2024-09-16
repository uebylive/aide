/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IAideAgentImplementation } from 'vs/workbench/contrib/aideAgent/common/aideAgent';
import { AideAgentModel } from 'vs/workbench/contrib/aideAgent/common/aideAgentModel';

export interface IAgentMarkdownContent {
	content: IMarkdownString;
	kind: 'markdownContent';
}

export type IAgentResponseProgress =
	| IAgentMarkdownContent
	| IAgentTask
	| IAgentTaskResult
	| IAgentWarningMessage;

export interface IAgentTaskDto {
	content: IMarkdownString;
	kind: 'progressTask';
}

export interface IAgentTaskResult {
	content: IMarkdownString | void;
	kind: 'progressTaskResult';
}

export interface IAgentWarningMessage {
	content: IMarkdownString;
	kind: 'warning';
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

export const IAideAgentService = createDecorator<IAideAgentService>('aideAgentService');

export interface IAideAgentService {
	_serviceBrand: undefined;
	registerAgentProvider(resolver: IAideAgentImplementation): void;

	startSession(): AideAgentModel | undefined;
	trigger(sessionId: string, message: string): void;
}
