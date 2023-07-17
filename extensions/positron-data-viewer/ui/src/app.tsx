/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// External libraries.
import * as ReactDOM from 'react-dom';
import * as React from 'react';

// External modules.
import * as ReactQuery from '@tanstack/react-query';

// Local modules.
import { DataPanel } from './DataPanel';

// External types.
import { DataViewerMessage, DataViewerMessageData, DataViewerMessageRequest } from './positron-data-viewer';

// This global is injected by VS Code when the extension is loaded.
//
// @ts-ignore
const vscode = acquireVsCodeApi();
const fetchSize = 10;

// Let the extension know that we're ready to receive the initial data.
const msg: DataViewerMessageRequest = {
	msg_type: 'ready',
	start_row: 0,
	fetch_size: fetchSize
};
vscode.postMessage(msg);

// Listen for messages from the extension.
window.addEventListener('message', (event: any) => {
	// Presume that the message compiles with the DataViewerMessage interface.
	const message = event.data as DataViewerMessage;

	if (message.msg_type === 'initial_data') {
		const dataMessage = message as DataViewerMessageData;
		console.log(`DATA: Row ${dataMessage.start_row} Col 0 starts with ${dataMessage.data.columns[0].data[0]}`);

		const queryClient = new ReactQuery.QueryClient();
		ReactDOM.render(
			<React.StrictMode>
				<ReactQuery.QueryClientProvider client={queryClient}>
					<DataPanel data={dataMessage.data} fetchSize={fetchSize} vscode={vscode} />
				</ReactQuery.QueryClientProvider>
			</React.StrictMode>,
			document.getElementById('root')
		);
	}
});
