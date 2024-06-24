/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { assertIsDefined } from 'vs/base/common/types';
import { TextEditorSelectionRevealType } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { FileKind } from 'vs/platform/files/common/files';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { SymbolKind, SymbolKinds } from 'vs/editor/common/languages';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IAideProbeBreakdownViewModel, IAideProbeGoToDefinitionViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { AideProbeExplanationWidget } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanationWidget';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownRenderer';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { editorFindMatchForeground, editorFindMatch } from 'vs/platform/theme/common/colors/editorColors';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';

const $ = dom.$;

const decorationDescription = 'chat-breakdown-definition';
const placeholderDecorationType = 'chat-breakdown-definition-session-detail';

export class AideChatBreakdowns extends Disposable {
	private readonly _onDidChangeFocus = this._register(new Emitter<IAideProbeBreakdownViewModel>());
	readonly onDidChangeFocus = this._onDidChangeFocus.event;

	private activeBreakdown: IAideProbeBreakdownViewModel | undefined;

	private list: WorkbenchList<IAideProbeBreakdownViewModel> | undefined;
	private renderer: BreakdownRenderer;
	private viewModel: IAideProbeBreakdownViewModel[] = [];
	private isVisible: boolean | undefined;
	private explanationWidget: Map<string, AideProbeExplanationWidget> = new Map();
	private goToDefinitionDecorations: IAideProbeGoToDefinitionViewModel[] = [];

	private readonly markdownRenderer: MarkdownRenderer;

	constructor(
		private readonly resourceLabels: ResourceLabels,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICodeEditorService private readonly editorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService,
		@IEditorProgressService private readonly editorProgressService: IEditorProgressService,
	) {
		super();

		this.markdownRenderer = this.instantiationService.createInstance(ChatMarkdownRenderer, undefined);
		this.renderer = this._register(this.instantiationService.createInstance(BreakdownRenderer, this.resourceLabels));

		const theme = this.themeService.getColorTheme();
		const decorationBackgroundColor = theme.getColor(editorFindMatch);
		const decorationColor = theme.getColor(editorFindMatchForeground);

		this.editorService.registerDecorationType(decorationDescription, placeholderDecorationType, {
			color: decorationColor?.toString() || '#f3f4f6',
			backgroundColor: decorationBackgroundColor?.toString() || '#1f2937',
			borderRadius: '3px',
		});

	}

	show(container: HTMLElement): void {
		if (this.isVisible) {
			return; // already visible
		}

		// Lazily create if showing for the first time
		if (!this.list) {
			this.createBreakdownsList(container);
		}

		// Make visible
		this.isVisible = true;
	}

	private createBreakdownsList(listContainer: HTMLElement): void {
		// List
		const listDelegate = this.instantiationService.createInstance(BreakdownsListDelegate);
		const list = this.list = this._register(<WorkbenchList<IAideProbeBreakdownViewModel>>this.instantiationService.createInstance(
			WorkbenchList,
			'BreakdownsList',
			listContainer,
			listDelegate,
			[this.renderer],
			{
				setRowLineHeight: false,
				supportDynamicHeights: true,
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false
			}
		));

		this._register(list.onDidChangeContentHeight(height => {
			list.layout(height);
		}));
		this._register(this.renderer.onDidChangeItemHeight(e => {
			list.updateElementHeight(e.index, e.height);
		}));
		this._register(list.onDidChangeFocus(e => {
			if (e.indexes.length === 1) {
				const index = e.indexes[0];
				list.setSelection([index]);
				const element = list.element(index);
				this._onDidChangeFocus.fire(element);
				if (element && element.uri && element.name) {
					this.openBreakdownReference(element);
				}
			}
		}));
		this._register(list.onDidOpen(async e => {
			if (e.element && e.element.uri && e.element.name) {
				this._onDidChangeFocus.fire(e.element);
				this.openBreakdownReference(e.element);
			}
		}));
	}

	private getBreakdownListIndex(element: IAideProbeBreakdownViewModel): number {
		let matchIndex = -1;
		this.viewModel.forEach((item, index) => {
			if (item.uri.fsPath === element.uri.fsPath && item.name === element.name) {
				matchIndex = index;
			}
		});
		return matchIndex;
	}

	async updateGoToDefinitionsDecorations(definitions: IAideProbeGoToDefinitionViewModel[]): Promise<void> {
		this.goToDefinitionDecorations = definitions;
	}

	async openBreakdownReference(element: IAideProbeBreakdownViewModel): Promise<void> {
		const { uri, name } = element;
		const symbolKey = `${uri.fsPath}:${name}`;

		if (this.activeBreakdown === element) {
			return;
		} else {
			this.activeBreakdown = element;
			const index = this.getBreakdownListIndex(element);
			if (this.list && index !== -1) {
				this.list.setFocus([index]);
			}

			const keys = this.explanationWidget.keys();
			for (const key of keys) {
				if (key === symbolKey) {
					continue;
				}

				// const existingWidget = this.explanationWidget.get(key);
				// existingWidget?.hide();
			}
		}

		let codeEditor: ICodeEditor | null;
		let explanationWidgetPosition: Position = new Position(1, 300);

		const resolveLocationOperation = element.symbol;
		this.editorProgressService.showWhile(resolveLocationOperation);
		const symbol = await resolveLocationOperation;

		if (!symbol) {
			codeEditor = await this.editorService.openCodeEditor({
				resource: uri,
				options: {
					pinned: false,
					preserveFocus: true,
				}
			}, null);
		} else {
			explanationWidgetPosition = new Position(symbol.range.startLineNumber, 300);
			codeEditor = await this.editorService.openCodeEditor({
				resource: uri,
				options: {
					pinned: false,
					preserveFocus: true,
					selection: symbol.range,
					selectionRevealType: TextEditorSelectionRevealType.NearTop
				}
			}, null);
		}

		if (codeEditor && symbol && explanationWidgetPosition) {
			if (this.explanationWidget.get(symbolKey)) {
				const existingWidget = this.explanationWidget.get(symbolKey)!;
				existingWidget.updateBreakdown(element);
			} else {
				const newWidget = this._register(this.instantiationService.createInstance(AideProbeExplanationWidget, codeEditor, this.markdownRenderer));
				newWidget.updateBreakdown(element);
				this.explanationWidget.set(symbolKey, newWidget);
			}

			// show the go-to-definition information
			const rowResponse = $('div.breakdown-content');
			const content = new MarkdownString();
			content.appendMarkdown('[testing-skcd]');
			const renderedContent = this.markdownRenderer.render(content);
			rowResponse.appendChild(renderedContent.element);


			// TODO(skcd): pass the data over here
			// this.goToDefinitionWidget = this._register(this.instantiationService.createInstance(AideProbeGoToDefinitionWidget, codeEditor));
			// this.goToDefinitionWidget.showAt(goToDefinitionPosition, rowResponse);


			// we have the go-to-definitions, we want to highlight only on the file we are currently opening in the probebreakdownviewmodel
			const definitionsToHighlight = this.goToDefinitionDecorations.filter((definition) => {
				return definition.uri.fsPath === element.uri.fsPath;
			})
				.map((definition) => {
					return {
						range: {
							startLineNumber: definition.range.startLineNumber,
							startColumn: definition.range.startColumn,
							endColumn: definition.range.endColumn + 1,
							endLineNumber: definition.range.endLineNumber
						},
						hoverMessage: { value: definition.thinking },
					};
				});

			codeEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, definitionsToHighlight);
		}
	}

	updateBreakdowns(breakdowns: ReadonlyArray<IAideProbeBreakdownViewModel>): void {
		const list = assertIsDefined(this.list);

		let matchingIndex = -1;
		if (this.viewModel.length === 0) {
			this.viewModel = [...breakdowns];
			list.splice(0, 0, breakdowns);
		} else {
			console.log('updating breakdowns');
			console.log(breakdowns);
			breakdowns.forEach((breakdown) => {
				const matchIndex = this.getBreakdownListIndex(breakdown);
				if (matchIndex === -1) {
					this.viewModel.push(breakdown);
					list.splice(this.viewModel.length - 1, 0, [breakdown]);
				} else {
					this.viewModel[matchIndex] = breakdown;
					list.splice(matchIndex, 1, [breakdown]);
					if (this.activeBreakdown?.uri.fsPath === breakdown.uri.fsPath && this.activeBreakdown?.name === breakdown.name) {
						matchingIndex = matchIndex;
					}
				}
			});
			const listLength = this.viewModel.length;
			console.log('list length', listLength);
			for (let i = listLength - 1; i >= 0; i--) {
				console.log(list.element(i));
			}
		}
		this.list?.rerender();
		if (matchingIndex !== -1) {
			this.list?.setFocus([matchingIndex]);
		}

		this.layout();
	}

	hide(): void {
		if (!this.isVisible || !this.list) {
			return; // already hidden
		}

		// Hide
		this.isVisible = false;

		// Clear list
		this.list.splice(0, this.viewModel.length);

		// Clear view model
		this.viewModel = [];
	}

	layout(width?: number): void {
		if (this.list) {
			this.list.layout(undefined, width);
		}
	}
}

interface IBreakdownTemplateData {
	currentItem?: IAideProbeBreakdownViewModel;
	currentItemIndex?: number;
	wrapper: HTMLElement;
	container: HTMLElement;
	progressIndicator: HTMLElement;
	toDispose: DisposableStore;
}

interface IItemHeightChangeParams {
	element: IAideProbeBreakdownViewModel;
	index: number;
	height: number;
}

class BreakdownRenderer extends Disposable implements IListRenderer<IAideProbeBreakdownViewModel, IBreakdownTemplateData> {
	static readonly TEMPLATE_ID = 'breakdownsListRenderer';

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly resourceLabels: ResourceLabels,
	) {
		super();
	}

	get templateId(): string {
		return BreakdownRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): IBreakdownTemplateData {
		const data: IBreakdownTemplateData = Object.create(null);
		data.toDispose = new DisposableStore();

		data.wrapper = dom.append(container, $('.breakdown-list-item-wrapper'));
		// Content
		data.container = $('.breakdown-list-item');
		data.wrapper.appendChild(data.container);

		// Progress indicator
		data.progressIndicator = $('.breakdown-list-item-details');
		data.wrapper.appendChild(data.progressIndicator);

		return data;
	}

	renderElement(element: IAideProbeBreakdownViewModel, index: number, templateData: IBreakdownTemplateData, height: number | undefined): void {
		console.log('rendering element', element, index, templateData, height);
		const templateDisposables = new DisposableStore();

		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		const { uri, name, response } = element;
		if (uri) {
			const rowResource = $('div.breakdown-resource');
			const label = this.resourceLabels.create(rowResource, { supportHighlights: true });
			label.element.style.display = 'flex';
			label.setResource({ resource: uri, name, description: basenameOrAuthority(uri) }, {
				fileKind: FileKind.FILE,
				icon: SymbolKinds.toIcon(SymbolKind.Method),
			});
			templateDisposables.add(label);
			templateData.container.appendChild(rowResource);

			element.symbol.then(symbol => {
				if (symbol && symbol.kind) {
					label.setResource({ resource: uri, name, description: basenameOrAuthority(uri) }, {
						fileKind: FileKind.FILE,
						icon: SymbolKinds.toIcon(symbol.kind),
					});
				}
			});
		}

		const completeIcon = Codicon.arrowRight;
		const progressIcon = ThemeIcon.modify(Codicon.loading, 'spin');
		if (response && response.value.length > 0) {
			templateData.progressIndicator.classList.remove(...ThemeIcon.asClassNameArray(progressIcon));
			templateData.progressIndicator.classList.add(...ThemeIcon.asClassNameArray(completeIcon));
		} else {
			templateData.progressIndicator.classList.remove(...ThemeIcon.asClassNameArray(completeIcon));
			templateData.progressIndicator.classList.add(...ThemeIcon.asClassNameArray(progressIcon));
		}

		this.updateItemHeight(templateData);
	}

	disposeTemplate(templateData: IBreakdownTemplateData): void {
		dispose(templateData.toDispose);
	}

	private updateItemHeight(templateData: IBreakdownTemplateData): void {
		if (!templateData.currentItem || typeof templateData.currentItemIndex !== 'number') {
			return;
		}

		const { currentItem: element, currentItemIndex: index } = templateData;

		const newHeight = templateData.wrapper.offsetHeight || 22;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = templateData.toDispose.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.wrapper), () => {
				// Have to recompute the height here because codeblock rendering is currently async and it may have changed.
				// If it becomes properly sync, then this could be removed.
				element.currentRenderedHeight = templateData.wrapper.offsetHeight || 22;
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, index, height: element.currentRenderedHeight });
			}));
		}
	}
}

class BreakdownsListDelegate implements IListVirtualDelegate<IAideProbeBreakdownViewModel> {
	private defaultElementHeight: number = 22;

	getHeight(element: IAideProbeBreakdownViewModel): number {
		return (element.currentRenderedHeight ?? this.defaultElementHeight);
	}

	getTemplateId(element: IAideProbeBreakdownViewModel): string {
		return BreakdownRenderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: IAideProbeBreakdownViewModel): boolean {
		return true;
	}
}
