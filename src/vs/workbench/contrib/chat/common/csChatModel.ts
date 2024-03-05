/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Location } from 'vs/editor/common/languages';
import type { IChatModel, IChatRequestModel, IChatResponseModel } from 'vs/workbench/contrib/chat/common/chatModel';

export interface IChatEditSummary {
	summary: string;
	location: Location;
}

export interface ICSChatResponseModel extends IChatResponseModel {
	readonly appliedEdits: Map<number, IChatEditSummary>;
	recordEdits(codeblockIndex: number, edits: IChatEditSummary | undefined): void;
}

export interface ICSChatModel extends IChatModel {
	getRequest(requestId: string): IChatRequestModel | undefined;
}
