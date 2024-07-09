/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IAppendStylesheet {
	type: 'append_stylesheet';
	href: string;
}

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

export interface IReady {
	type: 'ready';
}

export type IIPyWidgetsMessage = IAppendStylesheet |
	ICommClose |
	ICommMessage |
	ICommOpen |
	IReady;

export interface Disposable {
	dispose(): void;
}

export interface VSCodeEvent<T> {
	(listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
}

export interface IIPyWidgetsMessaging {
	onDidReceiveMessage: VSCodeEvent<IIPyWidgetsMessage>;
	postMessage(message: IIPyWidgetsMessage): void;
}
