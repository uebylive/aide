/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Markdown } from '../Markdown/Markdown';

type TerminalProps = {
	children: string;
};

export const Terminal = ({ children }: TerminalProps) => {
	return (
		<div>
			<div className='absolute flex ml-4 mt-4'>
				<div className='h-3 w-3 bg-red-500 rounded-full'></div>
				<div className='ml-2 h-3 w-3 bg-orange-300 rounded-full'></div>
				<div className='ml-2 h-3 w-3 bg-green-500 rounded-full'></div>
			</div>
			<Markdown className='max-h-[60vh] overflow-x-auto' children={children} />
		</div>
	);
};
