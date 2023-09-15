/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EventData } from '@estruyf/vscode';
import { Messenger } from '@estruyf/vscode/dist/client';
import { useEffect } from 'react';

import { Commit } from './pages/Commit';
import { TimeLine } from './pages';
import {
	usePageStore,
	useExplanationStore,
	useHealthStore,
	useChangedCodeSymbolsStore,
	useChangedCodeBlockChangeDescriptionStore,
} from './store';
import {
	HealthState,
	CodeSymbolChange,
	CodeBlockChangeDescription,
} from './types';

function App() {
	const { page, setPage } = usePageStore();
	const { setExplanationData } = useExplanationStore();
	const { status, setStatus } = useHealthStore();
	const { setChangedCodeSymbol } = useChangedCodeSymbolsStore();
	const { setCodeBlockChangeDescriptions } =
		useChangedCodeBlockChangeDescriptionStore();

	useEffect(() => {
		// Send a health check to the extension
		if (status !== 'OK') {
			Messenger.send('healthCheck');
		}

		// Listen to messages from the extension
		const listener = (message: MessageEvent<EventData<unknown>>) => {
			console.log('[debugging] What is the message', message);
			const { command, payload } = message.data;
			if (command === 'healthCheck') {
				const newStatus = (payload as HealthState).status;
				setStatus(newStatus);
				setPage('home');
			} else if (command === 'getChangeLog') {
				console.log('[debugging] What is the changelog payload', payload);
				const payloadData = (payload as { changes: CodeSymbolChange[] })
					.changes;
				setChangedCodeSymbol(
					payloadData.map((change) => ({
						...change,
						changeTime: new Date(change.changeTime),
					}))
				);
			} else if (command === 'getComponentChangeDescription') {
				const payloadData = payload as {
					codeBlockChangeDescriptions: CodeBlockChangeDescription[];
				};
				setCodeBlockChangeDescriptions(payloadData.codeBlockChangeDescriptions);
			}
		};

		Messenger.listen(listener);
		return () => {
			Messenger.unlisten(listener);
		};
	}, [
		setCodeBlockChangeDescriptions,
		setChangedCodeSymbol,
		setExplanationData,
		setPage,
		setStatus,
		status,
	]);

	return (
		<main className='h-screen bg-vscode-sideBar-background'>
			<div className='h-full relative w-full overflow-x-hidden'>
				{(() => {
					switch (page) {
						case 'commit':
							return <Commit />;
						default:
							return <TimeLine />;
					}
				})()}
			</div>
			{page === 'home' ? (
				<div className='fixed bottom-0 h-12 w-full flex items-center justify-center bg-vscode-sideBar-background'>
					<a
						href='https://join.slack.com/t/codestoryai/shared_invite/zt-1x4zy3mk1-9fL5k~7XGSNNku7~iYr51w'
						target='_blank'
						rel='noopener noreferrer'
						className='text-sm'
					>
						Share feedback
					</a>
				</div>
			) : (
				<div
					className='fixed bottom-0 left-3 right-3 h-12 flex cursor-pointer justify-center bg-vscode-sideBar-background border-t-2 border-t-vscode-panel-border z-10'
					onClick={() => setPage('home')}
				>
					<p className='text-sm self-center'>&larr; Go back</p>
				</div>
			)}
		</main>
	);
}

export default App;
