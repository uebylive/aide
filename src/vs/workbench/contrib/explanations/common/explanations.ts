/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExplanationsChangeEvent } from 'vs/workbench/contrib/explanations/common/explanationsModel';

export const EXPLANATIONS_EDITOR_CONTRIBUTION_ID = 'editor.contrib.explanations';

export interface ITreeElement {
	getId(): string;
}

export interface IExplanationData {
	readonly id?: string;
	readonly lineNumber: number;
	readonly column?: number;
}

export interface IExplanationUpdateData {
	readonly lineNumber?: number;
	readonly column?: number;
}

export interface IExplanation extends ITreeElement {
	readonly uri: URI;
	readonly lineNumber: number;
	readonly column?: number;
	readonly message?: string;
}

export interface IExplanationsModel extends ITreeElement {
	getExplanations(filter?: { uri?: URI }): IExplanation[];
	addExplanation(uri: URI, explanation: IExplanation, fireEvent?: boolean): IExplanation;
	updateExplanations(data: Map<string, IExplanationUpdateData>): void;
	onDidChangeExplanations: Event<IExplanationsChangeEvent | undefined>;
}

export const IExplanationsService = createDecorator<IExplanationsService>('explanationsService');
export interface IExplanationsService {
	readonly _serviceBrand: undefined;

	addExplanation(uri: URI, explanation: IExplanationData): void;

	updateExplanations(data: Map<string, IExplanationUpdateData>): void;

	getModel(): IExplanationsModel;
}

export interface IExplanationsEditorContribution extends editorCommon.IEditorContribution {
}
