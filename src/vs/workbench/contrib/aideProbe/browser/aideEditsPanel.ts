/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AideControlsPanel } from 'vs/workbench/contrib/aideProbe/browser/aideControlsPanel';
import * as dom from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { relativePath } from 'vs/base/common/resources';
import { SymbolKind, SymbolKinds } from 'vs/editor/common/languages';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';

const $ = dom.$;


export class AideEditsPanel extends AideControlsPanel {

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super(instantiationService);
	}
}


interface ISymbolInfoTemplateData {
	currentItem?: IAideProbeBreakdownViewModel;
	currentItemIndex?: number;
	container: HTMLElement;
	toDispose: DisposableStore;
}

interface IItemHeightChangeParams {
	element: IAideProbeBreakdownViewModel;
	index: number;
	height: number;
}

class SymbolInfoRenderer extends Disposable implements IListRenderer<IAideProbeBreakdownViewModel, ISymbolInfoTemplateData> {
	static readonly TEMPLATE_ID = 'symbolInfoListRenderer';

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly resourceLabels: ResourceLabels,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	get templateId(): string {
		return SymbolInfoRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): ISymbolInfoTemplateData {
		const data: ISymbolInfoTemplateData = Object.create(null);
		data.toDispose = new DisposableStore();
		data.container = dom.append(container, $('.symbol-info-list-item'));
		return data;
	}

	renderElement(element: IAideProbeBreakdownViewModel, index: number, templateData: ISymbolInfoTemplateData): void {
		const templateDisposables = new DisposableStore();

		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		const { uri, name } = element;
		if (uri) {
			const rowResource = $('div.symbol-info-resource');
			const label = this.resourceLabels.create(rowResource, { supportHighlights: true });
			label.element.style.display = 'flex';

			const workspaceFolder = this.contextService.getWorkspace().folders[0];
			const workspaceFolderUri = workspaceFolder.uri;
			const path = relativePath(workspaceFolderUri, uri);

			label.setResource({ resource: uri, name, description: path }, {
				fileKind: FileKind.FILE,
				icon: SymbolKinds.toIcon(SymbolKind.Method),
			});
			templateDisposables.add(label);
			templateData.container.appendChild(rowResource);

			element.symbol.then(symbol => {
				if (symbol && symbol.kind) {
					label.setResource({ resource: uri, name, description: path }, {
						fileKind: FileKind.FILE,
						icon: SymbolKinds.toIcon(symbol.kind),
					});
				}
			});
		}

		if (element.edits.length > 0) {
			const changes = element.edits.reduce((acc, edit) => {
				const newRanges = edit.getRangesN() || [];
				const oldRanges = edit.getRanges0() || [];
				if (edit.isInsertion()) {
					const wholeNewRange = newRanges[0];
					acc.added += wholeNewRange.endLineNumber - wholeNewRange.startLineNumber + 1;
				} else if (newRanges.length > 0 && oldRanges.length > 0) {
					const wholeNewRange = newRanges[0];
					const wholeOldRange = oldRanges[0];

					acc.added += wholeNewRange.endLineNumber - wholeNewRange.startLineNumber + 1;
					acc.removed += wholeOldRange.endLineNumber - wholeOldRange.startLineNumber + 1;
				}
				return acc;
			}, { added: 0, removed: 0 });

			// TODO: Add diffstat templateData.toDispose.add
		}

		this.updateItemHeight(templateData);

	}

	disposeTemplate(templateData: ISymbolInfoTemplateData): void {
		dispose(templateData.toDispose);
	}

	private updateItemHeight(templateData: ISymbolInfoTemplateData): void {
		if (!templateData.currentItem || typeof templateData.currentItemIndex !== 'number') {
			return;
		}

		const { currentItem: element, currentItemIndex: index } = templateData;

		const newHeight = templateData.container.offsetHeight || 52;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = templateData.toDispose.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.container), () => {
				element.currentRenderedHeight = templateData.container.offsetHeight || 52;
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, index, height: element.currentRenderedHeight });
			}));
		}
	}
}

class SymbolInfoListDelegate implements IListVirtualDelegate<IAideProbeBreakdownViewModel> {
	private defaultElementHeight: number = 52;

	getHeight(element: IAideProbeBreakdownViewModel): number {
		return (element.currentRenderedHeight ?? this.defaultElementHeight);
	}

	getTemplateId(element: IAideProbeBreakdownViewModel): string {
		return SymbolInfoRenderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: IAideProbeBreakdownViewModel): boolean {
		return true;
	}
}
