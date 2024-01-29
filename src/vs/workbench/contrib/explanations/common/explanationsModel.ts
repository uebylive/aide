/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as resources from 'vs/base/common/resources';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IExplanation, IExplanationData, IExplanationUpdateData, IExplanationsModel } from 'vs/workbench/contrib/explanations/common/explanations';

export interface IExplanationsChangeEvent {
	added?: IExplanation;
	changed?: Array<IExplanation>;
}

export class Explanation implements IExplanation {
	constructor(
		private readonly _uri: URI,
		public _lineNumber: number,
		public _column: number | undefined,
		private readonly id = generateUuid()
	) { }

	getId(): string {
		return this.id;
	}

	get uri(): URI {
		return this._uri;
	}

	get lineNumber(): number {
		return this._lineNumber;
	}

	get column(): number | undefined {
		return this._column;
	}

	get message(): string | undefined {
		return 'Test explanation';
	}

	toJSON(): IExplanationData {
		const result = Object.create(null);
		result.id = this.id;
		result.uri = this._uri;
		result.lineNumber = this._lineNumber;
		result.column = this._column;
		result.message = this.message;

		return result;
	}

	toString(): string {
		return `${resources.basenameOrAuthority(this._uri)} [${this._lineNumber},${this._column}]: ${this.message}`;
	}

	update(data: IExplanationUpdateData): void {
		if (!isUndefinedOrNull(data.lineNumber)) {
			this._lineNumber = data.lineNumber;
		}
		if (!isUndefinedOrNull(data.column)) {
			this._column = data.column;
		}
	}
}

export class ExplanationsModel extends Disposable implements IExplanationsModel {

	private readonly _onDidChangeExplanations = this._register(new Emitter<IExplanationsChangeEvent | undefined>());
	private explanations: Explanation[] = [];

	getId(): string {
		return 'explanationsModel';
	}

	get onDidChangeExplanations(): Event<IExplanationsChangeEvent | undefined> {
		return this._onDidChangeExplanations.event;
	}

	getExplanations(filter?: { uri?: URI }): IExplanation[] {
		if (!filter) {
			return this.explanations;
		}

		return this.explanations.filter(explanation => {
			if (filter.uri && explanation.uri.toString() !== filter.uri.toString()) {
				return false;
			}

			return true;
		});
	}

	addExplanation(uri: URI, rawData: IExplanationData, fireEvent = true): IExplanation {
		const newExplanation = new Explanation(uri, rawData.lineNumber, rawData.column);
		this.explanations.push(newExplanation);
		if (fireEvent) {
			this._onDidChangeExplanations.fire({ added: newExplanation });
		}

		return newExplanation;
	}

	updateExplanations(data: Map<string, IExplanationUpdateData>): void {
		const updated: IExplanation[] = [];
		this.explanations.forEach(exp => {
			const expData = data.get(exp.getId());
			if (expData) {
				exp.update(expData);
				updated.push(exp);
			}
		});
		this._onDidChangeExplanations.fire({ changed: updated });
	}
}
