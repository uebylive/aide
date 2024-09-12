/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { IDisposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/path';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/pinnedContext';
import { localize, localize2 } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { MenuId } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { FileKind } from 'vs/platform/files/common/files';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { buttonBackground } from 'vs/platform/theme/common/colors/inputColors';
import { asCssVariable } from 'vs/platform/theme/common/colorUtils';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IFilesConfiguration } from 'vs/workbench/contrib/files/common/files';
import { ManagePinnedContext } from 'vs/workbench/contrib/pinnedContext/browser/actions/pinnedContextActions';
import { IPinnedContextService, MANAGE_PINNED_CONTEXT, PinnedContextItem } from 'vs/workbench/contrib/pinnedContext/common/pinnedContext';

const ItemHeight = 22;

type TreeElement = PinnedContextItem;

export class PinnedContextPane extends ViewPane {
	static readonly TITLE: ILocalizedString = localize2('pinnedContext', "Pinned Context");

	private $container!: HTMLElement;
	private $message!: HTMLDivElement;
	private $tree!: HTMLDivElement;
	private tree!: WorkbenchObjectTree<TreeElement, FuzzyScore>;
	private treeRenderer: PinnedContextTreeRenderer | undefined;
	private resourceLabels: ResourceLabels;

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());

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
		@ICommandService private readonly commandService: ICommandService,
		@IPinnedContextService private readonly pinnedContextService: IPinnedContextService
	) {
		super({ ...options, titleMenuId: MenuId.PinnedContextTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this.resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event }));
		this._register(this.pinnedContextService.onDidChangePinnedContexts(() => this.refresh()));
	}

	private refresh(): void {
		const pinnedContexts = this.pinnedContextService.getPinnedContexts();
		this.updateTree(pinnedContexts);

		if (pinnedContexts.length === 0) {
			this.message = localize(
				'noPinnedContexts',
				"Pin files for the AI to cache and refer to for all it's work. The best files to pin are those you're actively working on or are good reference for the task at hand."
			);
		} else {
			this.message = undefined;
		}
	}

	private updateTree(pinnedContexts: URI[]): void {
		if (this.tree) {
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
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.$container = container;
		container.classList.add('pinned-context-view');

		const manageKbShortcut = this.keybindingService.lookupKeybinding(ManagePinnedContext.ID);
		const buttonTitle = manageKbShortcut ? localize('managePinnedContextsKb', "$(pinned) Manage ({0})", manageKbShortcut.getLabel()) : localize('managePinnedContextsNoKb', "$(pinned) Manage Pinned Contexts");
		const button = this._register(new Button(this.$container, {
			...defaultButtonStyles,
			buttonBackground: asCssVariable(buttonBackground),
			supportIcons: true,
			title: buttonTitle
		}));
		button.label = buttonTitle;
		button.element.classList.add('pinned-context-update-button');
		button.element.onclick = () => {
			this.commandService.executeCommand(MANAGE_PINNED_CONTEXT);
		};

		this.$message = dom.append(this.$container, dom.$('.message'));
		this.$message.classList.add('pinned-context-subtle');

		this.$tree = dom.append(this.$container, dom.$('.pinned-context-tree.show-file-icons'));
		this.$tree.classList.add('file-icon-themable-tree');
		this.$tree.classList.add('show-file-icons');

		this.treeRenderer = this.instantiationService.createInstance(
			PinnedContextTreeRenderer,
			this.resourceLabels,
			this.configurationService.getValue('explorer.decorations')
		);

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

	readonly label: IResourceLabel;
	private readonly removeButton: HTMLElement;

	constructor(
		container: HTMLElement,
		private readonly labels: ResourceLabels,
		private readonly onRemove: (item: TreeElement) => void
	) {
		container.classList.add('pinned-context-tree-node-item');
		this.label = this.labels.create(container, { supportHighlights: true });

		this.removeButton = document.createElement('div');
		this.removeButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
		this.removeButton.title = localize('removePinnedContext', "Remove from Pinned Context");
		container.appendChild(this.removeButton);
	}

	setElement(element: TreeElement): void {
		this.removeButton.onclick = (e) => {
			e.stopPropagation();
			this.onRemove(element);
		};
	}

	dispose(): void {
		this.label.dispose();
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
		private readonly labels: ResourceLabels,
		private decorations: IFilesConfiguration['explorer']['decorations'],
		@IOpenerService private readonly openerService: IOpenerService,
		@IPinnedContextService private readonly pinnedContextService: IPinnedContextService
	) { }

	renderTemplate(container: HTMLElement): PinnedContextElementTemplate {
		return new PinnedContextElementTemplate(container, this.labels, (item) => {
			this.pinnedContextService.removeContext(item.uri);
		});
	}

	renderElement(
		node: ITreeNode<TreeElement, FuzzyScore>,
		_index: number,
		template: PinnedContextElementTemplate,
		_height: number | undefined
	): void {
		const { element: item } = node;

		template.label.setFile(item.uri, {
			fileKind: FileKind.FILE,
			hidePath: false,
			fileDecorations: this.decorations
		});
		template.label.element.onclick = () => {
			this.openerService.open(item.uri, { editorOptions: { pinned: false } });
		};
		template.setElement(item);
	}

	disposeTemplate(template: PinnedContextElementTemplate): void {
		template.dispose();
	}
}
