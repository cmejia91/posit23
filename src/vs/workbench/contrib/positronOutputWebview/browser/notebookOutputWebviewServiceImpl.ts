/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, encodeBase64 } from 'vs/base/common/buffer';
// import { FileAccess, Schemas } from 'vs/base/common/network';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
// import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { ICreationRequestMessage } from 'vs/workbench/contrib/notebook/browser/view/renderers/webviewMessages';
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
import { MIME_TYPE_WIDGET_STATE, MIME_TYPE_WIDGET_VIEW, IPyWidgetViewSpec } from 'vs/workbench/services/positronIPyWidgets/common/positronIPyWidgetsService';
import { dirname } from 'vs/base/common/resources';
import { RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { generateUuid } from 'vs/base/common/uuid';

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
		output: ILanguageRuntimeMessageWebOutput
	): Promise<INotebookOutputWebview | undefined> {
		// Check to see if any of the MIME types have a renderer associated with
		// them. If they do, prefer the renderer.
		for (const mimeType of Object.keys(output.data)) {
			// if (mimeType === MIME_TYPE_WIDGET_STATE || mimeType === MIME_TYPE_WIDGET_VIEW) {
			// 	return this.createWidgetHtmlOutput(output.id, runtime, output.data);
			// }

			if (mimeType === 'text/plain') {
				continue;
			}

			// Don't render HTML outputs here; we'll render them as raw HTML below
			if (mimeType === 'text/html') {
				continue;
			}

			const renderer = this._notebookService.getPreferredRenderer(mimeType, 'jupyter-notebook');
			if (renderer) {
				return this.createNotebookRenderOutput(output.id, runtime,
					renderer, mimeType, output);
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
	 * Gets renderer data for a given MIME type. This is used to inject only the
	 * needed renderers into the webview.
	 *
	 * @param mimeType The MIME type to get renderers for
	 * @returns An array of renderers that can render the given MIME type
	 */
	// private getRendererData(mimeType: string): RendererMetadata[] {
	// 	return this._notebookService.getRenderers()
	// 		.filter(renderer => renderer.mimeTypes.includes(mimeType))
	// 		.map((renderer): RendererMetadata => {
	// 			const entrypoint = {
	// 				extends: renderer.entrypoint.extends,
	// 				path: this.asWebviewUri(renderer.entrypoint.path, renderer.extensionLocation).toString()
	// 			};
	// 			return {
	// 				id: renderer.id,
	// 				entrypoint,
	// 				mimeTypes: renderer.mimeTypes,
	// 				messaging: renderer.messaging !== RendererMessagingSpec.Never,
	// 				isBuiltin: renderer.isBuiltin
	// 			};
	// 		});
	// }

	/**
	 * Convert a URI to a webview URI.
	 */
	private asWebviewUri(uri: URI, fromExtension: URI | undefined) {
		return asWebviewUri(uri, fromExtension?.scheme === Schemas.vscodeRemote ? { isRemote: true, authority: fromExtension.authority } : undefined);
	}

	/**
	 * Gets the static preloads for a given extension.
	 */
	// private async getStaticPreloadsData(ext: ExtensionIdentifier):
	// 	Promise<StaticPreloadMetadata[]> {
	// 	const preloads = await this._notebookService.getStaticPreloadsForExt(ext);
	// 	return Array.from(preloads, preload => {
	// 		return {
	// 			entrypoint: this.asWebviewUri(preload.entrypoint, preload.extensionLocation)
	// 				.toString()
	// 				.toString()
	// 		};
	// 	});
	// }

	private async createNotebookRenderOutput(id: string,
		runtime: ILanguageRuntimeSession,
		renderer: INotebookRendererInfo,
		mimeType: string,
		message: ILanguageRuntimeMessageWebOutput
	): Promise<INotebookOutputWebview> {

		const data = message.data[mimeType] as any;

		// Get the renderer's entrypoint and convert it to a webview URI
		const rendererPath = asWebviewUri(renderer.entrypoint.path);

		// Create the preload script contents. This is a simplified version of the
		// preloads script that the notebook renderer API creates.
		const preloadsInfo = [
			...this._notebookService.getStaticPreloads('jupyter-notebook'),
			...await this._notebookService.getStaticPreloadsForExt(renderer.extensionId),
		];
		const preloadsData = Array.from(preloadsInfo).map(preload => {
			return {
				entrypoint: this.asWebviewUri(preload.entrypoint, preload.extensionLocation)
					.toString()
					.toString()
			};
		});
		// const jupyterRenderers = (await this._extensionService.getExtension('ms-toolsai.jupyter-renderers'));
		// if (!jupyterRenderers) {
		// 	throw new Error('Extension not found: ms-toolsai.jupyter-renderers');
		// }
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
			// TODO: Do we need all mime types renderers instead?
			//       Currently that's also returning the jupyter ipywidgets renderer in addition to positron's
			//       and its trying to use that one and failing because we didn't also setup its local resource roots
			[{
				id: renderer.id,
				entrypoint: {
					...renderer.entrypoint,
					path: this.asWebviewUri(renderer.entrypoint.path, renderer.extensionLocation).toString(),
				},
				mimeTypes: renderer.mimeTypes,
				messaging: renderer.messaging !== RendererMessagingSpec.Never,
				isBuiltin: renderer.isBuiltin
			}], // rendererData
			// this.getRendererData(mimeType),
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
					// TODO: Need this?
					// dirname(FileAccess.asFileUri('vs/loader.js')),
					// jupyterRenderers.extensionLocation,
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

		// Encode the data as base64, as either a raw string or JSON object
		const valueBytes = typeof (data) === 'string' ? VSBuffer.fromString(data) :
			VSBuffer.fromString(JSON.stringify(data));
		const rawData = encodeBase64(valueBytes);

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
We did it
<div id='container'></div>
<div id="_defaultColorPalatte"></div>
<!--
<script type="module">
	const vscode = acquireVsCodeApi();
	import { activate } from "${rendererPath.toString()}"

	// A stub implementation of RendererContext
	var ctx = {
		workspace: {
			isTrusted: ${this._workspaceTrustManagementService.isWorkspaceTrusted()}
		}
	}

	// Activate the renderer and create the data object
	var renderer = activate(ctx);
	var utf8bytes = Uint8Array.from(atob('${rawData}'), (m) => m.codePointAt(0));
	var rawData = new TextDecoder().decode(utf8bytes);
	var data = {
		id: '${id}',
		mime: '${mimeType}',
		text: () => { return rawData },
		json: () => { return JSON.parse(rawData) },
		data: () => { return new Uint8Array() /* NYI */ },
		blob: () => { return new Blob(); /* NYI */ },
	};

	const controller = new AbortController();
	const signal = controller.signal;

	// Render the widget when the page is loaded, then post a message to the
	// host letting it know that render is complete.
	window.onload = function() {
		let container = document.getElementById('container');
		console.log(window.requirejs);
		console.log(renderer);
		renderer.renderOutputItem(data, container, signal);
		vscode.postMessage('${RENDER_COMPLETE}');
	};
</script>
-->
<script type="module">${preloads}</script>
</body>
`);

		// TODO: Continue here... New issue: I think the 'dimension' message is coming here.
		//       But we haven't hooked up the webview yet...
		//       Think we might want to rethink when we send the render message to give our services
		//       time to hook up their own messaging...

		// TODO: Should this be inside the notebook output webview?
		// TODO: Need transfer?
		// const transfer = [valueBytes.buffer];
		const transfer: ArrayBuffer[] = [];
		// TODO: Could make cellId a constant?...
		const cellId = generateUuid();
		const webviewMessage: ICreationRequestMessage = {
			type: 'html',
			content: {
				type: RenderOutputType.Extension,
				outputId: id,
				// TODO: Need metadata?
				metadata: {},
				output: {
					mime: mimeType,
					valueBytes: valueBytes.buffer,
				},
				// TODO: Get from message
				allOutputs: [],
			},
			cellId,
			outputId: id,
			cellTop: 0,
			outputOffset: 0,
			left: 0,
			requiredPreloads: [],
			createOnIdle: true,
		};
		webview.postMessage(webviewMessage, transfer);

		return new NotebookOutputWebview(id, cellId, runtime.runtimeMetadata.runtimeId, webview);
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
		// TODO: Should this use an even simpler webview class?
		return new NotebookOutputWebview(id, '', runtime.runtimeMetadata.runtimeId, webview);
	}

	/**
	 * Renders widget HTML in a webview.
	 *
	 * @param id The ID of the notebook output
	 * @param runtime The runtime that emitted the output
	 * @param data A set of records containing the widget state and view mimetype data
	 *
	 * @returns A promise that resolves to the new webview.
	 */
	async createWidgetHtmlOutput(id: string,
		runtime: ILanguageRuntimeSession,
		data: Record<string, string>):
		Promise<INotebookOutputWebview> {
		const managerState = data[MIME_TYPE_WIDGET_STATE];
		const widgetViews = JSON.parse(data[MIME_TYPE_WIDGET_VIEW]) as IPyWidgetViewSpec[];

		// load positron-python extension, which has modules needed to load ipywidgets
		const pythonExtension = await this._extensionService.getExtension('ms-python.python');
		if (!pythonExtension) {
			return Promise.reject(`positron-python not found`);
		}
		// Form the path to the necessary libraries and inject it into the HTML
		const requiresPath = asWebviewUri(
			URI.joinPath(pythonExtension.extensionLocation, 'resources/js/requirejs/require.js'));

		const htmlManagerPath = asWebviewUri(
			URI.joinPath(pythonExtension.extensionLocation, 'resources/js/@jupyter-widgets/html-manager/dist/embed-amd.js'));

		let additionalScripts = '';
		const usesJupyterMatplotlib = managerState.includes('"model_module":"jupyter-matplotlib"');

		if (usesJupyterMatplotlib) {
			const jupyterMatplotlibPath = asWebviewUri(
				URI.joinPath(pythonExtension.extensionLocation, 'resources/js/jupyter-matplotlib/dist/index.js'));
			additionalScripts += `<script src='${jupyterMatplotlibPath}'></script>`;
		}

		// Create the metadata for the webview
		const webviewInitInfo: WebviewInitInfo = {
			contentOptions: {
				allowScripts: true,
				localResourceRoots: [pythonExtension.extensionLocation]
			},
			extension: {
				id: runtime.runtimeMetadata.extensionId
			},
			options: {},
			title: '', // TODO: should this be a parameter?
		};
		const webview = this._webviewService.createWebviewOverlay(webviewInitInfo);

		const createWidgetDiv = (widgetView: IPyWidgetViewSpec) => {
			const model_id = widgetView.model_id;
			const viewString = JSON.stringify(widgetView);
			return (`
<div id="widget-${model_id}">
	<script type="${MIME_TYPE_WIDGET_VIEW}">
		${viewString}
	</script>
</div>`
			);
		};
		const widgetDivs = widgetViews.map(view => createWidgetDiv(view)).join('\n');

		webview.setHtml(`
<html>
<head>

<!-- Load RequireJS, used by the IPywidgets for dependency management -->
<script src='${requiresPath}'></script>

<!-- Load the HTML manager, which is used to render the widgets -->
<script src='${htmlManagerPath}'></script>

<!-- Load additional dependencies that may be required by the widget type -->
<!-- If these are not included, they will just be loaded from CDN -->
${additionalScripts}

<!-- The state of all the widget models on the page -->
<script type="${MIME_TYPE_WIDGET_STATE}">
${managerState}
</script>
</head>

<body>
	<!-- The view specs of the primary widget models only -->
	${widgetDivs}
</body>
<script>
	const vscode = acquireVsCodeApi();
	window.onload = function() {
		vscode.postMessage('${RENDER_COMPLETE}');
};
</script>
</html>
		`);
		return new NotebookOutputWebview(id, '', runtime.runtimeMetadata.runtimeId, webview);
	}
}
