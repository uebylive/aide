/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import logger from '../logger';

class SemanticSearchQuery implements vscode.TextSearchQuery {
	pattern: string;

	constructor(pattern: string) {
		this.pattern = pattern;
	}

	toString(): string {
		return `SemanticSearchQuery { pattern: "${this.pattern}" }`;
	}
}

class SemanticSearchOptions implements vscode.TextSearchOptions {
	maxResults: number;
	previewOptions?: vscode.TextSearchPreviewOptions | undefined;
	maxFileSize?: number | undefined;
	encoding?: string | undefined;
	beforeContext?: number | undefined;
	afterContext?: number | undefined;
	folder: vscode.Uri;
	includes: string[];
	excludes: string[];
	useIgnoreFiles: boolean;
	followSymlinks: boolean;
	useGlobalIgnoreFiles: boolean;
	useParentIgnoreFiles: boolean;

	constructor(
		maxResults: number,
		folder: vscode.Uri,
		includes: string[],
		excludes: string[],
	) {
		this.maxResults = maxResults;
		this.folder = folder;
		this.includes = includes;
		this.excludes = excludes;
		this.useIgnoreFiles = true;
		this.followSymlinks = true;
		this.useGlobalIgnoreFiles = true;
		this.useParentIgnoreFiles = true;
	}

	toString(): string {
		return `SemanticSearchOptions { folder: "${this.folder}", includes: "${this.includes}", excludes: "${this.excludes}" }`;
	}
}

class SemanticSearchMatchPreview implements vscode.TextSearchMatchPreview {
	text: string;
	matches: vscode.Range | vscode.Range[];

	constructor(text: string, matches: vscode.Range | vscode.Range[]) {
		this.text = text;
		this.matches = matches;
	}

	toString(): string {
		return `SemanticSearchMatchPreview { text: "${this.text}", matches: "${this.matches}" }`;
	}
}

class SemanticSearchMatch implements vscode.TextSearchMatch {
	uri: vscode.Uri;
	ranges: vscode.Range | vscode.Range[];
	preview: vscode.TextSearchMatchPreview;

	constructor(
		uri: vscode.Uri,
		ranges: vscode.Range | vscode.Range[],
		preview: vscode.TextSearchMatchPreview,
	) {
		this.uri = uri;
		this.ranges = ranges;
		this.preview = preview;
	}

	toString(): string {
		return `SemanticSearchMatch { uri: "${this.uri}", ranges: "${this.ranges}", preview: "${this.preview}" }`;
	}
}

class SemanticSearchContext implements vscode.TextSearchContext {
	uri: vscode.Uri;
	text: string;
	lineNumber: number;

	constructor(uri: vscode.Uri, text: string, lineNumber: number) {
		this.uri = uri;
		this.text = text;
		this.lineNumber = lineNumber;
	}

	toString(): string {
		return `SemanticSearchContext { uri: "${this.uri}", text: "${this.text}", lineNumber: "${this.lineNumber}" }`;
	}
}

type SemanticSearchResult = SemanticSearchMatch | SemanticSearchContext;

class SemanticSearchCompleteMessage implements vscode.TextSearchCompleteMessage {
	text: string;
	trusted?: boolean | undefined;
	type: vscode.TextSearchCompleteMessageType;

	constructor(text: string, type: vscode.TextSearchCompleteMessageType) {
		this.text = text;
		this.type = type;
	}

	toString(): string {
		return `SemanticSearchCompleteMessage { text: "${this.text}", type: "${this.type}" }`;
	}
}

class SemanticSearchComplete implements vscode.TextSearchComplete {
	limitHit?: boolean;
	message?: SemanticSearchCompleteMessage | SemanticSearchCompleteMessage[];

	constructor(limitHit?: boolean, message?: SemanticSearchCompleteMessage | SemanticSearchCompleteMessage[]) {
		this.limitHit = limitHit;
		this.message = message;
	}

	toString(): string {
		return `SemanticSearchComplete { limitHit: "${this.limitHit}", message: "${this.message}" }`;
	}
}

export class SemanticSearchProvider implements vscode.TextSearchProvider {
	public static readonly providerType = 'codestory.semanticSearch';

	provideTextSearchResults(
		query: SemanticSearchQuery,
		options: SemanticSearchOptions,
		progress: vscode.Progress<SemanticSearchResult>,
		token: vscode.CancellationToken,
	): vscode.ProviderResult<SemanticSearchComplete> {
		logger.info(`provideTextSearchResults: query: ${query}, options: ${options}, progress: ${progress}, token: ${token}`);
		return new Promise<SemanticSearchComplete>((resolve, reject) => {
			return resolve(new SemanticSearchComplete());
		});
	}
}
