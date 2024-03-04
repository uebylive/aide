/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatTreeItem } from 'vs/workbench/contrib/chat/browser/chat';
import { isWelcomeVM } from 'vs/workbench/contrib/chat/common/chatViewModel';

// TODO(@ghostwriternr): Fix this hacky solution.
export const getChatTreeItemProviderId = (element: ChatTreeItem): string => {
	if (isWelcomeVM(element)) {
		return (element as any).session.providerId;
	} else {
		return (element as any)._model.session.providerId;
	}
};
