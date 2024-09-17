/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableMap, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAgentTriggerComplete, IAideAgentImplementation } from 'vs/workbench/contrib/aideAgent/common/aideAgent';
import { AideAgentModel, AideAgentScope, IAgentExchangeData, IAgentTriggerPayload } from 'vs/workbench/contrib/aideAgent/common/aideAgentModel';
import { IAgentResponseProgress, IAideAgentService } from 'vs/workbench/contrib/aideAgent/common/aideAgentService';

export class AideAgentService extends Disposable implements IAideAgentService {
	declare _serviceBrand: undefined;

	private agentModel: AideAgentModel | undefined;
	private agentProvider: IAideAgentImplementation | undefined;
	private readonly _pendingRequests = this._register(new DisposableMap<string, CancellationTokenSource>());

	private _scope: AideAgentScope = AideAgentScope.Selection;
	private _onDidChangeScope = this._register(new Emitter<AideAgentScope>());
	readonly onDidChangeScope = this._onDidChangeScope.event;

	get scope() {
		return this._scope;
	}

	set scope(scope: AideAgentScope) {
		this._scope = scope;
		this._onDidChangeScope.fire(scope);
	}

	get scopeSelection(): Readonly<number> {
		if (this._scope === AideAgentScope.Selection) {
			return 0;
		} else if (this._scope === AideAgentScope.PinnedContext) {
			return 1;
		} else {
			return 2;
		}
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	registerAgentProvider(resolver: IAideAgentImplementation): IDisposable {
		if (this.agentProvider) {
			throw new Error('Aide agent provider already registered');
		}

		this.agentProvider = resolver;
		return toDisposable(() => {
			this.agentProvider = undefined;
		});
	}

	startSession(): AideAgentModel | undefined {
		this.agentModel = this.instantiationService.createInstance(AideAgentModel);
		return this.agentModel;
	}

	trigger(message: string): void {
		const model = this.agentModel;
		if (!model || !this.agentProvider) {
			return;
		}

		if (this._pendingRequests.has(model.sessionId)) {
			return;
		}

		let triggerModel: IAgentExchangeData;

		const cts = new CancellationTokenSource();
		const token = cts.token;
		const triggerAgentInternal = async () => {
			const progressCallback = async (progress: IAgentResponseProgress) => {
				if (token.isCancellationRequested) {
					return;
				}

				model.acceptProgress(triggerModel, progress);
			};

			const listener = token.onCancellationRequested(() => {
				// TODO(@ghostwriternr): Implement cancelRequest
				// model.cancelRequest(triggerModel);
			});

			try {
				let rawResult: void | IAgentTriggerComplete | undefined;

				triggerModel = model.addTrigger(message);
				const requestProps: IAgentTriggerPayload = {
					id: triggerModel.exchangeId,
					message: message,
					scope: this._scope,
				};
				const agentResult = await this.agentProvider?.trigger(requestProps, progressCallback, token);
				rawResult = agentResult;

				if (token.isCancellationRequested) {
					return;
				} else {
					if (!rawResult) {
						rawResult = { errorDetails: localize('emptyResponse', "Provider returned null response") };
					}

					// TODO(@ghostwriternr): Implement setResponse
					// model.setResponse(triggerModel, rawResult);
				}
			} catch (error) {
				console.log(error);
			} finally {
				listener.dispose();
			}
		};

		const rawResponsePromise = triggerAgentInternal();
		rawResponsePromise.finally(() => {
			// cleanup
		});
	}
}
