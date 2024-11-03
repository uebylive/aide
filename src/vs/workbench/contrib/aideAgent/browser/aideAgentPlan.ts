/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IResponse } from '../common/aideAgentModel.js';

interface IAideAgentPlanProgressMessage {
	content: IMarkdownString;
	kind: 'progressMessage';
}

export interface AideAgentPlanTreeItem {
	readonly id: string;
	readonly response: IResponse;
	readonly progressMessages: ReadonlyArray<IAideAgentPlanProgressMessage>;
	readonly isComplete: boolean;
	currentRenderedHeight: number | undefined;
}
