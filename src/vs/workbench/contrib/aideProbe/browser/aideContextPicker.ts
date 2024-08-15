/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Emitter, Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IVariableEntry } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { basename, dirname } from 'vs/base/common/resources';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { Button } from 'vs/base/browser/ui/button/button';
import { localize } from 'vs/nls';
import { FileKind } from 'vs/platform/files/common/files';
import { Codicon } from 'vs/base/common/codicons';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { AideSelect } from 'vs/workbench/browser/aideSelect';
import { Heroicon } from 'vs/workbench/browser/heroicon';
import 'vs/css!./media/aideContextPicker';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CONTEXT_PROBE_IS_CODEBASE_SEARCH } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';

const $ = dom.$;

interface IQuickContextOption {
	icon: string;
	label: string;
	value: string;
}

const quickContextOptions: IQuickContextOption[] = [
	{
		icon: 'mini/square-3-stack-3d',
		label: 'Whole codebase (may take a while)',
		value: 'codebase',
	},
	{
		icon: 'mini/paper-clip',
		label: 'Specific context',
		value: 'specific-context'
	}
];

function getActiveEditorUri(editorService: IEditorService): URI | undefined {
	const editor = editorService.activeTextEditorControl;
	if (!isCodeEditor(editor)) {
		return undefined;
	}
	const model = editor.getModel();
	return model ? model.uri : undefined;
}

export class ContextPicker extends Disposable {

	private isCodeBaseSearch: IContextKey<boolean>;

	readonly context: AideContext;

	private button: Button;
	private buttonBadge: HTMLElement;
	private buttonIcon: Heroicon;

	private isListVisible = false;
	private listPanelElement: HTMLElement;
	private list: WorkbenchList<IVariableEntry>;
	private indexOfLastContextDeletedWithKeyboard: number = -1;
	private readonly defaultItemHeight = 36;


	private isContextTypePanelVisible = false;
	private contextTypeDropdownPanelElement: HTMLElement;

	constructor(
		private readonly parent: HTMLElement,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this.isCodeBaseSearch = CONTEXT_PROBE_IS_CODEBASE_SEARCH.bindTo(contextKeyService);

		this.context = this.instantiationService.createInstance(AideContext);

		const contextPickerElement = $('.aide-context-picker');
		this.parent.append(contextPickerElement);

		const splitButtonElement = $('.aide-controls-context-split-button');
		contextPickerElement.appendChild(splitButtonElement);

		//#region context list

		this.listPanelElement = $('.aide-context-picker-panel');
		contextPickerElement.appendChild(this.listPanelElement);

		const listElement = $('.aide-context-picker-list');
		this.listPanelElement.append(listElement);
		const renderer = this.instantiationService.createInstance(Renderer, this.context, this.indexOfLastContextDeletedWithKeyboard, this.defaultItemHeight);
		const listDelegate = this.instantiationService.createInstance(ItemListDelegate, this.defaultItemHeight);
		this.list = this._register(<WorkbenchList<IVariableEntry>>this.instantiationService.createInstance(
			WorkbenchList,
			'AideContextPicker',
			listElement,
			listDelegate,
			[renderer],
			{
				setRowLineHeight: false,
				supportDynamicHeights: true,
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false
			}
		));

		this._register(this.list.onDidChangeContentHeight(height => {
			this.list.layout(height);
		}));
		this._register(renderer.onDidChangeItemHeight(event => {
			if (this.isListVisible) {
				this.list.updateElementHeight(event.index, event.height);
			}
		}));

		const addButton = this._register(this.instantiationService.createInstance(Button, this.listPanelElement, {}));
		// TODO(@g-danna) Add Aide-specific localization
		addButton.label = localize('chat.addAttachment', "Add more specific context");
		addButton.element.classList.add('aide-context-picker-add-button');

		this._register(addButton.onDidClick(async () => {
			// TODO(@g-danna) Find a better (?) and type-safe way to do this
			const newEntries = await this.commandService.executeCommand('workbench.action.aideControls.attachContext') as unknown as IVariableEntry[];
			if (Array.isArray(newEntries)) {
				newEntries.forEach(entry => this.context.add(entry));
			}
		}));


		this.button = this._register(this.instantiationService.createInstance(Button, splitButtonElement, {}));
		this.button.element.classList.add('aide-controls-context-button');
		this.button.enabled = !this.isCodeBaseSearch.get();

		const buttonBadge = this.buttonBadge = $('.aide-controls-context-badge');
		this.button.element.appendChild(buttonBadge);

		this.buttonIcon = this.updateButtonIcon(this.button.element);

		this._register(this.button.onDidClick(() => {
			if (!this.isCodeBaseSearch.get()) {
				this.toggleContextPanel();
			}
		}));

		// eslint-disable-next-line local/code-no-global-document-listener
		this._register(dom.addDisposableListener(document, dom.EventType.MOUSE_DOWN, (e) => {
			// eslint-disable-next-line no-restricted-syntax
			const quickInputWidget = document.querySelector('.quick-input-widget');
			if (quickInputWidget && quickInputWidget.contains(e.target as HTMLElement)) {
				return;
			}
			if (this.isListVisible && !this.button.element.contains(e.target as HTMLElement) && !this.listPanelElement.contains(e.target as HTMLElement)) {
				dom.hide(this.listPanelElement);
				this.isListVisible = false;
			}
		}));

		// #endregion

		//#region codebase search select

		this.contextTypeDropdownPanelElement = $('.aide-context-picker-quick-context-panel');
		contextPickerElement.appendChild(this.contextTypeDropdownPanelElement);

		const contextTypeDropdownButton = this._register(this.instantiationService.createInstance(Button, splitButtonElement, {}));
		contextTypeDropdownButton.element.classList.add('aide-controls-context-type-button');
		this.instantiationService.createInstance(Heroicon, contextTypeDropdownButton.element, 'micro/chevron-down');

		const select = this._register(this.instantiationService.createInstance(AideSelect<IQuickContextOption>, this.contextTypeDropdownPanelElement, (container, item) => {
			const content = $('.aide-item-content');
			const icon = this.instantiationService.createInstance(Heroicon, container, item.icon);
			content.textContent = item.label;
			container.appendChild(content);
			return [icon];
		}));
		select.list.splice(0, 0, quickContextOptions);

		contextTypeDropdownButton.onDidClick(() => {
			if (!this.isContextTypePanelVisible) {
				dom.show(this.contextTypeDropdownPanelElement);
				select.list.rerender();
			} else {
				dom.hide(this.contextTypeDropdownPanelElement);
			}
			this.isContextTypePanelVisible = !this.isContextTypePanelVisible;
		});

		this._register(select.onDidSelect(({ element }) => {
			if (element.value === 'codebase') {
				this.isCodeBaseSearch.set(true);
				this.context.clear();
			} else {
				this.isCodeBaseSearch.set(false);
			}
			this.isContextTypePanelVisible = false;
			dom.hide(this.contextTypeDropdownPanelElement);
		}));

		// eslint-disable-next-line local/code-no-global-document-listener
		this._register(dom.addDisposableListener(document, dom.EventType.CLICK, (e) => {
			if (this.isContextTypePanelVisible && !contextTypeDropdownButton.element.contains(e.target as HTMLElement) && !this.contextTypeDropdownPanelElement.contains(e.target as HTMLElement)) {
				dom.hide(this.contextTypeDropdownPanelElement);
				this.isContextTypePanelVisible = false;
			}
		}));

		this.render();

		this._register(this.contextKeyService.onDidChangeContext((event) => {
			if (event.affectsSome(new Set([CONTEXT_PROBE_IS_CODEBASE_SEARCH.key]))) {
				this.updateButtonIcon(this.button.element);
				this.button.enabled = !this.isCodeBaseSearch.get();
				this.render();
			}
		}));

		this._register(this.context.onDidChange(() => {
			this.render();
		}));

		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.render();
		}));
	}

	private toggleContextPanel() {
		if (!this.isListVisible) {
			dom.show(this.listPanelElement);
		} else {
			dom.hide(this.listPanelElement);
		}
		this.isListVisible = !this.isListVisible;
		this.render();
	}

	private updateButtonIcon(button: HTMLElement) {
		if (this.buttonIcon) {
			this.buttonIcon.dispose();
		}
		const iconId = this.isCodeBaseSearch.get() ? 'mini/square-3-stack-3d' : 'mini/paper-clip';
		return this.buttonIcon = this.instantiationService.createInstance(Heroicon, button, iconId);
	}

	render() {
		const currentFileUri = getActiveEditorUri(this.editorService);
		if (this.context.entries.size === 0 && currentFileUri) {
			const currentFileEntry = {
				id: 'currentFile',
				name: `Using current file (${basename(currentFileUri)})`,
				value: currentFileUri
			};
			this.list.splice(0, this.list.length, [currentFileEntry]);
		} else {
			this.list.splice(0, this.list.length, [...this.context.entries]);
		}
		this.list.rerender();


		this.updateButtonIcon(this.button.element);

		if (!this.isCodeBaseSearch.get() && this.context.entries.size) {
			dom.show(this.buttonBadge);
			this.buttonBadge.textContent = this.context.entries.size.toString();
		} else {
			dom.hide(this.buttonBadge);
		}

		if (!this.isListVisible) {
			dom.hide(this.listPanelElement);
		}

		if (!this.isContextTypePanelVisible) {
			dom.hide(this.contextTypeDropdownPanelElement);
		}
	}
}

interface ITemplateData {
	currentItem?: IVariableEntry;
	currentItemIndex?: number;
	currentRenderedHeight: number;
	container: HTMLElement;
	toDispose: DisposableStore;
}

interface IItemHeightChangeParams {
	element: IVariableEntry;
	index: number;
	height: number;
}


class Renderer extends Disposable implements IListRenderer<IVariableEntry, ITemplateData> {
	static readonly TEMPLATE_ID = 'aideContextTemplate';

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	private readonly contextResourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event });

	constructor(

		private context: AideContext,
		private indexOfLastContextDeletedWithKeyboard: number,
		private readonly defaultItemHeight: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	get templateId(): string {
		return Renderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): ITemplateData {
		const data: ITemplateData = Object.create(null);
		data.toDispose = new DisposableStore();
		data.container = dom.append(container, $('.aide-context-option-item'));
		return data;
	}

	renderElement(element: IVariableEntry, index: number, templateData: ITemplateData): void {

		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		const container = templateData.container;

		if (element.id === 'currentFile') {
			container.textContent = element.name;
		} else {
			const label = this.contextResourceLabels.create(container, { supportIcons: true });
			const file = URI.isUri(element.value) ? element.value : element.value && typeof element.value === 'object' && 'uri' in element.value && URI.isUri(element.value.uri) ? element.value.uri : undefined;
			const range = element.value && typeof element.value === 'object' && 'range' in element.value && Range.isIRange(element.value.range) ? element.value.range : undefined;
			if (file && element.isFile) {
				const fileBasename = basename(file);
				const fileDirname = dirname(file);
				const friendlyName = `${fileBasename} ${fileDirname}`;
				const ariaLabel = range ? localize('chat.fileAttachmentWithRange', "Attached file, {0}, line {1} to line {2}", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment', "Attached file, {0}", friendlyName);

				label.setFile(file, {
					fileKind: FileKind.FILE,
					hidePath: true,
					range,
				});
				container.ariaLabel = ariaLabel;
				container.tabIndex = 0;
			} else {
				const elementLabel = element.fullName ?? element.name;
				label.setLabel(elementLabel, undefined);

				container.ariaLabel = localize('chat.attachment', "Attached context, {0}", element.name);
				container.tabIndex = 0;
			}

			const removeButton = templateData.toDispose.add(this.instantiationService.createInstance(Button, container, { supportIcons: true }));
			removeButton.icon = Codicon.close;


			// If this item is rendering in place of the last attached context item, focus the clear button so the user can continue deleting attached context items with the keyboard
			if (index === Math.min(this.indexOfLastContextDeletedWithKeyboard, this.context.entries.size - 1)) {
				removeButton.focus();
			}

			templateData.toDispose.add(removeButton.onDidClick((e) => {
				this.context.remove(element);
				// Set focus to the next attached context item if deletion was triggered by a keystroke (vs a mouse click)
				if (dom.isKeyboardEvent(e)) {
					const event = new StandardKeyboardEvent(e);
					if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
						this.indexOfLastContextDeletedWithKeyboard = index;
					}
				}
			}));
		}

		this.updateItemHeight(templateData);
	}

	disposeTemplate(templateData: ITemplateData): void {
		dispose(templateData.toDispose);
	}

	private updateItemHeight(templateData: ITemplateData): void {
		if (!templateData.currentItem || typeof templateData.currentItemIndex !== 'number') {
			return;
		}

		const { currentItem: element, currentItemIndex: index } = templateData;

		const newHeight = templateData.container.offsetHeight || this.defaultItemHeight;
		const shouldFireEvent = !templateData.currentRenderedHeight || templateData.currentRenderedHeight !== newHeight;
		templateData.currentRenderedHeight = newHeight;
		if (shouldFireEvent) {
			const disposable = templateData.toDispose.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.container), () => {
				templateData.currentRenderedHeight = templateData.container.offsetHeight || this.defaultItemHeight;
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, index, height: templateData.currentRenderedHeight });
			}));
		}
	}
}

class ItemListDelegate implements IListVirtualDelegate<IVariableEntry> {

	constructor(private readonly defaultItemHeight: number) { }

	getHeight(element: IVariableEntry): number {
		// Implement custom height for each element
		return this.defaultItemHeight;
	}

	getTemplateId(element: IVariableEntry): string {
		return Renderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: IVariableEntry): boolean {
		return true;
	}
}


class AideContext extends Disposable {

	private _onDidChange = this._register(new Emitter<Set<IVariableEntry>>());
	readonly onDidChange: Event<Set<IVariableEntry>> = this._onDidChange.event;

	private _entries: Set<IVariableEntry> = new Set();
	get entries(): Set<IVariableEntry> { return this._entries; }

	add(newVariable: IVariableEntry) {
		this._entries.add(newVariable);
		this._onDidChange.fire(this._entries);
	}

	remove(toRemove: IVariableEntry) {
		this._entries.delete(toRemove);
		this._onDidChange.fire(this._entries);
	}

	clear() {
		this._entries.clear();
		this._onDidChange.fire(this._entries);
	}
}
