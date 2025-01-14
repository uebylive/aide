/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatViewId } from './aideAgent.js';

import { DevtoolsStatus, IDevtoolsService, ParsedSource } from '../common/devtoolsService.js';
import { CONTEXT_DEVTOOLS_STATUS, CONTEXT_IS_DEVTOOLS_FEATURE_ENABLED, CONTEXT_IS_INSPECTING_HOST } from '../common/devtoolsServiceContextKeys.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ChatViewPane } from './aideAgentViewPane.js';
import { Location } from '../../../../editor/common/languages.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ChatDynamicVariableModel } from './contrib/aideAgentDynamicVariables.js';
import { IDynamicVariable } from '../common/aideAgentVariables.js';
import { localize } from '../../../../nls.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';

export class DevtoolsService extends Disposable implements IDevtoolsService {
	declare _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<DevtoolsStatus>());
	public readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private readonly _onDidTriggerInspectingHostStart = this._register(new Emitter<void>());
	public readonly onDidTriggerInspectingHostStart = this._onDidTriggerInspectingHostStart.event;

	private readonly _onDidTriggerInspectingHostStop = this._register(new Emitter<void>());
	public readonly onDidTriggerInspectingHostStop = this._onDidTriggerInspectingHostStop.event;

	private _isFeatureEnabled: IContextKey<boolean>;

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
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {

		super();
		this._status = CONTEXT_DEVTOOLS_STATUS.bindTo(contextKeyService);
		this._isInspecting = CONTEXT_IS_INSPECTING_HOST.bindTo(contextKeyService);
		this._isFeatureEnabled = CONTEXT_IS_DEVTOOLS_FEATURE_ENABLED.bindTo(contextKeyService);

		// Check current state of your config at startup:
		this.updateConfig();

		// Subscribe to config changes:
		this._register(
			this.configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('aide')) {
					this.updateConfig();
				}
			})
		);
	}


	private updateConfig(): void {
		// Read the configuration value:
		const isEnabled = !!this.configurationService.getValue<boolean>('aide.enableInspectWithDevtools');
		this._isFeatureEnabled.set(isEnabled);
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
		const dynamicVariablesModel = aideView.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);

		if (!dynamicVariablesModel) {
			return;
		}

		const input = aideView.widget.inputEditor;
		const inputModel = input.getModel();
		const reference = await this.getValidReference(payload);

		if (reference && inputModel) {
			const file = await this.fileService.stat(reference.uri);
			const displayName = `@${file.name}:${reference.range.startLineNumber}-${reference.range.endLineNumber}`;
			const inputModelFullRange = inputModel.getFullModelRange();
			// By default, append to the end of the model
			let replaceRange = {
				startColumn: inputModelFullRange.endColumn,
				endColumn: inputModelFullRange.endColumn,
				startLineNumber: inputModelFullRange.endLineNumber,
				endLineNumber: inputModelFullRange.endLineNumber,
			};

			const selection = input.getSelection();
			// If there is a selection, use that
			if (selection) {
				replaceRange = {
					startColumn: selection.startColumn,
					endColumn: selection.endColumn,
					startLineNumber: selection.startLineNumber,
					endLineNumber: selection.endLineNumber
				};
			}
			const isLeading = replaceRange.startColumn === 1;
			// Add leading space if we are not at the very beginning of the text model
			const output = isLeading ? displayName : ' ' + displayName;

			const success = input.executeEdits('addReactComponentSource', [{ range: replaceRange, text: output }]);
			if (success) {
				const variable: IDynamicVariable = {
					id: 'vscode.file',
					range: {
						...replaceRange,
						// Include the actual length of the variable
						startColumn: replaceRange.startColumn + (isLeading ? 0 : 1),
						endColumn: replaceRange.endColumn + displayName.length + (isLeading ? 0 : 1),
					},
					data: { uri: reference.uri, range: reference.range }
				};
				dynamicVariablesModel.addReference(variable);
				input.focus();
			}
		}
	}

	private async getValidReference(payload: any): Promise<Location | null> {
		try {
			console.log(payload);
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
					this.notifyProjectNotSupported();
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
				this.notifyProjectNotSupported();
				return null;
			}
		} catch (err) {
			this.notifyProjectNotSupported();
			return null;
		}
	}

	private notifyProjectNotSupported() {
		this.notificationService.prompt(
			Severity.Info,
			localize('aide.devtools.unsupportedProject', 'Your project doesn\'t seem to support React devtooling. You need to client render and have source maps enabled.'),
			[
				{
					label: localize('aide.devtools.openDocumentation', 'Open documentation'),
					run: () => {
						// Construct the external URI to open
						const externalUri = URI.parse('https://docs.aide.dev/features/react-devtools/#how-to-use');
						// Use the opener service to open it in the user's browser
						this.openerService.open(externalUri).catch(console.error);
					}
				}
			]
		);
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
