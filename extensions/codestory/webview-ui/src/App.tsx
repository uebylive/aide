/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { useEffect, useState, useRef } from 'react';
import { EventData } from '@estruyf/vscode';
import { Messenger } from '@estruyf/vscode/dist/client';

import { DataEvent } from './DataEvent';
import { useAntonData } from './hooks/useAntonData';
import { ReactComponent as AideLogo } from './assets/both-logos.svg';
import { useDebuggingStore } from './store';
import { ExpandingTextArea } from './components/TextArea/TextArea';

function App() {
	const [prompt, setPrompt] = useState('');
	const [promptForSubmission, setPromptForSubmission] = useState('');
	const { originalPrompt, antonData, setAntonData } = useAntonData(promptForSubmission);
	const ref = useRef<HTMLDivElement>(null);
	const { exploration, setExploration } = useDebuggingStore();

	const listener = (message: MessageEvent<EventData<unknown>>) => {
		console.log('[debugging] What is the message', message);
		const { command, payload } = message.data;
		if (command === 'sendPrompt') {
			console.log('Whats the payload');
			console.log(payload);
			setAntonData(payload as any);
		}
	};

	Messenger.listen(listener);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			setPromptForSubmission(prompt);
			e.preventDefault();
		}
	};

	useEffect(() => {
		if (!antonData) {
			return;
		}

		// Get last element of antonData.events
		const data = antonData.events[antonData.events.length - 1];
		if (!!data.executionEventId && data.executionEventId !== exploration.toString()) {
			setExploration(Number(data.executionEventId));
		}

		if (ref.current) {
			ref.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [antonData]);

	return (
		<main className='bg-cs-bgPrimary h-screen'>
			<div className='flex flex-col items-center justify-center gap-1 py-8'>
				<div className='flex items-center'>
					<AideLogo className='h-16 md:h-24' />
				</div>
			</div>
			<div className='w-full p-4'>
				<p className='mb-2'>Go on, ask me something.</p>
				<form onSubmit={() => setPromptForSubmission(prompt)}>
					<ExpandingTextArea
						placeholder='What can I help you accomplish today?'
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						onKeyDown={handleKeyDown}
						className='w-full p-2'
					/>
				</form>
			</div>
			<div className='container max-w-screen-lg mx-auto px-4 pb-16'>
				<div className='flex flex-col'>
					{antonData && antonData.events.length > 0
						? antonData.events
							.filter((ev) => ev.eventType !== 'initialThinking')
							.filter(
								(ev) => !ev.executionEventId || ev.executionEventId === exploration.toString()
							)
							.map((e, i) => {
								return (
									<div
										key={e.eventId}
										ref={
											i ===
												antonData.events
													.filter((ev) => ev.eventType !== 'initialThinking')
													.filter(
														(ev) =>
															!ev.executionEventId || ev.executionEventId === exploration.toString()
													).length -
												1
												? ref
												: undefined
										}
									>
										<DataEvent
											originalPrompt={originalPrompt}
											data={e}
											isFirst={i === 0}
										/>
									</div>
								);
							})
						: promptForSubmission && (
							<div className='flex items-center justify-center text-cs-textSecondary'>
								<div
									className='inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]'
									role='status'
								/>
								<p className='pl-2 text-lg font-bold'>Getting to work</p>
							</div>
						)}
				</div>
			</div>
		</main>
	);
}

export default App;
