/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IAideAgentService } from 'vs/workbench/contrib/aideAgent/common/aideAgentService';
import { AideAgentService } from 'vs/workbench/contrib/aideAgent/common/aideAgentServiceImpl';

registerSingleton(IAideAgentService, AideAgentService, InstantiationType.Delayed);
