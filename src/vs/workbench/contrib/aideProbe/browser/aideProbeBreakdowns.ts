/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeElement, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { assertIsDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { TextEditorSelectionRevealType } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { FileKind } from 'vs/platform/files/common/files';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { DocumentSymbol, SymbolKind, SymbolKinds } from 'vs/editor/common/languages';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { AideProbeExplanationWidget } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanationWidget';
import { Position } from 'vs/editor/common/core/position';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IAideProbeBreakdownViewModel, IAideProbeGoToDefinitionViewModel } from 'vs/workbench/contrib/aideProbe/common/aideProbeViewModel';
import { AideProbeGoToDefinitionWidget } from 'vs/workbench/contrib/aideProbe/browser/aideProbeGoToDefinitionWidget';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownRenderer';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ChatAccessibilityProvider } from 'vs/workbench/contrib/aideChat/browser/aideChatAccessibilityProvider';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { editorSelectionBackground, editorSelectionForeground } from 'vs/platform/theme/common/colors/editorColors';

const $ = dom.$;

async function getSymbol(
	uri: URI,
	name: string,
	textModelResolverService: ITextModelService,
	outlineModelService: IOutlineModelService,
): Promise<DocumentSymbol | undefined> {
	const reference = await textModelResolverService.createModelReference(uri);
	try {
		const symbols = (await outlineModelService.getOrCreate(reference.object.textEditorModel, CancellationToken.None)).getTopLevelSymbols();
		const symbol = symbols.find(s => s.name === name);
		if (!symbol) {
			return;
		}

		return symbol;
	} finally {
		reference.dispose();
	}
}


const decorationDescription = 'chat-breakdown-definition';
const placeholderDecorationType = 'chat-breakdown-definition-session-detail';

export class AideChatBreakdowns extends Disposable {
	private readonly _onDidChangeFocus = this._register(new Emitter<IAideProbeBreakdownViewModel>());
	readonly onDidChangeFocus = this._onDidChangeFocus.event;

	private activeBreakdown: IAideProbeBreakdownViewModel | undefined;

	private list: WorkbenchObjectTree<IAideProbeBreakdownViewModel> | undefined;
	private renderer: BreakdownRenderer | undefined;
	private viewModel: IAideProbeBreakdownViewModel[] = [];
	private isVisible: boolean | undefined;
	private explanationWidget: AideProbeExplanationWidget | undefined;
	// Keep track of definitions, we are just overloading this for now
	private goToDefinitionDecorations: IAideProbeGoToDefinitionViewModel[] = [];
	private goToDefinitionWidget: AideProbeGoToDefinitionWidget | undefined;

	private readonly markdownRenderer: MarkdownRenderer;

	constructor(
		private readonly resourceLabels: ResourceLabels,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IOutlineModelService private readonly outlineModelService: IOutlineModelService,
		@ICodeEditorService private readonly editorService: ICodeEditorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();

		this.markdownRenderer = this.instantiationService.createInstance(ChatMarkdownRenderer, undefined);
		this.renderer = this._register(this.instantiationService.createInstance(BreakdownRenderer, this.resourceLabels));

		const theme = this.themeService.getColorTheme();
		const decorationBackgroundColor = theme.getColor(editorSelectionBackground);
		const decorationColor = theme.getColor(editorSelectionForeground);

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
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService])));
		const listDelegate = scopedInstantiationService.createInstance(BreakdownsListDelegate);

		this.renderer = this._register(new BreakdownRenderer(this.resourceLabels, this.textModelResolverService, this.outlineModelService));
		const list = this.list = <WorkbenchObjectTree<IAideProbeBreakdownViewModel>>scopedInstantiationService.createInstance(
			WorkbenchObjectTree,
			'BreakdownsList',
			listContainer,
			listDelegate,
			[this.renderer],
			{
				identityProvider: { getId: (e: IAideProbeBreakdownViewModel) => `${e.uri.fsPath}_${e.name}` },
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false,
				supportDynamicHeights: true,
				hideTwistiesOfChildlessElements: true,
				accessibilityProvider: this.instantiationService.createInstance(ChatAccessibilityProvider),
				setRowLineHeight: false,
			}
		);

		this._register(list.onDidChangeContentHeight(height => {
			list.layout(height);
		}));
		this._register(this.renderer.onDidChangeItemHeight(e => {
			list.updateElementHeight(e.element, e.height);
		}));
		this._register(list.onDidChangeFocus(e => {
			if (e.elements.length === 1) {
				const element = e.elements[0]!;
				list.setSelection([element]);
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

	// private _getBreakdownListIndex(element: IAideProbeBreakdownViewModel): number {
	// 	let matchIndex = -1;
	// 	this.viewModel.forEach((item, index) => {
	// 		if (item.uri.fsPath === element.uri.fsPath && item.name === element.name) {
	// 			matchIndex = index;
	// 		}
	// 	});
	// 	return matchIndex;
	// }

	// Whenever we have an event, update our internal state

	public async updateGoToDefinitionsDecorations(definitions: IAideProbeGoToDefinitionViewModel[]): Promise<void> {
		this.goToDefinitionDecorations = definitions;
	}




	public async openBreakdownReference(element: IAideProbeBreakdownViewModel): Promise<void> {
		if (this.activeBreakdown === element) {
			return;
		} else {
			this.activeBreakdown = element;
			this.list?.setFocus([element]);
		}

		if (this.explanationWidget) {
			this.explanationWidget.hide();
			this.explanationWidget.dispose();
			this.explanationWidget = undefined;
		}

		if (this.goToDefinitionWidget) {
			this.goToDefinitionWidget.hide();
			this.goToDefinitionWidget.dispose();
			this.goToDefinitionWidget = undefined;
		}

		let codeEditor: ICodeEditor | null;
		let explanationWidgetPosition: Position = new Position(1, 1);
		// let goToDefinitionPosition: Position = new Position(1, 1);

		const { uri, name } = element;
		try {
			const symbol = await getSymbol(uri, name, this.textModelResolverService, this.outlineModelService);
			if (!symbol) {
				codeEditor = await this.editorService.openCodeEditor({
					resource: uri,
					options: {
						pinned: false,
						preserveFocus: true,
					}
				}, null);
			} else {
				explanationWidgetPosition = new Position(symbol.range.startLineNumber - 1, symbol.range.startColumn);
				// goToDefinitionPosition = new Position(symbol.range.startLineNumber + 1, symbol.range.startColumn + 10);
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
		} catch (e) {
			codeEditor = await this.editorService.openCodeEditor({
				resource: uri,
				options: {
					pinned: false,
					preserveFocus: true,
				}
			}, null);
		}

		if (codeEditor) {
			this.explanationWidget = this._register(this.instantiationService.createInstance(AideProbeExplanationWidget, codeEditor, element));
			this.explanationWidget.show(explanationWidgetPosition, 5);

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
						hoverMessage: { value: 'test' },
					};
				});

			codeEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, definitionsToHighlight);
		}
	}

	updateBreakdowns(breakdowns: IAideProbeBreakdownViewModel[]): void {
		const list = assertIsDefined(this.list);

		this.viewModel = breakdowns;
		const treeItems = (this.viewModel ?? [])
			.map((item): ITreeElement<IAideProbeBreakdownViewModel> => {
				return {
					element: item,
					children: [],
					collapsible: false
				};
			});
		list.setChildren(null, treeItems, {
			diffIdentityProvider: {
				getId(element) {
					return `${element.uri.fsPath}_${element.name}`;
				},
			}
		});

		this.layout();
	}

	hide(): void {
		if (!this.isVisible || !this.list) {
			return; // already hidden
		}

		// Hide
		this.isVisible = false;

		// Clear list
		this.updateBreakdowns([]);

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

class BreakdownRenderer extends Disposable implements ITreeRenderer<IAideProbeBreakdownViewModel, FuzzyScore, IBreakdownTemplateData> {
	static readonly TEMPLATE_ID = 'breakdownsListRenderer';

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly resourceLabels: ResourceLabels,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IOutlineModelService private readonly outlineModelService: IOutlineModelService,
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

	renderElement(node: ITreeNode<IAideProbeBreakdownViewModel, FuzzyScore>, index: number, templateData: IBreakdownTemplateData): void {
		const element = node.element;
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

			this.getSymbolKind(uri, name).then(kind => {
				if (kind) {
					label.setResource({ resource: uri, name, description: basenameOrAuthority(uri) }, {
						fileKind: FileKind.FILE,
						icon: SymbolKinds.toIcon(kind),
					});
				}
			});
		}

		if (response && response.value.length > 0) {
			const progressIcon = Codicon.arrowRight;
			templateData.progressIndicator.classList.add(...ThemeIcon.asClassNameArray(progressIcon));
		} else {
			const progressIcon = ThemeIcon.modify(Codicon.loading, 'spin');
			templateData.progressIndicator.classList.add(...ThemeIcon.asClassNameArray(progressIcon));
		}

		this.updateItemHeight(templateData);
	}

	private async getSymbolKind(uri: URI, name: string): Promise<SymbolKind | undefined> {
		const symbol = await getSymbol(uri, name, this.textModelResolverService, this.outlineModelService);
		if (!symbol) {
			return;
		}

		return symbol.kind;
	}

	disposeTemplate(templateData: IBreakdownTemplateData): void {
		dispose(templateData.toDispose);
	}

	private updateItemHeight(templateData: IBreakdownTemplateData): void {
		if (!templateData.currentItem || typeof templateData.currentItemIndex !== 'number') {
			return;
		}

		const { currentItem: element, currentItemIndex: index } = templateData;

		const newHeight = templateData.wrapper.offsetHeight;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = templateData.toDispose.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.wrapper), () => {
				// Have to recompute the height here because codeblock rendering is currently async and it may have changed.
				// If it becomes properly sync, then this could be removed.
				element.currentRenderedHeight = templateData.wrapper.offsetHeight;
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
