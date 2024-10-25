/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { localize } from '../../../../../nls.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels } from '../../../../browser/labels.js';
import { createFileIconThemableTreeContainerScope } from '../../../files/browser/views/explorerView.js';
import { IChatRequestVariableEntry } from '../../common/aideAgentModel.js';
import { ChatResponseReferencePartStatusKind, IChatContentReference } from '../../common/aideAgentService.js';
import { IDisposableReference, ResourcePool } from './aideAgentCollections.js';

const $ = dom.$;

export class ChatAttachmentsContentPart extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly attachedContextDisposables = this._register(new DisposableStore());
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		private readonly variables: IChatRequestVariableEntry[],
		private readonly contentReferences: readonly IChatContentReference[] | undefined,
		private readonly attachmentsCollapsibleListPool: AttachmentsCollapsibleListPool,
	) {
		super();

		this.domNode = dom.$('.aideagent-attached-context');
		this.initAttachedContext(this.domNode);
	}

	private initAttachedContext(container: HTMLElement) {
		dom.clearNode(container);
		this.attachedContextDisposables.clear();
		dom.setVisibility(Boolean(this.variables.length), this.domNode);

		if (this.variables.length) {
			const attachmentsLabel = this.variables.length > 1 ?
				localize('attachmentsPlural', "{0} attachments", this.variables.length) :
				localize('attachmentsSingular', "1 attachment");

			const buttonElement = $('.aideagent-attachments-label.show-file-icons', undefined);
			let listExpanded = false;
			const collapseButton = this._register(new Button(buttonElement, {
				buttonBackground: undefined,
				buttonBorder: undefined,
				buttonForeground: undefined,
				buttonHoverBackground: undefined,
				buttonSecondaryBackground: undefined,
				buttonSecondaryForeground: undefined,
				buttonSecondaryHoverBackground: undefined,
				buttonSeparator: undefined
			}));
			container.appendChild(buttonElement);
			collapseButton.element.textContent = attachmentsLabel;
			this.updateAriaLabel(collapseButton.element, attachmentsLabel, listExpanded);
			this.domNode.classList.toggle('aideagent-attachments-list-collapsed', !listExpanded);
			this._register(collapseButton.onDidClick(() => {
				listExpanded = !listExpanded;
				this.domNode.classList.toggle('aideagent-attachments-list-collapsed', !listExpanded);
				this._onDidChangeHeight.fire();
				this.updateAriaLabel(collapseButton.element, attachmentsLabel, listExpanded);
			}));

			const ref = this._register(this.attachmentsCollapsibleListPool.get());
			const list = ref.object;
			this.domNode.appendChild(list.getHTMLElement().parentElement!);

			const maxItemsShown = 6;
			const itemsShown = Math.min(this.variables.length, maxItemsShown);
			const height = itemsShown * 22;
			list.layout(height);
			list.getHTMLElement().style.height = `${height}px`;
			list.splice(0, list.length, this.variables);
		}
	}

	private updateAriaLabel(element: HTMLElement, label: string, expanded: boolean): void {
		element.ariaLabel = expanded ? localize('attachmentsExpanded', "{0}, expanded", label) : localize('attachmentsCollapsed', "{0}, collapsed", label);
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

export class AttachmentsCollapsibleListPool extends Disposable {
	private _pool: ResourcePool<WorkbenchList<IChatRequestVariableEntry>>;

	public get inUse(): ReadonlySet<WorkbenchList<IChatRequestVariableEntry>> {
		return this._pool.inUse;
	}

	constructor(
		private _onDidChangeVisibility: Event<boolean>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => this.listFactory()));
	}

	private listFactory(): WorkbenchList<IChatRequestVariableEntry> {
		const resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility }));

		const container = $('.aideagent-attachments-list');
		this._register(createFileIconThemableTreeContainerScope(container, this.themeService));

		const list = this.instantiationService.createInstance(
			WorkbenchList<IChatRequestVariableEntry>,
			'ChatAttachmentsListRenderer',
			container,
			new CollapsibleListDelegate(),
			[this.instantiationService.createInstance(CollapsibleListRenderer, resourceLabels)],
			{
				alwaysConsumeMouseWheel: false,
			}
		);
		return list;
	}

	get(): IDisposableReference<WorkbenchList<IChatRequestVariableEntry>> {
		const object = this._pool.get();
		let stale = false;
		return {
			object,
			isStale: () => stale,
			dispose: () => {
				stale = true;
				this._pool.release(object);
			}
		};
	}
}

class CollapsibleListDelegate implements IListVirtualDelegate<IChatRequestVariableEntry> {
	getHeight(element: IChatRequestVariableEntry): number {
		return 22;
	}

	getTemplateId(element: IChatRequestVariableEntry): string {
		return CollapsibleListRenderer.TEMPLATE_ID;
	}
}

interface ICollapsibleListTemplate {
	label: IResourceLabel;
	templateDisposables: DisposableStore;
}

class CollapsibleListRenderer implements IListRenderer<IChatRequestVariableEntry, ICollapsibleListTemplate> {
	static TEMPLATE_ID = 'chatCollapsibleListRenderer';
	readonly templateId: string = CollapsibleListRenderer.TEMPLATE_ID;

	constructor(
		private readonly labels: ResourceLabels,
		@IOpenerService private readonly openerService: IOpenerService,
	) { }

	renderTemplate(container: HTMLElement): ICollapsibleListTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));
		return { templateDisposables, label };
	}

	renderElement(element: IChatRequestVariableEntry, index: number, templateData: ICollapsibleListTemplate, height: number | undefined): void {
		const { label } = templateData;
		const file = URI.isUri(element.value) ? element.value : element.value && typeof element.value === 'object' && 'uri' in element.value && URI.isUri(element.value.uri) ? element.value.uri : undefined;
		const range = element.value && typeof element.value === 'object' && 'range' in element.value && Range.isIRange(element.value.range) ? element.value.range : undefined;

		const correspondingContentReference = element.references?.find((ref) => typeof ref.reference === 'object' && 'variableName' in ref.reference && ref.reference.variableName === element.name);
		const isAttachmentOmitted = correspondingContentReference?.options?.status?.kind === ChatResponseReferencePartStatusKind.Omitted;
		const isAttachmentPartialOrOmitted = isAttachmentOmitted || correspondingContentReference?.options?.status?.kind === ChatResponseReferencePartStatusKind.Partial;

		if (file) {
			const fileBasename = basename(file.path);
			const fileDirname = dirname(file.path);
			const friendlyName = `${fileBasename} ${fileDirname}`;
			let ariaLabel;
			if (isAttachmentOmitted) {
				ariaLabel = range ? localize('chat.omittedFileAttachmentWithRange', "Omitted: {0}, line {1} to line {2}.", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.omittedFileAttachment', "Omitted: {0}.", friendlyName);
			} else if (isAttachmentPartialOrOmitted) {
				ariaLabel = range ? localize('chat.partialFileAttachmentWithRange', "Partially attached: {0}, line {1} to line {2}.", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.partialFileAttachment', "Partially attached: {0}.", friendlyName);
			} else {
				ariaLabel = range ? localize('chat.fileAttachmentWithRange3', "Attached: {0}, line {1} to line {2}.", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment3', "Attached: {0}.", friendlyName);
			}

			let updatedRange = range;
			if (range?.startLineNumber === 42 && range.endLineNumber === 42 || element.id === 'vscode.file.rangeNotSetProperlyFullFile') {
				updatedRange = undefined;
			}
			label.setFile(file, {
				fileKind: FileKind.FILE,
				hidePath: true,
				range: updatedRange,
				title: correspondingContentReference?.options?.status?.description
			});
			label.element.ariaLabel = ariaLabel;
			label.element.tabIndex = 0;
			label.element.style.cursor = 'pointer';

			templateData.templateDisposables.add(dom.addDisposableListener(label.element, dom.EventType.CLICK, async (e: MouseEvent) => {
				dom.EventHelper.stop(e, true);
				if (file) {
					this.openerService.open(
						file,
						{
							fromUserGesture: true,
							editorOptions: {
								selection: updatedRange,
							} as any
						});
				}
			}));
		} else {
			const attachmentLabel = element.fullName ?? element.name;
			const withIcon = element.icon?.id ? `$(${element.icon.id}) ${attachmentLabel}` : attachmentLabel;
			label.setLabel(withIcon, correspondingContentReference?.options?.status?.description);

			label.element.ariaLabel = localize('chat.attachment3', "Attached context: {0}.", element.name);
			label.element.tabIndex = 0;
		}

		if (isAttachmentPartialOrOmitted) {
			label.element.classList.add('warning');
		}
		const description = correspondingContentReference?.options?.status?.description;
		if (isAttachmentPartialOrOmitted) {
			label.element.ariaLabel = `${label.element.ariaLabel}${description ? ` ${description}` : ''}`;
			for (const selector of ['.monaco-icon-suffix-container', '.monaco-icon-name-container']) {
				const element = label.element.querySelector(selector);
				if (element) {
					element.classList.add('warning');
				}
			}
		}
	}

	disposeTemplate(templateData: ICollapsibleListTemplate): void {
		templateData.templateDisposables.dispose();
	}
}
