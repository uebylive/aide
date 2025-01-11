/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export enum DevtoolsStatus {
	ServerConnected = 'server-connected',
	DevtoolsConnected = 'devtools-connected',
	Error = 'error',
	Idle = 'idle'
}


export type InspectedElementPayload =
	| InspectElementError
	| InspectElementParsedFullData
	| InspectElementHydratedPath
	| InspectElementNoChange
	| InspectElementNotFound;

export type InspectElementError = {
	id: number;
	responseID: number;
	type: 'error';
	errorType: 'user' | 'unknown-hook' | 'uncaught';
	message: string;
	stack?: string;
};

export type InspectElementParsedFullData = {
	id: number;
	responseID: number;
	type: 'full-data';
	value: InspectedElement;
	parsedSource?: {
		source: ParsedSourceData;
		line: number;
		column: number;
	};
};

export type ParsedSourceURLData = {
	type: 'URL';
	url: string;
	relativePath: string;
};

export type ParsedSourceAbsoluteData = {
	type: 'absolute';
	path: string;
};

export type ParsedSourceRelativeData = {
	type: 'relative';
	path: string;
};

export type ParsedSourceData =
	| ParsedSourceAbsoluteData
	| ParsedSourceRelativeData
	| ParsedSourceURLData;

export type InspectElementHydratedPath = {
	id: number;
	responseID: number;
	type: 'hydrated-path';
	path: Array<string | number>;
	value: any;
};

export type InspectElementNoChange = {
	id: number;
	responseID: number;
	type: 'no-change';
};

export type InspectElementNotFound = {
	id: number;
	responseID: number;
	type: 'not-found';
};



type SerializedElement = {
	displayName: string | null;
	id: number;
	key: number | string | null;
	type: ElementType;
};

type InspectedElement = {
	id: number;

	// Does the current renderer support editable hooks and function props?
	canEditHooks: boolean;
	canEditFunctionProps: boolean;

	// Does the current renderer support advanced editing interface?
	canEditHooksAndDeletePaths: boolean;
	canEditHooksAndRenamePaths: boolean;
	canEditFunctionPropsDeletePaths: boolean;
	canEditFunctionPropsRenamePaths: boolean;

	// Is this Error, and can its value be overridden now?
	canToggleError: boolean;
	isErrored: boolean;

	// Is this Suspense, and can its value be overridden now?
	canToggleSuspense: boolean;

	// Can view component source location.
	canViewSource: boolean;

	// Does the component have legacy context attached to it.
	hasLegacyContext: boolean;

	// Inspectable properties.
	context: Object | null;
	hooks: Object | null;
	props: Object | null;
	state: Object | null;
	key: number | string | null;
	errors: Array<[string, number]>;
	warnings: Array<[string, number]>;

	// List of owners
	owners: Array<SerializedElement> | null;
	source: Source | null;

	type: ElementType;

	// Meta information about the root this element belongs to.
	rootType: string | null;

	// Meta information about the renderer that created this element.
	rendererPackageName: string | null;
	rendererVersion: string | null;

	// UI plugins/visualizations for the inspected element.
	plugins: Plugins;
};


// Different types of elements displayed in the Elements tree.
// These types may be used to visually distinguish types,
// or to enable/disable certain functionality.
type ElementType =
	| 1
	| 2
	| 5
	| 6
	| 7
	| 8
	| 9
	| 10
	| 11
	| 12
	| 13
	| 14
	| 15;

type Source = {
	sourceURL: string;
	line: number;
	column: number;
};

type Plugins = {
	stylex: StyleXPlugin | null;
};

type StyleXPlugin = {
	sources: Array<string>;
	resolvedStyles: Object;
};
