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
