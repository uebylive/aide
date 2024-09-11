/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { FuzzyScore } from 'vs/base/common/filters';
import { IDisposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/path';
import { localize, localize2 } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IPinnedContextService, PinnedContextItem } from 'vs/workbench/contrib/pinnedContext/common/pinnedContext';

const ItemHeight = 22;

type TreeElement = PinnedContextItem;

export class PinnedContextPane extends ViewPane {
	static readonly TITLE: ILocalizedString = localize2('pinnedContext', "Pinned Context");

	private $container!: HTMLElement;
	private $message!: HTMLDivElement;
	private $tree!: HTMLDivElement;
	private tree!: WorkbenchObjectTree<TreeElement, FuzzyScore>;
	private treeRenderer: PinnedContextTreeRenderer | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IPinnedContextService private readonly pinnedContextService: IPinnedContextService
	) {
		super({ ...options, titleMenuId: MenuId.PinnedContextTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this._register(this.pinnedContextService.onDidChangePinnedContexts(() => this.refresh()));
	}

	private refresh(): void {
		this.updateTree();
		this.updateMessage();
	}

	private updateTree(): void {
		if (this.tree) {
			const pinnedContexts = this.pinnedContextService.getPinnedContexts();
			this.tree.setChildren(null, pinnedContexts.map(uri => ({ element: { uri } })));
		}
	}

	private _message: string | undefined;
	get message(): string | undefined {
		return this._message;
	}

	set message(message: string | undefined) {
		this._message = message;
		this.updateMessage();
	}

	private updateMessage(): void {
		if (this._message !== undefined) {
			this.showMessage(this._message);
		} else {
			this.hideMessage();
		}
	}

	private showMessage(message: string): void {
		if (!this.$message) {
			return;
		}
		this.$message.classList.remove('hide');
		this.resetMessageElement();

		this.$message.textContent = message;
	}

	private hideMessage(): void {
		this.resetMessageElement();
		this.$message.classList.add('hide');
	}

	private resetMessageElement(): void {
		dom.clearNode(this.$message);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree?.layout(height, width);
	}

	protected override renderHeaderTitle(container: HTMLElement): void {
		super.renderHeaderTitle(container, this.title);
		container.classList.add('pinned-context-view');
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.$container = container;
		container.classList.add('pinned-context-view');

		this.$message = dom.append(this.$container, dom.$('.message'));
		this.$message.classList.add('pinned-context-subtle');

		this.$tree = dom.append(this.$container, dom.$('.pinned-context-tree'));
		this.treeRenderer = this.instantiationService.createInstance(PinnedContextTreeRenderer);

		this.tree = <WorkbenchObjectTree<TreeElement, FuzzyScore>>this.instantiationService.createInstance(WorkbenchObjectTree, 'PinnedContextPane',
			this.$tree, new PinnedContextVirtualDelegate(), [this.treeRenderer], {
			identityProvider: new PinnedContextIdentityProvider(),
			accessibilityProvider: {
				getAriaLabel(element: TreeElement): string {
					return element.uri.toString();
				},
				getWidgetAriaLabel(): string {
					return localize('pinnedContext', "Pinned Context");
				}
			},
			keyboardNavigationLabelProvider: new PinnedContextKeyboardNavigationLabelProvider(),
			multipleSelectionSupport: false
		});

		this.refresh();
	}
}

class PinnedContextElementTemplate implements IDisposable {
	static readonly id = 'PinnedContextElementTemplate';

	readonly filename: HTMLElement;

	constructor(container: HTMLElement) {
		container.classList.add('pinned-context-tree-node-item');

		this.filename = dom.append(container, dom.$('.filename'));
	}

	dispose(): void {
		// noop
	}
}

export class PinnedContextIdentityProvider implements IIdentityProvider<TreeElement> {
	getId(item: TreeElement): { toString(): string } {
		return item.uri.fsPath;
	}
}

export class PinnedContextKeyboardNavigationLabelProvider implements IKeyboardNavigationLabelProvider<TreeElement> {
	getKeyboardNavigationLabel(element: TreeElement): { toString(): string } {
		return basename(element.uri.fsPath);
	}
}

class PinnedContextVirtualDelegate implements IListVirtualDelegate<TreeElement> {
	getHeight(): number {
		return ItemHeight;
	}

	getTemplateId(): string {
		return PinnedContextElementTemplate.id;
	}
}

class PinnedContextTreeRenderer implements ITreeRenderer<TreeElement, FuzzyScore, PinnedContextElementTemplate> {
	readonly templateId: string = PinnedContextElementTemplate.id;

	constructor(
		@IOpenerService private readonly openerService: IOpenerService
	) {
	}

	renderTemplate(container: HTMLElement): PinnedContextElementTemplate {
		return new PinnedContextElementTemplate(container);
	}

	renderElement(
		node: ITreeNode<TreeElement, FuzzyScore>,
		index: number,
		template: PinnedContextElementTemplate,
		height: number | undefined
	): void {
		const { element: item } = node;

		template.filename.textContent = basename(item.uri.fsPath);
		template.filename.onclick = () => {
			this.openerService.open(item.uri);
		};
	}

	disposeTemplate(template: PinnedContextElementTemplate): void {
		template.dispose();
	}
}
