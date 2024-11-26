/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAideAgentPlanStepViewModel, isAideAgentPlanStepVM } from '../../common/aideAgentPlanViewModel.js';
import { IChatRendererContent } from '../../common/aideAgentViewModel.js';
import { IMarkdownVulnerability } from '../../common/annotations.js';
import { CodeBlockModelCollection } from '../../common/codeBlockModelCollection.js';
import { IChatCodeBlockInfo, IEditPreviewCodeBlockInfo } from '../aideAgent.js';
import { IDisposableReference } from '../aideAgentContentParts/aideAgentCollections.js';
import { CollapsedCodeBlock, EditorPool, EditPreviewEditorPool } from '../aideAgentContentParts/aideAgentMarkdownContentPart.js';
import { ChatMarkdownDecorationsRenderer } from '../aideAgentMarkdownDecorationsRenderer.js';
import { CodeBlockPart, ICodeBlockData, localFileLanguageId, parseLocalFileData } from '../codeBlockPart.js';
import { EditPreviewBlockPart, IEditPreviewBlockData } from '../editPreviewPart.js';
import { IAideAgentPlanContentPart, IAideAgentPlanContentPartRenderContext } from './aideAgentPlanContentParts.js';

const $ = dom.$;

export class AideAgentPlanMarkdownContentPart extends Disposable implements IAideAgentPlanContentPart {
	private static idPool = 0;
	public readonly id = String(++AideAgentPlanMarkdownContentPart.idPool);
	public readonly domNode: HTMLElement;
	private readonly allRefs: IDisposableReference<CodeBlockPart | CollapsedCodeBlock>[] = [];
	private readonly allEditPreviewRefs: IDisposableReference<EditPreviewBlockPart>[] = [];

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	public readonly codeblocks: IChatCodeBlockInfo[] = [];
	public readonly editPreviewBlocks: IEditPreviewCodeBlockInfo[] = [];

	private extractUriFromMarkdown(markdown: string): URI | undefined {
		const lines = markdown.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith('```') && i > 0) {
				const previousLine = lines[i - 1].trim();
				try {
					return URI.parse(previousLine);
				} catch {
					return undefined;
				}
			}
		}
		return undefined;
	}

	constructor(
		private readonly markdown: IMarkdownString,
		context: IAideAgentPlanContentPartRenderContext,
		private readonly editorPool: EditorPool,
		private readonly editPreviewEditorPool: EditPreviewEditorPool,
		fillInIncompleteTokens = false,
		codeBlockStartIndex = 0,
		renderer: MarkdownRenderer,
		currentWidth: number,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly textModelService: ITextModelService,
	) {
		super();

		const element = context.element;
		const markdownDecorationsRenderer = instantiationService.createInstance(ChatMarkdownDecorationsRenderer);

		// Extract URI before rendering
		const extractedUri = this.extractUriFromMarkdown(markdown.value);

		// We release editors in order so that it's more likely that the same editor will be assigned if this element is re-rendered right away, like it often is during progressive rendering
		const orderedDisposablesList: IDisposable[] = [];
		let codeBlockIndex = codeBlockStartIndex;
		const result = this._register(renderer.render(markdown, {
			fillInIncompleteTokens,
			codeBlockRendererSync: (languageId, text, raw) => {
				if (raw?.includes('```')) {
					const uriTagAfterBackticks = raw.match(/```[\s\n]*<vscode_codeblock_uri>.*?<\/vscode_codeblock_uri>/);
					if (uriTagAfterBackticks) {
						raw = raw.replace(uriTagAfterBackticks[0], '```');
					}
				}

				const isCodeBlockComplete = context.element.isComplete || !raw || raw?.endsWith('```');
				if ((!text || (text.startsWith('<vscode_codeblock_uri>') && !text.includes('\n'))) && !isCodeBlockComplete) {
					const hideEmptyCodeblock = $('div');
					hideEmptyCodeblock.style.display = 'none';
					return hideEmptyCodeblock;
				}

				const editPreviewBlock = this.parseEditPreviewBlock(text);
				if (editPreviewBlock) {
					const sessionId = element.sessionId;
					const originalIndex = codeBlockIndex++;
					const original = this.codeBlockModelCollection.getOrCreate(sessionId, element, originalIndex).model;
					const modifiedIndex = codeBlockIndex++;
					const modified = this.codeBlockModelCollection.getOrCreate(sessionId, element, modifiedIndex).model;

					const ref = this.renderEditPreviewBlock({
						uri: extractedUri || URI.parse(''), // Use the extracted URI
						element,
						languageId,
						parentContextKeyService: contextKeyService,
						original: { model: original, text: editPreviewBlock.original, codeBlockIndex: originalIndex },
						modified: { model: modified, text: editPreviewBlock.modified, codeBlockIndex: modifiedIndex }
					}, currentWidth);
					this.allEditPreviewRefs.push(ref);

					this._register(ref.object.onDidChangeContentHeight(() => this._onDidChangeHeight.fire()));

					const ownerMarkdownPartId = this.id;
					const info: IEditPreviewCodeBlockInfo = new class {
						readonly ownerMarkdownPartId = ownerMarkdownPartId;
						readonly element = element;
					}();
					this.editPreviewBlocks.push(info);

					orderedDisposablesList.push(ref);
					return ref.object.element;
				}

				const index = codeBlockIndex++;
				let textModel: Promise<IResolvedTextEditorModel>;
				let range: Range | undefined;
				let vulns: readonly IMarkdownVulnerability[] | undefined;
				let codemapperUri: URI | undefined;
				if (equalsIgnoreCase(languageId, localFileLanguageId)) {
					try {
						const parsedBody = parseLocalFileData(text);
						range = parsedBody.range && Range.lift(parsedBody.range);
						textModel = this.textModelService.createModelReference(parsedBody.uri).then(ref => ref.object);
					} catch (e) {
						return $('div');
					}
				} else {
					const sessionId = element.sessionId;
					const modelEntry = this.codeBlockModelCollection.getOrCreate(sessionId, element, index);
					const fastUpdateModelEntry = this.codeBlockModelCollection.updateSync(sessionId, element, index, { text, languageId });
					vulns = modelEntry.vulns;
					codemapperUri = fastUpdateModelEntry.codemapperUri;
					textModel = modelEntry.model;
				}

				const codeBlockInfo = { languageId, textModel, codeBlockIndex: index, element, range, parentContextKeyService: contextKeyService, vulns, codemapperUri };

				if (!codemapperUri) {
					const ref = this.renderCodeBlock(codeBlockInfo, text, currentWidth, false);
					this.allRefs.push(ref);

					// Attach this after updating text/layout of the editor, so it should only be fired when the size updates later (horizontal scrollbar, wrapping)
					// not during a renderElement OR a progressive render (when we will be firing this event anyway at the end of the render)
					this._register(ref.object.onDidChangeContentHeight(() => this._onDidChangeHeight.fire()));

					const ownerMarkdownPartId = this.id;
					const info: IChatCodeBlockInfo = new class {
						readonly ownerMarkdownPartId = ownerMarkdownPartId;
						readonly codeBlockIndex = index;
						readonly element = element;
						readonly isStreaming = true;
						codemapperUri = undefined; // will be set async
						public get uri() {
							// here we must do a getter because the ref.object is rendered
							// async and the uri might be undefined when it's read immediately
							return ref.object.uri;
						}
						public focus() {
							ref.object.focus();
						}
						public getContent(): string {
							return ref.object.editor.getValue();
						}
					}();
					this.codeblocks.push(info);
					orderedDisposablesList.push(ref);
					return ref.object.element;
				} else {
					// TODO(@ghostwriternr): This check is not the best, because it's hit far before we're done making edits. But I'm unable to get the isComplete
					// condition to work properly here. Come back and fix this.
					const isStreaming = /* isResponseVM(element) ? !element.isComplete : */ !isCodeBlockComplete;
					const ref = this.renderCodeBlockPill(codeBlockInfo.codemapperUri, !isStreaming);
					if (isAideAgentPlanStepVM(codeBlockInfo.element)) {
						// TODO@joyceerhl: remove this code when we change the codeblockUri API to make the URI available synchronously
						this.codeBlockModelCollection.update(codeBlockInfo.element.sessionId, codeBlockInfo.element, codeBlockInfo.codeBlockIndex, { text, languageId: codeBlockInfo.languageId }).then((e) => {
							// Update the existing object's codemapperUri
							this.codeblocks[codeBlockInfo.codeBlockIndex].codemapperUri = e.codemapperUri;
							this._onDidChangeHeight.fire();
						});
					}
					this.allRefs.push(ref);
					const ownerMarkdownPartId = this.id;
					const info: IChatCodeBlockInfo = new class {
						readonly ownerMarkdownPartId = ownerMarkdownPartId;
						readonly codeBlockIndex = index;
						readonly element = element;
						readonly isStreaming = isStreaming;
						readonly codemapperUri = codemapperUri;
						public get uri() {
							return undefined;
						}
						public focus() {
							return ref.object.element.focus();
						}
						public getContent(): string {
							return ''; // Not needed for collapsed code blocks
						}
					}();
					this.codeblocks.push(info);
					orderedDisposablesList.push(ref);
					return ref.object.element;
				}
			},
			asyncRenderCallback: () => this._onDidChangeHeight.fire(),
		}));

		this._register(markdownDecorationsRenderer.walkTreeAndAnnotateReferenceLinks(result.element));

		orderedDisposablesList.reverse().forEach(d => this._register(d));
		this.domNode = result.element;
	}

	private parseEditPreviewBlock(text: string): { original: string; modified: string } | null {
		const startMarker = '<<<<<<< SEARCH';
		const separatorMarker = '=======';
		const endMarker = '>>>>>>> REPLACE';

		const startIndex = text.indexOf(startMarker);
		if (startIndex === -1) {
			return null;
		}

		let original = '';
		let modified = '';

		const contentAfterStart = text.slice(startIndex + startMarker.length);
		const separatorIndex = contentAfterStart.indexOf(separatorMarker);
		const endIndex = contentAfterStart.indexOf(endMarker);

		if (separatorIndex !== -1 && endIndex !== -1) {
			// Full block with both search and replace
			original = contentAfterStart.slice(0, separatorIndex).trim();
			modified = contentAfterStart.slice(separatorIndex + separatorMarker.length, endIndex).trim();
		} else if (separatorIndex !== -1) {
			// Separator exists but end doesn't
			original = contentAfterStart.slice(0, separatorIndex).trim();
			modified = contentAfterStart.slice(separatorIndex + separatorMarker.length).trim();
		} else {
			// Partial block with only start
			original = contentAfterStart.trim();
		}

		return { original, modified };
	}

	private renderCodeBlockPill(uri: URI | undefined, isCodeBlockComplete?: boolean): IDisposableReference<CollapsedCodeBlock> {
		const codeBlock = this.instantiationService.createInstance(CollapsedCodeBlock);
		if (uri) {
			codeBlock.render(uri, !isCodeBlockComplete);
		}

		return {
			object: codeBlock,
			isStale: () => false,
			dispose: () => codeBlock.dispose()
		};
	}

	private renderCodeBlock(data: ICodeBlockData, text: string, currentWidth: number, editableCodeBlock: boolean | undefined): IDisposableReference<CodeBlockPart> {
		const ref = this.editorPool.get();
		const editorInfo = ref.object;
		if (isAideAgentPlanStepVM(data.element)) {
			this.codeBlockModelCollection.update(data.element.sessionId, data.element, data.codeBlockIndex, { text, languageId: data.languageId }).then((e) => {
				// Update the existing object's codemapperUri
				this.codeblocks[data.codeBlockIndex].codemapperUri = e.codemapperUri;
			});
		}

		editorInfo.render(data, currentWidth, editableCodeBlock);

		return ref;
	}

	private renderEditPreviewBlock(data: IEditPreviewBlockData, currentWidth: number): IDisposableReference<EditPreviewBlockPart> {
		const ref = this.editPreviewEditorPool.get();
		const editPreviewEditorInfo = ref.object;
		if (isAideAgentPlanStepVM(data.element)) {
			this.codeBlockModelCollection.update(data.element.sessionId, data.element, data.original.codeBlockIndex, { text: data.original.text, languageId: data.languageId });
			this.codeBlockModelCollection.update(data.element.sessionId, data.element, data.modified.codeBlockIndex, { text: data.modified.text, languageId: data.languageId });
		}

		editPreviewEditorInfo.render(data, currentWidth);
		return ref;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: IAideAgentPlanStepViewModel): boolean {
		return other.kind === 'planStep' && other.description.value === this.markdown.value;
	}

	layout(width: number): void {
		this.allRefs.forEach((ref, index) => {
			if (ref.object instanceof CodeBlockPart) {
				ref.object.layout(width);
			}
		});
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
