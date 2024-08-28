/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerASTNavigationActions } from 'vs/workbench/contrib/astNavigation/browser/actions/astNavigationActions';
import { IASTNavigationService } from 'vs/workbench/contrib/astNavigation/common/astNavigationService';
import { ASTNavigationService } from 'vs/workbench/contrib/astNavigation/common/astNavigationServiceImpl';

registerASTNavigationActions();

registerSingleton(IASTNavigationService, ASTNavigationService, InstantiationType.Eager);
