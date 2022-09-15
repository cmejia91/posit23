/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as errors from 'vs/base/common/errors';
import * as performance from 'vs/base/common/performance';
import { URI } from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { MainContext, MainThreadConsoleShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtensionHostInitData } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { RPCProtocol } from 'vs/workbench/services/extensions/common/rpcProtocol';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { getSingletonServiceDescriptors } from 'vs/platform/instantiation/common/extensions';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService, ExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IURITransformerService, URITransformerService } from 'vs/workbench/api/common/extHostUriTransformerService';
import { IExtHostExtensionService, IHostUtils } from 'vs/workbench/api/common/extHostExtensionService';

export interface IExitFn {
	(code?: number): any;
}

export interface IConsolePatchFn {
	(mainThreadConsole: MainThreadConsoleShape): any;
}

export class ExtensionHostMain {

	private readonly _hostUtils: IHostUtils;
	private readonly _rpcProtocol: RPCProtocol;
	private readonly _extensionService: IExtHostExtensionService;
	private readonly _logService: ILogService;

	constructor(
		protocol: IMessagePassingProtocol,
		initData: IExtensionHostInitData,
		hostUtils: IHostUtils,
		uriTransformer: IURITransformer | null,
		messagePorts?: ReadonlyMap<string, MessagePort>
	) {
		this._hostUtils = hostUtils;
		this._rpcProtocol = new RPCProtocol(protocol, null, uriTransformer);

		// ensure URIs are transformed and revived
		initData = ExtensionHostMain._transform(initData, this._rpcProtocol);

		// bootstrap services
		const services = new ServiceCollection(...getSingletonServiceDescriptors());
		services.set(IExtHostInitDataService, { _serviceBrand: undefined, ...initData, messagePorts });
		services.set(IExtHostRpcService, new ExtHostRpcService(this._rpcProtocol));
		services.set(IURITransformerService, new URITransformerService(uriTransformer));
		services.set(IHostUtils, hostUtils);

		const instaService: IInstantiationService = new InstantiationService(services, true);

		// ugly self - inject
		this._logService = instaService.invokeFunction(accessor => accessor.get(ILogService));

		performance.mark(`code/extHost/didCreateServices`);
		if (this._hostUtils.pid) {
			this._logService.info(`Extension host with pid ${this._hostUtils.pid} started`);
		} else {
			this._logService.info(`Extension host started`);
		}
		this._logService.trace('initData', initData);

		// ugly self - inject
		// must call initialize *after* creating the extension service
		// because `initialize` itself creates instances that depend on it
		this._extensionService = instaService.invokeFunction(accessor => accessor.get(IExtHostExtensionService));
		this._extensionService.initialize();

		// error forwarding and stack trace scanning
		Error.stackTraceLimit = 100; // increase number of stack frames (from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)
		const extensionErrors = new WeakMap<Error, IExtensionDescription | undefined>();
		this._extensionService.getExtensionPathIndex().then(map => {
			(<any>Error).prepareStackTrace = (error: Error, stackTrace: errors.V8CallSite[]) => {
				let stackTraceMessage = '';
				let extension: IExtensionDescription | undefined;
				let fileName: string;
				for (const call of stackTrace) {
					stackTraceMessage += `\n\tat ${call.toString()}`;
					fileName = call.getFileName();
					if (!extension && fileName) {
						extension = map.findSubstr(URI.file(fileName));
					}

				}
				extensionErrors.set(error, extension);
				return `${error.name || 'Error'}: ${error.message || ''}${stackTraceMessage}`;
			};
		});

		const mainThreadExtensions = this._rpcProtocol.getProxy(MainContext.MainThreadExtensionService);
		const mainThreadErrors = this._rpcProtocol.getProxy(MainContext.MainThreadErrors);
		errors.setUnexpectedErrorHandler(err => {
			const data = errors.transformErrorForSerialization(err);
			const extension = extensionErrors.get(err);
			if (extension) {
				mainThreadExtensions.$onExtensionRuntimeError(extension.identifier, data);
			} else {
				mainThreadErrors.$onUnexpectedError(data);
			}
		});
	}

	async asBrowserUri(uri: URI): Promise<URI> {
		const mainThreadExtensionsProxy = this._rpcProtocol.getProxy(MainContext.MainThreadExtensionService);
		return URI.revive(await mainThreadExtensionsProxy.$asBrowserUri(uri));
	}

	terminate(reason: string): void {
		this._extensionService.terminate(reason);
	}

	private static _transform(initData: IExtensionHostInitData, rpcProtocol: RPCProtocol): IExtensionHostInitData {
		initData.allExtensions.forEach((ext) => {
			(<any>ext).extensionLocation = URI.revive(rpcProtocol.transformIncomingURIs(ext.extensionLocation));
			const browserNlsBundleUris: { [language: string]: URI } = {};
			if (ext.browserNlsBundleUris) {
				Object.keys(ext.browserNlsBundleUris).forEach(lang => browserNlsBundleUris[lang] = URI.revive(rpcProtocol.transformIncomingURIs(ext.browserNlsBundleUris![lang])));
				(<any>ext).browserNlsBundleUris = browserNlsBundleUris;
			}
		});
		initData.environment.appRoot = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.appRoot));
		const extDevLocs = initData.environment.extensionDevelopmentLocationURI;
		if (extDevLocs) {
			initData.environment.extensionDevelopmentLocationURI = extDevLocs.map(url => URI.revive(rpcProtocol.transformIncomingURIs(url)));
		}
		initData.environment.extensionTestsLocationURI = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.extensionTestsLocationURI));
		initData.environment.globalStorageHome = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.globalStorageHome));
		initData.environment.workspaceStorageHome = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.workspaceStorageHome));
		initData.nlsBaseUrl = URI.revive(rpcProtocol.transformIncomingURIs(initData.nlsBaseUrl));
		initData.logsLocation = URI.revive(rpcProtocol.transformIncomingURIs(initData.logsLocation));
		initData.logFile = URI.revive(rpcProtocol.transformIncomingURIs(initData.logFile));
		initData.workspace = rpcProtocol.transformIncomingURIs(initData.workspace);
		return initData;
	}
}
