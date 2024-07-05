/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IAppendStylesheetMessage {
	type: 'append_stylesheet';
	href: string;
}

export interface IRuntimeCommClose {
	type: 'comm_close';
	content: { comm_id: string };
}

export interface IRuntimeCommMessage {
	type: 'comm_msg';
	comm_id: string;
	parent_header?: { msg_id: string };
	// TODO: Put this somewhere else?
	msg_id?: string;
	content: { data: any, method?: string };
}

export interface IRuntimeCommOpen {
	type: 'comm_open';
	comm_id: string;
	target_name: string;
	content: any;
	metadata: any;
}

export type IIPyWidgetsMessage = IAppendStylesheetMessage |
	IRuntimeCommClose |
	IRuntimeCommMessage |
	IRuntimeCommOpen;

export type IRuntimeMessage = IRuntimeCommMessage | IAppendStylesheetMessage;

export interface Disposable {
	dispose(): void;
}

export interface VSCodeEvent<T> {
	(listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
}

export interface IIPyWidgetsMessaging {
	onDidReceiveMessage: VSCodeEvent<IIPyWidgetsMessage>;
	postMessage(message: IIPyWidgetsMessage | IAppendStylesheetMessage): void;
}
