/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IArcWidgetService } from 'vs/workbench/contrib/arc/browser/arc';
import { ArcContributionService } from 'vs/workbench/contrib/arc/browser/arcContributionServiceImpl';
import { ArcWidgetService } from 'vs/workbench/contrib/arc/browser/arcWidget';
import { IArcContributionService } from 'vs/workbench/contrib/arc/common/arcContributionService';
import { IArcService } from 'vs/workbench/contrib/arc/common/arcService';
import { ArcService } from 'vs/workbench/contrib/arc/common/arcServiceImpl';

registerSingleton(IArcService, ArcService, InstantiationType.Delayed);
registerSingleton(IArcWidgetService, ArcWidgetService, InstantiationType.Delayed);
registerSingleton(IArcContributionService, ArcContributionService, InstantiationType.Delayed);
