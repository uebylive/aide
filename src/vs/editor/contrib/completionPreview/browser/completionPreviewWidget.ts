/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';
import { DisposableStore, IReference, dispose } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';
import 'vs/css!./media/completionPreviewWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { Location } from 'vs/editor/common/languages';
import { ITextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import * as peekView from 'vs/editor/contrib/peekView/browser/peekView';
import * as nls from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';

export class CompletionPreviewController implements IEditorContribution {
	static readonly ID = 'editor.contrib.completionPreviewController';

	private _widget?: CompletionPreviewWidget;

	static get(editor: ICodeEditor): CompletionPreviewController | null {
		return editor.getContribution<CompletionPreviewController>(CompletionPreviewController.ID);
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	show(position: Position): void {
		if (!this._widget) {
			this._widget = this._instantiationService.createInstance(CompletionPreviewWidget, this._editor);
		}
		this._widget.show(new Range(position.lineNumber, position.column, position.lineNumber, position.column));
	}

	async revealPreview(location: Location): Promise<void> {
		if (!this._editor.hasModel() || !this._widget) {
			return;
		}

		await this._widget.revealPreview(location);
	}

	dispose(): void {
		this._widget?.dispose();
		this._widget = undefined;
	}
}
registerEditorContribution(CompletionPreviewController.ID, CompletionPreviewController, EditorContributionInstantiation.Lazy);

export class CompletionPreviewWidget extends peekView.PeekViewWidget {
	private readonly _callOnDispose = new DisposableStore();

	private _preview!: ICodeEditor;
	private _previewModelReference!: IReference<ITextEditorModel>;
	private _previewContainer!: HTMLElement;
	private _revealedLocation?: Location;
	private _dim = new dom.Dimension(0, 0);

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@peekView.IPeekViewService private readonly _peekViewService: peekView.IPeekViewService,
		@ILabelService private readonly _uriLabel: ILabelService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
	) {
		super(editor, { showFrame: true, showArrow: false, isResizeable: true, isAccessible: true }, instantiationService);

		this._applyTheme(themeService.getColorTheme());
		this._callOnDispose.add(themeService.onDidColorThemeChange(this._applyTheme.bind(this)));
		this._peekViewService.addExclusiveWidget(editor, this);
		this.create();
	}

	override dispose(): void {
		this._callOnDispose.dispose();
		dispose(this._preview);
		dispose(this._previewModelReference);
		super.dispose();
	}

	private _applyTheme(theme: IColorTheme) {
		const borderColor = theme.getColor(peekView.peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: theme.getColor(peekView.peekViewTitleBackground) || Color.transparent,
			primaryHeadingColor: theme.getColor(peekView.peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekView.peekViewTitleInfoForeground)
		});
	}

	override show(where: Range) {
		super.show(where, 8);
	}

	protected override _fillBody(containerElement: HTMLElement): void {
		this.setCssClass('completion-preview-widget');

		this._previewContainer = dom.append(containerElement, dom.$('div.preview.inline'));
		const options: IEditorOptions = {
			scrollBeyondLastLine: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false,
				alwaysConsumeMouseWheel: true
			},
			overviewRulerLanes: 2,
			fixedOverflowWidgets: true,
			minimap: {
				enabled: false
			}
		};
		this._preview = this.instantiationService.createInstance(EmbeddedCodeEditorWidget, this._previewContainer, options, {}, this.editor);
		this._preview.layout(this._dim);
		dom.hide(this._previewContainer);
	}

	protected override _onWidth(width: number) {
		if (this._dim) {
			this._doLayoutBody(this._dim.height, width);
		}
	}

	protected override _doLayoutBody(heightInPixel: number, widthInPixel: number): void {
		super._doLayoutBody(heightInPixel, widthInPixel);
		this._dim = new dom.Dimension(widthInPixel, heightInPixel);
		this._preview.layout(this._dim);
	}

	async revealPreview(location: Location): Promise<void> {
		if (this._revealedLocation === location) {
			return;
		}
		this._revealedLocation = location;

		if (location.uri.scheme !== Schemas.inMemory) {
			this.setTitle(basenameOrAuthority(location.uri), this._uriLabel.getUriLabel(dirname(location.uri)));
		} else {
			this.setTitle(nls.localize('peekView.alternateTitle', "Preview"));
		}

		const ref = await this._textModelResolverService.createModelReference(location.uri);

		dispose(this._previewModelReference);

		const model = ref.object;
		if (model) {
			const scrollType = this._preview.getModel() === model.textEditorModel ? ScrollType.Smooth : ScrollType.Immediate;
			const sel = Range.lift(location.range).collapseToStart();
			this._previewModelReference = ref;
			this._preview.setModel(model.textEditorModel);
			this._preview.setSelection(sel);
			this._preview.revealRangeInCenter(sel, scrollType);
		} else {
			this._preview.setModel(null);
			ref.dispose();
		}
		dom.show(this._previewContainer);
	}
}
