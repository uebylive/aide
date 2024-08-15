/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from 'vs/platform/instantiation/common/extensions';
import { AideControlsPartService } from 'vs/workbench/browser/parts/aidecontrols/aidecontrolsPart';
import { IAideControlsPartService } from 'vs/workbench/services/aideControls/browser/aideControlsPartService';


registerSingleton(IAideControlsPartService, AideControlsPartService, InstantiationType.Eager);
