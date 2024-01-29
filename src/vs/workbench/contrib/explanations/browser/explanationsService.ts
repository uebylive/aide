/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExplanationData, IExplanationUpdateData, IExplanationsModel, IExplanationsService } from 'vs/workbench/contrib/explanations/common/explanations';
import { ExplanationsModel } from 'vs/workbench/contrib/explanations/common/explanationsModel';

export class ExplanationService implements IExplanationsService {
	declare readonly _serviceBrand: undefined;

	private model: ExplanationsModel;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.model = this.instantiationService.createInstance(ExplanationsModel);
	}

	addExplanation(uri: URI, rawExplanation: IExplanationData): void {
		this.model.addExplanation(uri, rawExplanation);
	}

	updateExplanations(data: Map<string, IExplanationUpdateData>): void {
		this.model.updateExplanations(data);
	}

	getModel(): IExplanationsModel {
		return this.model;
	}
}
