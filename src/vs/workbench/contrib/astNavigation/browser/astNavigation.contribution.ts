/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerASTNavigationActions } from 'vs/workbench/contrib/astNavigation/browser/actions/astNavigationActions';
import { ASTNavigationService } from 'vs/workbench/contrib/astNavigation/browser/astNavigationServiceImpl';
import { IASTNavigationService } from 'vs/workbench/contrib/astNavigation/common/astNavigationService';

registerASTNavigationActions();

registerSingleton(IASTNavigationService, ASTNavigationService, InstantiationType.Eager);
