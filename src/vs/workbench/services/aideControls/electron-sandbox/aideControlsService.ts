/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from 'vs/platform/instantiation/common/extensions';
import { AideControlsService } from 'vs/workbench/browser/parts/aidecontrols/aidecontrolsPart';
import { IAideControlsService } from 'vs/workbench/services/aideControls/browser/aideControlsService';

registerSingleton(IAideControlsService, AideControlsService, InstantiationType.Eager);
