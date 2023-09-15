/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { messageHandler } from '@estruyf/vscode/dist/client';

export const handleOpenFile = (filePath: string, lineStart: number) => {
	messageHandler.send('openFile', { filePath, lineStart });
};
