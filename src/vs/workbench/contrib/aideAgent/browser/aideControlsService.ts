/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AideControls } from 'vs/workbench/contrib/aideAgent/browser/aideControls';

export const IAideControlsService = createDecorator<IAideControlsService>('IAideControlsService');

export interface IAideControlsService {
	_serviceBrand: undefined;
	// Controls
	registerControls(controls: AideControls): void;

	// Input
	acceptInput(): void;
	focusInput(): void;
	blurInput(): void;
}

export class AideControlsService extends Disposable implements IAideControlsService {
	_serviceBrand: undefined;

	private _controls: AideControls | undefined;

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
