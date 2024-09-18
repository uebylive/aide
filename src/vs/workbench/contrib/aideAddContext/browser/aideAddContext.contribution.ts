/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { AddContext } from '../../../../workbench/contrib/aideAddContext/browser/aideAddContext.js';

registerWorkbenchContribution2(
	AddContext.ID,
	AddContext,
	WorkbenchPhase.Eventually // registration only
);
