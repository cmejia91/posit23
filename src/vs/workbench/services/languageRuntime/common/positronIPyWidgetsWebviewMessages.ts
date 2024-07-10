/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// TODO: Put these things under a namespace?

// TODO: refactor to 'init' or something
export interface IAppendStylesheet {
	type: 'append_stylesheet';
	href: string;
}

// export interface ICommMessageFromWebview {
// 	type: 'comm_msg';
// 	comm_id: string;
// 	// TODO: use 'unknown'?
// 	data: any;
// 	// TODO: Do we need msg_id here?
// 	msg_id?: string;
// }

export interface ICommClose {
	type: 'comm_close';
	comm_id: string;
}

export interface ICommMessage {
	type: 'comm_msg';
	comm_id: string;
	data: any;
	msg_id?: string;
}

export interface ICommOpen {
	type: 'comm_open';
	comm_id: string;
	target_name: string;
	data?: any;
	metadata?: any;
}

export type IIPyWidgetsMessage = IAppendStylesheet |
	ICommClose |
	ICommMessage |
	ICommOpen |
	IReady;

export interface ICommCloseFromWebview {
	type: 'comm_close';
	comm_id: string;
}

export interface ICommMessageFromWebview {
	type: 'comm_msg';
	comm_id: string;
	msg_id: string;
	data: unknown;
}

export interface ICommOpenFromWebview {
	type: 'comm_open';
	comm_id: string;
	target_name: string;
	data: unknown;
	metadata: unknown;
}

export interface IReady {
	type: 'ready';
}

export type FromWebviewMessage = ICommClose |
	ICommMessageFromWebview |
	ICommOpenFromWebview |
	IReady;

export type ToWebviewMessage = {};
