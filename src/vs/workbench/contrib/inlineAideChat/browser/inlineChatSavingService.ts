/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Session } from 'vs/workbench/contrib/inlineAideChat/browser/inlineChatSession';


export const IInlineAideChatSavingService = createDecorator<IInlineAideChatSavingService>('IInlineAideChatSavingService');

export interface IInlineAideChatSavingService {
	_serviceBrand: undefined;

	markChanged(session: Session): void;

}
