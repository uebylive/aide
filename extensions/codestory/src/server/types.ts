/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LLMProviderAPIKeys } from '../sidecar/providerConfigTypes';
import { LLMProvider, LLMTypeVariant, SidecarVariableTypes } from '../sidecar/types';

type SidecarFileContent = {
	file_path: string;
	file_content: string;
	language: string;
};

export type UserContext = {
	variables: SidecarVariableTypes[];
	file_content_map: SidecarFileContent[];
	terminal_selection: string | undefined;
	folder_paths: string[];
};

type SymbolIdentifier = {
	symbol_name: string;
	fs_file_path?: string;
};

export type ProbeAgentBody = {
	editor_url: string;
	model_config: Record<string, any>;
	user_context: UserContext;
	symbol_identifier: SymbolIdentifier;
	query: string;
};

export interface SideCarAgentEvent {
	request_id: string;
	event: UIEvent;
}

interface UIEvent {
	SymbolEvent: SymbolEventRequest;
	ToolEvent: ToolInput;
	CodebaseEvent: SymbolInputEvent;
	SymbolLoctationUpdate: SymbolLocation;
	SymbolEventSubStep: SymbolEventSubStepRequest;
}

interface SymbolEventSubStepRequest {
	symbol_identifier: SymbolIdentifier;
	event: SymbolEventSubStep;
}

interface SymbolEventProbeRequest {
	SubSymbolSelection: {};
	ProbeDeeperSymbol: {};
}

interface SymbolEventSubStep {
	Probe: SymbolEventProbeRequest;
}

interface SymbolLocation {
	snippet: Snippet;
	symbol_identifier: SymbolIdentifier;
}

interface SymbolInputEvent {
	context: UserContext;
	llm: LLMTypeVariant;
	provider: LLMProvider;
	api_keys: LLMProviderAPIKeys;
	user_query: string;
	// Here we have properties for swe bench which we are sending for testing
	swe_bench_test_endpoint?: string;
	repo_map_fs_path?: string;
	gcloud_access_token?: string;
	swe_bench_id?: string;
	swe_bench_git_dname?: string;
}

interface SymbolEventRequest {
	symbol: SymbolIdentifier;
	event: SymbolEvent;
}

interface SymbolEvent {
	InitialRequest: {};
	AskQuestion: AskQuestionRequest;
	UserFeedback: {};
	Delete: {};
	Edit: SymbolToEditRequest;
	Outline: {};
	Probe: SymbolToProbeRequest;
}

interface AskQuestionRequest {
	question: string;
}

interface SymbolToEdit {
	outline: boolean;
	range: SidecarRequestRange;
	fs_file_path: string;
	symbol_name: string;
	instructions: string[];
}

interface SymbolToEditRequest {
	symbols: SymbolToEdit[];
	symbol_identifier: SymbolIdentifier;
}

interface SymbolToProbeHistory {
	symbol: string;
	fs_file_path: string;
	content: string;
	question: string;
}

interface SymbolToProbeRequest {
	symbol_identifier: SymbolIdentifier;
	probe_request: string;
	original_request: string;
	history: SymbolToProbeHistory[];
}

interface ToolInput {
	CodeEditing?: CodeEdit;
	LSPDiagnostics?: LSPDiagnostics;
	FindCodeSnippets?: FindCodeSnippets;
	ReRank?: ReRankEntriesForBroker;
	CodeSymbolUtilitySearch?: CodeSymbolUtilitySearch;
	RequestImportantSymbols?: CodeSymbolImportantRequest;
	RequestImportantSybmolsCodeWide?: CodeSymbolImportantWideSearch;
	GoToDefinition?: SidecarGoToDefinitionRequest;
	GoToReference?: SidecarGoToReferencesRequest;
	OpenFile?: OpenFileRequest;
	GrepSingleFile?: FindInFileRequest;
	SymbolImplementations?: SidecarGoToImplementationRequest;
	FilterCodeSnippetsForEditing?: CodeToEditFilterRequest;
	FilterCodeSnippetsForEditingSingleSymbols?: CodeToEditSymbolRequest;
	EditorApplyChange?: EditorApplyRequest;
	QuickFixRequest?: SidecarQuickFixRequest;
	QuickFixInvocationRequest?: LSPQuickFixInvocationRequest;
	CodeCorrectnessAction?: CodeCorrectnessRequest;
	CodeEditingError?: CodeEditingErrorRequest;
	ClassSymbolFollowup?: ClassSymbolFollowupRequest;
	ProbeSubSymbol?: CodeToEditFilterRequest;
	ProbePossibleRequest?: CodeSymbolToAskQuestionsRequest;
	ProbeQuestionAskRequest?: CodeSymbolToAskQuestionsRequest;
	ProbeFollowAlongSymbol?: CodeSymbolFollowAlongForProbing;
	ProbeSummarizeAnswerRequest?: CodeSymbolProbingSummarize;
	RepoMapSearch?: RepoMapSearchQuery;
}

interface CodeEdit {
	code_above?: string;
	code_below?: string;
	fs_file_path: string;
	code_to_edit: string;
	extra_context: string;
	language: string;
	model: LLMTypeVariant;
	instruction: string;
	api_key: LLMProviderAPIKeys;
	provider: LLMProvider;
}

export type LSPDiagnostics = {
	fs_file_path: string;
	range: SidecarRequestRange;
};

export interface FindCodeSnippets {
	fs_file_path: string;
	file_content: string;
	language: string;
	file_path: string;
	user_query: string;
	llm_type: LLMTypeVariant;
	api_key: LLMProviderAPIKeys;
	provider: LLMProvider;
}

interface ReRankCodeSnippet {
	fs_file_path: string;
	range: SidecarRequestRange;
	content: string;
	language: string;
}

interface ReRankDocument {
	document_name: string;
	document_path: string;
	content: string;
}

interface ReRankWebExtract {
	url: string;
	content: string;
}

interface ReRankEntry {
	CodeSnippet: ReRankCodeSnippet;
	Document: ReRankDocument;
	WebExtract: ReRankWebExtract;
}

interface ReRankEntries {
	id: number;
	entry: ReRankEntry;
}

interface ReRankRequestMetadata {
	model: LLMTypeVariant;
	query: string;
	provider_keys: Record<string, any>;
	provider: LLMProvider;
}

export interface ReRankEntriesForBroker {
	entries: ReRankEntries[];
	metadata: ReRankRequestMetadata;
}

export interface CodeSymbolUtilitySearch {
	user_query: string;
	definitions_already_present: string[];
	fs_file_path: string;
	fs_file_content: string;
	selection_range: SidecarRequestRange;
	language: string;
	llm_type: LLMTypeVariant;
	llm_provider: LLMProvider;
	api_key: LLMProviderAPIKeys;
	user_context: UserContext;
}

interface CodeSymbolImportantRequest {
	symbol_identifier?: string;
	history: string[];
	fs_file_path: string;
	fs_file_content: string;
	selection_range: SidecarRequestRange;
	language: string;
	llm_type: LLMTypeVariant;
	llm_provider: LLMProvider;
	api_key: LLMProviderAPIKeys;
	query: string;
}


export interface CodeSymbolImportantWideSearch {
	user_context: UserContext;
	user_query: string;
	llm_type: LLMTypeVariant;
	llm_provider: LLMProvider;
	api_key: LLMProviderAPIKeys;
	file_extension_filters: Set<string>;
}

export type SidecarGoToDefinitionRequest = {
	fs_file_path: string;
	position: SidecarRequestPosition;
};

interface OpenFileRequest {
	fs_file_path: string;
	editor_url: string;
}

interface FindInFileRequest {
	file_contents: string;
	file_symbol: string;
}

export type SidecarGoToDefinitionResponse = {
	definitions: FileAndRange[];
};

export type FileAndRange = {
	fs_file_path: string;
	range: SidecarRequestRange;
};

export type SidecarOpenFileToolRequest = {
	fs_file_path: string;
};

export type SidecarOpenFileToolResponse = {
	fs_file_path: string;
	file_contents: string;
	language: string;
	exists: boolean;
};

export type SidecarGoToImplementationRequest = {
	fs_file_path: string;
	position: SidecarRequestPosition;
	editor_url: string;
};

export enum OutlineNodeType {
	ClassDefinition = 'ClassDefinition',
	Class = 'Class',
	ClassName = 'ClassName',
	Function = 'Function',
	FunctionName = 'FunctionName',
	FunctionBody = 'FunctionBody',
	FunctionClassName = 'FunctionClassName',
	FunctionParameterIdentifier = 'FunctionParameterIdentifier',
	Decorator = 'Decorator',
}

export type OutlineNodeContent = {
	range: SidecarRequestRange;
	name: string;
	'r#type': OutlineNodeType;
	content: string;
	fs_file_path: string;
	identifier_range: SidecarRequestRange;
	body_range: SidecarRequestRange;
};

export type Snippet = {
	range: SidecarRequestRange;
	symbol_name: string;
	fs_file_path: string;
	content: string;
	language?: string;
	// this represents completely a snippet of code which is a logical symbol
	outline_node_content: OutlineNodeContent;
};

export type CodeToEditFilterRequest = {
	snippets: Snippet[];
	query: string;
	llm_type: LLMTypeVariant;
	llm_provider: LLMProvider;
	api_key: LLMProviderAPIKeys;
};

export type CodeSymbolToAskQuestionsRequest = {
	history: string;
	symbol_identifier: string;
	fs_file_path: string;
	language: string;
	extra_data: string;
	code_above?: string;
	code_below?: string;
	code_in_selection: string;
	llm_type: LLMTypeVariant;
	provider: LLMProvider;
	api_key: LLMProviderAPIKeys;
	query: string;
};

export type CodeSymbolFollowAlongForProbing = {
	history: string;
	symbol_identifier: string;
	fs_file_path: string;
	language: string;
	next_symbol_names: string[];
	next_symbol_outlines: string[];
	code_above?: string;
	code_below?: string;
	code_in_selection: string;
	llm_type: LLMTypeVariant;
	provider: LLMProvider;
	api_key: LLMProviderAPIKeys;
	query: string;
	next_symbol_link: string;
};

export type CodeSubSymbolProbingResult = {
	symbol_name: string;
	fs_file_path: string;
	probing_results: string[];
	content: string;
};

export type CodeSymbolProbingSummarize = {
	query: string;
	history: string;
	symbol_identifier: string;
	symbol_outline: string;
	fs_file_path: string;
	probing_results: CodeSubSymbolProbingResult[];
	llm: LLMTypeVariant;
	provider: LLMProvider;
	api_key: LLMProviderAPIKeys;
};

export type RepoMapSearchQuery = {
	repo_map: string;
	user_query: string;
	llm: LLMTypeVariant;
	provider: LLMProvider;
	api_key: LLMProviderAPIKeys;
};

export type CodeToEditSymbolRequest = {
	xml_symbol: string;
	query: string;
	llm: LLMTypeVariant;
	provider: LLMProvider;
	api_key: LLMProviderAPIKeys;
};

export type EditorApplyRequest = {
	fs_file_path: string;
	edited_content: string;
	selected_range: SidecarRequestRange;
	editor_url: string;
};

export type SidecarGoToImplementationResponse = {
	implementation_locations: FileAndRange[];
};

export type SidecarGoToReferencesRequest = {
	fs_file_path: string;
	position: SidecarRequestPosition;
};

export type SidecarGoToRefernecesResponse = {
	reference_locations: FileAndRange[];
};

export type SidecarQuickFixRequest = {
	fs_file_path: string;
	editor_url: string;
	range: SidecarRequestRange;
	request_id: string;
};

// Keeping it simple for now
export type SidecarQuickFixResponse = {
	options: {
		label: string;
		index: number;
	}[];
};

export type LSPQuickFixInvocationRequest = {
	request_id: string;
	index: number;
	fs_file_path: string;
	editor_url: string;
};

export type Diagnostic = {
	diagnostic: string;
	range: SidecarRequestRange;
};

export type QuickFixOption = {
	label: string;
	number: number;
};

export type CodeCorrectnessRequest = {
	fs_file_contents: string;
	fs_file_path: string;
	code_above?: string;
	code_below?: string;
	code_in_selection: string;
	symbol_name: string;
	instruction: string;
	previous_code: string;
	diagnostics: Diagnostic[];
	quick_fix_actions: QuickFixOption[];
	llm: LLMTypeVariant;
	provider: LLMProvider;
	api_keys: LLMProviderAPIKeys;
};

export type CodeEditingErrorRequest = {
	fs_file_path: string;
	code_above?: string;
	code_below?: string;
	code_in_selection: string;
	extra_context: string;
	original_code: string;
	error_instructions: string;
	previous_instructions: string;
	llm: LLMTypeVariant;
	provider: LLMProvider;
	api_keys: LLMProviderAPIKeys;
};

export type ClassSymbolFollowupRequest = {
	fs_file_path: string;
	original_code: string;
	language: string;
	edited_code: string;
	instructions: string;
	llm: LLMTypeVariant;
	provider: LLMProvider;
	api_keys: LLMProviderAPIKeys;
};

export type SidecarQuickFixInvocationResponse = {
	request_id: string;
	invocation_success: boolean;
};

export type SidecarApplyEditsRequest = {
	fs_file_path: string;
	edited_content: string;
	selected_range: SidecarRequestRange;
};

export interface SidecarRequestRange {
	startPosition: SidecarRequestPosition;
	endPosition: SidecarRequestPosition;
}

export interface SidecarRequestPosition {
	line: number;
	character: number;
	byteOffset: number;
}

export interface SidecarResponseRange {
	startPosition: SidecarResponsePosition;
	endPosition: SidecarResponsePosition;
}

export interface SidecarResponsePosition {
	line: number;
	character: number;
	byte_offset: number;
}

export type SidecarApplyEditsResponse = {
	fs_file_path: string;
	success: boolean;
	new_range: SidecarResponseRange;
};

export type SidecarDiagnosticsResponse = {
	diagnostic: string;
	range: SidecarResponseRange;
};
