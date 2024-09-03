/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { matchesSomeScheme, Schemas } from 'vs/base/common/network';
import { basename } from 'vs/base/common/path';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { ThemeIcon } from 'vs/base/common/themables';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Heroicon } from 'vs/workbench/browser/heroicon';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { ColorScheme } from 'vs/workbench/browser/web.api';
import { IAideChatContentReference, IAideChatWarningMessage } from 'vs/workbench/contrib/aideChat/common/aideChatService';
import { IAideChatVariablesService } from 'vs/workbench/contrib/aideChat/common/aideChatVariables';
import { IFollowupState } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { createFileIconThemableTreeContainerScope } from 'vs/workbench/contrib/files/browser/views/explorerView';

const $ = dom.$;

export interface IAideFollowupContentReference extends Omit<IAideChatContentReference, 'kind'> {
	kind: 'followup-reference';
	state: IFollowupState;
}

export interface IAideReferenceFoundContentReference extends Omit<IAideChatContentReference, 'kind'> {
	kind: 'found-reference';
	occurencies: number;
}

export class AideReferencesContentPart extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;
	private loadingIcon: Heroicon | undefined;
	private loadingBar: HTMLElement;
	private collapseButtonElement: HTMLElement;

	constructor(
		data: ReadonlyArray<IAideFollowupContentReference | IAideReferenceFoundContentReference | IAideChatWarningMessage>,
		label: string,
		expanded: boolean,
		private readonly onDidChangeVisibility: Event<boolean>,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
	) {
		super();

		const iconElement = $('.probe-references-icon');
		const icon = (expanded: boolean) => expanded ? Codicon.chevronDown : Codicon.chevronRight;
		iconElement.classList.add(...ThemeIcon.asClassNameArray(icon(expanded)));
		const buttonElement = $('.probe-references-label', undefined);

		this.loadingBar = $('.probe-references-loading-bar');
		buttonElement.appendChild(this.loadingBar);

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
		this.domNode = $('.probe-references', undefined, buttonElement);
		collapseButton.label = label;
		collapseButton.element.prepend(iconElement);
		this.collapseButtonElement = collapseButton.element;
		this.updateAriaLabel(collapseButton.element, label, expanded);
		this.domNode.classList.toggle('probe-references-collapsed', !expanded);
		this._register(collapseButton.onDidClick(() => {
			iconElement.classList.remove(...ThemeIcon.asClassNameArray(icon(expanded)));
			expanded = !expanded;
			iconElement.classList.add(...ThemeIcon.asClassNameArray(icon(expanded)));
			this.domNode.classList.toggle('probe-references-collapsed', !expanded);
			this._onDidChangeHeight.fire();
			this.updateAriaLabel(collapseButton.element, label, expanded);
		}));

		const resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeVisibility }));

		const container = $('.probe-references-list');
		this._register(createFileIconThemableTreeContainerScope(container, this.themeService));

		const renderer = this.instantiationService.createInstance(ContentReferencesListRenderer, resourceLabels);

		const list = this.instantiationService.createInstance(
			WorkbenchList<IAideFollowupContentReference | IAideReferenceFoundContentReference | IAideChatWarningMessage>,
			'ChatListRenderer',
			container,
			new ContentReferencesListDelegate(),
			[renderer],
			{
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: {
					getAriaLabel: (element: IAideFollowupContentReference | IAideReferenceFoundContentReference | IAideChatWarningMessage) => {
						if (element.kind === 'warning') {
							return element.content.value;
						}
						const reference = element.reference;
						if ('variableName' in reference) {
							return reference.variableName;
						} else if (URI.isUri(reference)) {
							return basename(reference.path);
						} else {
							return basename(reference.uri.path);
						}
					},

					getWidgetAriaLabel: () => localize('usedReferences', "Used References")
				},
				dnd: {
					getDragURI: (element: IAideFollowupContentReference | IAideReferenceFoundContentReference | IAideChatWarningMessage) => {
						if (element.kind === 'warning') {
							return null;
						}
						const { reference } = element;
						if ('variableName' in reference) {
							return null;
						} else if (URI.isUri(reference)) {
							return reference.toString();
						} else {
							return reference.uri.toString();
						}
					},
					dispose: () => { },
					onDragOver: () => false,
					drop: () => { },
				},
			});
		this._register(list);

		this.domNode.appendChild(list.getHTMLElement().parentElement!);

		this._register(list.onMouseDown(e => {
			e.browserEvent.stopPropagation();
		}));

		this._register(list.onDidOpen((e) => {
			if (e.browserEvent) {
				e.browserEvent.preventDefault();
			}
			if (e.element && 'reference' in e.element) {
				const uriOrLocation = 'variableName' in e.element.reference ? e.element.reference.value : e.element.reference;
				const uri = URI.isUri(uriOrLocation) ? uriOrLocation :
					uriOrLocation?.uri;
				if (uri) {
					openerService.open(
						uri,
						{
							fromUserGesture: true,
							editorOptions: {
								...e.editorOptions,
								...{
									selection: uriOrLocation && 'range' in uriOrLocation ? uriOrLocation.range : undefined
								}
							}
						});
				}
			}
		}));
		this._register(list.onContextMenu((e) => {
			e.browserEvent.preventDefault();
			e.browserEvent.stopPropagation();
		}));

		const maxItemsShown = 6;
		const itemsShown = Math.min(data.length, maxItemsShown);
		const height = itemsShown * 22;
		list.layout(height);
		list.getHTMLElement().style.height = `${height}px`;
		list.splice(0, list.length, data);
	}

	updateLoading(percentage: number) {
		if (this.loadingIcon) {
			this.loadingIcon.dispose();
		}
		if (isDefined(percentage)) {
			if (percentage === 100) {
				this.loadingIcon = this.instantiationService.createInstance(Heroicon, this.collapseButtonElement, 'micro/check-circle');
			} else {
				this.loadingIcon = this.instantiationService.createInstance(Heroicon, this.collapseButtonElement, 'micro/dashed-circle');
			}
			this.loadingBar.style.width = `${Math.min(100, percentage)}%`;
		} else {
			this.loadingBar.style.width = '0';
		}
	}

	private updateAriaLabel(element: HTMLElement, label: string, expanded?: boolean): void {
		element.ariaLabel = expanded ? localize('usedReferencesExpanded', "{0}, expanded", label) : localize('usedReferencesCollapsed', "{0}, collapsed", label);
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}


class ContentReferencesListDelegate implements IListVirtualDelegate<IAideFollowupContentReference | IAideReferenceFoundContentReference | IAideChatWarningMessage> {
	getHeight(element: IAideFollowupContentReference): number {
		return 22;
	}

	getTemplateId(element: IAideFollowupContentReference): string {
		return ContentReferencesListRenderer.TEMPLATE_ID;
	}
}

interface IChatContentReferenceListTemplate {
	container: HTMLElement;
	label: IResourceLabel;
	templateDisposables: DisposableStore;
}

class ContentReferencesListRenderer implements IListRenderer<IAideFollowupContentReference | IAideChatWarningMessage, IChatContentReferenceListTemplate> {
	static TEMPLATE_ID = 'contentReferencesListRenderer';
	readonly templateId: string = ContentReferencesListRenderer.TEMPLATE_ID;

	constructor(
		private labels: ResourceLabels,
		@IThemeService private readonly themeService: IThemeService,
		@IAideChatVariablesService private readonly chatVariablesService: IAideChatVariablesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	renderTemplate(container: HTMLElement): IChatContentReferenceListTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true }));
		return { container, templateDisposables, label };
	}


	private getReferenceIcon(data: IAideFollowupContentReference | IAideReferenceFoundContentReference): URI | ThemeIcon | undefined {
		if (ThemeIcon.isThemeIcon(data.iconPath)) {
			return data.iconPath;
		} else {
			return this.themeService.getColorTheme().type === ColorScheme.DARK && data.iconPath?.dark
				? data.iconPath?.dark
				: data.iconPath?.light;
		}
	}

	renderElement(data: IAideFollowupContentReference | IAideReferenceFoundContentReference | IAideChatWarningMessage, index: number, templateData: IChatContentReferenceListTemplate, height: number | undefined): void {

		templateData.container.classList.add('probe-references-list-item');

		if (data.kind === 'warning') {
			templateData.label.setResource({ name: data.content.value }, { icon: Codicon.warning });
			return;
		}

		const reference = data.reference;
		const icon = this.getReferenceIcon(data);
		templateData.label.element.style.display = 'flex';
		templateData.label.element.style.flex = '1';
		if ('variableName' in reference) {
			if (reference.value) {
				const uri = URI.isUri(reference.value) ? reference.value : reference.value.uri;
				templateData.label.setResource(
					{
						resource: uri,
						name: basenameOrAuthority(uri),
						description: `#${reference.variableName}`,
						range: 'range' in reference.value ? reference.value.range : undefined,
					}, { icon });
			} else {
				const variable = this.chatVariablesService.getVariable(reference.variableName);
				templateData.label.setLabel(`#${reference.variableName}`, undefined, { title: variable?.description });
			}
		} else {
			const uri = 'uri' in reference ? reference.uri : reference;
			if (matchesSomeScheme(uri, Schemas.mailto, Schemas.http, Schemas.https)) {
				templateData.label.setResource({ resource: uri, name: uri.toString() }, { icon: icon ?? Codicon.globe });
			} else {
				templateData.label.setFile(uri, {
					fileKind: FileKind.FILE,
					// Should not have this live-updating data on a historical reference
					fileDecorations: { badges: false, colors: false },
					range: 'range' in reference ? reference.range : undefined
				});
			}
		}

		if (data.kind === 'found-reference') {
			const occurenciesBadge = $('.probe-references-occurencies');
			occurenciesBadge.textContent = data.occurencies.toString();
			templateData.container.appendChild(occurenciesBadge);
		}

		if (data.kind === 'followup-reference') {

			const stateIconId = getStateIconId(data.state);
			if (stateIconId) {
				const stateIcon = this.instantiationService.createInstance(Heroicon, templateData.container, stateIconId);
				templateData.templateDisposables.add(stateIcon);
			}
		}
	}

	disposeTemplate(templateData: IChatContentReferenceListTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

function getStateIconId(state: IFollowupState) {
	switch (state) {
		case 'idle':
			return null;
		case 'loading':
			return 'micro/dashed-circle';
		case 'complete':
			return 'micro/check-circle';
	}
}
