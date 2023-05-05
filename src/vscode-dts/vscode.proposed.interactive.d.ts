/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface InteractiveEditorSlashCommand {
		command: string;
		detail?: string;
		refer?: boolean;
		// kind: CompletionItemKind;
	}

	// todo@API make classes
	export interface InteractiveEditorSession {
		placeholder?: string;
		slashCommands?: InteractiveEditorSlashCommand[];
		wholeRange?: Range;
	}

	// todo@API make classes
	export interface InteractiveEditorRequest {
		session: InteractiveEditorSession;
		prompt: string;

		selection: Selection;
		wholeRange: Range;
	}

	// todo@API make classes
	export interface InteractiveEditorResponse {
		edits: TextEdit[] | WorkspaceEdit;
		placeholder?: string;
		wholeRange?: Range;
	}

	// todo@API make classes
	export interface InteractiveEditorMessageResponse {
		contents: MarkdownString;
		placeholder?: string;
		wholeRange?: Range;
	}

	export enum InteractiveEditorResponseFeedbackKind {
		Unhelpful = 0,
		Helpful = 1,
		Undone = 2
	}

	export interface TextDocumentContext {
		document: TextDocument;
		selection: Selection;
		action?: string;
	}

	export interface InteractiveEditorSessionProvider<S extends InteractiveEditorSession = InteractiveEditorSession, R extends InteractiveEditorResponse | InteractiveEditorMessageResponse = InteractiveEditorResponse | InteractiveEditorMessageResponse> {
		// Create a session. The lifetime of this session is the duration of the editing session with the input mode widget.
		prepareInteractiveEditorSession(context: TextDocumentContext, token: CancellationToken): ProviderResult<S>;

		provideInteractiveEditorResponse(request: InteractiveEditorRequest, token: CancellationToken): ProviderResult<R>;

		// eslint-disable-next-line local/vscode-dts-provider-naming
		releaseInteractiveEditorSession?(session: S): any;

		// todo@API use enum instead of boolean
		// eslint-disable-next-line local/vscode-dts-provider-naming
		handleInteractiveEditorResponseFeedback?(session: S, response: R, kind: InteractiveEditorResponseFeedbackKind): void;
	}


	export interface InteractiveSessionState { }

	export interface InteractiveSessionParticipantInformation {
		name: string;

		/**
		 * A full URI for the icon of the participant.
		 */
		icon?: Uri;
	}

	export interface InteractiveSession {
		requester: InteractiveSessionParticipantInformation;
		responder: InteractiveSessionParticipantInformation;
		inputPlaceholder?: string;

		saveState?(): InteractiveSessionState;
	}

	export interface InteractiveSessionRequestArgs {
		command: string;
		args: any;
	}

	export interface InteractiveRequest {
		session: InteractiveSession;
		message: string | InteractiveSessionReplyFollowup;
	}

	export interface InteractiveResponseErrorDetails {
		message: string;
		responseIsIncomplete?: boolean;
		responseIsFiltered?: boolean;
	}

	export interface InteractiveResponseForProgress {
		errorDetails?: InteractiveResponseErrorDetails;
	}

	export interface InteractiveProgressContent {
		content: string;
	}

	export interface InteractiveProgressId {
		responseId: string;
	}

	export type InteractiveProgress = InteractiveProgressContent | InteractiveProgressId;

	export interface InteractiveResponseCommand {
		commandId: string;
		args?: any[];
		title: string; // supports codicon strings
	}

	export interface InteractiveSessionSlashCommand {
		command: string;
		kind: CompletionItemKind;
		detail?: string;
	}

	export interface InteractiveSessionReplyFollowup {
		message: string;
		tooltip?: string;
		title?: string;

		// Extensions can put any serializable data here, such as an ID/version
		metadata?: any;
	}

	export type InteractiveSessionFollowup = InteractiveSessionReplyFollowup | InteractiveResponseCommand;

	export type InteractiveWelcomeMessageContent = string | InteractiveSessionReplyFollowup[];

	export interface InteractiveSessionProvider<S extends InteractiveSession = InteractiveSession> {
		provideWelcomeMessage?(token: CancellationToken): ProviderResult<InteractiveWelcomeMessageContent[]>;
		provideFollowups?(session: S, token: CancellationToken): ProviderResult<(string | InteractiveSessionFollowup)[]>;
		provideSlashCommands?(session: S, token: CancellationToken): ProviderResult<InteractiveSessionSlashCommand[]>;

		prepareSession(initialState: InteractiveSessionState | undefined, token: CancellationToken): ProviderResult<S>;
		resolveRequest(session: S, context: InteractiveSessionRequestArgs | string, token: CancellationToken): ProviderResult<InteractiveRequest>;
		provideResponseWithProgress(request: InteractiveRequest, progress: Progress<InteractiveProgress>, token: CancellationToken): ProviderResult<InteractiveResponseForProgress>;
	}

	export enum InteractiveSessionVoteDirection {
		Up = 1,
		Down = 2
	}

	export interface InteractiveSessionVoteAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'vote';
		responseId: string;
		direction: InteractiveSessionVoteDirection;
	}

	export enum InteractiveSessionCopyKind {
		// Keyboard shortcut or context menu
		Action = 1,
		Toolbar = 2
	}

	export interface InteractiveSessionCopyAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'copy';
		responseId: string;
		codeBlockIndex: number;
		copyType: InteractiveSessionCopyKind;
		copiedCharacters: number;
		totalCharacters: number;
		copiedText: string;
	}

	export interface InteractiveSessionInsertAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'insert';
		responseId: string;
		codeBlockIndex: number;
		totalCharacters: number;
		newFile?: boolean;
	}

	export interface InteractiveSessionTerminalAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'runInTerminal';
		responseId: string;
		codeBlockIndex: number;
		languageId?: string;
	}

	export interface InteractiveSessionCommandAction {
		// eslint-disable-next-line local/vscode-dts-string-type-literals
		kind: 'command';
		command: InteractiveResponseCommand;
	}

	export type InteractiveSessionUserAction = InteractiveSessionVoteAction | InteractiveSessionCopyAction | InteractiveSessionInsertAction | InteractiveSessionTerminalAction | InteractiveSessionCommandAction;

	export interface InteractiveSessionUserActionEvent {
		action: InteractiveSessionUserAction;
		providerId: string;
	}

	export interface InteractiveSessionDynamicRequest {
		/**
		 * The message that will be displayed in the UI
		 */
		message: string;

		/**
		 * Any extra metadata/context that will go to the provider.
		 * NOTE not actually used yet.
		 */
		metadata?: any;
	}

	export namespace interactive {
		// current version of the proposal.
		export const _version: 1 | number;

		export function registerInteractiveSessionProvider(id: string, provider: InteractiveSessionProvider): Disposable;
		export function addInteractiveRequest(context: InteractiveSessionRequestArgs): void;

		export function sendInteractiveRequestToProvider(providerId: string, message: InteractiveSessionDynamicRequest): void;

		export function registerInteractiveEditorSessionProvider(provider: InteractiveEditorSessionProvider): Disposable;

		export const onDidPerformUserAction: Event<InteractiveSessionUserActionEvent>;
	}
}
