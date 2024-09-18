/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownRenderOptions, MarkedOptions } from '../../../../base/browser/markdownRenderer.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IMarkdownRendererOptions, IMarkdownRenderResult, MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITrustedDomainService } from '../../../../workbench/contrib/url/browser/trustedDomainService.js';

const allowedHtmlTags = [
	'b',
	'blockquote',
	'br',
	'code',
	'em',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'i',
	'li',
	'ol',
	'p',
	'pre',
	'strong',
	'table',
	'tbody',
	'td',
	'th',
	'thead',
	'tr',
	'ul',
	'a',
	'img',

	// TODO@roblourens when we sanitize attributes in markdown source, we can ban these elements at that step. microsoft/vscode-copilot#5091
	// Not in the official list, but used for codicons and other vscode markdown extensions
	'span',
	'div',
];

/**
 * This wraps the MarkdownRenderer and applies sanitizer options needed for Chat.
 */
export class ChatMarkdownRenderer extends MarkdownRenderer {
	constructor(
		options: IMarkdownRendererOptions | undefined,
		@ILanguageService languageService: ILanguageService,
		@IOpenerService openerService: IOpenerService,
		@ITrustedDomainService private readonly trustedDomainService: ITrustedDomainService,
	) {
		super(options ?? {}, languageService, openerService);
	}

	override render(markdown: IMarkdownString | undefined, options?: MarkdownRenderOptions, markedOptions?: MarkedOptions): IMarkdownRenderResult {
		options = {
			...options,
			remoteImageIsAllowed: (uri) => this.trustedDomainService.isValid(uri),
			sanitizerOptions: {
				replaceWithPlaintext: true,
				allowedTags: allowedHtmlTags,
			}
		};

		const mdWithBody: IMarkdownString | undefined = (markdown && markdown.supportHtml) ?
			{
				...markdown,

				// dompurify uses DOMParser, which strips leading comments. Wrapping it all in 'body' prevents this.
				value: `<body>${markdown.value}</body>`,
			}
			: markdown;
		return super.render(mdWithBody, options, markedOptions);
	}
}
