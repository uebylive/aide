/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable } from 'vs/base/common/lifecycle';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostArcShape, IMainContext, MainContext, MainThreadArcShape } from 'vs/workbench/api/common/extHost.protocol';
import type * as vscode from 'vscode';

export class ExtHostArc implements ExtHostArcShape {
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

	//#endregion
}
