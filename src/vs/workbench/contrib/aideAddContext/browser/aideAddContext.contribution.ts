/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { AddContext } from 'vs/workbench/contrib/aideAddContext/browser/aideAddContext';

registerWorkbenchContribution2(
	AddContext.ID,
	AddContext,
	WorkbenchPhase.Eventually // registration only
);
