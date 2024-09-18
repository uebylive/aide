/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import { EditMode } from '../../../../workbench/contrib/inlineAideChat/common/inlineChat.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Session, StashedSession } from './inlineChatSession.js';
import { IValidEditOperation } from '../../../../editor/common/model.js';
import { IChatResponseModel } from '../../../../workbench/contrib/aideChat/common/aideChatModel.js';


export type Recording = {
	when: Date;
	session: string;
	exchanges: { prompt: string; res: IChatResponseModel }[];
};

export interface ISessionKeyComputer {
	getComparisonKey(editor: ICodeEditor, uri: URI): string;
}

export const IInlineAideChatSessionService = createDecorator<IInlineAideChatSessionService>('IInlineAideChatSessionService');

export interface IInlineChatSessionEvent {
	readonly editor: ICodeEditor;
	readonly session: Session;
}

export interface IInlineChatSessionEndEvent extends IInlineChatSessionEvent {
	readonly endedByExternalCause: boolean;
}

export interface IInlineAideChatSessionService {
	_serviceBrand: undefined;

	onWillStartSession: Event<IActiveCodeEditor>;
	onDidMoveSession: Event<IInlineChatSessionEvent>;
	onDidStashSession: Event<IInlineChatSessionEvent>;
	onDidEndSession: Event<IInlineChatSessionEndEvent>;

	createSession(editor: IActiveCodeEditor, options: { editMode: EditMode; wholeRange?: IRange }, token: CancellationToken): Promise<Session | undefined>;

	moveSession(session: Session, newEditor: ICodeEditor): void;

	getCodeEditor(session: Session): ICodeEditor;

	getSession(editor: ICodeEditor, uri: URI): Session | undefined;

	releaseSession(session: Session): void;

	stashSession(session: Session, editor: ICodeEditor, undoCancelEdits: IValidEditOperation[]): StashedSession;

	registerSessionKeyComputer(scheme: string, value: ISessionKeyComputer): IDisposable;

	//
	recordings(): readonly Recording[];

	dispose(): void;
}
