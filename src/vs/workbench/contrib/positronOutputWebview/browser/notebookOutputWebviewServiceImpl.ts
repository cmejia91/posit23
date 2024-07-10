/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { IPositronSimpleRenderMessage } from 'vs/workbench/contrib/notebook/browser/view/renderers/webviewMessages';
import { preloadsScriptStr } from 'vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads';
import { INotebookRendererInfo, RendererMessagingSpec } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { NotebookOutputWebview, RENDER_COMPLETE } from 'vs/workbench/contrib/positronOutputWebview/browser/notebookOutputWebview';
import { INotebookOutputWebview, IPositronNotebookOutputWebviewService } from 'vs/workbench/contrib/positronOutputWebview/browser/notebookOutputWebviewService';
import { IWebviewService, WebviewInitInfo } from 'vs/workbench/contrib/webview/browser/webview';
import { asWebviewUri } from 'vs/workbench/contrib/webview/common/webview';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ILanguageRuntimeMessageWebOutput } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { ILanguageRuntimeSession } from 'vs/workbench/services/runtimeSession/common/runtimeSessionService';
import { dirname } from 'vs/base/common/resources';

export class PositronNotebookOutputWebviewService implements IPositronNotebookOutputWebviewService {

	// Required for dependency injection
	readonly _serviceBrand: undefined;

	constructor(
		@IWebviewService private readonly _webviewService: IWebviewService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IExtensionService private readonly _extensionService: IExtensionService,
	) {
	}


	async createNotebookOutputWebview(
		runtime: ILanguageRuntimeSession,
		output: ILanguageRuntimeMessageWebOutput,
		viewType?: string,
	): Promise<INotebookOutputWebview | undefined> {
		// Check to see if any of the MIME types have a renderer associated with
		// them. If they do, prefer the renderer.
		for (const mimeType of Object.keys(output.data)) {
			if (mimeType === 'text/plain') {
				continue;
			}

			// Don't render HTML outputs here; we'll render them as raw HTML below
			if (mimeType === 'text/html') {
				continue;
			}

			const renderer = this._notebookService.getPreferredRenderer(mimeType, viewType);
			if (renderer) {
				return this.createNotebookRenderOutput(output.id, runtime,
					renderer, mimeType, output, viewType);
			}
		}

		// If no dedicated renderer is found, check to see if there is a raw
		// HTML representation of the output.
		for (const mimeType of Object.keys(output.data)) {
			if (mimeType === 'text/html') {
				return this.createRawHtmlOutput(output.id, runtime, output.data[mimeType]);
			}
		}

		// No renderer found
		return Promise.resolve(undefined);
	}

	/**
	 * Convert a URI to a webview URI.
	 */
	private asWebviewUri(uri: URI, fromExtension: URI | undefined) {
		return asWebviewUri(uri, fromExtension?.scheme === Schemas.vscodeRemote ? { isRemote: true, authority: fromExtension.authority } : undefined);
	}

	private async createNotebookRenderOutput(id: string,
		runtime: ILanguageRuntimeSession,
		renderer: INotebookRendererInfo,
		mimeType: string,
		message: ILanguageRuntimeMessageWebOutput,
		viewType?: string,
	): Promise<INotebookOutputWebview> {

		const data = message.data[mimeType] as any;

		// Format renderer info for the preload script generator.
		const renderersData = [{
			id: renderer.id,
			entrypoint: {
				...renderer.entrypoint,
				path: this.asWebviewUri(renderer.entrypoint.path, renderer.extensionLocation).toString(),
			},
			mimeTypes: renderer.mimeTypes,
			messaging: renderer.messaging !== RendererMessagingSpec.Never,
			isBuiltin: renderer.isBuiltin
		}];

		// Get the required preloads for the renderer.
		const preloadsInfo = await this._notebookService.getStaticPreloadsForExt(renderer.extensionId);

		// TODO(seem): This is a hack to support IPyWidgets.
		//             If the view type is 'jupyter-notebook', we manually find the specific preload
		//             that includes RequireJS and jQuery, using its extension ID and entrypoint.
		//             We don't want to also bundle those in our own preload since both will load
		//             in an actual notebook webview.
		//             We should find a better way to handle this.
		if (viewType === 'jupyter-notebook') {
			// Get the Jupyter renderers extension.
			const jupyterRenderers = await this._extensionService.getExtension('ms-toolsai.jupyter-renderers');
			if (!jupyterRenderers) {
				throw new Error('ms-toolsai.jupyter-renderers extension not found');
			}

			// Get the Jupyter renderers extension's preloads.
			const jupyterNotebookPreloadsInfo = await this._notebookService.getStaticPreloadsForExt(jupyterRenderers.identifier);

			// Find the preload that bundles RequireJS and jQuery.
			const requireJsAndJQueryPreloadInfo = jupyterNotebookPreloadsInfo.find(
				preload => preload.entrypoint.fsPath.endsWith('client_renderer/preload.js'));

			if (!requireJsAndJQueryPreloadInfo) {
				throw new Error('RequireJS and jQuery preload info not found');
			}

			// Add the RequireJS and JQuery preload.
			preloadsInfo.push(requireJsAndJQueryPreloadInfo);
		}

		// Format preloads for the preload script generator.
		const preloadsData = Array.from(preloadsInfo).map(preload => {
			return {
				entrypoint: this.asWebviewUri(preload.entrypoint, preload.extensionLocation)
					.toString()
					.toString()
			};
		});

		// Create the preload script contents. This is a simplified version of the
		// preloads script that the notebook renderer API creates.
		const preloads = preloadsScriptStr({
			// PreloadStyles
			outputNodeLeftPadding: 0,
			outputNodePadding: 0,
			tokenizationCss: '',
		}, {
			// PreloadOptions
			dragAndDropEnabled: false
		}, {
			lineLimit: 1000,
			outputScrolling: true,
			outputWordWrap: false,
			linkifyFilePaths: false,
			minimalError: false,
		},
			renderersData,
			preloadsData,
			this._workspaceTrustManagementService.isWorkspaceTrusted(),
			id);

		// Get auxiliary resource roots from the runtime service and convert
		// them to webview URIs
		const resourceRoots = new Array<URI>();
		if (message.resource_roots) {
			for (const root of message.resource_roots) {
				resourceRoots.push(URI.revive(root));
			}
		}

		// Create the metadata for the webview
		const webviewInitInfo: WebviewInitInfo = {
			contentOptions: {
				allowScripts: true,
				// Needed since we use the API ourselves, and it's also used by
				// preload scripts
				allowMultipleAPIAcquire: true,
				localResourceRoots: [
					// Ensure that the renderer can load local resources from
					// the extension that provides it
					renderer.extensionLocation,
					...preloadsInfo.map(preload => dirname(preload.entrypoint)),
					...resourceRoots
				],
			},
			extension: {
				id: renderer.extensionId,
			},
			options: {},
			title: '',
		};

		// Create the webview itself
		const webview = this._webviewService.createWebviewOverlay(webviewInitInfo);

		// Form the HTML to send to the webview. Currently, this is a very simplified version
		// of the HTML that the notebook renderer API creates, but it works for many renderers.
		//
		// Some features known to be NYI:
		// - Message passing between the renderer and the host (RenderContext)
		// - Extending another renderer (RenderContext)
		// - State management (RenderContext)
		// - Raw Uint8Array data and blobs

		webview.setHtml(`
<head>
	<style nonce="${id}">
		#_defaultColorPalatte {
			color: var(--vscode-editor-findMatchHighlightBackground);
			background-color: var(--vscode-editor-findMatchBackground);
		}
	</style>
</head>
<body>
<div id='container'></div>
<div id="_defaultColorPalatte"></div>
<script type="module">${preloads}</script>
</body>
`);

		// TODO: Docs
		const valueBytes = typeof (data) === 'string' ? VSBuffer.fromString(data) :
			VSBuffer.fromString(JSON.stringify(data));
		// TODO: Need transfer?
		// const transfer = [valueBytes.buffer];
		const transfer: ArrayBuffer[] = [];
		const webviewMessage: IPositronSimpleRenderMessage = {
			type: 'positronRender',
			outputId: id,
			elementId: 'container',
			rendererId: renderer.id,
			mimeType,
			metadata: message.metadata,
			valueBytes: valueBytes.buffer,
		};
		webview.postMessage(webviewMessage, transfer);

		return new NotebookOutputWebview(id, runtime.runtimeMetadata.runtimeId, webview);
	}

	/**
	 * Renders raw HTML in a webview.
	 *
	 * @param id The ID of the notebook output
	 * @param runtime The runtime that emitted the output
	 * @param html The HTML to render
	 *
	 * @returns A promise that resolves to the new webview.
	 */
	async createRawHtmlOutput(id: string, runtime: ILanguageRuntimeSession, html: string):
		Promise<INotebookOutputWebview> {

		// Load the Jupyter extension. Many notebook HTML outputs have a dependency on jQuery,
		// which is provided by the Jupyter extension.
		const jupyterExtension = await this._extensionService.getExtension('ms-toolsai.jupyter');
		if (!jupyterExtension) {
			return Promise.reject(`Jupyter extension 'ms-toolsai.jupyter' not found`);
		}

		// Create the metadata for the webview
		const webviewInitInfo: WebviewInitInfo = {
			contentOptions: {
				allowScripts: true,
				localResourceRoots: [jupyterExtension.extensionLocation]
			},
			extension: {
				id: runtime.runtimeMetadata.extensionId
			},
			options: {},
			title: '',
		};
		const webview = this._webviewService.createWebviewOverlay(webviewInitInfo);

		// Form the path to the jQuery library and inject it into the HTML
		const jQueryPath = asWebviewUri(
			jupyterExtension.extensionLocation.with({
				path: jupyterExtension.extensionLocation.path +
					'/out/node_modules/jquery/dist/jquery.min.js'
			}));

		webview.setHtml(`
<script src='${jQueryPath}'></script>
${html}
<script>
const vscode = acquireVsCodeApi();
window.onload = function() {
	vscode.postMessage('${RENDER_COMPLETE}');
};
</script>`);
		// TODO: Should this use an even simpler webview class here?
		return new NotebookOutputWebview(id, runtime.runtimeMetadata.runtimeId, webview);
	}

}
