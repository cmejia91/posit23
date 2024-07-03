/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IWidgetCommMessage {
	type: 'comm_msg';
	comm_id: string;
	msg_id: string;
	content: any;
}

export interface IRuntimeCommMessage {
	type: 'comm_msg';
	comm_id: string;
	parent_header: { msg_id: string };
	content: { data: any };
}
