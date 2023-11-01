/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


export type OptionString =
	| { type: 'Some'; value: string }
	| { type: 'None' };

export type AgentStep =
	| { Path: { query: string; response: string; paths: string[] } }
	| { Code: { query: string; response: string; code_snippets: CodeSpan[] } }
	| { Proc: { query: string; paths: string[]; response: string } };

export type AgentState =
	| 'Search'
	| 'Plan'
	| 'Explain'
	| 'CodeEdit'
	| 'FixSignals'
	| 'Finish';

export interface CodeSpan {
	file_path: string;
	alias: number;
	start_line: number;
	end_line: number;
	data: string;
	score: number | null;
}

export interface SemanticSearchResponse {
	session_id: string;
	query: string;
	code_spans: CodeSpan[];
}

export interface Answer {
	answer_up_until_now: string;
	delta: string | null;
}

export type ConversationState =
	| 'Pending'
	| 'Started'
	| 'StreamingAnswer'
	| 'Finished';

export interface ConversationMessage {
	message_id: string;
	// We also want to store the session id here so we can load it and save it
	session_id: string;
	// The query which the user has asked
	query: string;
	// The steps which the agent has taken up until now
	steps_taken: AgentStep[];
	// The state of the agent
	agent_state: AgentState;
	// The file paths we are interested in, can be populated via search or after
	// asking for more context
	file_paths: String[];
	// The span which we found after performing search
	code_spans: CodeSpan[];
	// The span which user has selected and added to the context
	user_selected_code_span: CodeSpan[];
	// The files which are open in the editor
	open_files: String[];
	// The status of this conversation
	conversation_state: ConversationState;
	// Final answer which is going to get stored here
	answer: Answer | null;
	// Last updated
	last_updated: number;
	// Created at
	created_at: number;
}

export type ConversationMessageOkay =
	| { type: 'Ok'; data: ConversationMessage };

export interface Repository {
	disk_path: string;
	sync_status: SyncStatus;
	last_commit_unix_secs: number;
	last_index_unix_secs: number;
}

export type SyncStatus =
	| { tag: 'Error'; message: string }
	| { tag: 'Uninitialized' }
	| { tag: 'Cancelling' }
	| { tag: 'Cancelled' }
	| { tag: 'Queued' }
	| { tag: 'Syncing' }
	| { tag: 'Indexing' }
	| { tag: 'Done' }
	| { tag: 'Removed' }
	| { tag: 'RemoteRemoved' };

export interface RepoStatus {
	// The string here is generated from RepoRef.to_string()
	repo_map: { [key: string]: Repository };
}


/**
 * The positions here start with 0 index
 */
export interface Position {
	line: number;
	character: number;
}


export interface ContextSelection {
	relativePath: string;
	fsFilePath: string;
	workingDirectory: string;
	startPosition: Position;
	endPosition: Position;
}

export interface CurrentViewContext {
	// The string here is generated from RepoRef.to_string()
	repo_ref: string;
	// The relative path of the file
	relative_path: string;
	// The line number
	line_number: number;
	// The column number
	column_number: number;
	// the current text which is present on the active editor
	current_text: string;
	// The active selection
	selection: ContextSelection[] | null;
}

// We also get the definitions of the symbols which are present
export interface PreciseContext {
	symbol: {
		fuzzyName?: string;
	};
	hoverText: string[];
	definitionSnippet: {
		context: string;
		startLine: number;
		endLine: number;
	};
	fsFilePath: string;
	relativeFilePath: string;
	range: {
		startLine: number;
		startCharacter: number;
		endLine: number;
		endCharacter: number;
	};
}

export interface DeepContextForView {
	// The string here is generated from RepoRef.to_string()
	repoRef: string;
	preciseContext: PreciseContext[];
	// Where is the cursor positioned, this will be useful context
	// for the llm
	cursorPosition: {
		startPosition: Position;
		endPosition: Position;
	} | null;
	// What is the data present in the current viewport
	currentViewPort: {
		startPosition: Position;
		endPosition: Position;
		relativePath: string;
		fsFilePath: string;
		textOnScreen: string;
	} | null;
	language: string;
}


export interface TextDocument {
	text: String;
	language: String;
	fsFilePath: String;
	relativePath: String;
	lineCount: number;
}


export interface SnippetInformation {
	startPosition: {
		line: number;
		character: number;
		byteOffset: number;
	};
	endPosition: {
		line: number;
		character: number;
		byteOffset: number;
	};
}

export enum DiagnosticSeverity {
	Error = 0,
	Warning = 1,
	Information = 2,
	Hint = 3,
}

export interface DiagnosticRelatedInformation {
	location: {
		uri: string;
		range: {
			start: {
				line: number;
				character: number;
				byteOffset: number;
			};
			end: {
				line: number;
				character: number;
				byteOffset: number;
			};
		};
	};
	message: string;
}

export interface DiagnosticCode {
	strValue: string | null;
	numValue: number | null;
	information: {
		strValue: string | null;
		numValue: number | null;
		fsFilePath: string;
	} | null;
}

export interface DiagnosticInformation {
	range: {
		startPosition: {
			line: number;
			character: number;
			byteOffset: number;
		};
		endPosition: {
			line: number;
			character: number;
			byteOffset: number;
		};
	};
	message: string;
	severity: DiagnosticSeverity;
	source: string | null;
	code: DiagnosticCode | null;
}

export interface InEditorRequest {
	repoRef: string;
	query: string;
	threadId: string;
	language: string;
	snippetInformation: SnippetInformation;
	textDocumentWeb: TextDocument;
	diagnosticInformation: DiagnosticInformationFromEditor[],
}

export interface DiagnosticInformationFromEditor {
	fsFilePath: string;
	diagnostics: DiagnosticInformation[];
};


export type InLineAgentAction =
	| 'Code'
	| 'Doc'
	| 'Edit'
	| 'Tests'
	| 'Fix'
	| 'Explain'
	| 'Unknown'
	| { type: 'DecideAction'; query: string };


export type InLineAgentMessageState =
	| 'Pending'
	| 'Started'
	| 'StreamingAnswer'
	| 'Finished'
	| 'Errored';

export interface InLineAgentDocumentSymbol {
	name: string | null;
	start_position: Position;
	end_position: Position;
	kind: string | null;
	code: string;
}


export interface InLineAgentAnswer {
	answer_up_until_now: string;
	delta: string | null;
	state: InLineAgentMessageState;
	document_symbol: InLineAgentDocumentSymbol | null;
	context_selection: InLineAgentContextSelection | null;
}


export interface InLineAgentMessage {
	session_id: string;
	message_id: string;
	query: string;
	steps_taken: InLineAgentAction[];
	message_state: InLineAgentMessageState;
	answer: InLineAgentAnswer | null;
	last_updated: number;
	created_at: number;
	keep_alive: string | undefined;
}

export interface InLineAgentContextSelection {
	above: InLineAgentSelectionData;
	below: InLineAgentSelectionData;
	range: InLineAgentSelectionData;
}

export interface InLineAgentSelectionData {
	has_content: boolean;
	first_line_index: number;
	last_line_index: number;
	lines: string[];
}


export interface InEditorTreeSitterDocumentationQuery {
	language: string;
	source: string;
}

export interface InEditorTreeSitterDocumentationReply {
	documentation: string;
}
