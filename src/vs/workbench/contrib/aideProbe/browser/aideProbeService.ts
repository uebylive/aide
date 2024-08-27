/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/model';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AideProbeModel, AideProbeRequestModel, IAideProbeModel, IAideProbeResponseModel, IVariableEntry } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { AideProbeMode, AideProbeStatus, AnchorEditingSelection, IAideProbeData, IAideProbeMode, IAideProbeProgress, IAideProbeRequestModel, IAideProbeResponseEvent, IAideProbeResult, IAideProbeReviewUserEvent, IAideProbeSessionAction, IAideProbeUserAction } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CONTEXT_PROBE_CONTEXT_TYPE, CONTEXT_PROBE_MODE } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ITextModel } from 'vs/editor/common/model';


export interface IAideProbeResolver {
	initiate: (request: IAideProbeRequestModel, progress: (part: IAideProbeProgress) => Promise<void>, token: CancellationToken) => Promise<IAideProbeResult>;
	onSessionAction: (action: IAideProbeSessionAction) => Promise<void>;
	onUserAction: (action: IAideProbeUserAction) => Promise<void>;
}

export const IAideProbeService = createDecorator<IAideProbeService>('IAideProbeService');


export interface IAideProbeService {
	_serviceBrand: undefined;
	registerProbeProvider(data: IAideProbeData, resolver: IAideProbeResolver): void;

	getSession(): AideProbeModel | undefined;
	startSession(): AideProbeModel;

	initiateProbe(model: IAideProbeModel, request: string, variables: IVariableEntry[], textModel: ITextModel | null): IInitiateProbeResponseState;
	addIteration(newPrompt: string): Promise<void>;
	makeFollowupRequest(): Promise<void>;
	onContextChange(newContext: string[]): Promise<void>;

	anchorEditingSelection: AnchorEditingSelection | undefined;

	clearSession(): void;
	rejectCodeEdits(): void;

	readonly onNewEvent: Event<IAideProbeResponseEvent>;
	readonly onReview: Event<IAideProbeReviewUserEvent>;
	readonly onDidSetAnchoredSelection: Event<AnchorEditingSelection | undefined>;
	readonly onDidStartProbing: Event<void>;
}

export interface IInitiateProbeResponseState {
	responseCreatedPromise: Promise<IAideProbeResponseModel>;
	responseCompletePromise: Promise<void>;
}

export class AideProbeService extends Disposable implements IAideProbeService {
	_serviceBrand: undefined;

	private mode: IContextKey<IAideProbeMode>;
	private contextType: IContextKey<string>;

	protected readonly _onDidStartProbing = this._store.add(new Emitter<void>());
	readonly onDidStartProbing: Event<void> = this._onDidStartProbing.event;

	protected readonly _onNewEvent = this._store.add(new Emitter<IAideProbeResponseEvent>());
	readonly onNewEvent: Event<IAideProbeResponseEvent> = this._onNewEvent.event;

	protected readonly _onReview = this._store.add(new Emitter<IAideProbeReviewUserEvent>());
	readonly onReview: Event<IAideProbeReviewUserEvent> = this._onReview.event;

	protected readonly _onDidSetAnchoredSelection = this._store.add(new Emitter<AnchorEditingSelection | undefined>());
	readonly onDidSetAnchoredSelection: Event<AnchorEditingSelection | undefined> = this._onDidSetAnchoredSelection.event;

	private _activeRequest: CancellationTokenSource | undefined;
	private probeProvider: IAideProbeResolver | undefined;

	private _model: AideProbeModel | undefined;
	private readonly _modelDisposables = this._register(new DisposableStore());
	private _initiateProbeResponseState: IInitiateProbeResponseState | undefined;


	set anchorEditingSelection(selection: AnchorEditingSelection | undefined) {
		this._anchorEditingSelection = selection;
		this._onDidSetAnchoredSelection.fire(selection);
	}
	get anchorEditingSelection() {
		return this._anchorEditingSelection;
	}
	private _anchorEditingSelection: AnchorEditingSelection | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.mode = CONTEXT_PROBE_MODE.bindTo(contextKeyService);
		this.contextType = CONTEXT_PROBE_CONTEXT_TYPE.bindTo(contextKeyService);
	}

	registerProbeProvider(data: IAideProbeData, resolver: IAideProbeResolver): IDisposable {
		if (this.probeProvider) {
			throw new Error(`A probe provider with the id '${data.id}' is already registered.`);
		}

		this.probeProvider = resolver;
		return toDisposable(() => {
			this.probeProvider = undefined;
		});
	}

	getSession(): AideProbeModel | undefined {
		return this._model;
	}

	startSession(): AideProbeModel {
		if (this._model) {
			this._modelDisposables.clear();
			this._model.dispose();
		}

		this._model = this.instantiationService.createInstance(AideProbeModel);
		this._model.status = AideProbeStatus.IN_PROGRESS;
		this._modelDisposables.add(this._model.onNewEvent(edits => {
			this._onNewEvent.fire(edits);
		}));
		return this._model;
	}

	initiateProbe(probeModel: AideProbeModel, request: string, variables: IVariableEntry[] = [], textModel: ITextModel | null): IInitiateProbeResponseState {
		const responseCreated = new DeferredPromise<IAideProbeResponseModel>();
		let responseCreatedComplete = false;
		function completeResponseCreated(): void {
			if (!responseCreatedComplete && probeModel.response) {
				responseCreated.complete(probeModel.response);
				responseCreatedComplete = true;
			}
		}

		const source = new CancellationTokenSource();
		const token = source.token;
		const initiateProbeInternal = async () => {
			const progressCallback = async (progress: IAideProbeProgress) => {
				if (token.isCancellationRequested) {
					return;
				}
				await probeModel.acceptResponseProgress(progress);
				completeResponseCreated();
			};

			const listener = token.onCancellationRequested(() => {
				probeModel.cancelRequest();
			});

			const mode = this.mode.get() || AideProbeMode.AGENTIC;
			const codebaseSearch = this.contextType.get() === 'codebase' || false;

			try {
				if (codebaseSearch) {
					const openEditors = this.editorService.editors;
					for (const editor of openEditors) {
						const resource = editor.resource;
						if (!resource) {
							continue;
						}

						const model = this.modelService.getModel(resource);

						if (!model) {
							continue;
						}

						const range = model.getFullModelRange();
						const valueObj = { uri: resource, range: range };
						variables.push({
							id: 'vscode.file',
							name: `file:${resource.path.split('/').pop()}`,
							value: JSON.stringify(valueObj),
						});
					}
				}

				if (mode === AideProbeMode.ANCHORED && this._anchorEditingSelection) {
					const { uri, selection } = this._anchorEditingSelection;
					variables.push({
						id: 'selection',
						// follow the same schema as the chat variables
						name: 'file',
						value: JSON.stringify({
							uri,
							range: {
								// selection is 1 indexed and not 0 indexed and also depends
								// on the orientation
								startLineNumber: Math.min(selection.startLineNumber - 1, selection.endLineNumber - 1),
								startColumn: selection.startColumn - 1,
								endLineNumber: Math.max(selection.endLineNumber - 1, selection.startLineNumber - 1),
								endColumn: selection.endColumn - 1,
							},
						})
					});
				}

				probeModel.request = new AideProbeRequestModel(probeModel.sessionId, request, { variables }, codebaseSearch, mode);

				const resolver = this.probeProvider;
				if (!resolver) {
					throw new Error('No probe provider registered.');
				}

				const result = await resolver.initiate(probeModel.request, progressCallback, token);
				if (token.isCancellationRequested) {
					return;
				} else if (result) {
					probeModel.completeResponse();
				}

				// Mock data start
				//if (textModel) {
				//	const result = await mockInitiateProbe(probeModel.request, progressCallback, token, textModel);
				//	if (token.isCancellationRequested) {
				//		return;
				//	} else if (result) {
				//		probeModel.completeResponse();
				//	}
				//}
				// Mock data end

			} catch (error) {
				console.log(error);
			} finally {
				listener.dispose();
			}
		};

		const rawResponsePromise = initiateProbeInternal();
		this._onDidStartProbing.fire();
		this._activeRequest = source;
		rawResponsePromise.finally(() => {
			this._activeRequest?.dispose();
		});

		this._initiateProbeResponseState = {
			responseCreatedPromise: responseCreated.p,
			responseCompletePromise: rawResponsePromise,
		};

		return this._initiateProbeResponseState;
	}

	async addIteration(newPrompt: string) {
		const resolver = this.probeProvider;
		if (!resolver || !this._model) {
			return;
			// return new Error('Added iteration without a probe provider or active session.');
		}
		this._model.clearResponse();
		this._model.status = AideProbeStatus.IN_PROGRESS;
		//mockOnUserAction({ type: 'newIteration', newPrompt });
		return await resolver.onSessionAction({ sessionId: this._model.sessionId, action: { type: 'newIteration', newPrompt } });
	}

	async makeFollowupRequest() {
		const resolver = this.probeProvider;
		if (!resolver || !this._model) {
			return;
		} else {
			this._model.clearResponse();
			this._model.status = AideProbeStatus.IN_PROGRESS;
			return await resolver.onSessionAction({ sessionId: this._model.sessionId, action: { type: 'followUpRequest' } });
		}
	}

	async onContextChange(newContext: string[]) {
		return await this.probeProvider?.onUserAction({ type: 'contextChange', newContext });
	}

	cancelProbe() {
		if (this._activeRequest) {
			this._activeRequest.cancel();
			this._activeRequest.dispose();
		}
		if (this._model) {
			this._model.status = AideProbeStatus.INACTIVE;
		}
	}

	//acceptCodeEdits() {
	//	this.clearSession();
	//}

	rejectCodeEdits() {
		this.cancelProbe();
		this._model?.response?.addToUndoStack();
		const edits = this._model?.response?.codeEdits;
		if (edits) {
			for (const edit of edits.values()) {
				edit?.hunkData.discardAll();
			}
		}
		this._model?.clearResponse();
		this._onReview.fire('reject');
		this.clearSession();
	}

	clearSession() {
		this.anchorEditingSelection = undefined;
		if (this._model) {
			this._model.dispose();
			this._model = undefined;
		}
		this._onReview.fire('accept');
		this.cancelProbe();
	}
}
