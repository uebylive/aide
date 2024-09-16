/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from 'vs/platform/instantiation/common/extensions';
import { BottomBarPartService } from 'vs/workbench/browser/parts/bottombar/bottomBarPart';
import { IBottomBarPartService } from 'vs/workbench/services/bottomBarPart/browser/bottomBarPartService';

registerSingleton(IBottomBarPartService, BottomBarPartService, InstantiationType.Eager);
