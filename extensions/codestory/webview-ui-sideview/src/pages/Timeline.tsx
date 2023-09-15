/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { useEffect, useState } from 'react';
import { VSCodeButton, VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react';
import remarkGfm from 'remark-gfm';
import { ReactMarkdown } from 'react-markdown/lib/react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

import {
	useChangedCodeBlockChangeDescriptionStore,
	useChangedCodeSymbolsStore,
	useCommitStore,
	usePageStore,
} from '../store';
import { getRelativeTime } from '../utils/datetime';
import {
	ChangeDescription,
	CodeBlockChangeDescription,
	CodeSymbolChange,
	CommitPrepData,
} from '../types';
import { handleOpenFile } from '../utils/files';

type SelectionReason = 'NOT STAGED' | 'STAGED' | 'STAGED AUTOMATICALLY';
type GroupedChangesState = {
	[group: string]: {
		selection: {
			selected: boolean;
			reason: SelectionReason;
		};
		files: {
			[filePath: string]: CodeSymbolChange[];
		};
	};
};

const groupChangedCodeSymbols = (
	changes: CodeSymbolChange[]
): GroupedChangesState => {
	const groupedChanges: GroupedChangesState = {};
	changes.forEach((change) => {
		const group = change.componentIdentifier;
		const relativePath = change.relativePath;
		if (!groupedChanges[group]) {
			groupedChanges[group] = {
				selection: {
					selected: false,
					reason: 'NOT STAGED',
				},
				files: {
					[relativePath]: [change],
				},
			};
		} else {
			if (!groupedChanges[group].files[relativePath]) {
				groupedChanges[group].files[relativePath] = [change];
			} else {
				groupedChanges[group].files[relativePath].push(change);
			}
		}
	});
	return groupedChanges;
};

const getComponentIdentifierToChange = (
	codeBlockChangeDescriptions: CodeBlockChangeDescription[]
) => {
	const newMap = new Map<string, ChangeDescription>();
	codeBlockChangeDescriptions.forEach((change) => {
		newMap.set(change.componentIdentifier, change.changeDescription);
	});
	return newMap;
};

/**
 * Renders a timeline component that displays a list of changelogs.
 *
 * @return The timeline component.
 */
export const TimeLine = (): JSX.Element => {
	const { setPage } = usePageStore();
	const { setCommitPrepData } = useCommitStore();
	const { changedCodeSymbols } = useChangedCodeSymbolsStore();
	const [groupedChanges, setGroupedChanges] = useState<GroupedChangesState>(
		groupChangedCodeSymbols(changedCodeSymbols)
	);
	const [commitMode, setCommitMode] = useState<boolean>(false);
	const { codeBlockChangeDescriptions } =
		useChangedCodeBlockChangeDescriptionStore();
	const [componentIdentifierToChange, setComponentIdentifierToChange] =
		useState<Map<string, ChangeDescription>>(
			getComponentIdentifierToChange(codeBlockChangeDescriptions)
		);

	useEffect(() => {
		setComponentIdentifierToChange(
			getComponentIdentifierToChange(codeBlockChangeDescriptions)
		);
	}, [codeBlockChangeDescriptions]);

	useEffect(() => {
		setGroupedChanges(groupChangedCodeSymbols(changedCodeSymbols));
	}, [changedCodeSymbols]);

	const toggleCommitMode = () => {
		if (commitMode) {
			setGroupedChanges((changes) =>
				Object.keys(changes).reduce((grouped, next) => {
					grouped[next] = {
						...changes[next],
						selection: {
							selected: false,
							reason: 'NOT STAGED',
						},
					};
					return grouped;
				}, {} as GroupedChangesState)
			);
		}
		setCommitMode(!commitMode);
	};

	const toggleGroupForCommit: React.MouseEventHandler<HTMLInputElement> = (
		e
	) => {
		e.stopPropagation();
		e.preventDefault();

		const group = e.currentTarget?.value;
		if (group) {
			setGroupedChanges((oldChanges) => {
				const changes = { ...oldChanges };
				const newSelectedState = !changes[group].selection.selected;
				changes[group].selection.selected = newSelectedState;
				if (newSelectedState) {
					changes[group].selection.reason = 'STAGED';
					Object.keys(changes).forEach((changeGroup) => {
						if (changeGroup !== group) {
							Object.keys(changes[group].files).some((file) => {
								if (
									changes[changeGroup].files[file] &&
									changes[changeGroup].selection.reason !==
									'STAGED AUTOMATICALLY'
								) {
									changes[changeGroup].selection = {
										selected: newSelectedState,
										reason: 'STAGED AUTOMATICALLY',
									};
									return true;
								}
								return false;
							});
						}
					});
				} else {
					changes[group].selection.reason = 'NOT STAGED';
					Object.keys(changes).forEach((changeGroup) => {
						if (
							changeGroup !== group &&
							changes[changeGroup].selection.reason === 'STAGED AUTOMATICALLY'
						) {
							changes[changeGroup].selection = {
								selected: newSelectedState,
								reason: 'NOT STAGED',
							};
						}
					});
				}
				return changes;
			});
		}
	};

	const initiateCommit = () => {
		const commitPrepData: CommitPrepData = {
			changedFiles: [],
			changeDescriptions: [],
		};
		Object.entries(groupedChanges).forEach(([componentIdentifier, value]) => {
			if (value.selection.selected) {
				Object.entries(value.files).forEach(([filePath]) => {
					commitPrepData.changedFiles.push(filePath);
					commitPrepData.changeDescriptions.push(
						componentIdentifierToChange.get(componentIdentifier) ?? {
							summary: '',
							changes: [],
						}
					);
				});
			}
		});
		setCommitPrepData(commitPrepData);
		setPage('commit');
	};

	return (
		<div className='min-h-full w-full flex flex-col p-4'>
			<div className='mb-12 h-full text-vscode-sideBar-foreground'>
				<div className='w-full flex flex-row justify-between text-xs mb-3'>
					<p>CHANGES YOU HAVE DONE</p>
					{changedCodeSymbols.length > 0 && (
						<p
							className={`cursor-pointer ${commitMode ? 'text-vscode-button-background' : ''
								}`}
							onClick={toggleCommitMode}
						>
							{commitMode ? 'CANCEL' : 'COMMIT'}
						</p>
					)}
				</div>
				{changedCodeSymbols?.length === 0 ? (
					<div className='w-full flex align-middle justify-center mt-24'>
						<p>No changes yet</p>
					</div>
				) : (
					<>
						{Object.entries(groupedChanges).map(([key, value]) => {
							return (
								<div key={key} className='mb-5'>
									<div className='p-3 border border-vscode-foreground rounded-lg'>
										{commitMode && (
											<div>
												<div className='flex justify-between leading-7'>
													<p className='font-bold text-codestory-primary align-middle'>
														{value.selection.reason}
													</p>
													<VSCodeCheckbox
														checked={value.selection.selected}
														onClick={toggleGroupForCommit}
														value={key}
														className='mr-2'
													/>
												</div>
												<hr className='border-vscode-foreground my-2' />
											</div>
										)}
										{Object.entries(value.files).map(([key, value]) => {
											return (
												<div key={key} className='text-base mb-2 last:mb-0'>
													<p className='text-sm text-vscode-button-background'>
														{key}
													</p>
													<p className='text-xs text-gray-500'>
														{getRelativeTime(
															value.reduce((prev, next) =>
																prev.changeTime.getTime() <
																	next.changeTime.getTime()
																	? prev
																	: next
															).changeTime
														)}
													</p>
													<ul>
														{value.map((change, i) => (
															<li
																key={i}
																className='text-vscode-sideBar-foreground'
															>
																<p
																	className='hover:cursor-pointer'
																	onClick={() =>
																		handleOpenFile(
																			change.filePath,
																			change.startLine
																		)
																	}
																>
																	<span
																		className={`inline-block w-5 mr-2 text-center ${change.changeType === 'added'
																			? 'text-green-500'
																			: change.changeType === 'removed'
																				? 'text-red-500'
																				: 'text-gray-500'
																			}`}
																	>
																		{change.changeType === 'added'
																			? '+'
																			: change.changeType === 'removed'
																				? '-'
																				// allow-any-unicode-next-line
																				: '∗'}
																	</span>
																	{change.displayName}
																</p>
															</li>
														))}
													</ul>
												</div>
											);
										})}
										<p>
											<ReactMarkdown
												children={
													componentIdentifierToChange.get(key)?.summary ??
													// allow-any-unicode-next-line
													'No changelog generated yet, please wait 🚏'
												}
												className='p-3 bg-vscode-input-background overflow-x-hidden'
												remarkPlugins={[remarkGfm]}
												components={{
													code({ node, inline, className, children, ...props }) {
														const match = /language-(\w+)/.exec(className || '');
														return !inline && match ? (
															// @ts-ignore
															<SyntaxHighlighter
																{...props}
																children={String(children).replace(/\n$/, '')}
																language={match[1]}
																PreTag='div'
															/>
														) : (
															<code {...props} className={className}>
																{children}
															</code>
														);
													},
												}}
											></ReactMarkdown>
										</p>
									</div>
								</div>
							);
						})}
						{commitMode && (
							<>
								{Object.entries(groupedChanges).some(
									([_, value]) =>
										value.selection.reason === 'STAGED AUTOMATICALLY'
								) && (
										<p className='border-l-4 pl-2 border-vscode-foreground'>
											Some change sets are staged automatically because CodeStory
											only supports staging entire files currently.
										</p>
									)}
								<div className='w-full flex justify-end mt-5'>
									<VSCodeButton
										onClick={initiateCommit}
										disabled={
											!Object.entries(groupedChanges).some(
												([_, value]) => value.selection.selected
											)
										}
									>
										COMMIT
									</VSCodeButton>
								</div>
							</>
						)}
					</>
				)}
			</div>
		</div>
	);
};
