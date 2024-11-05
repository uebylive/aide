/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from '../../../../base/common/arrays.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString, MarkdownString, isMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { revive } from '../../../../base/common/marshalling.js';
import { equals } from '../../../../base/common/objects.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isObject } from '../../../../base/common/types.js';
import { URI, UriComponents, UriDto, isUriComponents } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IOffsetRange, OffsetRange } from '../../../../editor/common/core/offsetRange.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { IWorkspaceFileEdit, IWorkspaceTextEdit, TextEdit, WorkspaceEdit } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ChatAgentLocation, IAideAgentAgentService, IChatAgentCommand, IChatAgentData, IChatAgentResult, reviveSerializedAgent } from './aideAgentAgents.js';
import { IAideAgentCodeEditingService, IAideAgentCodeEditingSession } from './aideAgentCodeEditingService.js';
import { CONTEXT_AIDE_PLAN_REVIEW_STATE_EXCHANGEID, CONTEXT_AIDE_PLAN_REVIEW_STATE_SESSIONID } from './aideAgentContextKeys.js';
import { ChatRequestTextPart, IParsedChatRequest, reviveParsedChatRequest } from './aideAgentParserTypes.js';
import { IAideAgentPlanService, IAideAgentPlanSession } from './aideAgentPlanService.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, ChatPlanState, IAideAgentService, IChatAgentMarkdownContentWithVulnerability, IChatAideAgentPlanRegenerateInformationPart, IChatCheckpointAdded, IChatCodeCitation, IChatCodeEdit, IChatCommandButton, IChatCommandGroup, IChatConfirmation, IChatContentInlineReference, IChatContentReference, IChatEditsInfo, IChatFollowup, IChatLocationData, IChatMarkdownContent, IChatPlanInfo, IChatPlanStep, IChatProgress, IChatProgressMessage, IChatResponseCodeblockUriPart, IChatResponseProgressFileTreeData, IChatRollbackCompleted, IChatStreamingState, IChatTask, IChatTextEdit, IChatThinkingForEditPart, IChatTreeData, IChatUsedContext, IChatWarningMessage, ICodePlanEditInfo, isIUsedContext } from './aideAgentService.js';
import { IChatRequestVariableValue } from './aideAgentVariables.js';

export function isRequestModel(item: unknown): item is IChatRequestModel {
	return !!item && typeof item === 'object' && 'message' in item;
}

export function isResponseModel(item: unknown): item is IChatResponseModel {
	return !!item && typeof (item as IChatResponseModel).setVote !== 'undefined';
}

export function isWelcomeModel(item: unknown): item is IChatWelcomeMessageModel {
	return !!item && typeof item === 'object' && 'content' in item;
}

export interface IChatRequestVariableEntry {
	id: string;
	fullName?: string;
	icon?: ThemeIcon;
	name: string;
	modelDescription?: string;
	range?: IOffsetRange;
	value: IChatRequestVariableValue;
	references?: IChatContentReference[];

	// TODO are these just a 'kind'?
	isDynamic?: boolean;
	isFile?: boolean;
	isTool?: boolean;
}

export interface IChatRequestVariableData {
	variables: IChatRequestVariableEntry[];
}

export interface IChatRequestModel {
	readonly id: string;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly session: IChatModel;
	readonly message: IParsedChatRequest;
	readonly attempt: number;
	readonly variableData: IChatRequestVariableData;
	readonly confirmation?: string;
	readonly locationData?: IChatLocationData;
	readonly attachedContext?: IChatRequestVariableEntry[];
}

export type IChatExchangeModel = IChatRequestModel | IChatResponseModel;

export interface IChatTextEditGroupState {
	sha1: string;
	applied: number;
}

export interface IChatTextEditGroup {
	uri: URI;
	edits: TextEdit[][];
	state?: IChatTextEditGroupState;
	kind: 'textEditGroup';
}

export type IChatProgressResponseContent =
	| IChatMarkdownContent
	| IChatAgentMarkdownContentWithVulnerability
	| IChatResponseCodeblockUriPart
	| IChatTreeData
	| IChatContentInlineReference
	| IChatProgressMessage
	| IChatCommandButton
	| IChatCommandGroup
	| IChatWarningMessage
	| IChatTask
	| IChatTextEditGroup
	| IChatPlanStep
	| IChatEditsInfo
	| IChatPlanInfo
	| IChatConfirmation
	| IChatRollbackCompleted
	| IChatCheckpointAdded
	| IChatThinkingForEditPart;

export type IChatProgressRenderableResponseContent = Exclude<IChatProgressResponseContent, IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability | IChatResponseCodeblockUriPart>;

export interface IResponse {
	readonly value: ReadonlyArray<IChatProgressResponseContent>;
	toMarkdown(): string;
	toString(): string;
}

export interface IChatResponseModel {
	readonly onDidChange: Event<void>;
	readonly isUserResponse: boolean;
	readonly id: string;
	// readonly requestId: string;
	readonly username: string;
	readonly avatarIcon?: ThemeIcon | URI;
	readonly session: IChatModel;
	readonly agent?: IChatAgentData;
	readonly usedContext: IChatUsedContext | undefined;
	readonly contentReferences: ReadonlyArray<IChatContentReference>;
	readonly editsInfo: IChatEditsInfo | undefined;
	readonly planInfo: IChatPlanInfo | undefined;
	readonly streamingState: IChatStreamingState | undefined;
	readonly codeCitations: ReadonlyArray<IChatCodeCitation>;
	readonly codeEdits: Map<URI, Range[]> | undefined;
	readonly progressMessages: ReadonlyArray<IChatProgressMessage>;
	readonly slashCommand?: IChatAgentCommand;
	readonly agentOrSlashCommandDetected: boolean;
	readonly response: IResponse;
	readonly isComplete: boolean;
	readonly isCanceled: boolean;
	/** A stale response is one that has been persisted and rehydrated, so e.g. Commands that have their arguments stored in the EH are gone. */
	readonly isStale: boolean;
	readonly vote: ChatAgentVoteDirection | undefined;
	readonly voteDownReason: ChatAgentVoteDownReason | undefined;
	readonly followups?: IChatFollowup[] | undefined;
	readonly result?: IChatAgentResult;
	readonly planExchangeId: string | null;
	readonly planSessionId: string | null;
	setVote(vote: ChatAgentVoteDirection): void;
	setVoteDownReason(reason: ChatAgentVoteDownReason | undefined): void;
	setEditApplied(edit: IChatTextEditGroup, editCount: number): boolean;
}

export class ChatRequestModel implements IChatRequestModel {
	private static nextId = 0;

	public readonly id: string;

	public get session() {
		return this._session;
	}

	public get username(): string {
		return this.session.requesterUsername;
	}

	public get avatarIconUri(): URI | undefined {
		return this.session.requesterAvatarIconUri;
	}

	public get attempt(): number {
		return this._attempt;
	}

	public get variableData(): IChatRequestVariableData {
		return this._variableData;
	}

	public set variableData(v: IChatRequestVariableData) {
		this._variableData = v;
	}

	public get confirmation(): string | undefined {
		return this._confirmation;
	}

	public get locationData(): IChatLocationData | undefined {
		return this._locationData;
	}

	public get attachedContext(): IChatRequestVariableEntry[] | undefined {
		return this._attachedContext;
	}

	constructor(
		private _session: ChatModel,
		public readonly message: IParsedChatRequest,
		private _variableData: IChatRequestVariableData,
		private _attempt: number = 0,
		private _confirmation?: string,
		private _locationData?: IChatLocationData,
		private _attachedContext?: IChatRequestVariableEntry[]
	) {
		this.id = 'request_' + ChatRequestModel.nextId++;
	}
}

export class Response extends Disposable implements IResponse {
	private _onDidChangeValue = this._register(new Emitter<void>());
	public get onDidChangeValue() {
		return this._onDidChangeValue.event;
	}

	private _responseParts: IChatProgressResponseContent[];

	/**
	 * A stringified representation of response data which might be presented to a screenreader or used when copying a response.
	 */
	private _responseRepr = '';

	/**
	 * Just the markdown content of the response, used for determining the rendering rate of markdown
	 */
	private _markdownContent = '';

	private _citations: IChatCodeCitation[] = [];

	get value(): IChatProgressResponseContent[] {
		return this._responseParts;
	}

	constructor(value: IMarkdownString | ReadonlyArray<IMarkdownString | IChatResponseProgressFileTreeData | IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability | IChatResponseCodeblockUriPart>) {
		super();
		this._responseParts = asArray(value).map((v) => (isMarkdownString(v) ?
			{ content: v, kind: 'markdownContent' } satisfies IChatMarkdownContent :
			'kind' in v ? v : { kind: 'treeData', treeData: v }));

		this._updateRepr(true);
	}

	override toString(): string {
		return this._responseRepr;
	}

	toMarkdown(): string {
		return this._markdownContent;
	}

	clear(): void {
		this._responseParts = [];
		this._updateRepr(true);
	}

	updateContent(progress: IChatProgressResponseContent | IChatTextEdit | IChatTask | IChatAideAgentPlanRegenerateInformationPart, quiet?: boolean): void {
		if (progress.kind === 'markdownContent') {
			const responsePartLength = this._responseParts.length - 1;
			const lastResponsePart = this._responseParts[responsePartLength];

			if (!lastResponsePart || lastResponsePart.kind !== 'markdownContent' || !canMergeMarkdownStrings(lastResponsePart.content, progress.content)) {
				// The last part can't be merged with- not markdown, or markdown with different permissions
				this._responseParts.push(progress);
			} else {
				lastResponsePart.content = appendMarkdownString(lastResponsePart.content, progress.content);
			}
			this._updateRepr(quiet);
		} else if (progress.kind === 'textEdit') {
			if (progress.edits.length > 0) {
				// merge text edits for the same file no matter when they come in
				let found = false;
				for (let i = 0; !found && i < this._responseParts.length; i++) {
					const candidate = this._responseParts[i];
					if (candidate.kind === 'textEditGroup' && isEqual(candidate.uri, progress.uri)) {
						candidate.edits.push(progress.edits);
						found = true;
					}
				}
				if (!found) {
					this._responseParts.push({
						kind: 'textEditGroup',
						uri: progress.uri,
						edits: [progress.edits]
					});
				}
				this._updateRepr(quiet);
			}
		} else if (progress.kind === 'progressTask') {
			// Add a new resolving part
			const responsePosition = this._responseParts.push(progress) - 1;
			this._updateRepr(quiet);

			const disp = progress.onDidAddProgress(() => {
				this._updateRepr(false);
			});

			progress.task?.().then((content) => {
				// Stop listening for progress updates once the task settles
				disp.dispose();

				// Replace the resolving part's content with the resolved response
				if (typeof content === 'string') {
					(this._responseParts[responsePosition] as IChatTask).content = new MarkdownString(content);
				}
				this._updateRepr(false);
			});
		} else if (progress.kind === 'planRegeneration') {
			console.log('planRegeneration');
			const responsePartLength = this._responseParts.length - 1;
			const lastResponsePart = this._responseParts[responsePartLength];

			if (!lastResponsePart || lastResponsePart.kind !== 'markdownContent') {
				console.log('planRegeneration::notResetting');
			} else {
				lastResponsePart.content = new MarkdownString('');
			}
			this._updateRepr(quiet);
		} else {
			this._responseParts.push(progress);
			this._updateRepr(quiet);
		}
	}

	public addCitation(citation: IChatCodeCitation) {
		this._citations.push(citation);
		this._updateRepr();
	}

	private _updateRepr(quiet?: boolean) {
		const inlineRefToRepr = (part: IChatContentInlineReference) =>
			'uri' in part.inlineReference ? basename(part.inlineReference.uri) : 'name' in part.inlineReference ? part.inlineReference.name : basename(part.inlineReference);

		this._responseRepr = this._responseParts.map(part => {
			// Ignore the representation of planUpdate parts
			if (part.kind === 'treeData') {
				return '';
			} else if (part.kind === 'rollbackCompleted') {
				return 'rollback completed';
			} else if (part.kind === 'checkpointAdded') {
				return 'checkpoint added';
			} else if (part.kind === 'inlineReference') {
				return inlineRefToRepr(part);
			} else if (part.kind === 'command') {
				return part.command.title;
			} else if (part.kind === 'commandGroup') {
				return part.commands.map(c => c.command.title).join(', ');
			} else if (part.kind === 'textEditGroup') {
				return localize('editsSummary', "Made changes.");
			} else if (part.kind === 'progressMessage' || part.kind === 'codeblockUri') {
				return '';
			} else if (part.kind === 'confirmation') {
				return `${part.title}\n${part.message}`;
			} else if (part.kind === 'planStep') {
				return part.description.value;
			} else if (part.kind === 'editsInfo' || part.kind === 'planInfo') {
				const repr = part.state;
				if (part.isStale) {
					return repr.concat(` ${localize('stale', "(stale)")}`);
				}
				return repr;
			} else if (part.kind === 'thinkingForEdit') {
				return part.thinkingDelta.value;
			} else {
				return part.content.value;
			}
		})
			.filter(s => s.length > 0)
			.join('\n\n');

		this._responseRepr += this._citations.length ? '\n\n' + getCodeCitationsMessage(this._citations) : '';

		this._markdownContent = this._responseParts.map(part => {
			if (part.kind === 'inlineReference') {
				return inlineRefToRepr(part);
			} else if (part.kind === 'thinkingForEdit') {
				return part.thinkingDelta.value;
			} else if (part.kind === 'markdownContent' || part.kind === 'markdownVuln') {
				return part.content.value;
			} else {
				return '';
			}
		})
			.filter(s => s.length > 0)
			.join('\n\n');

		if (!quiet) {
			this._onDidChangeValue.fire();
		}
	}
}

export class ChatResponseModel extends Disposable implements IChatResponseModel {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private static nextId = 0;

	public readonly id: string;

	public get session() {
		return this._session;
	}

	public get isComplete(): boolean {
		return this._isComplete;
	}

	public get isCanceled(): boolean {
		return this._isCanceled;
	}

	public get vote(): ChatAgentVoteDirection | undefined {
		return this._vote;
	}

	public get voteDownReason(): ChatAgentVoteDownReason | undefined {
		return this._voteDownReason;
	}

	public get followups(): IChatFollowup[] | undefined {
		return this._followups;
	}

	private _response: Response;
	public get response(): IResponse {
		return this._response;
	}

	public get result(): IChatAgentResult | undefined {
		return this._result;
	}

	public get username(): string {
		return this.session.responderUsername;
	}

	public get avatarIcon(): ThemeIcon | URI | undefined {
		return this.session.responderAvatarIcon;
	}

	private _followups?: IChatFollowup[];

	public get agent(): IChatAgentData | undefined {
		return this._agent;
	}

	public get slashCommand(): IChatAgentCommand | undefined {
		return this._slashCommand;
	}

	private _agentOrSlashCommandDetected: boolean | undefined;
	public get agentOrSlashCommandDetected(): boolean {
		return this._agentOrSlashCommandDetected ?? false;
	}

	private _usedContext: IChatUsedContext | undefined;
	public get usedContext(): IChatUsedContext | undefined {
		return this._usedContext;
	}

	private readonly _contentReferences: IChatContentReference[] = [];
	public get contentReferences(): ReadonlyArray<IChatContentReference> {
		return this._contentReferences;
	}

	private _streamingState: IChatStreamingState | undefined;
	public get streamingState(): IChatStreamingState | undefined {
		return this._streamingState;
	}

	private _editsInfo: IChatEditsInfo | undefined;
	public get editsInfo(): IChatEditsInfo | undefined {
		return this._editsInfo;
	}

	private _planInfo: IChatPlanInfo | undefined;
	public get planInfo(): IChatPlanInfo | undefined {
		return this._planInfo;
	}

	private _editingSession: IAideAgentCodeEditingSession | undefined;

	/**
	 * Returns the code edits for the response model based on the sessionId and the exchangeId
	 *
	 * the only gotcha here is that this makes it very stateful... so we are not able to update it
	 * dynamically, we have to do something smart over here to grab it properly
	 * or make sure that this gets returned properly
	 */
	private _codeEdits: Map<URI, Range[]> | undefined;
	public get codeEdits(): Map<URI, Range[]> | undefined {
		return this._codeEdits;
		// return this._editingSession?.fileLocationForEditsMade(this.session.sessionId, this.id);
	}

	private _planSession: IAideAgentPlanSession | undefined;

	private readonly _codeCitations: IChatCodeCitation[] = [];
	public get codeCitations(): ReadonlyArray<IChatCodeCitation> {
		return this._codeCitations;
	}

	private readonly _progressMessages: IChatProgressMessage[] = [];
	public get progressMessages(): ReadonlyArray<IChatProgressMessage> {
		return this._progressMessages;
	}

	private _isStale: boolean = false;
	public get isStale(): boolean {
		return this._isStale;
	}

	private _planExchangeId: string | null = null;
	public get planExchangeId(): string | null {
		return this._planExchangeId;
	}

	public set planExchangeId(planExchangeId: string) {
		this._planExchangeId = planExchangeId;
	}

	private _planSessionId: string | null = null;
	public get planSessionId(): string | null {
		return this._planSessionId;
	}

	public set planSessionId(planSessionId: string) {
		this._planSessionId = planSessionId;
	}

	_isUserResponse: boolean;
	get isUserResponse() {
		return this._isUserResponse;
	}

	constructor(
		@IAideAgentCodeEditingService private readonly _aideAgentCodeEditingService: IAideAgentCodeEditingService,
		@IAideAgentPlanService private readonly _aidePlanService: IAideAgentPlanService,
		_response: IMarkdownString | ReadonlyArray<IMarkdownString | IChatResponseProgressFileTreeData | IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability | IChatResponseCodeblockUriPart>,
		private _session: ChatModel,
		private _agent: IChatAgentData | undefined,
		private _slashCommand: IChatAgentCommand | undefined,
		// public readonly requestId: string,
		private _isComplete: boolean = false,
		private _isCanceled = false,
		private _vote?: ChatAgentVoteDirection,
		private _voteDownReason?: ChatAgentVoteDownReason,
		private _result?: IChatAgentResult,
		followups?: ReadonlyArray<IChatFollowup>,
		isUserResponse = false,
	) {
		super();

		this._isUserResponse = isUserResponse;

		// If we are creating a response with some existing content, consider it stale
		this._isStale = Array.isArray(_response) && (_response.length !== 0 || isMarkdownString(_response) && _response.value.length !== 0);

		this._followups = followups ? [...followups] : undefined;
		this._response = this._register(new Response(_response));
		this._register(this._response.onDidChangeValue(() => this._onDidChange.fire()));
		this.id = 'response_' + ChatResponseModel.nextId++;
	}

	/**
	 * Apply a progress update to the actual response content.
	 */
	updateContent(responsePart: IChatProgressResponseContent | IChatTextEdit | IChatAideAgentPlanRegenerateInformationPart, quiet?: boolean) {
		this._response.updateContent(responsePart, quiet);
	}

	/**
	 * Apply one of the progress updates that are not part of the actual response content.
	 */
	applyReference(progress: IChatUsedContext | IChatContentReference) {
		if (progress.kind === 'usedContext') {
			this._usedContext = progress;
		} else if (progress.kind === 'reference') {
			this._contentReferences.push(progress);
			this._onDidChange.fire();
		}
	}

	applyEditsInfo(editsInfo: IChatEditsInfo) {
		this._editsInfo = editsInfo;
		this._onDidChange.fire();
	}

	applyPlanInfo(planInfo: IChatPlanInfo) {
		this._planSession = this._aidePlanService.getOrStartPlanSession(planInfo.sessionId, planInfo.exchangeId);
		this._planInfo = planInfo;
		// update the plan info to what we have over here
		this._planSession.updatePlanInfo(planInfo);
		this._onDidChange.fire();
	}

	async applyCodeEdit(codeEdit: IChatCodeEdit) {
		// here we have to pass sessionId instead of the chat.id
		this._editingSession = this._aideAgentCodeEditingService.getOrStartCodeEditingSession(this.session.sessionId);
		for (const edit of codeEdit.edits.edits) {
			if (isWorkspaceTextEdit(edit)) {
				await this._editingSession.apply(edit);
				// update our code edits here so we can keep update it automagically
				// after applying an edit
				this._codeEdits = this._editingSession.fileLocationForEditsMade(this.session.sessionId, edit.metadata?.label ?? this.id);
				// TODO(@ghostwriternr): This is a temporary hack to show the edited resource, until we build the UI component for showing this
				// in a special manner for edits.
				const resource = edit.resource;
				if (resource.fsPath === '/undoCheck') {
					continue;
				}
				this.applyReference({
					kind: 'reference',
					reference: resource
				});
			}
		}
	}

	/**
	 * Updates the UI element over here by gragging the edit information from the
	 * editing service and updating our own codeEdits properly
	 */
	async applyPlanEditInfo(progress: ICodePlanEditInfo) {
		const exchangeId = progress.exchangeId;
		const currentStepIndex = progress.currentStepIndex;
		const previousStepIndex = progress.startStepIndex;
		// This format is dicatated on the Aide extension layer
		// I know bad case of not being explicit enough
		const planStartExchangeId = `${exchangeId}::${previousStepIndex}`;
		const planEndExchangeId = `${exchangeId}::${currentStepIndex}`;
		const newEditsInformation = await this._editingSession?.editsBetweenExchangesInSession(this.session.sessionId, planStartExchangeId, planEndExchangeId);
		this._codeEdits = newEditsInformation;
		this._onDidChange.fire();
	}

	applyCodeCitation(progress: IChatCodeCitation) {
		this._codeCitations.push(progress);
		this._response.addCitation(progress);
		this._onDidChange.fire();
	}

	setAgent(agent: IChatAgentData, slashCommand?: IChatAgentCommand) {
		this._agent = agent;
		this._slashCommand = slashCommand;
		this._agentOrSlashCommandDetected = true;
		this._onDidChange.fire();
	}

	setResult(result: IChatAgentResult): void {
		this._result = result;
		this._onDidChange.fire();
	}

	complete(): void {
		if (this._result?.errorDetails?.responseIsRedacted) {
			this._response.clear();
		}

		this._editingSession?.complete();

		this._isComplete = true;
		this._onDidChange.fire();
	}

	cancel(): void {
		this._isComplete = true;
		this._isCanceled = true;
		this._onDidChange.fire();
	}

	setFollowups(followups: IChatFollowup[] | undefined): void {
		this._followups = followups;
		this._onDidChange.fire(); // Fire so that command followups get rendered on the row
	}

	setVote(vote: ChatAgentVoteDirection): void {
		this._vote = vote;
		this._onDidChange.fire();
	}

	setVoteDownReason(reason: ChatAgentVoteDownReason | undefined): void {
		this._voteDownReason = reason;
		this._onDidChange.fire();
	}

	setEditApplied(edit: IChatTextEditGroup, editCount: number): boolean {
		if (!this.response.value.includes(edit)) {
			return false;
		}
		if (!edit.state) {
			return false;
		}
		edit.state.applied = editCount; // must not be edit.edits.length
		this._onDidChange.fire();
		return true;
	}
}

export interface IChatModel {
	readonly onDidDispose: Event<void>;
	readonly onDidChange: Event<IChatChangeEvent>;
	readonly sessionId: string;
	readonly isPassthrough: boolean;
	readonly initState: ChatModelInitState;
	readonly initialLocation: ChatAgentLocation;
	readonly title: string;
	readonly welcomeMessage: IChatWelcomeMessageModel | undefined;
	readonly requestInProgress: boolean;
	readonly inputPlaceholder?: string;
	handleUserCancelActionForSession(): void;
	getExchanges(): IChatExchangeModel[];
	toExport(): IExportableChatData;
	toJSON(): ISerializableChatData;
}

export interface ISerializableChatsData {
	[sessionId: string]: ISerializableChatData;
}

export type ISerializableChatAgentData = UriDto<IChatAgentData>;

export interface ISerializableChatRequestData {
	message: string | IParsedChatRequest; // string => old format
	/** Is really like "prompt data". This is the message in the format in which the agent gets it + variable values. */
	variableData: IChatRequestVariableData;
	response: ReadonlyArray<IMarkdownString | IChatResponseProgressFileTreeData | IChatContentInlineReference | IChatAgentMarkdownContentWithVulnerability> | undefined;
	agent?: ISerializableChatAgentData;
	slashCommand?: IChatAgentCommand;
	// responseErrorDetails: IChatResponseErrorDetails | undefined;
	result?: IChatAgentResult; // Optional for backcompat
	followups: ReadonlyArray<IChatFollowup> | undefined;
	isCanceled: boolean | undefined;
	vote: ChatAgentVoteDirection | undefined;
	voteDownReason?: ChatAgentVoteDownReason;
	/** For backward compat: should be optional */
	usedContext?: IChatUsedContext;
	contentReferences?: ReadonlyArray<IChatContentReference>;
	codeCitations?: ReadonlyArray<IChatCodeCitation>;
}

export interface IExportableChatData {
	initialLocation: ChatAgentLocation | undefined;
	welcomeMessage: (string | IChatFollowup[])[] | undefined;
	requests: ISerializableChatRequestData[];
	requesterUsername: string;
	responderUsername: string;
	requesterAvatarIconUri: UriComponents | undefined;
	responderAvatarIconUri: ThemeIcon | UriComponents | undefined; // Keeping Uri name for backcompat
}

/*
	NOTE: every time the serialized data format is updated, we need to create a new interface, because we may need to handle any old data format when parsing.
*/

export interface ISerializableChatData1 extends IExportableChatData {
	sessionId: string;
	creationDate: number;
	isImported: boolean;

	/** Indicates that this session was created in this window. Is cleared after the chat has been written to storage once. Needed to sync chat creations/deletions between empty windows. */
	isNew?: boolean;
}

export interface ISerializableChatData2 extends ISerializableChatData1 {
	version: 2;
	lastMessageDate: number;
	computedTitle: string | undefined;
}

export interface ISerializableChatData3 extends Omit<ISerializableChatData2, 'version' | 'computedTitle'> {
	version: 3;
	customTitle: string | undefined;
}

/**
 * Chat data that has been parsed and normalized to the current format.
 */
export type ISerializableChatData = ISerializableChatData3;

/**
 * Chat data that has been loaded but not normalized, and could be any format
 */
export type ISerializableChatDataIn = ISerializableChatData1 | ISerializableChatData2 | ISerializableChatData3;

/**
 * Normalize chat data from storage to the current format.
 * TODO- ChatModel#_deserialize and reviveSerializedAgent also still do some normalization and maybe that should be done in here too.
 */
export function normalizeSerializableChatData(raw: ISerializableChatDataIn): ISerializableChatData {
	normalizeOldFields(raw);

	if (!('version' in raw)) {
		return {
			version: 3,
			...raw,
			lastMessageDate: raw.creationDate,
			customTitle: undefined,
		};
	}

	if (raw.version === 2) {
		return {
			...raw,
			version: 3,
			customTitle: raw.computedTitle
		};
	}

	return raw;
}

function normalizeOldFields(raw: ISerializableChatDataIn): void {
	// Fill in fields that very old chat data may be missing
	if (!raw.sessionId) {
		raw.sessionId = generateUuid();
	}

	if (!raw.creationDate) {
		raw.creationDate = getLastYearDate();
	}

	if ('version' in raw && (raw.version === 2 || raw.version === 3)) {
		if (!raw.lastMessageDate) {
			// A bug led to not porting creationDate properly, and that was copied to lastMessageDate, so fix that up if missing.
			raw.lastMessageDate = getLastYearDate();
		}
	}
}

function getLastYearDate(): number {
	const lastYearDate = new Date();
	lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
	return lastYearDate.getTime();
}

export function isExportableSessionData(obj: unknown): obj is IExportableChatData {
	const data = obj as IExportableChatData;
	return typeof data === 'object' &&
		typeof data.requesterUsername === 'string';
}

export function isSerializableSessionData(obj: unknown): obj is ISerializableChatData {
	const data = obj as ISerializableChatData;
	return isExportableSessionData(obj) &&
		typeof data.creationDate === 'number' &&
		typeof data.sessionId === 'string' &&
		obj.requests.every((request: ISerializableChatRequestData) =>
			!request.usedContext /* for backward compat allow missing usedContext */ || isIUsedContext(request.usedContext)
		);
}

export type IChatChangeEvent =
	| IChatInitEvent
	| IChatAddRequestEvent | IChatChangedRequestEvent | IChatRemoveRequestEvent
	| IChatEditsInfo | IChatPlanInfo
	| IChatAddResponseEvent
	| IChatSetAgentEvent
	| IChatMoveEvent
	| IChatCodeEditEvent
	| IChatStreamingState
	| IChatRemoveExchangesEvent
	| IChatAideAgentPlanRegenerateInformationPart;

export interface IChatAddRequestEvent {
	kind: 'addRequest';
	request: IChatRequestModel;
}

export interface IChatChangedRequestEvent {
	kind: 'changedRequest';
	request: IChatRequestModel;
}

export interface IChatAddResponseEvent {
	kind: 'addResponse';
	response: IChatResponseModel;
}

export const enum ChatRequestRemovalReason {
	/**
	 * "Normal" remove
	 */
	Removal,

	/**
	 * Removed because the request will be resent
	 */
	Resend,
}

export interface IChatRemoveRequestEvent {
	kind: 'removeRequest';
	requestId: string;
	responseId?: string;
	reason: ChatRequestRemovalReason;
}

export interface IChatMoveEvent {
	kind: 'move';
	target: URI;
	range: IRange;
}

export interface IChatCodeEditEvent {
	kind: 'codeEdit';
	edits: WorkspaceEdit;
}

export interface IChatRemoveExchangesEvent {
	kind: 'removeExchanges';
	from: number;
	remaining: IChatExchangeModel[];
	removed: IChatExchangeModel[];
}

export interface IChatSetAgentEvent {
	kind: 'setAgent';
	agent: IChatAgentData;
	command?: IChatAgentCommand;
}

export interface IChatInitEvent {
	kind: 'initialize';
}

export enum ChatModelInitState {
	Created,
	Initializing,
	Initialized
}

export enum AgentSessionExchangeUserAction {
	AcceptAll = 'AcceptAll',
	RejectAll = 'RejectAll',
}

export enum AgentMode {
	Chat = 'Chat',
	Edit = 'Edit',
	Plan = 'Plan'
}

export enum AgentScope {
	Selection = 'Selection',
	PinnedContext = 'Pinned Context',
	Codebase = 'Codebase'
}

export class ChatModel extends Disposable implements IChatModel {
	static getDefaultTitle(requests: (ISerializableChatRequestData | IChatExchangeModel)[]): string {
		const firstRequestMessage = requests.find(r => isRequestModel(r));
		const message = firstRequestMessage?.message.text ?? 'Session';
		return message.split('\n')[0].substring(0, 50);
	}

	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	private readonly _onDidChange = this._register(new Emitter<IChatChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private _mutableExchanges: ChatResponseModel[];
	private _exchanges: IChatExchangeModel[];
	private _initState: ChatModelInitState = ChatModelInitState.Created;
	private _isInitializedDeferred = new DeferredPromise<void>();
	// this is kinda similar to threads in a way if you think about it??
	// cause each chat model can have children chat models which are shown over here
	private _planChatModels: Map<string, ChatModel> = new Map();
	private _planChatResponseModels: Map<string, ChatResponseModel> = new Map();

	private _welcomeMessage: ChatWelcomeMessageModel | undefined;
	get welcomeMessage(): ChatWelcomeMessageModel | undefined {
		return this._exchanges.length === 0 ? this._welcomeMessage : undefined;
	}

	// TODO to be clear, this is not the same as the id from the session object, which belongs to the provider.
	// It's easier to be able to identify this model before its async initialization is complete
	private _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	get requestInProgress(): boolean {
		const lastExchange = this._exchanges[this._exchanges.length - 1];
		return !!lastExchange && 'response' in lastExchange && !lastExchange.isComplete;
	}

	get hasRequests(): boolean {
		return this._exchanges.length > 0;
	}

	get lastExchange(): IChatExchangeModel | undefined {
		return this._exchanges.at(-1);
	}

	_lastStreamingState: IChatStreamingState | undefined;
	get lastStreamingState() {
		return this._lastStreamingState;
	}

	private _creationDate: number;
	get creationDate(): number {
		return this._creationDate;
	}

	private _lastMessageDate: number;
	get lastMessageDate(): number {
		return this._lastMessageDate;
	}

	private get _defaultAgent() {
		return this.chatAgentService.getDefaultAgent(ChatAgentLocation.Panel);
	}

	get requesterUsername(): string {
		return this._defaultAgent?.metadata.requester?.name ??
			this.initialData?.requesterUsername ?? '';
	}

	get responderUsername(): string {
		return this._defaultAgent?.fullName ??
			this.initialData?.responderUsername ?? '';
	}

	private readonly _initialRequesterAvatarIconUri: URI | undefined;
	get requesterAvatarIconUri(): URI | undefined {
		return this._defaultAgent?.metadata.requester?.icon ??
			this._initialRequesterAvatarIconUri;
	}

	private readonly _initialResponderAvatarIconUri: ThemeIcon | URI | undefined;
	get responderAvatarIcon(): ThemeIcon | URI | undefined {
		return this._defaultAgent?.metadata.themeIcon ??
			this._initialResponderAvatarIconUri;
	}

	get initState(): ChatModelInitState {
		return this._initState;
	}

	private _isImported = false;
	get isImported(): boolean {
		return this._isImported;
	}

	private _customTitle: string | undefined;
	get customTitle(): string | undefined {
		return this._customTitle;
	}

	get title(): string {
		return this._customTitle || ChatModel.getDefaultTitle(this._exchanges);
	}

	get initialLocation() {
		return this._initialLocation;
	}

	constructor(
		private readonly initialData: ISerializableChatData | IExportableChatData | undefined,
		private readonly _initialLocation: ChatAgentLocation,
		readonly isPassthrough: boolean,
		// used to force a certain session id on the chatmodel, use it at your own risk
		// we are using it now to set the sessionId for the planreview pane over here
		readonly forcedSessionId: string | null,
		@ILogService private readonly logService: ILogService,
		@IAideAgentService private readonly aideAgentService: IAideAgentService,
		@IAideAgentAgentService private readonly chatAgentService: IAideAgentAgentService,
		@IAideAgentCodeEditingService private readonly aideAgentCodeEditingService: IAideAgentCodeEditingService,
		@IAideAgentPlanService private readonly aideAgentPlanService: IAideAgentPlanService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this._isImported = (!!initialData && !isSerializableSessionData(initialData)) || (initialData?.isImported ?? false);
		if (forcedSessionId) {
			this._sessionId = forcedSessionId;
		} else {
			this._sessionId = (isSerializableSessionData(initialData) && initialData.sessionId) || generateUuid();
		}
		this._exchanges = initialData ? this._deserialize(initialData) : [];
		this._mutableExchanges = [];
		this._creationDate = (isSerializableSessionData(initialData) && initialData.creationDate) || Date.now();
		this._lastMessageDate = (isSerializableSessionData(initialData) && initialData.lastMessageDate) || this._creationDate;
		this._customTitle = isSerializableSessionData(initialData) ? initialData.customTitle : undefined;

		this._initialRequesterAvatarIconUri = initialData?.requesterAvatarIconUri && URI.revive(initialData.requesterAvatarIconUri);
		this._initialResponderAvatarIconUri = isUriComponents(initialData?.responderAvatarIconUri) ? URI.revive(initialData.responderAvatarIconUri) : initialData?.responderAvatarIconUri;
	}

	private _deserialize(obj: IExportableChatData): ChatRequestModel[] {
		const requests = obj.requests;
		if (!Array.isArray(requests)) {
			this.logService.error(`Ignoring malformed session data: ${JSON.stringify(obj)}`);
			return [];
		}

		if (obj.welcomeMessage) {
			const content = obj.welcomeMessage.map(item => typeof item === 'string' ? new MarkdownString(item) : item);
			this._welcomeMessage = this.instantiationService.createInstance(ChatWelcomeMessageModel, content, []);
		}

		try {
			return requests.map((raw: ISerializableChatRequestData) => {
				const parsedRequest =
					typeof raw.message === 'string'
						? this.getParsedRequestFromString(raw.message)
						: reviveParsedChatRequest(raw.message);

				// Old messages don't have variableData, or have it in the wrong (non-array) shape
				const variableData: IChatRequestVariableData = this.reviveVariableData(raw.variableData);
				const request = new ChatRequestModel(this, parsedRequest, variableData);
				if (raw.response || raw.result || (raw as any).responseErrorDetails) {
					const agent = (raw.agent && 'metadata' in raw.agent) ? // Check for the new format, ignore entries in the old format
						reviveSerializedAgent(raw.agent) : undefined;

					// Port entries from old format
					const result = 'responseErrorDetails' in raw ?
						// eslint-disable-next-line local/code-no-dangerous-type-assertions
						{ errorDetails: raw.responseErrorDetails } as IChatAgentResult : raw.result;
					// TODO(@ghostwriternr): We used to assign the response to the request here, but now we don't.
					const response = new ChatResponseModel(
						this.aideAgentCodeEditingService,
						this.aideAgentPlanService,
						raw.response ?? [new MarkdownString(raw.response)], this, agent, raw.slashCommand, true, raw.isCanceled, raw.vote, raw.voteDownReason, result, raw.followups
					);
					if (raw.usedContext) { // @ulugbekna: if this's a new vscode sessions, doc versions are incorrect anyway?
						response.applyReference(revive(raw.usedContext));
					}

					raw.contentReferences?.forEach(r => response.applyReference(revive(r)));
					raw.codeCitations?.forEach(c => response.applyCodeCitation(revive(c)));
				}
				return request;
			});
		} catch (error) {
			this.logService.error('Failed to parse chat data', error);
			return [];
		}
	}

	private reviveVariableData(raw: IChatRequestVariableData): IChatRequestVariableData {
		const variableData = raw && Array.isArray(raw.variables)
			? raw :
			{ variables: [] };

		variableData.variables = variableData.variables.map<IChatRequestVariableEntry>((v): IChatRequestVariableEntry => {
			// Old variables format
			if (v && 'values' in v && Array.isArray(v.values)) {
				return {
					id: v.id ?? '',
					name: v.name,
					value: v.values[0]?.value,
					range: v.range,
					modelDescription: v.modelDescription,
					references: v.references
				};
			} else {
				return v;
			}
		});

		return variableData;
	}

	private getParsedRequestFromString(message: string): IParsedChatRequest {
		// TODO These offsets won't be used, but chat replies need to go through the parser as well
		const parts = [new ChatRequestTextPart(new OffsetRange(0, message.length), { startColumn: 1, startLineNumber: 1, endColumn: 1, endLineNumber: 1 }, message)];
		return {
			text: message,
			parts
		};
	}

	startInitialize(): void {
		if (this.initState !== ChatModelInitState.Created) {
			throw new Error(`ChatModel is in the wrong state for startInitialize: ${ChatModelInitState[this.initState]}`);
		}
		this._initState = ChatModelInitState.Initializing;
	}

	deinitialize(): void {
		this._initState = ChatModelInitState.Created;
		this._isInitializedDeferred = new DeferredPromise<void>();
	}

	initialize(welcomeMessage: ChatWelcomeMessageModel | undefined): void {
		if (this.initState !== ChatModelInitState.Initializing) {
			// Must call startInitialize before initialize, and only call it once
			throw new Error(`ChatModel is in the wrong state for initialize: ${ChatModelInitState[this.initState]}`);
		}

		this._initState = ChatModelInitState.Initialized;
		if (!this._welcomeMessage) {
			// Could also have loaded the welcome message from persisted data
			this._welcomeMessage = welcomeMessage;
		}

		this._isInitializedDeferred.complete();
		this._onDidChange.fire({ kind: 'initialize' });
	}

	setInitializationError(error: Error): void {
		if (this.initState !== ChatModelInitState.Initializing) {
			throw new Error(`ChatModel is in the wrong state for setInitializationError: ${ChatModelInitState[this.initState]}`);
		}

		if (!this._isInitializedDeferred.isSettled) {
			this._isInitializedDeferred.error(error);
		}
	}

	waitForInitialization(): Promise<void> {
		return this._isInitializedDeferred.p;
	}

	getExchanges(): IChatExchangeModel[] {
		return this._exchanges;
	}

	// Over here we are pushing new ChatRequestModels over here
	// this can be used to solve the problem of updating request
	// if ChatRequestModel supports updating
	addRequest(message: IParsedChatRequest, variableData: IChatRequestVariableData, attempt: number, chatAgent?: IChatAgentData, slashCommand?: IChatAgentCommand, confirmation?: string, locationData?: IChatLocationData, attachments?: IChatRequestVariableEntry[]): ChatRequestModel {
		const request = new ChatRequestModel(this, message, variableData, attempt, confirmation, locationData, attachments);

		this._exchanges.push(request);
		this._lastMessageDate = Date.now();
		this._onDidChange.fire({ kind: 'addRequest', request });
		return request;
	}

	private resetResponses() {
		this._mutableExchanges.forEach((exchange) => {
			exchange.dispose();
		});
		this._mutableExchanges = [];
		const removed = this._exchanges;
		this._exchanges = [];
		const from = 0;
		const remaining: IChatExchangeModel[] = [];
		this._onDidChange.fire({ kind: 'removeExchanges', from, remaining, removed });
	}

	addResponse(isUserResponse = false): ChatResponseModel {
		const response = new ChatResponseModel(
			this.aideAgentCodeEditingService,
			this.aideAgentPlanService,
			[],
			this,
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
			isUserResponse
		);
		this._exchanges.push(response);
		this._mutableExchanges.push(response);
		// TODO(@ghostwriternr): Just looking at the above, do we need to update the last message date here? What is it used for?
		this._onDidChange.fire({ kind: 'addResponse', response });
		return response;
	}

	private removeExchanges(from: number) {
		const exchanges = this._exchanges;
		const remaining = exchanges.slice(0, from);
		const removed = exchanges.slice(from, exchanges.length);
		this._exchanges = remaining;
		this._onDidChange.fire({ kind: 'removeExchanges', from, remaining, removed });
		return { from, remaining, removed };
	}

	setCustomTitle(title: string): void {
		this._customTitle = title;
	}

	updateRequest(request: ChatRequestModel, variableData: IChatRequestVariableData) {
		request.variableData = variableData;
		this._onDidChange.fire({ kind: 'changedRequest', request });
	}


	acceptThinkingForEdit(progress: IChatThinkingForEditPart) {
		if (progress.kind !== 'thinkingForEdit') {
			return;
		}
		const planId = `${progress.sessionId}-${progress.exchangeId}`;
		// If this is a plan session, then we are showing rich information on the side pane already
		// and the edit information is not as useful anymore
		if (this.aideAgentPlanService.isPlanSession(progress.sessionId, progress.exchangeId)) {
			return;
		}
		let planMaybe = this._planChatModels.get(planId);
		if (planMaybe === undefined) {
			planMaybe = this.aideAgentService.startSessionWithId(ChatAgentLocation.Notebook, CancellationToken.None, planId);
			if (planMaybe === undefined) {
				return;
			}
			this._planChatModels.set(planId, planMaybe);
		}
		// if its still empty.. boy oh boy
		if (planMaybe === undefined) {
			return;
		}

		// No running exchanges, implies we have not started showing this information to the user
		if (planMaybe.getExchanges().length === 0) {
			const response = planMaybe.addResponse();
			this._planChatResponseModels.set(planId, response);
			// push the progress over here as markdown
			planMaybe.acceptResponseProgress(response,
				{
					'kind': 'markdownContent',
					content: progress.thinkingDelta,
				}
			);
		} else {
			const responseModel = this._planChatResponseModels.get(planId);
			if (responseModel === undefined) {
				return;
			}
			planMaybe.acceptResponseProgress(responseModel, {
				'kind': 'markdownContent',
				content: progress.thinkingDelta,
			});
		}

		// Bring the plan view pane to the view of the user
		this.aideAgentPlanService.anchorPlanViewPane(progress.sessionId, progress.exchangeId);
	}

	/**
	 * Handles progress event which tells us that we are generating a new plan
	 */
	acceptPlanRegeneration(progress: IChatAideAgentPlanRegenerateInformationPart) {
		if (progress.kind !== 'planRegeneration') {
			return;
		}
		const planId = `${progress.sessionId}-${progress.exchangeId}`;
		const runningPlan = this._planChatModels.get(planId);
		if (runningPlan === undefined) {
			return;
		}
		runningPlan.resetResponses();
		CONTEXT_AIDE_PLAN_REVIEW_STATE_SESSIONID.bindTo(this.contextKeyService).set(progress.sessionId);
		CONTEXT_AIDE_PLAN_REVIEW_STATE_EXCHANGEID.bindTo(this.contextKeyService).set(progress.exchangeId);
		runningPlan.dispose();
	}

	/**
	 * Handles IChatPlanStep which has deltas streaming in continously, we have total
	 * control over how to render the plan properly. Of course we can create rich elemnts etc for this
	 * which is all good
	 */
	acceptPlanStepInfo(progress: IChatPlanStep) {
		if (progress.kind !== 'planStep') {
			return;
		}
		// make sure we are tracking this as a plan
		this.aideAgentPlanService.getOrStartPlanSession(progress.sessionId, progress.exchangeId);
		const planId = `${progress.sessionId}-${progress.exchangeId}`;
		let planMaybe = this._planChatModels.get(planId);
		if (planMaybe === undefined) {
			planMaybe = this.aideAgentService.startSessionWithId(ChatAgentLocation.Notebook, CancellationToken.None, planId);
			if (planMaybe === undefined) {
				return;
			}
			this._planChatModels.set(planId, planMaybe);
		}
		// if its still empty.. boy oh boy
		if (planMaybe === undefined) {
			return;
		}

		const currentProgressIndex = progress.index;

		// We do not have enough entries in our session for this... awkward
		if (currentProgressIndex > planMaybe.getExchanges().length - 1) {
			// if there is a previous plan response which is going on, we can safely cancel it over here
			const previousResponseModel = this._planChatResponseModels.get(`${planId}-${planMaybe.getExchanges().length - 1}`);
			if (previousResponseModel) {
				// complete the previous step over here
				previousResponseModel.complete();
			}
			// if this is the first entry we will have a title over here
			const response = planMaybe.addResponse();
			response.planExchangeId = progress.exchangeId;
			response.planSessionId = progress.sessionId;
			this._planChatResponseModels.set(`${planId}-${currentProgressIndex}`, response);
			planMaybe.acceptResponseProgress(response, {
				'kind': 'markdownContent',
				content: new MarkdownString(`## ${progress.title}\n`)
			});
			// do not mark this as complete yet.. we are not done
			return;
		}

		if (currentProgressIndex === planMaybe.getExchanges().length - 1) {
			// extra dumb logic here but esentially what we are going to do is the following
			// update the markdown content for the plan over here
			// we want to get back the response over here so we can send more events to it
			const responseModel = this._planChatResponseModels.get(`${planId}-${currentProgressIndex}`);
			if (progress.descriptionDelta) {
				planMaybe.acceptResponseProgress(responseModel, {
					'kind': 'markdownContent',
					content: progress.descriptionDelta,
				});
				this.detectCodeBlockAndUpdateURI(planMaybe, progress, responseModel);
			}
		}

		// For now we can also make sure that we bring the review pane over here into the view
		// automagically since the plan is getting generated
		this.aideAgentPlanService.anchorPlanViewPane(progress.sessionId, progress.exchangeId);
	}

	detectCodeBlockAndUpdateURI(plan: ChatModel, progress: IChatPlanStep, responseModel: ChatResponseModel | undefined) {
		if (progress.description.value.includes('```') && progress.files.length > 0) {
			plan.acceptResponseProgress(responseModel, {
				'kind': 'codeblockUri',
				uri: progress.files[0],
			});
		}
	}

	/**
	 * We can accept response for progress but mutate the states here in a very weird
	 * way with our response model
	 * We have to make sure that it does end up calling acceptResponseProgress which takes
	 * care of all the updates for us
	 *
	 * We can figure out what kind of events to accept here which is nice but also not fun
	 * log over here if we are reacting to events we do not want to support
	 */
	accepResponseProgressMutable(progress: IChatProgress, quiet?: boolean): void {
		if (progress.kind === 'planInfo') {
			const runningResponseModel = this._mutableExchanges.find((exchange) => {
				return exchange.id === progress.exchangeId;
			});
			if (runningResponseModel === undefined) {
				return;
			}
			this.acceptResponseProgress(runningResponseModel, progress, quiet);
		} else if (progress.kind === 'planEditInfo') {
			const runningResponseModel = this._mutableExchanges.find((exchange) => {
				return exchange.id === progress.exchangeId;
			});
			if (runningResponseModel === undefined) {
				return;
			}
			this.acceptResponseProgress(runningResponseModel, progress, quiet);
		} else {
			console.log(`${progress.kind} not supported for mutable progress`);
		}
	}

	acceptResponseProgress(response: ChatResponseModel | undefined, progress: IChatProgress, quiet?: boolean): void {
		/*
		if (!request.response) {
			request.response = new ChatResponseModel([], this, undefined, undefined, request.id);
		}

		if (request.response.isComplete) {
			throw new Error('acceptResponseProgress: Adding progress to a completed response');
		}
		*/
		// TODO(@ghostwriternr): This will break, because this node is not added to the exchanges.
		if (!response) {
			response = new ChatResponseModel(
				this.aideAgentCodeEditingService,
				this.aideAgentPlanService,
				[], this, undefined, undefined
			);
		}

		if (progress.kind === 'endResponse' && response) {
			this.completeResponse(response);
			return;
		}

		if (progress.kind === 'planRegeneration') {
			response.updateContent(progress, quiet);
			this.acceptPlanRegeneration(progress);
			this._onDidChange.fire(progress);
			return;
		}

		// Instead of doing so much state management over here, we can just send the event
		// over to the viewModel by firing the event over here and letting the onDidChange
		// handlers for the view models (ChatModelView) react to this, they know what to do with this
		if (progress.kind === 'streamingState') {
			this._onDidChange.fire(progress);
			// early return over here
			return;
		}
		// We have a plan edit info, which is a UI event and not a state event
		// we should just update the model state over here for the UI but not
		// make any changes to the environment itself
		if (progress.kind === 'planEditInfo') {
			response.applyPlanEditInfo(progress);
			return;
		}

		// These events are special as they directed towards the side panel
		// as well, so we have to send the right notification over here
		if (progress.kind === 'planStep') {
			this.acceptPlanStepInfo(progress);
			return;
		}

		if (progress.kind === 'thinkingForEdit') {
			this.acceptThinkingForEdit(progress);
			return;
		}

		if (progress.kind === 'markdownContent' ||
			progress.kind === 'treeData' ||
			progress.kind === 'inlineReference' ||
			progress.kind === 'codeblockUri' ||
			progress.kind === 'markdownVuln' ||
			progress.kind === 'progressMessage' ||
			progress.kind === 'command' ||
			progress.kind === 'commandGroup' ||
			progress.kind === 'textEdit' ||
			progress.kind === 'warning' ||
			progress.kind === 'progressTask' ||
			progress.kind === 'confirmation' ||
			progress.kind === 'rollbackCompleted' ||
			progress.kind === 'checkpointAdded'
		) {
			response.updateContent(progress, quiet);
		} else if (progress.kind === 'usedContext' || progress.kind === 'reference') {
			response.applyReference(progress);
		} else if (progress.kind === 'agentDetection') {
			const agent = this.chatAgentService.getAgent(progress.agentId);
			if (agent) {
				response.setAgent(agent, progress.command);
				this._onDidChange.fire({ kind: 'setAgent', agent, command: progress.command });
			}
		} else if (progress.kind === 'codeCitation') {
			response.applyCodeCitation(progress);
		} else if (progress.kind === 'move') {
			this._onDidChange.fire({ kind: 'move', target: progress.uri, range: progress.range });
		} else if (progress.kind === 'codeEdit') {
			response.applyCodeEdit(progress);
			this._onDidChange.fire({ kind: 'codeEdit', edits: progress.edits });
		} else if (progress.kind === 'editsInfo') {
			response.applyEditsInfo(progress);
			this._onDidChange.fire(progress);
		} else if (progress.kind === 'planInfo') {
			response.applyPlanInfo(progress);
			this._onDidChange.fire(progress);
		} else {
			this.logService.error(`Couldn't handle progress: ${JSON.stringify(progress)}`);
		}
	}

	/* TODO(@ghostwriternr): This method was used to remove/resend requests. We can add it back in if we need it.
	removeRequest(id: string, reason: ChatRequestRemovalReason = ChatRequestRemovalReason.Removal): void {
		const index = this._exchanges.findIndex(request => request.id === id);
		const request = this._exchanges[index];

		if (index !== -1) {
			this._onDidChange.fire({ kind: 'removeRequest', requestId: request.id, responseId: request.response?.id, reason });
			this._exchanges.splice(index, 1);
			request.response?.dispose();
		}
	}
	*/

	cancelResponse(response: ChatResponseModel): void {
		if (response) {
			response.cancel();
		}
	}

	/* TODO(@ghostwriternr): This method was used to link a response with a request. We may need this, but I'm assuming the shape will be a bit different?
	setResponse(request: ChatRequestModel, result: IChatAgentResult): void {
		if (!request.response) {
			request.response = new ChatResponseModel([], this, undefined, undefined);
		}

		request.response.setResult(result);
	}
	*/

	completeResponse(response: ChatResponseModel): void {
		if (!response) {
			throw new Error('Call setResponse before completeResponse');
		}

		response.complete();
	}

	handleUserIterationRequest(sessionId: string, exchangeId: string, iterationQuery: string, references: IChatRequestVariableData): void {
		this.chatAgentService.handleUserIterationRequest(sessionId, exchangeId, iterationQuery, references);
	}

	handleUserActionForSession(sessionId: string, exchangeId: string, stepIndex: number | undefined, agentId: string | undefined, accepted: boolean): void {
		this.chatAgentService.handleUserFeedbackForSession(sessionId, exchangeId, stepIndex, agentId, accepted);
		const response = this.addResponse(true);
		// We just display plan info for now
		this.acceptResponseProgress(response, { kind: 'planInfo', sessionId, exchangeId, state: accepted ? ChatPlanState.Accepted : ChatPlanState.Cancelled, isStale: false });
		if (accepted) {
			this.acceptResponseProgress(response, { kind: 'checkpointAdded', sessionId, exchangeId });
		}
		response.complete();
	}

	handleUserCancelActionForSession() {
		const response = this.addResponse(true);
		this.acceptResponseProgress(response,
			{
				kind: 'planInfo',
				sessionId: this.sessionId,
				exchangeId: 'fake-fake', // terrible hack
				state: ChatPlanState.Cancelled,
				isStale: false
			}
		);
		response.complete();
	}

	async handleUserActionUndoSession(sessionId: string, exchangeId: string): Promise<void> {
		const editingSession = this.aideAgentCodeEditingService.getOrStartCodeEditingSession(sessionId);
		await editingSession.rejectForExchange(sessionId, exchangeId);
		this.chatAgentService.handleUserActionUndoSession(sessionId, exchangeId);
		// TODO(ghostwriternr): Do the updates for the UI over here, including changing the responses etc
		const exchangeIndex = this._exchanges.findIndex((exchange) => exchange.id === exchangeId);
		if (exchangeIndex > 0) {
			const { removed } = this.removeExchanges(exchangeIndex + 1);
			// We will respond to this event entirely on the ide layer, but it should probably be triggered by sidecar
			const response = this.addResponse(true);
			this.acceptResponseProgress(response, { kind: 'rollbackCompleted', sessionId, exchangeId, exchangesRemoved: removed.length });
			response.complete();
			// this.acceptResponseProgress(response, { kind: 'endResponse' }); @g-danna can I remove this?
		}
	}

	/* TODO(@ghostwriternr): Honestly, don't care about followups at the moment.
	setFollowups(request: ChatRequestModel, followups: IChatFollowup[] | undefined): void {
		if (!request.response) {
			// Maybe something went wrong?
			return;
		}

		request.response.setFollowups(followups);
	}
	*/

	toExport(): IExportableChatData {
		return {
			requesterUsername: this.requesterUsername,
			requesterAvatarIconUri: this.requesterAvatarIconUri,
			responderUsername: this.responderUsername,
			responderAvatarIconUri: this.responderAvatarIcon,
			initialLocation: this.initialLocation,
			welcomeMessage: this._welcomeMessage?.content.map(c => {
				if (Array.isArray(c)) {
					return c;
				} else {
					return c.value;
				}
			}),
			// TODO(@ghostwriternr): Don't want to deal with this for now.
			requests: [],
			/*
			requests: this._exchanges.map((r): ISerializableChatRequestData => {
				const message = {
					...r.message,
					parts: r.message.parts.map(p => p && 'toJSON' in p ? (p.toJSON as Function)() : p)
				};
				const agent = r.response?.agent;
				const agentJson = agent && 'toJSON' in agent ? (agent.toJSON as Function)() :
					agent ? { ...agent } : undefined;
				return {
					message,
					variableData: r.variableData,
					response: r.response ?
						r.response.response.value.map(item => {
							// Keeping the shape of the persisted data the same for back compat
							if (item.kind === 'treeData') {
								return item.treeData;
							} else if (item.kind === 'markdownContent') {
								return item.content;
							} else {
								return item as any; // TODO
							}
						})
						: undefined,
					result: r.response?.result,
					followups: r.response?.followups,
					isCanceled: r.response?.isCanceled,
					vote: r.response?.vote,
					voteDownReason: r.response?.voteDownReason,
					agent: agentJson,
					slashCommand: r.response?.slashCommand,
					usedContext: r.response?.usedContext,
					contentReferences: r.response?.contentReferences,
					codeCitations: r.response?.codeCitations
				};
			}),
			*/
		};
	}

	toJSON(): ISerializableChatData {
		return {
			version: 3,
			...this.toExport(),
			sessionId: this.sessionId,
			creationDate: this._creationDate,
			isImported: this._isImported,
			lastMessageDate: this._lastMessageDate,
			customTitle: this._customTitle
		};
	}

	override dispose() {
		this._exchanges.forEach(r => r instanceof ChatResponseModel ? r.dispose() : undefined);
		this._onDidDispose.fire();

		super.dispose();
	}
}

export type IChatWelcomeMessageContent = IMarkdownString | IChatFollowup[];

export interface IChatWelcomeMessageModel {
	readonly id: string;
	readonly content: IChatWelcomeMessageContent[];
	readonly sampleQuestions: IChatFollowup[];
	readonly username: string;
	readonly avatarIcon?: URI;
}

export class ChatWelcomeMessageModel implements IChatWelcomeMessageModel {
	private static nextId = 0;

	private _id: string;
	public get id(): string {
		return this._id;
	}

	constructor(
		public readonly content: IChatWelcomeMessageContent[],
		public readonly sampleQuestions: IChatFollowup[],
		@IAideAgentAgentService private readonly chatAgentService: IAideAgentAgentService,
	) {
		this._id = 'welcome_' + ChatWelcomeMessageModel.nextId++;
	}

	public get username(): string {
		return this.chatAgentService.getContributedDefaultAgent(ChatAgentLocation.Panel)?.fullName ?? '';
	}

	public get avatarIcon(): URI | undefined {
		return this.chatAgentService.getDefaultAgent(ChatAgentLocation.Panel)?.metadata.icon;
	}
}

export function updateRanges(variableData: IChatRequestVariableData, diff: number): IChatRequestVariableData {
	return {
		variables: variableData.variables.map(v => ({
			...v,
			range: v.range && {
				start: v.range.start - diff,
				endExclusive: v.range.endExclusive - diff
			}
		}))
	};
}

export function canMergeMarkdownStrings(md1: IMarkdownString, md2: IMarkdownString): boolean {
	if (md1.baseUri && md2.baseUri) {
		const baseUriEquals = md1.baseUri.scheme === md2.baseUri.scheme
			&& md1.baseUri.authority === md2.baseUri.authority
			&& md1.baseUri.path === md2.baseUri.path
			&& md1.baseUri.query === md2.baseUri.query
			&& md1.baseUri.fragment === md2.baseUri.fragment;
		if (!baseUriEquals) {
			return false;
		}
	} else if (md1.baseUri || md2.baseUri) {
		return false;
	}

	return equals(md1.isTrusted, md2.isTrusted) &&
		md1.supportHtml === md2.supportHtml &&
		md1.supportThemeIcons === md2.supportThemeIcons;
}

export function appendMarkdownString(md1: IMarkdownString, md2: IMarkdownString | string): IMarkdownString {
	const appendedValue = typeof md2 === 'string' ? md2 : md2.value;
	return {
		value: md1.value + appendedValue,
		isTrusted: md1.isTrusted,
		supportThemeIcons: md1.supportThemeIcons,
		supportHtml: md1.supportHtml,
		baseUri: md1.baseUri
	};
}

export function getCodeCitationsMessage(citations: ReadonlyArray<IChatCodeCitation>): string {
	if (citations.length === 0) {
		return '';
	}

	const licenseTypes = citations.reduce((set, c) => set.add(c.license), new Set<string>());
	const label = licenseTypes.size === 1 ?
		localize('codeCitation', "Similar code found with 1 license type", licenseTypes.size) :
		localize('codeCitations', "Similar code found with {0} license types", licenseTypes.size);
	return label;
}

function isWorkspaceTextEdit(candidate: IWorkspaceTextEdit | IWorkspaceFileEdit): candidate is IWorkspaceTextEdit {
	return isObject(candidate)
		&& URI.isUri((<IWorkspaceTextEdit>candidate).resource)
		&& isObject((<IWorkspaceTextEdit>candidate).textEdit);
}
