/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';

export const ExpandingTextArea = (
	{ value, style, className, ...props }: React.DetailedHTMLProps<React.TextareaHTMLAttributes<HTMLTextAreaElement>, HTMLTextAreaElement>
) => {
	const [rows, setRows] = useState(1);
	const ref = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (ref.current) {
			const scrollHeight = ref.current.scrollHeight;
			setRows(scrollHeight / 16);
		}
	}, [value]);

	return (
		<textarea
			ref={ref}
			className={`${className} h-auto rounded border border-cs-textSecondary text-cs-textSecondary bg-cs-bgSecondary resize-none`}
			style={{ height: `${rows * 16}px`, ...style }}
			value={value}
			{...props}
		/>
	);
};
