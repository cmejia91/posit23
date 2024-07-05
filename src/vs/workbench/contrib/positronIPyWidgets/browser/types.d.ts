/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';

export interface IWidgetCommMessage {
	type: 'comm_msg';
	comm_id: string;
	msg_id: string;
	content: any;
}

export interface IRuntimeCommMessage {
	type: 'comm_msg';
	comm_id: string;
	parent_header?: { msg_id: string };
	// TODO: Put this somewhere else?
	msg_id?: string;
	content: { data: any, method?: string };
}

export interface IAppendStylesheetMessage {
	type: 'append_stylesheet';
	href: string;
}

export interface IRuntimeCommOpen {
	type: 'comm_open';
	comm_id: string;
	target_name: string;
	content: any;
	metadata: any;
}

export type IIPyWidgetsMessage = IRuntimeCommMessage | IRuntimeCommOpen;

export interface IIPyWidgetsMessaging {
	onDidReceiveMessage: Event<IIPyWidgetsMessage>;
	postMessage(message: IIPyWidgetsMessage | IAppendStylesheetMessage): void;
}
