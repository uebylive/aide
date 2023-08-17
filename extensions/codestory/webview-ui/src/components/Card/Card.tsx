/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { useEffect, useState } from 'react';
import {
	IconEmpathize,
	IconListDetails,
	IconSearch,
	IconListSearch,
	IconBinaryTree2,
	IconEdit,
	IconCode,
	IconDeviceFloppy,
	IconShield,
	IconPrompt,
	IconReportAnalytics,
	IconHierarchy3,
	IconRoute,
	IconLoader,
	IconCheck,
} from '@tabler/icons-react';

import { EventType } from '../../types';
import { makeTimestampHumanReadable } from '../../utils/time';

type CardProps = {
	cardContext: string;
	eventType: EventType;
	children: string | JSX.Element | JSX.Element[] | (() => JSX.Element);
	timestamp: number;
};

const getTitleStyles = (
	eventType: EventType
): { title: string; border: string; text: string; emoji: JSX.Element } => {
	switch (eventType) {
		case 'initialThinking':
			return {
				title: 'THINKING',
				border: 'border-cs-answers-initial_thinking',
				text: 'text-cs-answers-initial_thinking',
				emoji: <IconEmpathize />,
			};
		case 'planningOut':
			return {
				title: 'PLANNING',
				border: 'border-cs-answers-planning_out',
				text: 'text-cs-answers-planning_out',
				emoji: <IconListDetails />,
			};
		case 'searchForCodeSnippets':
			return {
				title: 'SEARCHING THE CODEBASE',
				border: 'border-cs-answers-search_for_code_snippets',
				text: 'text-cs-answers-search_for_code_snippets',
				emoji: <IconSearch />,
			};
		case 'searchResults':
			return {
				title: 'SEARCH RESULTS',
				border: 'border-cs-answers-search_results',
				text: 'text-cs-answers-search_results',
				emoji: <IconListSearch />,
			};
		case 'branchElements':
			return {
				title: 'EXPLORATION',
				border: 'border-cs-answers-branch_elements',
				text: 'text-cs-answers-branch_elements',
				emoji: <IconBinaryTree2 />,
			};
		case 'codeSymbolModificationInstruction':
			return {
				title: 'PROPOSED MODIFICATIONS️',
				border: 'border-cs-answers-code_symbol_modification_instruction',
				text: 'text-cs-answers-code_symbol_modification_instruction',
				emoji: <IconEdit />,
			};
		case 'codeSymbolModificationEvent':
			return {
				title: 'MODIFICATIONS',
				border: 'border-cs-answers-code_symbol_modification_event',
				text: 'text-cs-answers-code_symbol_modification_event',
				emoji: <IconCode />,
			};
		case 'saveFile':
			return {
				title: 'WRITING TO FILE',
				border: 'border-cs-answers-save_file',
				text: 'text-cs-answers-save_file',
				emoji: <IconDeviceFloppy />,
			};
		case 'testExecutionHarness':
			return {
				title: 'SETTING UP TEST HARNESS',
				border: 'border-cs-answers-test_execution_harness',
				text: 'text-cs-answers-test_execution_harness',
				emoji: <IconShield />,
			};
		case 'terminalExecution':
			return {
				title: 'EXECUTING COMMANDS',
				border: 'border-cs-answers-terminal_execution',
				text: 'text-cs-answers-terminal_execution',
				emoji: <IconPrompt />,
			};
		case 'executionBranchFinishReason':
			return {
				title: 'FINISHED',
				border: 'border-cs-answers-execution_branch_finish_reason',
				text: 'text-cs-answers-execution_branch_finish_reason',
				emoji: <IconReportAnalytics />,
			};
		case 'getReferencesForCodeNode':
			return {
				title: 'FIND REFERENCES',
				border: 'border-cs-answers-get_references_for_code_node',
				text: 'text-cs-answers-get_references_for_code_node',
				emoji: <IconHierarchy3 />,
			};
		case 'exploringNodeDfs':
			return {
				title: 'NAVIGATING THE CODEBASE',
				border: 'border-cs-answers-exploring_node_dfs',
				text: 'text-cs-answers-exploring_node_dfs',
				emoji: <IconRoute />,
			};
		// case 'plan_changes_for_node':
		//   return {
		//     title: 'CHANGES TO MAKE',
		//     border: 'border-cs-answers-plan_changes_for_node',
		//     text: 'text-cs-answers-plan_changes_for_node',
		//     emoji: <IconClipboardList />,
		//   };
		// case 'lookup_code_snippets_for_symbols':
		//   return {
		//     title: 'GETTING MORE CONTEXT',
		//     border: 'border-cs-answers-lookup_code_snippets_for_symbols',
		//     text: 'text-cs-answers-lookup_code_snippets_for_symbols',
		//     emoji: <IconListSearch />,
		//   };
		// case 'changes_to_current_node_on_dfs':
		//   return {
		//     title: 'MODIFICATIONS',
		//     border: 'border-cs-answers-changes_to_current_node_on_dfs',
		//     text: 'text-cs-answers-changes_to_current_node_on_dfs',
		//     emoji: <IconEdit />,
		//   };
		case 'taskComplete':
			return {
				title: 'TASK COMPLETE',
				border: 'border-cs-answers-task_complete',
				text: 'text-cs-answers-task_complete',
				emoji: <IconCheck />,
			};
		default:
			return {
				title: 'PROCESSING',
				border: 'border-cs-answers-plan',
				text: 'text-cs-answers-plan',
				emoji: <IconLoader />,
			};
	}
};

export const Card = ({
	cardContext,
	eventType,
	timestamp,
	children,
}: CardProps) => {
	const [loaded, setLoaded] = useState(false);
	const [summaryExpanded, setSummaryExpanded] = useState(false);
	const { title, border, text, emoji } = getTitleStyles(eventType);

	useEffect(() => {
		setTimeout(() => {
			setLoaded(true);
		}, 0);
	}, []);

	return (
		<div
			className={`border ${border} rounded bg-cs-bgSecondary p-2 transition-transform ${
				loaded ? 'translate-y-0' : 'translate-y-6'
			}`}
		>
			<div
				className={`bg-cs-bgPrimary rounded px-4 py-2 mb-2 cursor-pointer ${
					summaryExpanded ? '' : 'h-8'
				} overflow-y-hidden`}
				onClick={() => setSummaryExpanded((expanded) => !expanded)}
			>
				<p className='text-sm transition-colors text-cs-inactive hover:text-cs-textPrimary'>
					{cardContext.trim()}
				</p>
			</div>
			<div className='sticky top-0 bg-cs-bgPrimary rounded-t px-4 py-2'>
				<div className='flex items-center font-bold'>
					{emoji}
					<p className={`pl-2 ${text}`}>{title}</p>
				</div>
			</div>
			<div className='border-4 border-cs-bgPrimary text-base rounded-b'>
				{children}
			</div>
			<p className='text-xs text-right mt-2'>
				{makeTimestampHumanReadable(timestamp)}
			</p>
		</div>
	);
};
