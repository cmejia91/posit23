/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { ILanguageRuntimeMessageError, ILanguageRuntimeMessageEvent, ILanguageRuntimeInfo, ILanguageRuntimeMetadata, ILanguageRuntimeMessageOutput, ILanguageRuntimeMessagePrompt, ILanguageRuntimeMessageState, RuntimeClientType, RuntimeCodeExecutionMode, RuntimeCodeFragmentStatus, RuntimeErrorBehavior, RuntimeState, ILanguageRuntimeMessageInput, ILanguageRuntimeMessageCommData, ILanguageRuntimeMessageCommClosed, ILanguageRuntimeMessageStream, ILanguageRuntimeMessageCommOpen } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { IPreviewPaneItemOptions } from 'vs/workbench/services/positronPreview/common/positronPreview';
import { createProxyIdentifier, IRPCProtocol } from 'vs/workbench/services/extensions/common/proxyIdentifier';

// This is the interface that the main process exposes to the extension host
export interface MainThreadLanguageRuntimeShape extends IDisposable {
	$registerLanguageRuntime(handle: number, metadata: ILanguageRuntimeMetadata): void;
	$unregisterLanguageRuntime(handle: number): void;
	$emitLanguageRuntimeState(handle: number, state: RuntimeState): void;
	$emitRuntimeClientOpened(handle: number, message: ILanguageRuntimeMessageCommOpen): void;
	$emitRuntimeClientMessage(handle: number, message: ILanguageRuntimeMessageCommData): void;
	$emitRuntimeClientClosed(handle: number, message: ILanguageRuntimeMessageCommClosed): void;

	$emitLanguageRuntimeMessageOutput(handle: number, message: ILanguageRuntimeMessageOutput): void;
	$emitLanguageRuntimeMessageStream(handle: number, message: ILanguageRuntimeMessageStream): void;
	$emitLanguageRuntimeMessageInput(handle: number, message: ILanguageRuntimeMessageInput): void;
	$emitLanguageRuntimeMessageError(handle: number, message: ILanguageRuntimeMessageError): void;
	$emitLanguageRuntimeMessagePrompt(handle: number, message: ILanguageRuntimeMessagePrompt): void;
	$emitLanguageRuntimeMessageState(handle: number, message: ILanguageRuntimeMessageState): void;
	$emitLanguageRuntimeMessageEvent(handle: number, message: ILanguageRuntimeMessageEvent): void;
}

export interface MainThreadPreviewPaneShape extends IDisposable {
	$createPreviewPaneItem(handle: number, options: IPreviewPaneItemOptions): void;
	$sendMessageToPreviewPane(handle: number, message: Object): void;
}

// The interface to the main thread exposed by the extension host
export interface ExtHostLanguageRuntimeShape {
	$startLanguageRuntime(handle: number): Promise<ILanguageRuntimeInfo>;
	$executeCode(handle: number, code: string, id: string, mode: RuntimeCodeExecutionMode, errorBehavior: RuntimeErrorBehavior): void;
	$isCodeFragmentComplete(handle: number, code: string): Promise<RuntimeCodeFragmentStatus>;
	$createClient(handle: number, id: string, type: RuntimeClientType, params: any): Promise<void>;
	$listClients(handle: number, type?: RuntimeClientType): Promise<Record<string, string>>;
	$removeClient(handle: number, id: string): void;
	$sendClientMessage(handle: number, client_id: string, message_id: string, message: any): void;
	$replyToPrompt(handle: number, id: string, response: string): void;
	$interruptLanguageRuntime(handle: number): Promise<void>;
	$restartLanguageRuntime(handle: number): Promise<void>;
	$shutdownLanguageRuntime(handle: number): Promise<void>;
}

export interface ExtHostPreviewPaneShape {
	$emitMessageFromPreviewPane(handle: number, message: Object): void;
}

export interface IMainPositronContext extends IRPCProtocol {
}

export const ExtHostPositronContext = {
	ExtHostLanguageRuntime: createProxyIdentifier<ExtHostLanguageRuntimeShape>('ExtHostLanguageRuntime'),
	ExtHostPreviewPane: createProxyIdentifier<ExtHostPreviewPaneShape>('ExtHostPreviewPane'),
};

export const MainPositronContext = {
	MainThreadLanguageRuntime: createProxyIdentifier<MainThreadLanguageRuntimeShape>('MainThreadLanguageRuntime'),
	MainThreadPreviewPane: createProxyIdentifier<MainThreadPreviewPaneShape>('MainThreadPreviewPane'),
};
