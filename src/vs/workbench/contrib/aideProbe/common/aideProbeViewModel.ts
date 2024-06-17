/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IAideProbeModel } from 'vs/workbench/contrib/aideProbe/common/aideProbeModel';

export interface IAideProbeViewModel {
	readonly onDidChange: Event<void>;
	readonly model: IAideProbeModel;
}

export class AideProbeViewModel extends Disposable implements IAideProbeViewModel {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	get model(): IAideProbeModel {
		return this._model;
	}

	constructor(
		private readonly _model: IAideProbeModel,
	) {
		super();

		this._register(this._model.onDidChange(() => {
			this._onDidChange.fire();
		}));
	}
}
