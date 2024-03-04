/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { RepoRef, SideCarClient } from '../../sidecar/client';
import { v4 as uuidv4 } from 'uuid';
import { InEditorRequest, InLineAgentContextSelection } from '../../sidecar/types';
import { parseDiagnosticsInformation, reportFromStreamToEditorSessionProgress } from './reportEditorSessionAnswerStream';

export enum IndentStyle {
	Tabs = 'tabs',
	Spaces = 'spaces'
}

export interface IndentStyleSpaces {
	kind: IndentStyle;
	indentSize: number | null;
}

export class IndentationUtils {
	private spacePatterns: Map<number, RegExp>;
	private readonly tabPattern: RegExp;

	constructor() {
		this.spacePatterns = new Map();
		this.tabPattern = /^(\t+)/;
	}

	/**
	 * Determines the indentation of a given line.
	 *
	 * @param line The line to inspect.
	 * @param useSpaces Whether to look for spaces (true) or tabs (false).
	 * @param spaceCount If using spaces, the number of spaces per indent.
	 * @returns A tuple where the first element is the whitespace string and the second is the indent count.
	 */
	guessIndent(line: string, useSpaces: boolean, spaceCount?: number): [string, number] {
		const pattern = useSpaces ? this.getSpacePattern(spaceCount!) : this.tabPattern;
		const match = line.match(pattern);
		return match ? [match[0], match[0].length / (useSpaces ? spaceCount! : 1)] : ['', 0];
	}

	/**
	 * Retrieves (or generates) the regex pattern for a given space count.
	 *
	 * @param count The number of spaces per indent.
	 * @returns The corresponding regex pattern.
	 */
	private getSpacePattern(count: number): RegExp {
		if (!this.spacePatterns.has(count)) {
			this.spacePatterns.set(count, new RegExp(`^(( {${count}})+)`));
		}
		return this.spacePatterns.get(count)!;
	}
}

export class IndentationHelper {
	static getLeadingWhitespace(line: string) {
		for (let i = 0; i < line.length; i++) {
			const charCode = line.charCodeAt(i);
			if (charCode !== 32 && charCode !== 9) {
				return line.substring(0, i);
			}
		}
		return line;
	}

	static guessIndentStyleFromLeadingWhitespace(whitespace: string): IndentStyleSpaces | null {
		if (!whitespace || whitespace === ' ') {
			return null;
		}
		if (/\t/.test(whitespace)) {
			return { kind: IndentStyle.Tabs, indentSize: null };
		}
		const spaceMatch = whitespace.match(/( +)/);
		if (spaceMatch) {
			const spaceCount = spaceMatch[1].length;
			return {
				kind: IndentStyle.Spaces,
				indentSize: spaceCount === 2 ? spaceCount : 4
			};
		}
		return null;
	}

	static guessIndentStyleFromLine(line: string) {
		const leadingWhitespace = this.getLeadingWhitespace(line);
		const result = this.guessIndentStyleFromLeadingWhitespace(leadingWhitespace);
		return result;
	}

	// we get the whitespace string and the indent level this way for the string we want to add
	static guessIndentLevel(line: string, indentStyle: IndentStyleSpaces): [string, number] {
		const indentationUtils = new IndentationUtils();
		if (indentStyle === null) {
			return ['', 0];
		}
		const [whiteSpaceString, indentationLevel] = indentationUtils.guessIndent(line, indentStyle.kind === IndentStyle.Spaces, indentStyle.indentSize ?? 1);
		return [whiteSpaceString, indentationLevel];
	}

	static getDocumentIndentStyle(lines: string[], defaultStyle: IndentStyleSpaces | undefined) {
		for (const line of lines) {
			const style = this.guessIndentStyleFromLine(line);
			if (style) {
				return style;
			}
		}
		return defaultStyle || { kind: IndentStyle.Tabs, indentSize: null };
	}

	static getDocumentIndentStyleUsingSelection(selectionContext: InLineAgentContextSelection): IndentStyleSpaces {
		const activeTextEditor = vscode.window.activeTextEditor;
		if (activeTextEditor) {
			if (activeTextEditor.options.insertSpaces) {
				// @ts-ignore
				return { kind: IndentStyle.Spaces, indentSize: activeTextEditor.options.tabSize ?? null };
			} else {
				return { kind: IndentStyle.Tabs, indentSize: null };
			}
		}
		const content = [...selectionContext.above.lines, ...selectionContext.range.lines, ...selectionContext.below.lines];
		for (const line of content) {
			const style = this.guessIndentStyleFromLine(line);
			if (style) {
				return style;
			}
		}
		return { kind: IndentStyle.Tabs, indentSize: null };
	}

	static changeIndentLevel(lines: string[], currentLevel: number, newLevel: number, style: IndentStyleSpaces): string[] {
		if (currentLevel === newLevel) {
			return lines;
		}
		if (currentLevel > newLevel) {
			// we have to shift things back by a few levels
			const changeInLevel = currentLevel - newLevel;
			const indentationStringToRemoveFromPrefix = style.kind === IndentStyle.Tabs ? '\t' : ' '.repeat(style.indentSize ?? 4);
			// we have to remove this string from every string
			const newLines = lines.map((line) => {
				if (line.startsWith(indentationStringToRemoveFromPrefix)) {
					return line.slice(indentationStringToRemoveFromPrefix.length);
				} else {
					return line;
				}
			});
			return newLines;
		}
		if (currentLevel < newLevel) {
			// we have to shift things forward by a few levels
			const changeInLevel = newLevel - currentLevel;
			const indentationStringToAddToPrefix = style.kind === IndentStyle.Tabs ? '\t' : ' '.repeat(style.indentSize ?? 4);
			// we have to add this string to every string
			const newLines = lines.map((line) => {
				return indentationStringToAddToPrefix + line;
			});
			return newLines;
		}
		return lines;
	}

	static changeIndentStyle(lines: string[], oldStyle: IndentStyleSpaces, newStyle: IndentStyleSpaces): string[] {
		const indentationStringToRemoveFromPrefix = oldStyle.kind === IndentStyle.Tabs ? '\t' : ' '.repeat(oldStyle.indentSize ?? 4);
		const indentationStringToAddToPrefix = newStyle.kind === IndentStyle.Tabs ? '\t' : ' '.repeat(newStyle.indentSize ?? 4);
		const newLines = lines.map((line) => {
			// we have to remove the old indentation and add the new one
			const indentationLevel = IndentationHelper.guessIndentLevel(line, oldStyle);
			// now we can remove the string
			const strippedLine = line.slice(indentationStringToRemoveFromPrefix.repeat(indentationLevel[1]).length);
			// now add back the new indentation string
			return indentationStringToAddToPrefix.repeat(indentationLevel[1]) + strippedLine;
		});
		return newLines;
	}
}


export class CSInteractiveEditorSession implements vscode.InteractiveEditorSession {
	placeholder?: string;
	input?: string;
	slashCommands?: vscode.InteractiveEditorSlashCommand[];
	wholeRange?: vscode.Range;
	message?: string;

	textDocument: vscode.TextDocument;
	range: vscode.Range;
	threadId: string;

	constructor(textDocument: vscode.TextDocument, range: vscode.Range) {
		this.placeholder = 'What would you like to change?';
		this.slashCommands = [];
		this.threadId = uuidv4();
		this.textDocument = textDocument;
		this.wholeRange = range;
		this.message = '';
		this.range = range;
	}

	getTextDocumentLanguage(): string {
		return this.textDocument.languageId;
	}
}

export class CSInteractiveEditorProgressItem implements vscode.InteractiveEditorProgressItem {
	message?: string;
	edits?: vscode.TextEdit[];
	editsShouldBeInstant?: boolean;
	slashCommand?: vscode.InteractiveEditorSlashCommand;
	content?: string | vscode.MarkdownString;

	static normalMessage(message: string): CSInteractiveEditorProgressItem {
		return {
			message: message,
		};
	}

	static sendReplyMessage(message: string): CSInteractiveEditorProgressItem {
		return {
			content: message,
			message,
		};
	}

	static documentationGeneration(): CSInteractiveEditorProgressItem {
		return {
			slashCommand: {
				command: 'doc',
				refer: true,
				detail: 'Generate documentation for the selected code',
				executeImmediately: false,
			}
		};
	}

	static editGeneration(): CSInteractiveEditorProgressItem {
		return {
			slashCommand: {
				command: 'edit',
				refer: true,
				detail: 'Edits the code as per the user request',
				executeImmediately: false,
			}
		};
	}

	static fixGeneration(): CSInteractiveEditorProgressItem {
		return {
			slashCommand: {
				command: 'fix',
				refer: true,
				detail: 'Fixes the code as per the user request',
				executeImmediately: false,
			}
		};
	}
}

export class CSInteractiveEditorMessageResponse implements vscode.InteractiveEditorMessageResponse {
	contents: vscode.MarkdownString;
	placeholder?: string;
	wholeRange?: vscode.Range;

	constructor(contents: vscode.MarkdownString, placeholder: string | undefined, wholeRange: vscode.Range | undefined) {
		this.contents = contents;
		this.placeholder = placeholder;
		this.wholeRange = wholeRange;
	}
}


export class CSInteractiveEditorResponse implements vscode.InteractiveEditorResponse {
	edits: vscode.TextEdit[] | vscode.WorkspaceEdit;
	contents?: vscode.MarkdownString | undefined;
	placeholder?: string;
	wholeRange?: vscode.Range | undefined;

	constructor(edits: vscode.TextEdit[] | vscode.WorkspaceEdit, contents: vscode.MarkdownString | undefined, placeholder: string | undefined, wholeRange: vscode.Range) {
		this.edits = edits;
		this.contents = contents;
		this.placeholder = placeholder;
		this.wholeRange = wholeRange;
	}
}

export type CSInteractiveEditorResponseMessage = CSInteractiveEditorResponse | CSInteractiveEditorMessageResponse;

export class CSInteractiveEditorSessionProvider implements vscode.InteractiveEditorSessionProvider<CSInteractiveEditorSession> {
	label: 'cs-chat-editor';
	sidecarClient: SideCarClient;
	repoRef: RepoRef;
	workingDirectory: string;
	constructor(
		sidecarClient: SideCarClient,
		repoRef: RepoRef,
		workingDirectory: string,
	) {
		this.label = 'cs-chat-editor';
		this.sidecarClient = sidecarClient;
		this.repoRef = repoRef;
		this.workingDirectory = workingDirectory;
	}

	prepareInteractiveEditorSession(
		context: vscode.TextDocumentContext,
		token: vscode.CancellationToken,
	): vscode.ProviderResult<CSInteractiveEditorSession> {
		const start = context.selection.active;
		const anchor = context.selection.anchor;
		if (vscode.window.activeTextEditor === undefined) {
			throw Error('no active text editor');
		}
		const currentEditorOptions = vscode.window.activeTextEditor?.options;
		let fileIndentInfo;
		if (currentEditorOptions) {
			fileIndentInfo = {
				insertSpaces: currentEditorOptions.insertSpaces,
				tabSize: currentEditorOptions.tabSize
			};
		}
		// const range = new vscode.Range(start.line - 1, start.character, anchor.line + 1, anchor.character);
		return new CSInteractiveEditorSession(context.document, context.selection);
	}

	provideInteractiveEditorResponse(
		session: CSInteractiveEditorSession,
		request: vscode.InteractiveEditorRequest,
		progress: vscode.Progress<CSInteractiveEditorProgressItem>,
		token: vscode.CancellationToken,
	): vscode.ProviderResult<CSInteractiveEditorResponseMessage> {
		return (async () => {
			progress.report({
				message: 'Getting the response...',
			});
			const textDocument = session.textDocument;
			// First get the more correct range for this selection
			const text = session.textDocument.getText();
			const lineCount = session.textDocument.lineCount;
			const startOffset = session.textDocument.offsetAt(session.range.start);
			const endOffset = session.textDocument.offsetAt(session.range.end);
			const textEncoder = new TextEncoder();
			const utf8Array = [...textEncoder.encode(text)];
			// Now we want to prepare the data we have to send over the wire
			const context: InEditorRequest = {
				repoRef: this.repoRef.getRepresentation(),
				query: request.prompt,
				threadId: session.threadId,
				language: session.getTextDocumentLanguage(),
				snippetInformation: {
					startPosition: {
						line: session.range.start.line,
						character: session.range.start.character,
						byteOffset: startOffset,
					},
					endPosition: {
						line: session.range.end.line,
						character: session.range.end.character,
						byteOffset: endOffset,
					},
				},
				textDocumentWeb: {
					text,
					utf8Array,
					language: session.getTextDocumentLanguage(),
					fsFilePath: session.textDocument.fileName,
					relativePath: vscode.workspace.asRelativePath(session.textDocument.fileName),
					lineCount,
				},
				diagnosticsInformation: await parseDiagnosticsInformation(
					vscode.languages.getDiagnostics(textDocument.uri),
					textDocument,
					session.range,
				),
			};
			const messages = await this.sidecarClient.getInLineEditorResponse(context);
			const messageReply = await reportFromStreamToEditorSessionProgress(
				messages,
				progress,
				token,
				this.repoRef,
				this.workingDirectory,
				this.sidecarClient,
				session.getTextDocumentLanguage(),
				session.textDocument,
			);
			if (messageReply.message !== null) {
				console.log(messageReply.message);
				return new CSInteractiveEditorMessageResponse(
					new vscode.MarkdownString(messageReply.message, true),
					undefined,
					undefined,
				);
			} else {
				return new CSInteractiveEditorResponse(
					[],
					undefined,
					'skcd waiting for something',
					session.range,
				);
			}
		})();
	}

	handleInteractiveEditorResponseFeedback(session: CSInteractiveEditorSession, response: CSInteractiveEditorResponseMessage, kind: vscode.InteractiveEditorResponseFeedbackKind): void {
		console.log('We are good');
	}
}
