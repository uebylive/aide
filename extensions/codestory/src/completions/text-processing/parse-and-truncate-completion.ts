import type { TextDocument } from 'vscode'
import type { SyntaxNode } from 'web-tree-sitter'

import type { DocumentContext } from '../get-current-doc-context'

import { parseCompletion, type ParsedCompletion } from './parse-completion'
import type { InlineCompletionItemWithAnalytics } from './process-inline-completions'
import { normalizeStartLine, truncateMultilineCompletion } from './truncate-multiline-completion'
import { truncateParsedCompletion } from './truncate-parsed-completion'
import { getFirstLine } from './utils'

interface ParseAndTruncateParams {
	document: TextDocument
	docContext: DocumentContext
	isDynamicMultilineCompletion: boolean
}

export function parseAndTruncateCompletion(
	completion: string,
	params: ParseAndTruncateParams
): InlineCompletionItemWithAnalytics {
	const {
		document,
		docContext,
		docContext: { multilineTrigger, prefix },
		isDynamicMultilineCompletion,
	} = params;
	// TODO(skcd): Multiline trigger generally happens only when we are at the end of { or equivalent thing
	// not on newline, should we just make it work always regardless?
	// console.log('sidecar.parseAndTruncateCompletion.multiline', multilineTrigger);

	const multiline = Boolean(multilineTrigger);
	const insertTextBeforeTruncation = (
		multiline ? normalizeStartLine(completion, prefix) : completion
	).trimEnd();

	// This is always true for now and returns whatever we have
	const parsed = parseCompletion({
		completion: { insertText: insertTextBeforeTruncation },
		document,
		docContext,
	})

	if (parsed.insertText === '') {
		return parsed
	}

	if (multiline) {
		// This just returns the string as it is with no changes done
		const truncationResult = truncateMultilineBlock({
			parsed,
			document,
			docContext,
		});

		// TODO(skcd): Bring this back later on
		// what we are doing here is using tree sitter to check if we should stop streaming
		// because we do not have the tree-sitter implementation working right now
		// Stop streaming _some_ unhelpful dynamic multiline completions by truncating the insert text early.
		// if (
		//     isDynamicMultilineCompletion &&
		//     isDynamicMultilineCompletionToStopStreaming(truncationResult.nodeToInsert)
		// ) {
		//     truncationResult.insertText = getFirstLine(truncationResult.insertText)
		// }

		const initialLineCount = insertTextBeforeTruncation.split('\n').length
		const truncatedLineCount = truncationResult.insertText.split('\n').length

		parsed.lineTruncatedCount = initialLineCount - truncatedLineCount
		parsed.insertText = truncationResult.insertText
		parsed.truncatedWith = truncationResult.truncatedWith
	}

	// console.log('sidecar.parseAndTruncateCompletion.parsed', parsed.insertText);

	return parsed
}

interface TruncateMultilineBlockParams {
	parsed: ParsedCompletion
	docContext: DocumentContext
	document: TextDocument
}

interface TruncateMultilineBlockResult {
	truncatedWith: 'tree-sitter' | 'indentation'
	insertText: string
	nodeToInsert?: SyntaxNode
}

function truncateMultilineBlock(params: TruncateMultilineBlockParams): TruncateMultilineBlockResult {
	const { parsed, docContext, document } = params

	if (parsed.tree) {
		return {
			truncatedWith: 'tree-sitter',
			...truncateParsedCompletion({
				completion: parsed,
				docContext,
				document,
			}),
		}
	}

	const { prefix, suffix } = docContext;

	const truncatedString = truncateMultilineCompletion(
		parsed.insertText,
		prefix,
		suffix,
		document.languageId
	);
	return {
		truncatedWith: 'indentation',
		insertText: truncatedString,
	}
}

const NODE_TYPES_TO_STOP_STREAMING_AT_ROOT_NODE = new Set(['class_declaration'])

/**
 * Stop streaming dynamic multiline completions which leads to genereting a lot of lines
 * and are unhelpful most of the time. Currently applicable to a number of node types
 * at the root of the document.
 */
function isDynamicMultilineCompletionToStopStreaming(node?: SyntaxNode): boolean {
	return Boolean(
		node && isRootNode(node.parent) && NODE_TYPES_TO_STOP_STREAMING_AT_ROOT_NODE.has(node.type)
	)
}

function isRootNode(node: SyntaxNode | null): boolean {
	return node?.parent === null
}
