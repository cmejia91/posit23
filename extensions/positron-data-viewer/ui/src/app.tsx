/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as ReactDOM from 'react-dom';
import * as React from 'react';

import { DataPanel } from './DataPanel';
import { DataViewerMessage, DataViewerMessageData, DataViewerMessageReady, DataViewerMessageType } from '../../src/positron-data-viewer';

// This global is injected by VS Code when the extension is loaded.
//
// @ts-ignore
const vscode = acquireVsCodeApi();

// Let the extension know that we're ready to receive data.
const msg: DataViewerMessageReady = {
	msg_type: DataViewerMessageType.Ready
};
vscode.postMessage(msg);

// Listen for messages from the extension.
window.addEventListener('message', (event: any) => {
	// Presume that the message compiles with the DataViewerMessage interface.
	const message = event.data as DataViewerMessage;

	if (message.msg_type === DataViewerMessageType.Data) {
		const dataMessage = message as DataViewerMessageData;
		ReactDOM.render(
			<DataPanel data={dataMessage.data} />,
			document.getElementById('root')
		);
	} else {
		console.error(`Unknown message type: ${message.msg_type}`);
	}
});
