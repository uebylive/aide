/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
module.exports = {
	content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
	theme: {
		extend: {
			typography: {
				DEFAULT: {
					css: {
						color: 'var(--vscode-editor-foreground)',
						code: {
							color: 'var(--vscode-icon-foreground)',
						},
						pre: {
							borderRadius: 0,
							padding: '0px',
							div: {
								margin: '0px',
							},
						},
					},
				},
			},
			colors: {
				'cs': {
					textPrimary: 'var(--vscode-editor-foreground)',
					textSecondary: 'var(--vscode-icon-foreground)',
					bgPrimary: 'var(--vscode-panel-background)',
					bgSecondary: 'var(--vscode-activityBar-background)',
					inactive: 'var(--vscode-activityBar-inactiveForeground)',
				},
				'cs-answers': {
					initial_thinking: '#88B7B5',
					planning_out: '#E7AC75',
					search_for_code_snippets: '#9C6EA1',
					search_results: '#5CB85C',
					branch_elements: '#7DA3A1',
					code_symbol_modification_instruction: '#E36FA2',
					code_symbol_modification_event: '#A865A2',
					save_file: '#E89EA4',
					test_execution_harness: '#9279C3',
					terminal_execution: '#E65550',
					execution_branch_finish_reason: '#DB8E71',
					get_references_for_code_node: '#896E8E',
					exploring_node_dfs: '#4D937A',
					plan_changes_for_node: '#C76B7E',
					lookup_code_snippets_for_symbols: '#B7796F',
					changes_to_current_node_on_dfs: '#80796B',
					task_complete: '#737373',
				},
			},
		},
	},
	plugins: [require('@tailwindcss/typography')],
};
