/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// External libraries.
import * as React from 'react';
import { createRoot } from 'react-dom/client';

// External modules.
import * as ReactQuery from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Local modules.
import { DataPanel } from './DataPanel';

// External types.
import { DataViewerMessage, DataViewerMessageRowRequest, DataViewerMessageRowResponse } from './positron-data-viewer';

// This global is injected by VS Code when the extension is loaded.
//
// @ts-ignore
const vscode = acquireVsCodeApi();
const fetchSize = 500;

// Let the extension know that we're ready to receive the initial data.
const msg: DataViewerMessageRowRequest = {
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
		const dataMessage = message as DataViewerMessageRowResponse;
		const queryClient = new ReactQuery.QueryClient();
		const container = document.getElementById('root');
		const root = createRoot(container!);
		root.render(

				<ReactQuery.QueryClientProvider client={queryClient}>
					<DataPanel initialData={dataMessage.data} fetchSize={fetchSize} vscode={vscode} />
					<ReactQueryDevtools initialIsOpen={false} />
				</ReactQuery.QueryClientProvider>

		);
	} // Other message types are handled in the DataPanel component after app initialization.
});
