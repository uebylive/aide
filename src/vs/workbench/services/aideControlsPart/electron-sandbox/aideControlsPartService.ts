/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AideControlsPartService } from '../../../browser/parts/aidecontrols/aidecontrolsPart.js';
import { IAideControlsPartService } from '../browser/aideControlsPartService.js';

registerSingleton(IAideControlsPartService, AideControlsPartService, InstantiationType.Eager);
