/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import ReactDiffViewer from 'react-diff-viewer-continued';

import { Markdown } from '../Markdown/Markdown';

type GitDiffProps = {
	gitDiff: string;
	className?: string;
};

export const DiffView = ({ gitDiff, className }: GitDiffProps) => {
	// Extract the ORIGINAL and UPDATED parts
	const parts = gitDiff.split('====');
	if (parts.length === 1) {
		return <Markdown className={`${className} p-4`}>{gitDiff}</Markdown>;
	}

	const original = parts[0]
		.replace('<<<< ORIGINAL\n', '')
		.replace('```\n', '')
		.replace(/^\n|\n$/g, '');
	const updated = parts[1]
		.replace('>>>> UPDATED\n```', '')
		.replace(/^\n|\n$/g, '');

	return (
		<div className={`${className} border p-4 bg-cs-bgSecondary`}>
			<ReactDiffViewer
				oldValue={original}
				newValue={updated}
				splitView={false}
				hideLineNumbers
			/>
		</div>
	);
};
