/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SymbolNavigationActionType } from 'vscode';

export function getSymbolNavigationActionTypeLabel(actionType: SymbolNavigationActionType): string {
	switch (actionType) {
		case SymbolNavigationActionType.GoToDefinition:
			return 'Go To Definition';
		case SymbolNavigationActionType.GoToDeclaration:
			return 'Go To Declaration';
		case SymbolNavigationActionType.GoToTypeDefinition:
			return 'Go To Type Definition';
		case SymbolNavigationActionType.GoToImplementation:
			return 'Go To Implementation';
		case SymbolNavigationActionType.GoToReferences:
			return 'Go To References';
		case SymbolNavigationActionType.GenericGoToLocation:
			return 'Generic Go To Location';
		default:
			return 'Unknown Action Type';
	}
}
