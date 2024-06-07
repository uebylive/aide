/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { AideChatAgentLocation } from 'vs/workbench/contrib/aideChat/common/aideChatAgents';

export const CONTEXT_CHAT_MODE = new RawContextKey<'Edit' | 'Chat'>('aideChatMode', 'Edit', { type: 'string', description: localize('aideChatMode', "The current aide mode.") });

export const CONTEXT_RESPONSE_VOTE = new RawContextKey<string>('aideChatSessionResponseVote', '', { type: 'string', description: localize('aideChatResponseVote', "When the response has been voted up, is set to 'up'. When voted down, is set to 'down'. Otherwise an empty string.") });
export const CONTEXT_RESPONSE_DETECTED_AGENT_COMMAND = new RawContextKey<boolean>('aideChatSessionResponseDetectedAgentOrCommand', false, { type: 'boolean', description: localize('aideChatSessionResponseDetectedAgentOrCommand', "When the agent or command was automatically detected") });
export const CONTEXT_CHAT_RESPONSE_SUPPORT_ISSUE_REPORTING = new RawContextKey<boolean>('aideChatResponseSupportsIssueReporting', false, { type: 'boolean', description: localize('aideChatResponseSupportsIssueReporting', "True when the current chat response supports issue reporting.") });
export const CONTEXT_RESPONSE_FILTERED = new RawContextKey<boolean>('aideChatSessionResponseFiltered', false, { type: 'boolean', description: localize('aideChatResponseFiltered', "True when the chat response was filtered out by the server.") });
export const CONTEXT_CHAT_REQUEST_IN_PROGRESS = new RawContextKey<boolean>('aideChatSessionRequestInProgress', false, { type: 'boolean', description: localize('aideChatRequestInProgress', "True when the current request is still in progress.") });
export const CONTEXT_CHAT_HAS_REQUESTS = new RawContextKey<boolean>('aideChatSessionHasRequests', false, { type: 'boolean', description: localize('aideChatHasRequests', "True when the current chat session has requests.") });

export const CONTEXT_RESPONSE = new RawContextKey<boolean>('aideChatResponse', false, { type: 'boolean', description: localize('aideChatResponse', "The chat item is a response.") });
export const CONTEXT_REQUEST = new RawContextKey<boolean>('aideChatRequest', false, { type: 'boolean', description: localize('aideChatRequest', "The chat item is a request") });

export const CONTEXT_CHAT_EDIT_APPLIED = new RawContextKey<boolean>('aideChatEditApplied', false, { type: 'boolean', description: localize('aideChatEditApplied', "True when the chat text edits have been applied.") });

export const CONTEXT_CHAT_INPUT_HAS_TEXT = new RawContextKey<boolean>('aideChatInputHasText', false, { type: 'boolean', description: localize('aideChatInputHasText', "True when the chat input has text.") });
export const CONTEXT_CHAT_INPUT_HAS_FOCUS = new RawContextKey<boolean>('aideChatInputHasFocus', false, { type: 'boolean', description: localize('aideChatInputHasFocus', "True when the chat input has focus.") });
export const CONTEXT_IN_CHAT_INPUT = new RawContextKey<boolean>('inAideChatInput', false, { type: 'boolean', description: localize('inAideChatInput', "True when focus is in the chat input, false otherwise.") });
export const CONTEXT_IN_CHAT_SESSION = new RawContextKey<boolean>('inAideChat', false, { type: 'boolean', description: localize('inAideChat', "True when focus is in the chat widget, false otherwise.") });

export const CONTEXT_CHAT_ENABLED = new RawContextKey<boolean>('aideChatIsEnabled', false, { type: 'boolean', description: localize('aideChatIsEnabled', "True when chat is enabled because a default chat participant is registered.") });
export const CONTEXT_CHAT_INPUT_CURSOR_AT_TOP = new RawContextKey<boolean>('aideChatCursorAtTop', false);
export const CONTEXT_CHAT_INPUT_HAS_AGENT = new RawContextKey<boolean>('aideChatInputHasAgent', false);
export const CONTEXT_CHAT_LOCATION = new RawContextKey<AideChatAgentLocation>('aideChatLocation', undefined);
export const CONTEXT_IN_QUICK_CHAT = new RawContextKey<boolean>('quickAideChatHasFocus', false, { type: 'boolean', description: localize('inQuickAideChat', "True when the quick chat UI has focus, false otherwise.") });

export const CONTEXT_CHAT_EDIT_RESPONSEID_IN_PROGRESS = new RawContextKey<string>('aideChatEditResponseIdInProgress', '', { type: 'string', description: localize('aideChatEditResponseIdInProgress', "The response ID of the current edit in progress.") });
export const CONTEXT_CHAT_EDIT_CODEBLOCK_NUMBER_IN_PROGRESS = new RawContextKey<number>('aideChatEditCodeblockNumberInProgress', -1, { type: 'number', description: localize('aideChatEditCodeblockNumberInProgress', "The codeblock number of the current edit in progress.") });
