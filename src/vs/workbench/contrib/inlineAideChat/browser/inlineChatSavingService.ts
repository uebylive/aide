/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Session } from '../../../../workbench/contrib/inlineAideChat/browser/inlineChatSession.js';


export const IInlineAideChatSavingService = createDecorator<IInlineAideChatSavingService>('IInlineAideChatSavingService');

export interface IInlineAideChatSavingService {
	_serviceBrand: undefined;

	markChanged(session: Session): void;

}
