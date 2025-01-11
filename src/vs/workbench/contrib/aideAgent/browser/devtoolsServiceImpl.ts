/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatViewId } from './aideAgent.js';

import { DevtoolsStatus, IDevtoolsService, ParsedSource } from '../common/devtoolsService.js';
import { CONTEXT_DEVTOOLS_STATUS, CONTEXT_IS_INSPECTING_HOST } from '../common/devtoolsServiceContextKeys.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ChatViewPane } from './aideAgentViewPane.js';
import { Location } from '../../../../editor/common/languages.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';

export class DevtoolsService extends Disposable implements IDevtoolsService {
	declare _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<DevtoolsStatus>());
	public readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private readonly _onDidTriggerInspectingHostStart = this._register(new Emitter<void>());
	public readonly onDidTriggerInspectingHostStart = this._onDidTriggerInspectingHostStart.event;

	private readonly _onDidTriggerInspectingHostStop = this._register(new Emitter<void>());
	public readonly onDidTriggerInspectingHostStop = this._onDidTriggerInspectingHostStop.event;

	private _status: IContextKey<DevtoolsStatus>;
	get status(): DevtoolsStatus {
		const contextKeyValue = this._status.get();
		if (contextKeyValue === undefined) {
			console.error(`Context key for ${CONTEXT_DEVTOOLS_STATUS.key} is undefined. Resetting`);
			this._status.reset();
		}
		return this._status.get()!;
	}

	set status(status: DevtoolsStatus) {
		this._status.set(status);
		this.notifyStatusChange();
	}

	private _latestPayload: any;
	get latestPayload() {
		return this._latestPayload;
	}

	set latestPayload(payload: any) {
		this._latestPayload = payload;
	}

	private _latestResource: URI | undefined;
	get latestResource() {
		return this._latestResource;
	}

	private _isInspecting: IContextKey<boolean>;
	get isInspecting() {
		const contextKeyValue = this._isInspecting.get();
		if (contextKeyValue === undefined) {
			console.error(`Context key for ${CONTEXT_IS_INSPECTING_HOST.key} in is undefined. Resetting`);
			this._isInspecting.reset();
		}
		return this._isInspecting.get()!;
	}

	set isInspecting(isInspecting: boolean) {
		this._isInspecting.set(isInspecting);
		// Stopped inspecting and we have some payload
		if (!isInspecting && this._latestPayload) {
			this.addReference(this._latestPayload);
		}
	}

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewsService private readonly viewsService: IViewsService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILanguageFeaturesService private readonly languageFeatureService: ILanguageFeaturesService
	) {
		super();
		this._status = CONTEXT_DEVTOOLS_STATUS.bindTo(contextKeyService);
		this._isInspecting = CONTEXT_IS_INSPECTING_HOST.bindTo(contextKeyService);
	}

	private notifyStatusChange() {
		const isDevelopment = !this.environmentService.isBuilt || this.environmentService.isExtensionDevelopment;
		if (isDevelopment) {
			console.log('Devtools service status: ', this.status);
		}
		this._onDidChangeStatus.fire(this.status);
	}

	private async addReference(payload: any) {
		const aideView = this.viewsService.getViewWithId<ChatViewPane>(ChatViewId);
		if (!aideView) {
			return;
		}
		const suggestController = aideView.widget.inputEditor.getContribution<SuggestController>('editor.contrib.suggestController');
		if (!suggestController) {
			return;
		}
		const reference = await this.getValidReference(payload);

		if (reference) {
			//const widget = aideView.widget;
			//const selection = widget.inputEditor.getSelection();
			this._latestResource = reference.uri;

			const completionProviders = this.languageFeatureService.completionProvider.getForAllLanguages();
			const completionProvider = completionProviders.find(provider => provider._debugDisplayName === 'devtoolsFileProvider');
			if (!completionProvider) {
				return;
			}
			suggestController.triggerSuggest(new Set([completionProvider]));
		}
	}

	private async getValidReference(payload: any): Promise<Location | null> {
		try {
			if ('parsedSource' in payload.value) {
				const { source, column, line } = payload.value.parsedSource as unknown as ParsedSource;
				let reference: URI | null = null;
				if (source.type === 'URL') {
					reference = await this.resolveRelativeReference(source.relativePath);
				} else if (source.type === 'relative') {
					reference = await this.resolveRelativeReference(source.path);
				} else if (source.type === 'absolute') {
					reference = URI.parse(source.path);
				}

				if (!reference) {
					console.error(`Cannot find file on system: ${JSON.stringify(payload)}`);
					return null;
				}
				return {
					uri: reference,
					range: {
						startColumn: column,
						endColumn: 9999999,
						startLineNumber: line,
						endLineNumber: line,
					}
				};
			} else {
				console.error(`The project output must have a source path in order to work`);
				return null;
			}
		} catch (err) {
			console.log(err);
			return null;
		}
	}

	private async resolveRelativeReference(relativePath: string): Promise<URI | null> {
		const workspace = this.workspaceContextService.getWorkspace();
		if (!workspace) {
			throw Error('A workspace needs to be open in order to parse relative references.');
		}
		for (const workspaceFolder of workspace.folders) {
			const absolutePath = joinPath(workspaceFolder.uri, relativePath);
			const doesFileExist = await this.fileService.exists(absolutePath);
			if (doesFileExist) {
				return absolutePath;
			}
		}
		return null;
	}

	startInspectingHost(): void {
		this._isInspecting.set(true);
		this._onDidTriggerInspectingHostStart.fire();
	}

	stopInspectingHost(): void {
		this._isInspecting.set(false);
		this._onDidTriggerInspectingHostStop.fire();
	}
}
