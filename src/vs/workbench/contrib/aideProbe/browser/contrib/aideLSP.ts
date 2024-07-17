/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CONTEXT_PROBE_IS_LSP_ACTIVE } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import Severity from 'vs/base/common/severity';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';


export class AideLSP {
	public static readonly ID = 'workbench.contrib.aideLSP';
	private static readonly STORAGE_KEY = 'aide.notifications.dontShowAgain';
	private static readonly CONFIG_KEY = 'aide.resetNotifications';

	isActive: IContextKey<boolean>;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {

		this.isActive = CONTEXT_PROBE_IS_LSP_ACTIVE.bindTo(this.contextKeyService);

		this.editorService.onDidActiveEditorChange(() => {
			this.checkForLSP();
		});

		this.languageFeaturesService.referenceProvider.onDidChange(() => {
			this.checkForLSP();
		});

		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AideLSP.CONFIG_KEY) && this.configurationService.getValue<boolean>(AideLSP.CONFIG_KEY)) {
				this.resetNotificationState();
			}
		});
	}

	private checkForLSP() {
		const editor = this.editorService.activeTextEditorControl;
		console.log(editor);

		if (!isCodeEditor(editor)) {
			return;
		}

		const model = editor.getModel();
		if (!model) {
			return;
		}

		const languageId = model.getLanguageId();

		if (languageId === 'plaintext' || languageId === 'json' || languageId === 'markdown') {
			return;
		}

		const isReferenceProviderActive = this.languageFeaturesService.referenceProvider.has(model);
		this.isActive.set(isReferenceProviderActive);

		if (!isReferenceProviderActive) {
			this.notifiyLSPIsNotActive(languageId);
		}
	}

	private notifiyLSPIsNotActive(languageId: string) {

		const dontShowAgain = this.storageService.getBoolean(AideLSP.STORAGE_KEY, StorageScope.PROFILE, false);

		if (dontShowAgain) {
			return;
		}

		this.notificationService.notify({
			severity: Severity.Info,
			message: `In order for Aide to work, you have to install the recommended extensions for ${languageId}`,
			actions: {
				primary: [
					{
						label: 'Don\'t show again',
						run: () => {
							this.storageService.store(
								AideLSP.STORAGE_KEY,
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
		this.storageService.remove(AideLSP.STORAGE_KEY, StorageScope.PROFILE);
	}


}

registerWorkbenchContribution2(AideLSP.ID, AideLSP, WorkbenchPhase.BlockStartup);
