/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ActivationFunction } from 'vscode-notebook-renderer';

// TODO: Need these?
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fortawesome/fontawesome-free/css/v4-shims.min.css';

import '@lumino/widgets/style/index.css';
import '@jupyter-widgets/base/css/index.css';
import '@jupyter-widgets/controls/css/widgets.css'; // This imports labvariables and widgets-base

// window.addEventListener('load', () => {
// 	// TODO: Is there a better way for us to control what gets rendered than passing via HTML?
// 	//  Can we directly use the data from the display message?
// 	manager.loadFromKernel().then(async () => {
// 		const element = document.documentElement;
// 		const tags = element.querySelectorAll(
// 			'script[type="application/vnd.jupyter.widget-view+json"]'
// 		);
// 		await Promise.all(
// 			Array.from(tags).map(async (viewtag) => {
// 				const widgetViewObject = JSON.parse(viewtag.innerHTML);
// 				// TODO: Validate view?
// 				// const valid = view_validate(widgetViewObject);
// 				// if (!valid) {
// 				// 	throw new Error(`View state has errors: ${view_validate.errors}`);
// 				// }
// 				const model_id: string = widgetViewObject.model_id;
// 				const model = await manager.get_model(model_id);
// 				if (model !== undefined && viewtag.parentElement !== null) {
// 					const prev = viewtag.previousElementSibling;
// 					if (
// 						prev &&
// 						prev.tagName === 'img' &&
// 						prev.classList.contains('jupyter-widget')
// 					) {
// 						viewtag.parentElement.removeChild(prev);
// 					}
// 					const widgetTag = document.createElement('div');
// 					widgetTag.className = 'widget-subarea';
// 					viewtag.parentElement.insertBefore(widgetTag, viewtag);
// 					const view = await manager.create_view(model);
// 					manager.display_view(view, widgetTag);
// 				}
// 			})
// 		);
// 		this.context.postMessage!({ type: 'render_complete' });
// 	}).catch((error) => {
// 		console.error('Error rendering widgets:', error);
// 	});
// });

// window.addEventListener('message', (event) => {
// 	const message = event.data;
// 	if (message?.type === 'comm_info_reply') {
// 		// TODO: error handling?
// 		manager.onCommInfoReply(message);
// 	} else if (message?.type === 'comm_msg') {
// 		const comm = comms.get(message.comm_id);
// 		if (!comm) {
// 			throw new Error(`Comm not found ${message.comm_id}`);
// 		}
// 		// TODO: Don't need the type or comm_id in this.
// 		comm.handle_msg(message);
// 	} else if (message?.type === 'comm_close') {
// 		const comm = comms.get(message.comm_id);
// 		if (!comm) {
// 			throw new Error(`Comm not found ${message.comm_id}`);
// 		}
// 		comm.handle_close(message);
// 	} else {
// 		console.info('Unhandled message in webview', message);
// 	}
// });

export const activate: ActivationFunction = async (context) => {
	console.log('Activating positron-ipywidgets renderer...', context);

	// TODO: Comment...
	const manager = await new Promise<any>((resolve) => {
		const interval = setInterval(() => {
			console.log('Renderer is checking for manager...');
			const manager = (window as any).positronIPyWidgetManager;
			if (manager) {
				clearInterval(interval);
				resolve(manager);
			}
		}, 100);
	});

	return {
		async renderOutputItem(outputItem, element, signal) {
			console.log('Rendering output item...', outputItem, element, signal);

			const view = outputItem.json();
			console.log('View:', view);

			// TODO: Do we need to get _all_ widget state on render?
			//       Should this happen in the preload?
			await manager.loadFromKernel();

			const model = await manager.get_model(view.model_id);
			// TODO: Raise an error if undefined?
			if (model !== undefined) {
				const view = await manager.create_view(model);
				manager.display_view(view, element);
			}
		},
	};
};
