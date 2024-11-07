/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatViewPane } from './aideAgentViewPane.js';
import { IChatViewState, IChatWidgetCompletionContext, IChatWidgetContrib } from './aideAgentWidget.js';
import { ICodeBlockActionContext } from './codeBlockPart.js';
import { ChatAgentLocation, IChatAgentCommand, IChatAgentData } from '../common/aideAgentAgents.js';
import { AgentMode, AgentScope, IChatRequestVariableEntry, IChatResponseModel } from '../common/aideAgentModel.js';
import { IParsedChatRequest } from '../common/aideAgentParserTypes.js';
import { CHAT_PROVIDER_ID } from '../common/aideAgentParticipantContribTypes.js';
import { IChatRequestViewModel, IChatResponseViewModel, IChatViewModel, IChatWelcomeMessageViewModel } from '../common/aideAgentViewModel.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ChatInputPart } from './aideAgentInputPart.js';

export const IAideAgentWidgetService = createDecorator<IAideAgentWidgetService>('aideAgentWidgetService');

export interface IAideAgentWidgetService {

	readonly _serviceBrand: undefined;

	/**
	 * Returns the most recently focused widget if any.
	 */
	readonly lastFocusedWidget: IChatWidget | undefined;

	getWidgetByInputUri(uri: URI): IChatWidget | undefined;
	getWidgetBySessionId(sessionId: string): IChatWidget | undefined;
}

export async function showChatView(viewsService: IViewsService): Promise<IChatWidget | undefined> {
	return (await viewsService.openView<ChatViewPane>(CHAT_VIEW_ID))?.widget;
}

export const IAideAgentAccessibilityService = createDecorator<IAideAgentAccessibilityService>('aideAgentAccessibilityService');
export interface IAideAgentAccessibilityService {
	readonly _serviceBrand: undefined;
	acceptRequest(): number;
	acceptResponse(response: IChatResponseViewModel | string | undefined, requestId: number): void;
}

export enum TreeUser {
	Chat = 'Chat',
	ReviewPlan = 'ReviewPlan',
}

export type ITreeUser = `${TreeUser}`;

export interface IChatCodeBlockInfo {
	ownerMarkdownPartId: string;
	readonly codeBlockIndex: number;
	readonly uri: URI | undefined;
	codemapperUri: URI | undefined;
	readonly isStreaming: boolean;
	focus(): void;
	getContent(): string;
	readonly element: ChatTreeItem;
}

export interface IEditPreviewCodeBlockInfo {
	readonly ownerMarkdownPartId: string;
	readonly element: ChatTreeItem;
}

export interface IChatFileTreeInfo {
	treeDataId: string;
	treeIndex: number;
	focus(): void;
}

export interface IChatPlanStepsInfo {
	sessionId: string;
	stepIndex: number;
	focus(): void;
	blur(): void;
	dropStep(): void;
	implementStep(): void;
	appendStep(): void;
	expandStep(): void;
}

export type ChatTreeItem = IChatRequestViewModel | IChatResponseViewModel | IChatWelcomeMessageViewModel;

export interface IChatListItemRendererOptions {
	readonly renderStyle?: 'default' | 'compact' | 'minimal';
	readonly noHeader?: boolean;
	readonly noPadding?: boolean;
	readonly editableCodeBlock?: boolean;
	readonly renderCodeBlockPills?: boolean;
	readonly renderTextEditsAsSummary?: (uri: URI) => boolean;
}

export interface IChatWidgetViewOptions {
	renderInputOnTop?: boolean;
	renderFollowups?: boolean;
	renderStyle?: 'default' | 'compact' | 'minimal';
	supportsFileReferences?: boolean;
	filter?: (item: ChatTreeItem) => boolean;
	rendererOptions?: IChatListItemRendererOptions;
	menus?: {
		/**
		 * The menu that is inside the input editor, use for send, dictation
		 */
		executeToolbar?: MenuId;
		/**
		 * The menu that next to the input editor, use for close, config etc
		 */
		inputSideToolbar?: MenuId;
		/**
		 * The telemetry source for all commands of this widget
		 */
		telemetrySource?: string;
	};
	defaultElementHeight?: number;
	editorOverflowWidgetsDomNode?: HTMLElement;
}

export interface IChatViewViewContext {
	viewId: string;
}

export interface IChatPassthroughContext {
	isPassthrough: boolean;
}

export type IChatWidgetViewContext = IChatViewViewContext | IChatPassthroughContext | {};

export interface IChatWidget {
	readonly onDidChangeViewModel: Event<void>;
	readonly onDidAcceptInput: Event<void>;
	readonly onDidHide: Event<void>;
	readonly onDidSubmitAgent: Event<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>;
	readonly onDidChangeAgent: Event<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>;
	readonly onDidChangeParsedInput: Event<void>;
	readonly onDidChangeContext: Event<{ removed?: IChatRequestVariableEntry[]; added?: IChatRequestVariableEntry[] }>;
	readonly location: ChatAgentLocation;
	readonly viewContext: IChatWidgetViewContext;
	readonly viewModel: IChatViewModel | undefined;
	readonly inputEditor: ICodeEditor;
	readonly supportsFileReferences: boolean;
	readonly parsedInput: IParsedChatRequest;
	readonly runningSessionId: string | undefined;
	readonly runningExchangeId: string | undefined;
	lastSelectedAgent: IChatAgentData | undefined;
	readonly scopedContextKeyService: IContextKeyService;
	completionContext: IChatWidgetCompletionContext;
	readonly planningEnabled: boolean;
	readonly inputPart: ChatInputPart;

	setSavedStep(stepIndex: number): void;
	setWillBeSavedStep(stepIndex: number): void;
	setWillBeDroppedStep(stepIndex: number): void;

	getContrib<T extends IChatWidgetContrib>(id: string): T | undefined;
	reveal(item: ChatTreeItem): void;
	focus(item: ChatTreeItem): void;
	getSibling(item: ChatTreeItem, type: 'next' | 'previous'): ChatTreeItem | undefined;
	getFocus(): ChatTreeItem | undefined;
	setInput(query?: string): void;
	getInput(): string;
	logInputHistory(): void;
	acceptIterationInput(query: string, sessionId: string, exchangeId: string): Promise<IChatResponseModel | undefined>;
	acceptInput(mode: AgentMode, query?: string): Promise<IChatResponseModel | undefined>;
	acceptInputWithPrefix(prefix: string): void;
	setInputPlaceholder(placeholder: string): void;
	resetInputPlaceholder(): void;
	focusLastMessage(): void;
	focusInput(): void;
	hasInputFocus(): boolean;
	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined;
	getCodeBlockInfosForResponse(response: IChatResponseViewModel): IChatCodeBlockInfo[];
	getFileTreeInfosForResponse(response: IChatResponseViewModel): IChatFileTreeInfo[];
	getLastFocusedFileTreeForResponse(response: IChatResponseViewModel): IChatFileTreeInfo | undefined;
	getPlanStepsInfoForResponse(response: IChatResponseViewModel): IChatPlanStepsInfo[];
	getLastFocusedPlanStepForResponse(response: IChatResponseViewModel): IChatPlanStepsInfo | undefined;
	setContext(overwrite: boolean, ...context: IChatRequestVariableEntry[]): void;
	clear(): void;
	getViewState(): IChatViewState;
	transferQueryState(mode: AgentMode, scope: AgentScope): void;
	togglePlanning(): void;
}


export interface ICodeBlockActionContextProvider {
	getCodeBlockContext(editor?: ICodeEditor): ICodeBlockActionContext | undefined;
}

export const IAideAgentCodeBlockContextProviderService = createDecorator<IAideAgentCodeBlockContextProviderService>('aideAgentCodeBlockContextProviderService');
export interface IAideAgentCodeBlockContextProviderService {
	readonly _serviceBrand: undefined;
	readonly providers: ICodeBlockActionContextProvider[];
	registerProvider(provider: ICodeBlockActionContextProvider, id: string): IDisposable;
}

export const GeneratingPhrase = localize('generating', "Generating");

export const CHAT_VIEW_ID = `workbench.panel.chat.view.${CHAT_PROVIDER_ID}`;
