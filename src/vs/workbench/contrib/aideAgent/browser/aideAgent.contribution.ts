/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IAideAgentService } from '../common/aideAgentService.js';
import { AideAgentService } from '../common/aideAgentServiceImpl.js';
import { registerAgentActions } from './actions/aideAgentActions.js';
import { AideControls } from './aideControls.js';
import { AideControlsService, IAideControlsService } from './aideControlsService.js';

// Register services
registerSingleton(IAideAgentService, AideAgentService, InstantiationType.Delayed);
registerSingleton(IAideControlsService, AideControlsService, InstantiationType.Delayed);

// Register actions
registerAgentActions();

// Register workbench contributions
registerWorkbenchContribution2(AideControls.ID, AideControls, WorkbenchPhase.Eventually);
