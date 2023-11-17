/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { isCancellationError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ResourceEdit, ResourceFileEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { IRange, Range } from 'vs/editor/common/core/range';
import { TextEdit } from 'vs/editor/common/languages';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ChatEditSession } from 'vs/workbench/contrib/csChat/common/csChatEdit';
import { EditMode, IChatBulkEditResponse } from 'vs/workbench/contrib/csChat/common/csChatService';

export class SessionExchange {

	constructor(
		readonly response: MarkdownResponse | EditResponse | EmptyResponse | ErrorResponse
	) { }
}

export class EmptyResponse {

}

export class ErrorResponse {

	readonly message: string;
	readonly isCancellation: boolean;

	constructor(
		readonly error: any
	) {
		this.message = toErrorMessage(error, false);
		this.isCancellation = isCancellationError(error);
	}
}

export class MarkdownResponse {
	constructor(
		readonly raw: any,
		readonly mdContent: IMarkdownString,
	) { }
}

export class EditResponse {
	readonly singleCreateFileEdit: { uri: URI; edits: Promise<TextEdit>[] } | undefined;
	readonly workspaceEdits: ResourceEdit[] | undefined;

	constructor(
		readonly raw: IChatBulkEditResponse,
	) {
		const edits = ResourceEdit.convert(raw.edits);
		this.workspaceEdits = edits;

		let isComplexEdit = false;

		for (const edit of edits) {
			if (edit instanceof ResourceFileEdit) {
				if (!isComplexEdit && edit.newResource && !edit.oldResource) {
					if (this.singleCreateFileEdit) {
						isComplexEdit = true;
						this.singleCreateFileEdit = undefined;
					} else {
						this.singleCreateFileEdit = { uri: edit.newResource, edits: [] };
						if (edit.options.contents) {
							this.singleCreateFileEdit.edits.push(edit.options.contents.then(x => ({ range: new Range(1, 1, 1, 1), text: x.toString() })));
						}
					}
				}
			} else if (edit instanceof ResourceTextEdit) {
				if (isEqual(this.singleCreateFileEdit?.uri, edit.resource)) {
					this.singleCreateFileEdit!.edits.push(Promise.resolve(edit.textEdit));
				} else {
					isComplexEdit = true;
				}
			}
		}
		if (isComplexEdit) {
			this.singleCreateFileEdit = undefined;
		}
	}
}

export interface ISessionKeyComputer {
	getComparisonKey(editor: ICodeEditor, uri: URI): string;
}

export const IChatEditSessionService = createDecorator<ICSChatEditSessionService>('ICSChatEditSessionService');

export interface ICSChatEditSessionService {
	_serviceBrand: undefined;
	onWillStartSession: Event<IActiveCodeEditor>;
	createSession(editor: IActiveCodeEditor, options: { editMode: EditMode; wholeRange?: IRange }, token: CancellationToken): Promise<ChatEditSession | undefined>;
	getSession(key: string): ChatEditSession | undefined;
	releaseSession(session: ChatEditSession): void;
	dispose(): void;
}

type SessionData = {
	session: ChatEditSession;
	store: IDisposable;
};

export class CSChatEditSessionService implements ICSChatEditSessionService {

	declare _serviceBrand: undefined;

	private readonly _onWillStartSession = new Emitter<IActiveCodeEditor>();
	readonly onWillStartSession: Event<IActiveCodeEditor> = this._onWillStartSession.event;

	private readonly _sessions = new Map<string, SessionData>();

	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) { }

	dispose() {
		this._onWillStartSession.dispose();
		this._sessions.forEach(x => x.store.dispose());
		this._sessions.clear();
	}

	async createSession(editor: IActiveCodeEditor, options: { editMode: EditMode; wholeRange?: Range }, token: CancellationToken): Promise<ChatEditSession | undefined> {
		this._onWillStartSession.fire(editor);
		const textModel = editor.getModel();

		const store = new DisposableStore();

		// create: keep a reference to prevent disposal of the "actual" model
		const refTextModelN = await this._textModelService.createModelReference(textModel.uri);
		store.add(refTextModelN);

		// create: keep a snapshot of the "actual" model
		const textModel0 = this._modelService.createModel(
			createTextBufferFactoryFromSnapshot(textModel.createSnapshot()),
			{ languageId: textModel.getLanguageId(), onDidChange: Event.None },
			undefined, true
		);
		store.add(textModel0);

		const session = new ChatEditSession(options.editMode, textModel0, textModel);

		const key = '';
		if (this._sessions.has(key)) {
			store.dispose();
			throw new Error(`Session already stored for ${key}`);
		}
		this._sessions.set(key, { session, store });
		return session;
	}

	releaseSession(session: ChatEditSession): void {
		for (const [key, value] of this._sessions) {
			if (value.session === session) {
				value.store.dispose();
				this._sessions.delete(key);
				break;
			}
		}
	}

	getSession(key: string): ChatEditSession | undefined {
		return this._sessions.get(key)?.session;
	}
}
