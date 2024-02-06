/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Uri } from 'vscode';
import { CSChatFileTreeData, CSChatProgressFileTree } from '../completions/providers/chatprovider';


export const createFileTreeFromPaths = (
	filePaths: string[],
	workingDirectory: string,
): CSChatProgressFileTree => {
	// Create a root CSChatFileTreeData object with an empty label and URI
	const rootTreeData = new CSChatFileTreeData('', Uri.file(''));

	// Iterate through codeSnippets and build the file tree
	for (const filePath of filePaths) {
		const finalFilePath = path.join(workingDirectory, filePath);
		const filePathSegments = finalFilePath.split('/');
		let currentNode = rootTreeData;

		// Traverse the tree, creating any missing nodes
		for (const segment of filePathSegments) {
			if (!currentNode.children) {
				currentNode.children = [];
			}

			// Check if a node with the same label already exists
			let childNode = currentNode.children.find((node) => node.label === segment);

			if (!childNode) {
				// Create a new node for the segment
				const uri = Uri.file(finalFilePath);
				childNode = new CSChatFileTreeData(segment, uri);
				currentNode.children.push(childNode);
			}

			// Update the currentNode to the child node for the next iteration
			currentNode = childNode;
		}
	}

	// Remove working directory from the label of root node
	rootTreeData.label = rootTreeData.label.replace(workingDirectory, '');

	// Create and return the CSChatProgressFileTree
	return new CSChatProgressFileTree(rootTreeData);
}
