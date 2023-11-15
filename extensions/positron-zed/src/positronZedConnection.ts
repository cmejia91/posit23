/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { randomUUID } from 'crypto';

/**
 * A ZedConnection instance; simulates a real database connection.
 */
export class ZedConnection {
	// The unique ID for this connection (randomly generated)
	public readonly id;

	/**
	 * Emitter that handles outgoing messages to the front end
	 */
	private readonly _onDidEmitData = new vscode.EventEmitter<object>();
	onDidEmitData: vscode.Event<object> = this._onDidEmitData.event;

	constructor(readonly name: string) {
		this.id = randomUUID();
	}

	/**
	 * Handles an incoming message from the Positron front end
	 *
	 * @param message The message to handle
	 */
	public handleMessage(message: any) {
		switch (message.msg_type) {

			// A request to list the tables
			case 'tables_request':
				// Emit the data to the front end
				this._onDidEmitData.fire({
					msg_type: 'tables_response',
					tables: [
						'table1',
						'table2',
						'table3'
					]
				});
				break;

			// A request to list the fields in a table
			case 'fields_request':
				// Emit the data to the front end
				this._onDidEmitData.fire({
					msg_type: 'fields_response',
					fields: [
						'field1',
						'field2',
						'field3'
					]
				});
				break;
		}
	}
}
