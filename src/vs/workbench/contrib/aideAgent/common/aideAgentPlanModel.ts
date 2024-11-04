/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from '../../../../base/common/htmlContent.js';

export interface IAideAgentPlanStepModel {
	readonly index: number;
	readonly title: string;
	readonly description: IMarkdownString;
	readonly isLast: boolean;
}

export interface IAideAgentPlanModel {
	readonly sessionId: string;
	readonly steps: IAideAgentPlanStepModel[];
}
