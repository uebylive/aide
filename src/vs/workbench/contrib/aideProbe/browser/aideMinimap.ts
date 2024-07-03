/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IMinimapModel, IMinimapRenderingContext, InnerMinimap, MinimapOptions } from 'vs/editor/browser/viewParts/minimap/minimap';
import { Selection } from 'vs/editor/common/core/selection';
import { EditorTheme } from 'vs/editor/common/editorTheme';
import { TextModelResolvedOptions } from 'vs/editor/common/model';
import { ViewLineData, ViewModelDecoration } from 'vs/editor/common/viewModel';
import { MinimapTokensColorTracker } from 'vs/editor/common/viewModel/minimapTokensColorTracker';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class AideMinimap implements IMinimapModel {
	tokensColorTracker: MinimapTokensColorTracker;
	options: MinimapOptions;

	constructor(
		editor: ICodeEditor,
		@IThemeService private readonly _themeService: IThemeService
	) {
		this.tokensColorTracker = MinimapTokensColorTracker.getInstance();
		const theme = new EditorTheme(this._themeService.getColorTheme());
		this.options = new MinimapOptions(editor.getOptions(), theme, this.tokensColorTracker);
		const innerMinimap = new InnerMinimap(theme, this);
		const minimapCtx: IMinimapRenderingContext = {
			viewportContainsWhitespaceGaps: false,
			scrollWidth: 200,
			scrollHeight: 200,

			viewportStartLineNumber: 1,
			viewportEndLineNumber: 2,
			viewportStartLineNumberVerticalOffset: 0,

			scrollTop: 0,
			scrollLeft: 0,

			viewportWidth: 200,
			viewportHeight: 200,
		};
		innerMinimap.render(minimapCtx);
	}

	getLineCount(): number {
		throw new Error('Method not implemented.');
	}

	getRealLineCount(): number {
		throw new Error('Method not implemented.');
	}

	getLineContent(lineNumber: number): string {
		throw new Error('Method not implemented.');
	}

	getLineMaxColumn(lineNumber: number): number {
		throw new Error('Method not implemented.');
	}

	getMinimapLinesRenderingData(startLineNumber: number, endLineNumber: number, needed: boolean[]): (ViewLineData | null)[] {
		throw new Error('Method not implemented.');
	}

	getSelections(): Selection[] {
		throw new Error('Method not implemented.');
	}

	getMinimapDecorationsInViewport(startLineNumber: number, endLineNumber: number): ViewModelDecoration[] {
		throw new Error('Method not implemented.');
	}

	getSectionHeaderDecorationsInViewport(startLineNumber: number, endLineNumber: number): ViewModelDecoration[] {
		throw new Error('Method not implemented.');
	}

	getSectionHeaderText(decoration: ViewModelDecoration, fitWidth: (s: string) => string): string | null {
		throw new Error('Method not implemented.');
	}

	getOptions(): TextModelResolvedOptions {
		throw new Error('Method not implemented.');
	}

	revealLineNumber(lineNumber: number): void {
		throw new Error('Method not implemented.');
	}

	setScrollTop(scrollTop: number): void {
		throw new Error('Method not implemented.');
	}
}
