/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { AideChatModelInitState, IAideChatModel } from 'vs/workbench/contrib/aideChat/common/aideChatModel';

export interface IAideChatViewModel {
	readonly model: IAideChatModel;
	readonly initState: AideChatModelInitState;
	readonly sessionId: string;
	readonly inputPlaceholder?: string;
}

export class AideChatViewModel extends Disposable implements IAideChatViewModel {
	get model(): IAideChatModel {
		return this._model;
	}

	get sessionId() {
		return this._model.sessionId;
	}

	get initState() {
		return this._model.initState;
	}

	constructor(
		private readonly _model: IAideChatModel
	) {
		super();
	}
}
