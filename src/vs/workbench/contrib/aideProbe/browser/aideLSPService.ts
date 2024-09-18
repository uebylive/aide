/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export interface IAideLSPService {
	_serviceBrand: undefined;

	readonly map: Map<string, boolean>;
	getStatus(languageId: string): boolean;
	isActiveForCurrentEditor(): boolean;
	readonly onDidChangeStatus: Event<ILanguageStatus>;
}

interface ILanguageStatus {
	languageId: string;
	isActive: boolean;
}

export const IAideLSPService = createDecorator<IAideLSPService>('IAideLSPService');

export const unsupportedLanguages = new Set(['ignore']);

export class AideLSPService extends Disposable implements IAideLSPService {
	_serviceBrand: undefined;
	readonly map: Map<string, boolean>;
	public static readonly ID = 'workbench.contrib.aideLSP';
	//private static readonly STORAGE_KEY = 'aide.notifications.dontShowAgain';

	private _onDidChangeStatus = this._register(new Emitter<ILanguageStatus>());
	readonly onDidChangeStatus: Event<ILanguageStatus> = this._onDidChangeStatus.event;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this.map = new Map();

		this.checkForLSP();

		this.editorService.onDidActiveEditorChange(() => {
			this.checkForLSP();
		});

		this.languageFeaturesService.referenceProvider.onDidChange(() => {
			this.checkForLSP();
		});
	}

	private checkForLSP() {

		const editor = this.editorService.activeTextEditorControl;
		if (!isCodeEditor(editor)) {
			return;
		}

		const model = editor.getModel();
		if (!model) {
			return;
		}

		const languageId = model.getLanguageId();

		const previousStatus = this.map.get(languageId);

		if (unsupportedLanguages.has(languageId)) {
			return;
		}

		const currentStatus = this.languageFeaturesService.referenceProvider.has(model);
		this.map.set(languageId, currentStatus);
		if (previousStatus !== currentStatus) {
			this._onDidChangeStatus.fire({ languageId, isActive: currentStatus });
		}

		//if (!isReferenceProviderActive) {
		//	this.notifiyLSPIsNotActive(languageId);
		//}
	}

	getStatus(languageId: string): boolean {
		const referenceProviders = this.languageFeaturesService.referenceProvider.getForLanguageId({ 'scheme': 'file', 'language': languageId });
		if (referenceProviders.length !== 0) {
			return true;
		} else {
			return false;
		}
	}

	isActiveForCurrentEditor(): boolean {
		const editor = this.editorService.activeTextEditorControl;
		if (!isCodeEditor(editor)) {
			return false;
		}

		const model = editor.getModel();
		if (!model) {
			return false;
		}

		const languageId = model.getLanguageId();
		return this.getStatus(languageId);
	}

	/*
	private notifiyLSPIsNotActive(languageId: string) {

		const dontShowAgain = this.storageService.getBoolean(AideLSPService.STORAGE_KEY, StorageScope.PROFILE, false);

		if (dontShowAgain) {
			return;
		}

		this.notificationService.notify({
			severity: Severity.Info,
			// TODO(@g-danna) - Localize this
			message: `In order for Aide to work, you have to install the recommended extensions for ${languageId}`,
			actions: {
				primary: [
					{
						label: 'Don\'t show again',
						run: () => {
							this.storageService.store(
								AideLSPService.STORAGE_KEY,
								true,
								StorageScope.PROFILE,
								StorageTarget.USER
							);
						},
						id: 'aide.notifications.dontShowAgain',
						tooltip: '',
						class: undefined,
						enabled: true
					}],
			}
		});
	}

	private resetNotificationState() {
		this.storageService.remove(AideLSPService.STORAGE_KEY, StorageScope.PROFILE);
	}*/
}
