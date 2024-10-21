/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { PinnedContextWidget } from './pinnedContextWidget.js';

export const IPinnedContextWidgetService = createDecorator<IPinnedContextWidgetService>('pinnedContextWidgetService');
export interface IPinnedContextWidgetService {
	readonly _serviceBrand: undefined;

	register(widget: PinnedContextWidget): IDisposable;
	getWidget(): PinnedContextWidget | undefined;
}

export class PinnedContextWidgetService implements IPinnedContextWidgetService {
	declare readonly _serviceBrand: undefined;

	private _widget: PinnedContextWidget | undefined;

	register(widget: PinnedContextWidget): IDisposable {
		this._widget = widget;

		return toDisposable(() => {
			this._widget = undefined;
		});
	}

	getWidget(): PinnedContextWidget | undefined {
		return this._widget;
	}
}
