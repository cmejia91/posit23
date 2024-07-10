/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

//
// Messages from the webview.
//

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

export type FromWebviewMessage = ICommCloseFromWebview |
	ICommMessageFromWebview |
	ICommOpenFromWebview |
	IReady;

//
// Messages to the webview.
//

// TODO: refactor to 'init' or something
export interface IAppendStylesheet {
	type: 'append_stylesheet';
	href: string;
}

export interface ICommCloseToWebview {
	type: 'comm_close';
	comm_id: string;
}

export interface ICommMessageToWebview {
	type: 'comm_msg';
	comm_id: string;
	data: unknown;
	/** If this is an RPC response, the ID of the RPC request message. */
	request_msg_id?: string;
}

export interface ICommOpenToWebview {
	type: 'comm_open';
	comm_id: string;
	target_name: string;
	data: unknown;
	metadata: unknown;
}

export type ToWebviewMessage = IAppendStylesheet |
	ICommCloseToWebview |
	ICommMessageToWebview |
	ICommOpenToWebview;
