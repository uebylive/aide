/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { LineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { WorkspaceEdit } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { EditMode } from 'vs/workbench/contrib/csChat/common/csChatService';

export class ChatEditSession {
	private readonly _edits: WorkspaceEdit[] = [];

	readonly textModelNAltVersion: number;
	private _textModelNSnapshotAltVersion: number | undefined;

	constructor(
		readonly editMode: EditMode,
		readonly textModel0: ITextModel,
		readonly textModelN: ITextModel,
	) {
		this.textModelNAltVersion = textModelN.getAlternativeVersionId();
	}

	get textModelNSnapshotAltVersion(): number | undefined {
		return this._textModelNSnapshotAltVersion;
	}

	createSnapshot(): void {
		this._textModelNSnapshotAltVersion = this.textModelN.getAlternativeVersionId();
	}

	addExchange(exchange: WorkspaceEdit): void {
		this._edits.push(exchange);
	}

	getExchanges(): Iterable<WorkspaceEdit> {
		return this._edits;
	}

	getLastExchange(): WorkspaceEdit | undefined {
		return this._edits[this._edits.length - 1];
	}

	get hasChangedText(): boolean {
		return this.textModelNAltVersion !== this.textModelN.getAlternativeVersionId();
	}

	asChangedText(changes: readonly LineRangeMapping[]): string | undefined {
		if (changes.length === 0) {
			return undefined;
		}

		let startLine = Number.MAX_VALUE;
		let endLine = Number.MIN_VALUE;
		for (const change of changes) {
			startLine = Math.min(startLine, change.modified.startLineNumber);
			endLine = Math.max(endLine, change.modified.endLineNumberExclusive);
		}

		return this.textModelN.getValueInRange(new Range(startLine, 1, endLine, Number.MAX_VALUE));
	}
}
