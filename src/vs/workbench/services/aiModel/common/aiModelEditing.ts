/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from 'vs/base/common/async';
import * as json from 'vs/base/common/json';
import { Disposable, IReference } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { IModelSelectionSettings, isModelSelectionSettings } from 'vs/platform/aiModel/common/aiModels';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

type ModelType = 'slowModel' | 'fastModel';

export const IModelSelectionEditingService = createDecorator<IModelSelectionEditingService>('modelSelectionEditingService');
export interface IModelSelectionEditingService {
	readonly _serviceBrand: undefined;

	editModel(type: ModelType, key: string): Promise<void>;
}

export class ModelSelectionEditingService extends Disposable implements IModelSelectionEditingService {
	public _serviceBrand: undefined;
	private queue: Queue<void>;

	constructor(
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService
	) {
		super();
		this.queue = new Queue<void>();
	}

	editModel(type: ModelType, key: string): Promise<void> {
		return this.queue.queue(() => this.doEditModel(type, key)); // queue up writes to prevent race conditions
	}

	private async doEditModel(type: ModelType, key: string): Promise<void> {
		const reference = await this.resolveAndValidate();
		const model = reference.object.textEditorModel;

		const userModelSelectionEntries = <IModelSelectionSettings>json.parse(model.getValue());
		if (isModelSelectionSettings(userModelSelectionEntries)) {
			const updatedModel = { ...userModelSelectionEntries };
			updatedModel[type] = key;
			this.updateModel(updatedModel, model);
		}
		try {
			await this.save();
		} finally {
			reference.dispose();
		}
	}

	private save(): Promise<any> {
		return this.textFileService.save(this.userDataProfileService.currentProfile.modelSelectionResource);
	}

	private updateModel(updatedJson: Record<string, any>, textModel: ITextModel): void {
		const { tabSize, insertSpaces } = textModel.getOptions();
		const eol = textModel.getEOL();
		const content = JSON.stringify(updatedJson, null, insertSpaces ? ' '.repeat(tabSize) : '\t') + eol;
		textModel.setValue(content);
	}

	private resolveModelReference(): Promise<IReference<IResolvedTextEditorModel>> {
		return this.fileService.exists(this.userDataProfileService.currentProfile.modelSelectionResource)
			.then(exists => {
				const EOL = this.configurationService.getValue<{ eol: string }>('files', { overrideIdentifier: 'json' })['eol'];
				const result: Promise<any> = exists ? Promise.resolve(null) : this.textFileService.write(this.userDataProfileService.currentProfile.modelSelectionResource, this.getEmptyContent(EOL), { encoding: 'utf8' });
				return result.then(() => this.textModelResolverService.createModelReference(this.userDataProfileService.currentProfile.modelSelectionResource));
			});
	}

	private resolveAndValidate(): Promise<IReference<IResolvedTextEditorModel>> {
		// Target cannot be dirty if not writing into buffer
		if (this.textFileService.isDirty(this.userDataProfileService.currentProfile.modelSelectionResource)) {
			return Promise.reject(new Error(localize('errorModelSelectionFileDirty', "Unable to write because model selection file configuration file has unsaved changes. Please save it first and then try again.")));
		}

		return this.resolveModelReference();
	}

	private getEmptyContent(EOL: string): string {
		return '// ' + localize('emptyModelSelectionHeader', "Place your model selections in this file to override the defaults") + EOL + '{}';
	}
}

registerSingleton(IModelSelectionEditingService, ModelSelectionEditingService, InstantiationType.Delayed);
