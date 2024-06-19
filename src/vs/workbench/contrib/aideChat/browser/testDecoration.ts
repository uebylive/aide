/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colors/inputColors';
import { IThemeService } from 'vs/platform/theme/common/themeService';


export class TestDecoration extends Disposable {
	public static readonly ID = 'editor.contrib.testDecoration';
	private readonly _toDispose = new DisposableStore();

	constructor(
		private readonly _editor: ICodeEditor,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();

		console.log('starting up');

		this.codeEditorService.registerDecorationType('test', 'test', {
			color: '#FFFFFF',
			backgroundColor: '#FF0000',
			borderRadius: '3px',
		});

		const decoration: IDecorationOptions[] = [
			{
				range: {
					startLineNumber: 1,
					startColumn: 1,
					endColumn: 30,
					endLineNumber: 9
				},
				hoverMessage: { value: 'test' },
				// renderOptions: {
				// after: {
				// contentText: 'test',
				// color: this.getPlaceholderColor()
				// }
				// }
			}
		];

		this._editor.setDecorationsByType('test', 'test', decoration);

	}

	override dispose(): void {
		super.dispose();
		this._toDispose.dispose();
	}


	private getPlaceholderColor(): string | undefined {
		const theme = this.themeService.getColorTheme();
		const transparentForeground = theme.getColor(inputPlaceholderForeground);
		return transparentForeground?.toString();
	}
}
