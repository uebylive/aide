/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AideProbeScope } from '../common/aideProbe.js';
import { AideControls } from './aideControls.js';

export const IAideControlsService = createDecorator<IAideControlsService>('IAideControlsService');

export interface IAideControlsService {
	_serviceBrand: undefined;
	onDidChangeScope: Event<AideProbeScope>;

	scope: AideProbeScope;
	readonly scopeSelection: number;
	controls: AideControls | undefined;
	registerControls(controls: AideControls): void;

	acceptInput(): void;
	focusInput(): void;
	blurInput(): void;
}

export class AideControlsService extends Disposable implements IAideControlsService {
	_serviceBrand: undefined;

	private _controls: AideControls | undefined;
	get controls() {
		return this._controls;
	}

	private _scope: AideProbeScope = AideProbeScope.Selection;
	private _onDidChangeScope = this._register(new Emitter<AideProbeScope>());
	readonly onDidChangeScope = this._onDidChangeScope.event;

	get scope() {
		return this._scope;
	}

	set scope(scope: AideProbeScope) {
		this._scope = scope;
		this._onDidChangeScope.fire(scope);
	}

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
	) {
		super();
	}

	registerControls(controls: AideControls): void {
		if (!this._controls) {
			this._controls = controls;
		} else {
			console.warn('AideControls already registered');
		}
	}

	get scopeSelection(): Readonly<number> {
		if (this._scope === AideProbeScope.Selection) {
			return 0;
		} else if (this._scope === AideProbeScope.PinnedContext) {
			return 1;
		} else {
			return 2;
		}
	}

	acceptInput(): void {
		if (this._controls) {
			this._controls.acceptInput();
		}
	}

	focusInput(): void {
		if (this._controls) {
			this._controls.focusInput();
		}
	}

	blurInput(): void {
		if (this._controls) {
			const activeEditor = this.codeEditorService.listCodeEditors().find(editor => !editor.hasTextFocus());
			if (activeEditor) {
				activeEditor.focus();
			}
		}
	}
}
