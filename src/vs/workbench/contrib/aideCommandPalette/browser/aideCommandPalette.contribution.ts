/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerCommandPaletteActions } from 'vs/workbench/contrib/aideCommandPalette/browser/actions/aideCommandPaletteActions';
import { AideCommandPaletteService } from 'vs/workbench/contrib/aideCommandPalette/browser/aideCommandPalette';
import { IAideCommandPaletteService } from 'vs/workbench/contrib/aideCommandPalette/common/aideCommandPaletteService';

registerSingleton(IAideCommandPaletteService, AideCommandPaletteService, InstantiationType.Eager);

registerCommandPaletteActions();
