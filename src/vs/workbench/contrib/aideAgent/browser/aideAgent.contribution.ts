/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { registerAgentActions } from 'vs/workbench/contrib/aideAgent/browser/actions/aideAgentActions';
import { AideControls } from 'vs/workbench/contrib/aideAgent/browser/aideControls';
import { AideControlsService, IAideControlsService } from 'vs/workbench/contrib/aideAgent/browser/aideControlsService';
import { IAideAgentService } from 'vs/workbench/contrib/aideAgent/common/aideAgentService';
import { AideAgentService } from 'vs/workbench/contrib/aideAgent/common/aideAgentServiceImpl';

// Register services
registerSingleton(IAideAgentService, AideAgentService, InstantiationType.Delayed);
registerSingleton(IAideControlsService, AideControlsService, InstantiationType.Delayed);

// Register actions
registerAgentActions();

// Register workbench contributions
registerWorkbenchContribution2(AideControls.ID, AideControls, WorkbenchPhase.Eventually);
