/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// A span defines the range of code we are going to coalesce into a single chunk
class Span {
	start: number;
	end: number;

	constructor(start: number, end?: number) {
		this.start = start;
		this.end = end !== undefined ? end : start;
	}

	extract(s: string): string {
		return s.slice(this.start, this.end);
	}

	extractLines(s: string): string {
		return s.split('\n').slice(this.start, this.end).join('\n');
	}

	add(other: Span | number): Span {
		if (typeof other === 'number') {
			return new Span(this.start + other, this.end + other);
		} else if (other instanceof Span) {
			return new Span(this.start, other.end);
		} else {
			throw new Error('Not implemented for the given type');
		}
	}

	length(): number {
		return this.end - this.start;
	}
}
function nonWhitespaceLen(s: string): number {
	return s.replace(/\s/g, '').length;
}

function getLineNumber(index: number, sourceCode: string): number {
	let totalChars = 0;
	const lines = sourceCode.split('\n');
	for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
		totalChars += lines[lineNumber].length;
		if (totalChars > index) {
			return lineNumber;
		}
	}
	return lines.length;
}

// This is the most important function here, where we generate spans from the
// code using tree-sitter to power the search
function chunkTree(tree: any, sourceCode: string, MAX_CHARS = 512 * 3, coalesce = 50): Span[] {
	// 1. Recursively form chunks based on the last post(https://docs.sweep.dev/blogs/chunking-2m-files)
	function chunkNode(node: any): Span[] {
		const chunks: Span[] = [];
		let currentChunk: Span = new Span(node.startByte, node.startByte);
		const nodeChildren = node.children;
		for (const child of nodeChildren) {
			if (child.endByte - child.startByte > MAX_CHARS) {
				chunks.push(currentChunk);
				currentChunk = new Span(child.endByte, child.endByte);
				chunks.push(...chunkNode(child));
			} else if (child.endByte - child.startByte + (currentChunk.end - currentChunk.start) > MAX_CHARS) {
				chunks.push(currentChunk);
				currentChunk = new Span(child.startByte, child.endByte);
			} else {
				currentChunk = new Span(currentChunk.start, child.endByte);
			}
		}
		chunks.push(currentChunk);
		return chunks;
	}

	const chunks = chunkNode(tree.rootNode);

	// 2. Filling in the gaps
	if (chunks.length < 2) {
		return [new Span(0, chunks[0].end)];
	}
	for (let i = 0; i < chunks.length - 1; i++) {
		chunks[i].end = chunks[i + 1].start;
	}
	chunks[chunks.length - 1].start = tree.rootNode.endByte;

	// 3. Combining small chunks with bigger ones
	const newChunks = [];
	let currentChunk: Span = new Span(0, 0);
	for (const chunk of chunks) {
		currentChunk = new Span(currentChunk.start, chunk.end);
		if (nonWhitespaceLen(currentChunk.extract(sourceCode)) > coalesce && sourceCode.slice(currentChunk.start, currentChunk.end).includes('\n')) {
			newChunks.push(currentChunk);
			currentChunk = new Span(chunk.end, chunk.end);
		}
	}
	if (currentChunk.end - currentChunk.start > 0) {
		newChunks.push(currentChunk);
	}

	// 4. Changing line numbers and Eliminating empty chunks
	const lineChunks = newChunks.map(chunk => {
		return new Span(
			getLineNumber(chunk.start, sourceCode),
			getLineNumber(chunk.end, sourceCode),
		);
	}).filter(chunk => chunk.end - chunk.start > 0);

	// 5. Coalescing last chunk if it's too small
	if (lineChunks.length > 0 && lineChunks[lineChunks.length - 1].end - lineChunks[lineChunks.length - 1].start < coalesce) {
		lineChunks[lineChunks.length - 2].end = lineChunks[lineChunks.length - 1].end;
		lineChunks.pop();
	}

	return lineChunks;
}


// If we can't parse it using tree-sitter, the best fallback is to use
// line-based chunking instead and get it to work.
// peak #m clowntown
const MAX_LINES_FOR_SPLIT = 30;
const MAX_OVERLAP = 15;

function lineBasedChunking(
	code: string,
	lineCount: number = MAX_LINES_FOR_SPLIT,
	overlap: number = MAX_OVERLAP,
): string[] {
	if (overlap >= lineCount) {
		throw new Error('Overlap should be smaller than lineCount.');
	}

	const lines = code.split('\n');
	const totalLines = lines.length;
	const chunks: string[] = [];

	let start = 0;
	while (start < totalLines) {
		const end = Math.min(start + lineCount, totalLines);
		const chunk = lines.slice(start, end).join('\n');
		chunks.push(chunk);
		start += lineCount - overlap;
	}

	return chunks;
}


export const chunkCodeFile = async (
	filePath: string,
	maxCharacters: number,
	coalesce: number,
): Promise<Span[]> => {
	// Now we are going to pick the relevant tree-sitter library here and ship
	// that instead.
	// TODO(skcd): Pick up from here
	// We want to get the tree-sitter wasm libraries for as many languages as we
	// can and keep them at the same place so we can do span based chunking
	// and power our search
	return [];
}
