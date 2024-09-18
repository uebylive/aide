/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ILocalizedString, localize, localize2 } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { buttonBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels } from '../../../browser/labels.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IFilesConfiguration } from '../../files/common/files.js';
import { IPinnedContextService, MANAGE_PINNED_CONTEXT, PinnedContextItem } from '../common/pinnedContext.js';
import { ManagePinnedContext } from './actions/pinnedContextActions.js';
import './media/pinnedContext.css';

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
				"Pin files for the AI to cache and refer to for all it's work. The best files to pin are those you're actively working on or referring to for the task at hand."
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
