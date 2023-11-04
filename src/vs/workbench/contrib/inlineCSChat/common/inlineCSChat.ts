/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IRange } from 'vs/editor/common/core/range';
import { ISelection } from 'vs/editor/common/core/selection';
import { Event } from 'vs/base/common/event';
import { ProviderResult, TextEdit, WorkspaceEdit } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgress } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { diffInserted, diffRemoved, editorHoverHighlight, editorWidgetBackground, editorWidgetBorder, focusBorder, inputBackground, inputPlaceholderForeground, registerColor, transparent, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { Extensions as ExtensionsMigration, IConfigurationMigrationRegistry } from 'vs/workbench/common/configuration';

export interface IInlineCSChatSlashCommand {
	command: string;
	detail?: string;
	refer?: boolean;
	executeImmediately?: boolean;
}

export interface IInlineCSChatSession {
	id: number;
	placeholder?: string;
	input?: string;
	message?: string;
	slashCommands?: IInlineCSChatSlashCommand[];
	wholeRange?: IRange;
}

export interface IInlineCSChatRequest {
	prompt: string;
	selection: ISelection;
	wholeRange: IRange;
	attempt: number;
	requestId: string;
	live: boolean;
}

export type IInlineCSChatResponse = IInlineCSChatEditResponse | IInlineCSChatBulkEditResponse | IInlineCSChatMessageResponse;

export const enum InlineChatResponseType {
	EditorEdit = 'editorEdit',
	BulkEdit = 'bulkEdit',
	Message = 'message'
}

export const enum InlineChateResponseTypes {
	OnlyMessages = 'onlyMessages',
	OnlyEdits = 'onlyEdits',
	Mixed = 'mixed'
}

export interface IInlineCSChatEditResponse {
	id: number;
	type: InlineChatResponseType.EditorEdit;
	edits: TextEdit[];
	placeholder?: string;
	wholeRange?: IRange;
}

export interface IInlineCSChatBulkEditResponse {
	id: number;
	type: InlineChatResponseType.BulkEdit;
	edits: WorkspaceEdit;
	placeholder?: string;
	wholeRange?: IRange;
}

export interface IInlineCSChatMessageResponse {
	id: number;
	type: InlineChatResponseType.Message;
	message: IMarkdownString;
	placeholder?: string;
	wholeRange?: IRange;
}

export interface IInlineCSChatProgressItem {
	markdownFragment?: string;
	edits?: TextEdit[];
	editsShouldBeInstant?: boolean;
	message?: string;
	slashCommand?: string;
}

export const enum InlineCSChatResponseFeedbackKind {
	Unhelpful = 0,
	Helpful = 1,
	Undone = 2,
	Accepted = 3
}

export interface IInlineCSChatSessionProvider {

	debugName: string;
	label: string;

	prepareInlineChatSession(model: ITextModel, range: ISelection, token: CancellationToken): ProviderResult<IInlineCSChatSession>;

	provideResponse(item: IInlineCSChatSession, request: IInlineCSChatRequest, progress: IProgress<IInlineCSChatProgressItem>, token: CancellationToken): ProviderResult<IInlineCSChatResponse>;

	handleInlineChatResponseFeedback?(session: IInlineCSChatSession, response: IInlineCSChatResponse, kind: InlineCSChatResponseFeedbackKind): void;
}

export const IInlineCSChatService = createDecorator<IInlineCSChatService>('IInlineCSChatService');

export interface IInlineCSChatService {
	_serviceBrand: undefined;

	onDidChangeProviders: Event<void>;
	addProvider(provider: IInlineCSChatSessionProvider): IDisposable;
	getAllProvider(): Iterable<IInlineCSChatSessionProvider>;
}

export const INLINE_CHAT_ID = 'csChatEditor';
export const INTERACTIVE_EDITOR_ACCESSIBILITY_HELP_ID = 'csChatEditorAccessiblityHelp';
export const INLINE_CHAT_DECORATIONS_ID = 'csChatEditorDecorations';

export const CTX_INLINE_CHAT_HAS_PROVIDER = new RawContextKey<boolean>('inlineCSChatHasProvider', false, localize('inlineChatHasProvider', "Whether a provider for interactive editors exists"));
export const CTX_INLINE_CHAT_VISIBLE = new RawContextKey<boolean>('inlineCSChatVisible', false, localize('inlineChatVisible', "Whether the interactive editor input is visible"));
export const CTX_INLINE_CHAT_FOCUSED = new RawContextKey<boolean>('inlineCSChatFocused', false, localize('inlineChatFocused', "Whether the interactive editor input is focused"));
export const CTX_INLINE_CHAT_RESPONSE_FOCUSED = new RawContextKey<boolean>('inlineCSChatResponseFocused', false, localize('inlineChatResponseFocused', "Whether the interactive widget's response is focused"));
export const CTX_INLINE_CHAT_EMPTY = new RawContextKey<boolean>('inlineCSChatEmpty', false, localize('inlineChatEmpty', "Whether the interactive editor input is empty"));
export const CTX_INLINE_CHAT_INNER_CURSOR_FIRST = new RawContextKey<boolean>('inlineCSChatInnerCursorFirst', false, localize('inlineChatInnerCursorFirst', "Whether the cursor of the iteractive editor input is on the first line"));
export const CTX_INLINE_CHAT_INNER_CURSOR_LAST = new RawContextKey<boolean>('inlineCSChatInnerCursorLast', false, localize('inlineChatInnerCursorLast', "Whether the cursor of the iteractive editor input is on the last line"));
export const CTX_INLINE_CHAT_INNER_CURSOR_START = new RawContextKey<boolean>('inlineCSChatInnerCursorStart', false, localize('inlineChatInnerCursorStart', "Whether the cursor of the iteractive editor input is on the start of the input"));
export const CTX_INLINE_CHAT_INNER_CURSOR_END = new RawContextKey<boolean>('inlineCSChatInnerCursorEnd', false, localize('inlineChatInnerCursorEnd', "Whether the cursor of the iteractive editor input is on the end of the input"));
export const CTX_INLINE_CHAT_MESSAGE_CROP_STATE = new RawContextKey<'cropped' | 'not_cropped' | 'expanded'>('inlineCSChatMarkdownMessageCropState', 'not_cropped', localize('inlineChatMarkdownMessageCropState', "Whether the interactive editor message is cropped, not cropped or expanded"));
export const CTX_INLINE_CHAT_OUTER_CURSOR_POSITION = new RawContextKey<'above' | 'below' | ''>('inlineCSChatOuterCursorPosition', '', localize('inlineChatOuterCursorPosition', "Whether the cursor of the outer editor is above or below the interactive editor input"));
export const CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST = new RawContextKey<boolean>('inlineCSChatHasActiveRequest', false, localize('inlineChatHasActiveRequest', "Whether interactive editor has an active request"));
export const CTX_INLINE_CHAT_HAS_STASHED_SESSION = new RawContextKey<boolean>('inlineCSChatHasStashedSession', false, localize('inlineChatHasStashedSession', "Whether interactive editor has kept a session for quick restore"));
export const CTX_INLINE_CHAT_LAST_RESPONSE_TYPE = new RawContextKey<InlineChatResponseType | undefined>('inlineCSChatLastResponseType', undefined, localize('inlineChatResponseType', "What type was the last response of the current interactive editor session"));
export const CTX_INLINE_CHAT_RESPONSE_TYPES = new RawContextKey<InlineChateResponseTypes | undefined>('inlineCSChatResponseTypes', undefined, localize('inlineChatResponseTypes', "What type was the responses have been receieved"));
export const CTX_INLINE_CHAT_DID_EDIT = new RawContextKey<boolean>('inlineCSChatDidEdit', undefined, localize('inlineChatDidEdit', "Whether interactive editor did change any code"));
export const CTX_INLINE_CHAT_USER_DID_EDIT = new RawContextKey<boolean>('inlineCSChatUserDidEdit', undefined, localize('inlineChatUserDidEdit', "Whether the user did changes ontop of the inline chat"));
export const CTX_INLINE_CHAT_LAST_FEEDBACK = new RawContextKey<'unhelpful' | 'helpful' | ''>('inlineCSChatLastFeedbackKind', '', localize('inlineChatLastFeedbackKind', "The last kind of feedback that was provided"));
export const CTX_INLINE_CHAT_DOCUMENT_CHANGED = new RawContextKey<boolean>('inlineCSChatDocumentChanged', false, localize('inlineChatDocumentChanged', "Whether the document has changed concurrently"));
export const CTX_INLINE_CHAT_EDIT_MODE = new RawContextKey<EditMode>('config.inlineCSChat.editMode', EditMode.Live);

// --- (select) action identifier

export const ACTION_ACCEPT_CHANGES = 'interactiveCS.acceptChanges';
export const ACTION_REGENERATE_RESPONSE = 'inlineCSChat.regenerate';
export const ACTION_VIEW_IN_CHAT = 'inlineCSChat.viewInChat';

// --- menus

export const MENU_INLINE_CHAT_WIDGET = MenuId.for('inlineCSChatWidget');
export const MENU_INLINE_CHAT_WIDGET_MARKDOWN_MESSAGE = MenuId.for('inlineCSChatWidget.markdownMessage');
export const MENU_INLINE_CHAT_WIDGET_STATUS = MenuId.for('inlineCSChatWidget.status');
export const MENU_INLINE_CHAT_WIDGET_FEEDBACK = MenuId.for('inlineCSChatWidget.feedback');
export const MENU_INLINE_CHAT_WIDGET_DISCARD = MenuId.for('inlineCSChatWidget.undo');
export const MENU_INLINE_CHAT_WIDGET_TOGGLE = MenuId.for('inlineCSChatWidget.toggle');

// --- colors


export const inlineChatBackground = registerColor('inlineChat.background', { dark: editorWidgetBackground, light: editorWidgetBackground, hcDark: editorWidgetBackground, hcLight: editorWidgetBackground }, localize('inlineChat.background', "Background color of the interactive editor widget"));
export const inlineChatBorder = registerColor('inlineChat.border', { dark: editorWidgetBorder, light: editorWidgetBorder, hcDark: editorWidgetBorder, hcLight: editorWidgetBorder }, localize('inlineChat.border', "Border color of the interactive editor widget"));
export const inlineChatShadow = registerColor('inlineChat.shadow', { dark: widgetShadow, light: widgetShadow, hcDark: widgetShadow, hcLight: widgetShadow }, localize('inlineChat.shadow', "Shadow color of the interactive editor widget"));
export const inlineChatRegionHighlight = registerColor('inlineChat.regionHighlight', { dark: editorHoverHighlight, light: editorHoverHighlight, hcDark: editorHoverHighlight, hcLight: editorHoverHighlight }, localize('inlineChat.regionHighlight', "Background highlighting of the current interactive region. Must be transparent."), true);
export const inlineChatInputBorder = registerColor('inlineChatInput.border', { dark: editorWidgetBorder, light: editorWidgetBorder, hcDark: editorWidgetBorder, hcLight: editorWidgetBorder }, localize('inlineChatInput.border', "Border color of the interactive editor input"));
export const inlineChatInputFocusBorder = registerColor('inlineChatInput.focusBorder', { dark: focusBorder, light: focusBorder, hcDark: focusBorder, hcLight: focusBorder }, localize('inlineChatInput.focusBorder', "Border color of the interactive editor input when focused"));
export const inlineChatInputPlaceholderForeground = registerColor('inlineChatInput.placeholderForeground', { dark: inputPlaceholderForeground, light: inputPlaceholderForeground, hcDark: inputPlaceholderForeground, hcLight: inputPlaceholderForeground }, localize('inlineChatInput.placeholderForeground', "Foreground color of the interactive editor input placeholder"));
export const inlineChatInputBackground = registerColor('inlineChatInput.background', { dark: inputBackground, light: inputBackground, hcDark: inputBackground, hcLight: inputBackground }, localize('inlineChatInput.background', "Background color of the interactive editor input"));

export const inlineChatDiffInserted = registerColor('inlineChatDiff.inserted', { dark: transparent(diffInserted, .5), light: transparent(diffInserted, .5), hcDark: transparent(diffInserted, .5), hcLight: transparent(diffInserted, .5) }, localize('inlineChatDiff.inserted', "Background color of inserted text in the interactive editor input"));
export const inlineChatDiffRemoved = registerColor('inlineChatDiff.removed', { dark: transparent(diffRemoved, .5), light: transparent(diffRemoved, .5), hcDark: transparent(diffRemoved, .5), hcLight: transparent(diffRemoved, .5) }, localize('inlineChatDiff.removed', "Background color of removed text in the interactive editor input"));

// settings

export const enum EditMode {
	Live = 'live',
	LivePreview = 'livePreview',
	Preview = 'preview'
}

Registry.as<IConfigurationMigrationRegistry>(ExtensionsMigration.ConfigurationMigration).registerConfigurationMigrations(
	[{
		key: 'interactiveEditor.editMode', migrateFn: (value: any) => {
			return [['inlineChat.mode', { value: value }]];
		}
	}]
);

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'editor',
	properties: {
		'inlineChat.mode': {
			description: localize('mode', "Configure if changes crafted in the interactive editor are applied directly to the document or are previewed first."),
			default: EditMode.LivePreview,
			type: 'string',
			enum: [EditMode.LivePreview, EditMode.Preview, EditMode.Live],
			markdownEnumDescriptions: [
				localize('mode.livePreview', "Changes are applied directly to the document and are highlighted visually via inline or side-by-side diffs. Ending a session will keep the changes."),
				localize('mode.preview', "Changes are previewed only and need to be accepted via the apply button. Ending a session will discard the changes."),
				localize('mode.live', "Changes are applied directly to the document but can be highlighted via inline diffs. Ending a session will keep the changes."),
			]
		},
		'inlineChat.showDiff': {
			description: localize('showDiff', "Enable/disable showing the diff when edits are generated. Works only with inlineChat.mode equal to live or livePreview."),
			default: true,
			type: 'boolean'
		},
		'inlineChat.showGutterIcon': {
			description: localize('showGutterIcon', "Show/hide a gutter icon for spawning inline chat on empty lines."),
			default: false,
			type: 'boolean'
		}
	}
});
