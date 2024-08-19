/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AideProbeModel, AideProbeRequestModel, IAideProbeModel, IAideProbeResponseModel, IVariableEntry } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
// import { mockInitiateProbe, mockOnUserAction } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService.mock';
import { IAideProbeData, IAideProbeProgress, IAideProbeRequestModel, IAideProbeResponseEvent, IAideProbeResult, IAideProbeReviewUserEvent, IAideProbeUserAction } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export type ProbeMode = 'edit' | 'explore';


export interface IAideProbeResolver {
	initiate: (request: IAideProbeRequestModel, progress: (part: IAideProbeProgress) => Promise<void>, token: CancellationToken) => Promise<IAideProbeResult>;
	onUserAction: (action: IAideProbeUserAction) => Promise<void>;
}

export const IAideProbeService = createDecorator<IAideProbeService>('IAideProbeService');

export interface IAideProbeService {
	_serviceBrand: undefined;
	registerProbeProvider(data: IAideProbeData, resolver: IAideProbeResolver): void;

	getSession(): AideProbeModel | undefined;
	startSession(): AideProbeModel;

	initiateProbe(model: IAideProbeModel, request: string, edit: boolean, codebaseSearch: boolean, variables: IVariableEntry[], textModel: ITextModel | null): IInitiateProbeResponseState;
	addIteration(newPrompt: string): Promise<void>;
	cancelProbe(): void;
	undoEdit(): void;
	acceptCodeEdits(): void;
	rejectCodeEdits(): void;

	readonly onNewEvent: Event<IAideProbeResponseEvent>;
	readonly onReview: Event<IAideProbeReviewUserEvent>;
}

export interface IInitiateProbeResponseState {
	responseCreatedPromise: Promise<IAideProbeResponseModel>;
	responseCompletePromise: Promise<void>;
}

export class AideProbeService extends Disposable implements IAideProbeService {
	_serviceBrand: undefined;

	protected readonly _onNewEvent = this._store.add(new Emitter<IAideProbeResponseEvent>());
	readonly onNewEvent: Event<IAideProbeResponseEvent> = this._onNewEvent.event;

	protected readonly _onReview = this._store.add(new Emitter<IAideProbeReviewUserEvent>());
	readonly onReview: Event<IAideProbeReviewUserEvent> = this._onReview.event;

	private _activeRequest: CancellationTokenSource | undefined;
	private probeProvider: IAideProbeResolver | undefined;
	private _model: AideProbeModel | undefined;
	private readonly _modelDisposables = this._register(new DisposableStore());
	private _initiateProbeResponseState: IInitiateProbeResponseState | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
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
		this._modelDisposables.add(this._model.onNewEvent(edits => {
			this._onNewEvent.fire(edits);
		}));
		return this._model;
	}

	initiateProbe(probeModel: AideProbeModel, request: string, edit: boolean, codebaseSearch: boolean, variables: IVariableEntry[] = [], textModel: ITextModel): IInitiateProbeResponseState {
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


				if (progress.kind === 'textEdit') {
					if (progress.edits.complete) {
						const workSpaceEdit = progress.edits.edits.find(edit => ResourceTextEdit.is(edit));
						if (workSpaceEdit) {
							const openEditor = this.editorService.activeTextEditorControl;
							if (isCodeEditor(openEditor)) {
								const model = openEditor?.getModel();
								if (model && model.uri.toString() === workSpaceEdit.resource.toString()) {
									openEditor.pushUndoStop();
								}
							}
						}
					}
				}

				completeResponseCreated();
			};

			const listener = token.onCancellationRequested(() => {
				probeModel.cancelRequest();
			});

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

				probeModel.request = new AideProbeRequestModel(probeModel.sessionId, request, { variables }, edit, codebaseSearch);

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
				// if (textModel) {
				// 	const result = await mockInitiateProbe(probeModel.request, progressCallback, token, textModel);
				// 	if (token.isCancellationRequested) {
				// 		return;
				// 	} else if (result) {
				// 		probeModel.completeResponse();
				// 	}
				// }
				// Mock data end

			} catch (error) {
				console.log(error);
			} finally {
				listener.dispose();
			}
		};

		const rawResponsePromise = initiateProbeInternal();
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
		return await resolver.onUserAction({ sessionId: this._model.sessionId, action: { type: 'newIteration', newPrompt } });
	}


	cancelProbe() {
		if (this._activeRequest) {
			this._activeRequest.cancel();
			this._activeRequest.dispose();
		}
	}

	acceptCodeEdits() {
		this._onReview.fire('accept');
		this.clearSession();
	}

	rejectCodeEdits() {
		//const edits = this._model?.response?.codeEdits;
		//if (edits) {
		//	for (const edit of edits.values()) {
		//	/edit?.hunkData.discardAll();
		//	}
		//}

		this._onReview.fire('reject');
		this.clearSession();
	}

	async undoEdit() {
		const resource = await this._model?.response?.undoEdit();

		const openEditor = this.editorService.activeTextEditorControl;
		if (isCodeEditor(openEditor)) {
			const model = openEditor?.getModel();
			if (model && model.uri.toString() === resource?.toString()) {
				model.undo();
			}
		}
	}

	private clearSession() {
		this._model?.dispose();
		this._model = undefined;
		this.cancelProbe();
	}
}
