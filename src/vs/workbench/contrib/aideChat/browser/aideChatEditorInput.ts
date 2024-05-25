/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IAideChatEditorOptions } from 'vs/workbench/contrib/aideChat/browser/aideChatEditor';
import { IAideChatModel } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { IAideChatService } from 'vs/workbench/contrib/aideChat/common/aideChatService';

const AideChatEditorIcon = registerIcon('aidechat-editor-label-icon', Codicon.wand, nls.localize('aideChatEditorLabelIcon', 'Icon of the aide chat editor label.'));

export class AideChatEditorInput extends EditorInput {
	static readonly countsInUse = new Set<number>();

	static readonly TypeID: string = 'workbench.input.aideChatSession';
	static readonly EditorID: string = 'workbench.editor.aideChatSession';

	private readonly inputCount: number;
	public sessionId: string | undefined;

	private model: IAideChatModel | undefined;

	static getNewEditorUri(): URI {
		const handle = Math.floor(Math.random() * 1e9);
		return AideChatUri.generate(handle);
	}

	static getNextCount(): number {
		let count = 0;
		while (AideChatEditorInput.countsInUse.has(count)) {
			count++;
		}

		return count;
	}

	constructor(
		readonly resource: URI,
		readonly options: IAideChatEditorOptions,
		@IAideChatService private readonly chatService: IAideChatService
	) {
		super();

		const parsed = AideChatUri.parse(resource);
		if (typeof parsed?.handle !== 'number') {
			throw new Error('Invalid aideChat URI');
		}

		this.sessionId = (options.target && 'sessionId' in options.target) ?
			options.target.sessionId :
			undefined;
		this.inputCount = AideChatEditorInput.getNextCount();
		AideChatEditorInput.countsInUse.add(this.inputCount);
		this._register(toDisposable(() => AideChatEditorInput.countsInUse.delete(this.inputCount)));
	}

	override get editorId(): string | undefined {
		return AideChatEditorInput.EditorID;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return otherInput instanceof AideChatEditorInput && otherInput.resource.toString() === this.resource.toString();
	}

	override get typeId(): string {
		return AideChatEditorInput.TypeID;
	}

	override getName(): string {
		return this.model?.title || nls.localize('aideChatEditorName', "Aide") + (this.inputCount > 0 ? ` ${this.inputCount + 1}` : '');
	}

	override getIcon(): ThemeIcon {
		return AideChatEditorIcon;
	}

	override async resolve(): Promise<AideChatEditorModel | null> {
		if (typeof this.sessionId === 'string') {
			this.model = this.chatService.getOrRestoreSession(this.sessionId);
		} else if (!this.options.target) {
			this.model = this.chatService.startSession(CancellationToken.None);
		}

		if (!this.model) {
			return null;
		}

		this.sessionId = this.model.sessionId;

		return this._register(new AideChatEditorModel(this.model));
	}

	override dispose(): void {
		super.dispose();
		if (this.sessionId) {
			this.chatService.clearSession(this.sessionId);
		}
	}
}

export class AideChatEditorModel extends Disposable {
	private _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	private _isDisposed = false;
	private _isResolved = false;

	constructor(
		readonly model: IAideChatModel,
	) { super(); }

	async resolve(): Promise<void> {
		this._isResolved = true;
	}

	isResolved(): boolean {
		return this._isResolved;
	}

	isDisposed(): boolean {
		return this._isDisposed;
	}

	override dispose(): void {
		super.dispose();
		this._isDisposed = true;
	}
}

export namespace AideChatUri {

	export const scheme = Schemas.vscodeAideChatSesssion;


	export function generate(handle: number): URI {
		return URI.from({ scheme, path: `aidechat-${handle}` });
	}

	export function parse(resource: URI): { handle: number } | undefined {
		if (resource.scheme !== scheme) {
			return undefined;
		}

		const match = resource.path.match(/aidechat-(\d+)/);
		const handleStr = match?.[1];
		if (typeof handleStr !== 'string') {
			return undefined;
		}

		const handle = parseInt(handleStr);
		if (isNaN(handle)) {
			return undefined;
		}

		return { handle };
	}
}

interface ISerializedChatEditorInput {
	options: IAideChatEditorOptions;
	sessionId: string;
	resource: URI;
}

export class ChatEditorInputSerializer implements IEditorSerializer {
	canSerialize(input: EditorInput): input is AideChatEditorInput & { readonly sessionId: string } {
		return input instanceof AideChatEditorInput && typeof input.sessionId === 'string';
	}

	serialize(input: EditorInput): string | undefined {
		if (!this.canSerialize(input)) {
			return undefined;
		}

		const obj: ISerializedChatEditorInput = {
			options: input.options,
			sessionId: input.sessionId,
			resource: input.resource
		};
		return JSON.stringify(obj);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			const parsed: ISerializedChatEditorInput = JSON.parse(serializedEditor);
			const resource = URI.revive(parsed.resource);
			return instantiationService.createInstance(AideChatEditorInput, resource, { ...parsed.options, target: { sessionId: parsed.sessionId } });
		} catch (err) {
			return undefined;
		}
	}
}
