/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CONTEXT_AST_NAVIGATION_MODE } from 'vs/workbench/contrib/astNavigation/common/astNavigationContextKeys';
import { IASTNavigationService } from 'vs/workbench/contrib/astNavigation/common/astNavigationService';

export class ASTNavigationService extends Disposable implements IASTNavigationService {
	declare _serviceBrand: undefined;

	private _astNavigationMode: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
		this._astNavigationMode = CONTEXT_AST_NAVIGATION_MODE.bindTo(this._contextKeyService);
	}

	toggleASTNavigationMode(): void {
		this._astNavigationMode.set(!this._astNavigationMode.get());
	}
}
