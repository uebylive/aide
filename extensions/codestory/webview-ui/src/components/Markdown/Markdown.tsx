/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import ReactMarkdown from 'react-markdown';

import { SyntaxHighlighter } from '../SyntaxHighliter/SyntaxHighlighter';

type MarkdownProps = {
	children: string;
	className?: string;
};

export const Markdown = ({ children, className }: MarkdownProps) => {
	return (
		<ReactMarkdown
			children={children}
			className={`${className} prose break-words max-w-none`}
			components={{
				code({ node, inline, className, children, style, ...props }) {
					const match = /language-(\w+)/.exec(className || '');
					return !inline && match ? (
						<SyntaxHighlighter
							{...props}
							children={String(children).replace(/\n$/, '')}
							language={match[1]}
						/>
					) : (
						<code {...props} className={className}>
							{children}
						</code>
					);
				},
			}}
		/>
	);
};
