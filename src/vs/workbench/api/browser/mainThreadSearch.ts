/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IFileMatch, IFileQuery, IRawFileMatch2, ISearchComplete, ISearchCompleteStats, ISearchProgressItem, ISearchResultProvider, ISearchService, ITextQuery, ITextSearchMatch, QueryType, SearchProviderType } from 'vs/workbench/services/search/common/search';
import { ExtHostContext, ExtHostSearchShape, MainContext, MainThreadSearchShape } from '../common/extHost.protocol';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { revive } from 'vs/base/common/marshalling';

@extHostNamedCustomer(MainContext.MainThreadSearch)
export class MainThreadSearch implements MainThreadSearchShape {

	private readonly _proxy: ExtHostSearchShape;
	private readonly _searchProvider = new Map<number, RemoteSearchProvider>();

	constructor(
		extHostContext: IExtHostContext,
		@ISearchService private readonly _searchService: ISearchService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService _configurationService: IConfigurationService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSearch);
		this._proxy.$enableExtensionHostSearch();
	}

	dispose(): void {
		this._searchProvider.forEach(value => value.dispose());
		this._searchProvider.clear();
	}

	$registerTextSearchProvider(handle: number, scheme: string): void {
		this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, SearchProviderType.text, scheme, handle, this._proxy, this._commandService));
	}

	$registerFileSearchProvider(handle: number, scheme: string): void {
		this._searchProvider.set(handle, new RemoteSearchProvider(this._searchService, SearchProviderType.file, scheme, handle, this._proxy, this._commandService));
	}

	$unregisterProvider(handle: number): void {
		dispose(this._searchProvider.get(handle));
		this._searchProvider.delete(handle);
	}

	$handleFileMatch(handle: number, session: number, data: UriComponents[]): void {
		const provider = this._searchProvider.get(handle);
		if (!provider) {
			throw new Error('Got result for unknown provider');
		}

		provider.handleFindMatch(session, data);
	}

	$handleTextMatch(handle: number, session: number, data: IRawFileMatch2[]): void {
		const provider = this._searchProvider.get(handle);
		if (!provider) {
			throw new Error('Got result for unknown provider');
		}

		provider.handleFindMatch(session, data);
	}

	$handleTelemetry(eventName: string, data: any): void {
		this._telemetryService.publicLog(eventName, data);
	}
}

class SearchOperation {

	private static _idPool = 0;

	constructor(
		readonly progress?: (match: IFileMatch) => any,
		readonly id: number = ++SearchOperation._idPool,
		readonly matches = new Map<string, IFileMatch>()
	) {
		//
	}

	addMatch(match: IFileMatch): void {
		const existingMatch = this.matches.get(match.resource.toString());
		if (existingMatch) {
			// TODO@rob clean up text/file result types
			// If a file search returns the same file twice, we would enter this branch.
			// It's possible that could happen, #90813
			if (existingMatch.results && match.results) {
				existingMatch.results.push(...match.results);
			}
		} else {
			this.matches.set(match.resource.toString(), match);
		}

		this.progress?.(match);
	}
}

class RemoteSearchProvider implements ISearchResultProvider, IDisposable {

	private readonly _registrations = new DisposableStore();
	private readonly _searches = new Map<number, SearchOperation>();

	constructor(
		searchService: ISearchService,
		type: SearchProviderType,
		private readonly _scheme: string,
		private readonly _handle: number,
		private readonly _proxy: ExtHostSearchShape,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		this._registrations.add(searchService.registerSearchResultProvider(this._scheme, type, this));
	}

	dispose(): void {
		this._registrations.dispose();
	}

	fileSearch(query: IFileQuery, token: CancellationToken = CancellationToken.None): Promise<ISearchComplete> {
		return this.doSearch(query, undefined, token);
	}

	async doSemanticSearch(query: ITextQuery, onProgress?: (p: ISearchProgressItem) => void, token: CancellationToken = CancellationToken.None): Promise<ISearchComplete> {
		const search = new SearchOperation(onProgress);
		const semanticSearchCommand = CommandsRegistry.getCommand('codestory.semanticSearch');
		if (semanticSearchCommand) {
			const results = await this._commandService.executeCommand(semanticSearchCommand.id, query.contentPattern.pattern);
			results.forEach((result: any) => {
				const previewText = result.codeSymbolInformation.codeSnippet.code.split('\n')[0];
				const searchResult: ITextSearchMatch = {
					preview: {
						matches: [{
							startLineNumber: 0,
							startColumn: 0,
							endLineNumber: 0,
							endColumn: 0,
						}],
						text: previewText
					},
					ranges: [{
						startLineNumber: result.codeSymbolInformation.symbolStartLine,
						startColumn: 0,
						endLineNumber: result.codeSymbolInformation.symbolStartLine,
						endColumn: 0,
					}],
				};
				search.addMatch({
					resource: URI.file(result.codeSymbolInformation.fsFilePath),
					results: [searchResult]
				});
			});
			console.log('[semanticSearch]');
			console.log(search.matches.values());
			const response: ISearchComplete = {
				results: Array.from(search.matches.values()),
				stats: {
					type: 'textSearchProvider',
				},
				limitHit: false,
				messages: []
			};
			console.log('[semanticSearch][extensionAnswer] :', response);
			return response;
		} else {
			return Promise.reject('command is not defined');
		}
	}

	textSearch(query: ITextQuery, onProgress?: (p: ISearchProgressItem) => void, token: CancellationToken = CancellationToken.None): Promise<ISearchComplete> {
		if (query.useSemantic) {
			return this.doSemanticSearch(query, onProgress, token);
		}
		return this.doSearch(query, onProgress, token);
	}

	doSearch(query: ITextQuery | IFileQuery, onProgress?: (p: ISearchProgressItem) => void, token: CancellationToken = CancellationToken.None): Promise<ISearchComplete> {
		if (!query.folderQueries.length) {
			throw new Error('Empty folderQueries');
		}

		const search = new SearchOperation(onProgress);
		this._searches.set(search.id, search);

		const searchP = query.type === QueryType.File
			? this._proxy.$provideFileSearchResults(this._handle, search.id, query, token)
			: this._proxy.$provideTextSearchResults(this._handle, search.id, query, token);

		return Promise.resolve(searchP).then((result: ISearchCompleteStats) => {
			this._searches.delete(search.id);
			return { results: Array.from(search.matches.values()), stats: result.stats, limitHit: result.limitHit, messages: result.messages };
		}, err => {
			this._searches.delete(search.id);
			return Promise.reject(err);
		});
	}

	clearCache(cacheKey: string): Promise<void> {
		return Promise.resolve(this._proxy.$clearCache(cacheKey));
	}

	handleFindMatch(session: number, dataOrUri: Array<UriComponents | IRawFileMatch2>): void {
		const searchOp = this._searches.get(session);

		if (!searchOp) {
			// ignore...
			return;
		}

		dataOrUri.forEach(result => {
			if ((<IRawFileMatch2>result).results) {
				searchOp.addMatch(revive((<IRawFileMatch2>result)));
			} else {
				searchOp.addMatch({
					resource: URI.revive(<UriComponents>result)
				});
			}
		});
	}
}
