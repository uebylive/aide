/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// We store the various types of requests we are getting from the sidecar over here

export type SidecarDiagnosticsRequest = {
	fs_file_path: string;
	range: {
		startPosition: {
			line: number;
			character: number;
		};
		endPosition: {
			line: number;
			character: number;
		};
	};
};

export type SidecarGoToDefinitionRequest = {
	fs_file_path: string;
	position: {
		line: number;
		character: number;
	};
};

export type SidecarGoToDefinitionResponse = {
	symbols: FileAndRange[];
};

export type FileAndRange = {
	fs_file_path: string;
	range: {
		startPosition: {
			line: number;
			character: number;
		};
		endPosition: {
			line: number;
			character: number;
		};
	};
};

export type SidecarOpenFileToolRequest = {
	fs_file_path: string;
};

export type SidecarOpenFileToolResponse = {
	fs_file_path: string;
	file_contents: string;
	language: string;
	exists: boolean;
};

export type SidecarGoToImplementationRequest = {
	fs_file_path: string;
	position: {
		line: number;
		character: number;
	};
};

export type SidecarGoToImplementationResponse = {
	implementation_locations: FileAndRange[];
};
