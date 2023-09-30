/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable } from 'vs/base/common/lifecycle';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostArcShape, IArcDto, IMainContext, MainContext, MainThreadArcShape } from 'vs/workbench/api/common/extHost.protocol';
import type * as vscode from 'vscode';

class ArcProviderWrapper<T> {

	private static _pool = 0;

	readonly handle: number = ArcProviderWrapper._pool++;

	constructor(
		readonly extension: Readonly<IRelaxedExtensionDescription>,
		readonly provider: T,
	) { }
}

export class ExtHostArc implements ExtHostArcShape {
	private static _nextId = 0;

	private readonly _chatProvider = new Map<number, ArcProviderWrapper<vscode.ArcProvider>>();

	private readonly _proxy: MainThreadArcShape;

	constructor(
		mainContext: IMainContext,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadArc);
	}

	//#region arc

	registerArcProvider(extension: Readonly<IRelaxedExtensionDescription>, id: string, provider: vscode.ArcProvider): vscode.Disposable {
		this._proxy.$registerArcProvider(0, id);
		return toDisposable(() => {
			this._proxy.$unregisterArcProvider(0);
		});
	}

	async $prepareArc(handle: number, initialState: any, token: vscode.CancellationToken): Promise<IArcDto | undefined> {
		const entry = this._chatProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const id = ExtHostArc._nextId++;

		return {
			id,
		};
	}

	//#endregion
}
