/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IAideChatVariablesService } from 'vs/workbench/contrib/aideChat/common/aideChatVariables';
import { ChatRequestTextPart, ChatRequestVariablePart, IParsedChatRequest, IParsedChatRequestPart, chatVariableLeader } from 'vs/workbench/contrib/aideProbe/common/aideProbeParserTypes';

const variableReg = /^#([\w_\-]+)(:\d+)?(?=(\s|$|\b))/i; // A #-variable with an optional numeric : arg (@response:2)

export class ChatRequestParser {
	constructor(
		@IAideChatVariablesService private readonly variableService: IAideChatVariablesService,
	) { }

	parseChatRequest(message: string): IParsedChatRequest {
		const parts: IParsedChatRequestPart[] = [];

		let lineNumber = 1;
		let column = 1;
		for (let i = 0; i < message.length; i++) {
			const previousChar = message.charAt(i - 1);
			const char = message.charAt(i);
			let newPart: IParsedChatRequestPart | undefined;
			if (previousChar.match(/\s/) || i === 0) {
				if (char === chatVariableLeader) {
					newPart = this.tryToParseVariable(message.slice(i), i, new Position(lineNumber, column), parts);
				}
			}

			if (newPart) {
				if (i !== 0) {
					// Insert a part for all the text we passed over, then insert the new parsed part
					const previousPart = parts.at(-1);
					const previousPartEnd = previousPart?.range.endExclusive ?? 0;
					const previousPartEditorRangeEndLine = previousPart?.editorRange.endLineNumber ?? 1;
					const previousPartEditorRangeEndCol = previousPart?.editorRange.endColumn ?? 1;
					parts.push(new ChatRequestTextPart(
						new OffsetRange(previousPartEnd, i),
						new Range(previousPartEditorRangeEndLine, previousPartEditorRangeEndCol, lineNumber, column),
						message.slice(previousPartEnd, i)));
				}

				parts.push(newPart);
			}

			if (char === '\n') {
				lineNumber++;
				column = 1;
			} else {
				column++;
			}
		}

		const lastPart = parts.at(-1);
		const lastPartEnd = lastPart?.range.endExclusive ?? 0;
		if (lastPartEnd < message.length) {
			parts.push(new ChatRequestTextPart(
				new OffsetRange(lastPartEnd, message.length),
				new Range(lastPart?.editorRange.endLineNumber ?? 1, lastPart?.editorRange.endColumn ?? 1, lineNumber, column),
				message.slice(lastPartEnd, message.length)));
		}

		return {
			parts,
			text: message,
		};
	}

	private tryToParseVariable(message: string, offset: number, position: IPosition, parts: ReadonlyArray<IParsedChatRequestPart>): ChatRequestVariablePart | undefined {
		const nextVariableMatch = message.match(variableReg);
		if (!nextVariableMatch) {
			return;
		}

		const [full, name] = nextVariableMatch;
		const variableArg = nextVariableMatch[2] ?? '';
		const varRange = new OffsetRange(offset, offset + full.length);
		const varEditorRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column + full.length);



		// TODO - not really handling duplicate variables names yet
		const variable = this.variableService.getVariable(name);
		if (variable && (!variable.isSlow)) {
			return new ChatRequestVariablePart(varRange, varEditorRange, name, variableArg, variable.id);
		}

		return;
	}
}
