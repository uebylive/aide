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
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IResourceLabel, ResourceLabels } from '../../../browser/labels.js';
import { IFilesConfiguration } from '../../files/common/files.js';
import { IPinnedContextService, IPinnedContextWidget, MANAGE_PINNED_CONTEXT, PinnedContextItem } from '../common/pinnedContext.js';
import { ManagePinnedContext } from './actions/pinnedContextActions.js';
import './media/pinnedContext.css';

const ItemHeight = 22;

type TreeElement = PinnedContextItem;

export class PinnedContextWidget extends Disposable implements IPinnedContextWidget {
	private isExpanded = false;
	private isEditing = false;
	setEditing(editing: boolean): void {
		this.isEditing = editing;
	}

	private container: HTMLElement | undefined;
	get element(): HTMLElement | undefined {
		return this.container;
	}

	private $message!: HTMLDivElement;
	private $tree!: HTMLDivElement;
	private tree!: WorkbenchObjectTree<TreeElement, FuzzyScore>;
	private treeRenderer: PinnedContextTreeRenderer | undefined;

	private resourceLabels: ResourceLabels;
	private _onDidChangeVisibility = this._register(new Emitter<boolean>());

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IPinnedContextService private readonly pinnedContextService: IPinnedContextService,
	) {
		super();

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

	render(parent: HTMLElement): void {
		const container = this.container = dom.append(parent, dom.$('.pinned-context-widget'));

		const label = dom.append(container, dom.$('.pinned-context-label'));
		// Icon
		const icon = dom.$('.pinned-context-icon');
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.pinnedDirty));
		icon.style.height = '16px';
		label.appendChild(icon);
		// Title
		const manageKbShortcut = this.keybindingService.lookupKeybinding(ManagePinnedContext.ID);
		const buttonTitle = manageKbShortcut ? localize('managePinnedContextsKb', "Pinned Context ({0})", manageKbShortcut.getLabel()) : localize('managePinnedContextsNoKb', "Pinned Context");
		const title = dom.$('.pinned-context-title');
		title.textContent = buttonTitle;
		label.appendChild(title);
		// Edit button
		const buttonContainer = dom.append(label, dom.$('.pinned-context-edit-button'));
		const editButton = this._register(new Button(buttonContainer, {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined
		}));
		editButton.label = localize('editPinnedContexts', "Edit");
		editButton.onDidClick(() => {
			this.commandService.executeCommand(MANAGE_PINNED_CONTEXT);
		});

		const overview = dom.append(container, dom.$('.pinned-context-overview'));
		const overviewLabel = localize('pinnedContextsOverview', "$(chevron-down) 12 files pinned");
		const overviewButton = this._register(new Button(overview, {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined,
			title: overviewLabel,
			supportIcons: true
		}));
		overviewButton.label = overviewLabel;

		const details = dom.append(container, dom.$('.pinned-context-details'));
		details.style.display = 'none';

		this.$message = dom.append(details, dom.$('.message'));
		this.$message.classList.add('pinned-context-subtle');

		this.$tree = dom.append(details, dom.$('.pinned-context-tree.show-file-icons'));
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
