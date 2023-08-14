/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Messenger } from '@estruyf/vscode/dist/client';
import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react';

export const Setup = () => {
	const handleRefresh = () => {
		Messenger.send('healthCheck');
	};

	return (
		<div className='pt-2 pb-12 mx-6 h-full text-vscode-sideBar-foreground'>
			<div className='h-full flex flex-col items-center justify-center'>
				<p className='text-center text-lg mb-4'>
					CodeStory currently requires a backend to be run locally. Please
					ensure the backend is setup and try again.
				</p>
				<p className='text-center text-lg mb-4'>
					If you are working on a Python project, you can {/* @ts-ignore */}
					<VSCodeLink
						href='https://join.slack.com/t/codestoryai/shared_invite/zt-1x4zy3mk1-9fL5k~7XGSNNku7~iYr51w'
						target='_blank'
						rel='noopener noreferrer'
						className='text-lg'
					>
						reach out to us Slack
					</VSCodeLink>{' '}
					and we'll be happy to help you onboard!
				</p>
				{/* @ts-ignore */}
				<VSCodeButton onClick={handleRefresh}>Refresh</VSCodeButton>
			</div>
		</div>
	);
};
