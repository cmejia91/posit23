/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostLanguageRuntime } from 'vs/workbench/api/common/positron/extHostLanguageRuntime';
import type * as positron from 'positron';
import type * as vscode from 'vscode';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionRegistries } from 'vs/workbench/api/common/extHost.api.impl';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostConfigProvider } from 'vs/workbench/api/common/extHostConfiguration';
import { ExtHostPositronContext } from 'vs/workbench/api/common/positron/extHost.positron.protocol';
import * as extHostTypes from 'vs/workbench/api/common/positron/extHostTypes.positron';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { ExtHostPreviewPanels } from 'vs/workbench/api/common/positron/extHostPreviewPanels';

/**
 * Factory interface for creating an instance of the Positron API.
 */
export interface IExtensionPositronApiFactory {
	(extension: IExtensionDescription, extensionInfo: IExtensionRegistries, configProvider: ExtHostConfigProvider): typeof positron;
}

/**
 * This method instantiates and returns the extension API surface for Positron;
 * it mirrors IExtensionApiFactory for VS Code.
 */
export function createPositronApiFactoryAndRegisterActors(accessor: ServicesAccessor): IExtensionPositronApiFactory {
	const rpcProtocol = accessor.get(IExtHostRpcService);
	const initData = accessor.get(IExtHostInitDataService);
	const extHostLanguageRuntime = rpcProtocol.set(ExtHostPositronContext.ExtHostLanguageRuntime, new ExtHostLanguageRuntime(rpcProtocol));
	const extHostPreviewPanels = rpcProtocol.set(ExtHostPositronContext.ExtHostPreviewPanels, new ExtHostPreviewPanels(rpcProtocol));

	return function (extension: IExtensionDescription, extensionInfo: IExtensionRegistries, configProvider: ExtHostConfigProvider): typeof positron {

		// --- Start Positron ---
		const runtime: typeof positron.runtime = {
			executeCode(langaugeId, code, focus): Thenable<boolean> {
				return extHostLanguageRuntime.executeCode(langaugeId, code, focus);
			},
			registerLanguageRuntime(runtime: positron.LanguageRuntime): vscode.Disposable {
				return extHostLanguageRuntime.registerLanguageRuntime(runtime);
			},
			registerClientHandler(handler: positron.RuntimeClientHandler): vscode.Disposable {
				return extHostLanguageRuntime.registerClientHandler(handler);
			}
		};

		const window: typeof positron.window = {
			createPreviewPanel(viewType: string, title: string, preserveFocus?: boolean, options?: vscode.WebviewPanelOptions & vscode.WebviewOptions) {
				return extHostPreviewPanels.createPreviewPanel(extension, viewType, title, preserveFocus, options);
			}
		};
		// --- End Positron ---

		return <typeof positron>{
			version: initData.positronVersion,
			runtime,
			window,
			RuntimeClientType: extHostTypes.RuntimeClientType,
			RuntimeClientState: extHostTypes.RuntimeClientState,
			LanguageRuntimeMessageType: extHostTypes.LanguageRuntimeMessageType,
			LanguageRuntimeStreamName: extHostTypes.LanguageRuntimeStreamName,
			RuntimeCodeExecutionMode: extHostTypes.RuntimeCodeExecutionMode,
			RuntimeErrorBehavior: extHostTypes.RuntimeErrorBehavior,
			LanguageRuntimeStartupBehavior: extHostTypes.LanguageRuntimeStartupBehavior,
			RuntimeOnlineState: extHostTypes.RuntimeOnlineState,
			RuntimeState: extHostTypes.RuntimeState,
			RuntimeCodeFragmentStatus: extHostTypes.RuntimeCodeFragmentStatus,
		};
	};
}
