/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from 'vs/platform/instantiation/common/extensions';
import { AideBarService } from 'vs/workbench/browser/parts/aidebar/aidebarPart';
import { IAideBarService } from 'vs/workbench/services/aideBar/browser/aideBarService';

registerSingleton(IAideBarService, AideBarService, InstantiationType.Eager);
