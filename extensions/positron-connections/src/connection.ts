/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as positron from 'positron';
import path = require('path');

/**
 * Base class for connection items.
 */
export class ConnectionItem {
	/**
	 * Create a new ConnectionItem instance
	 *
	 * @param name The name of the item
	 * @param client A reference to the client instance (comm) that owns the
	 *   item
	 */
	constructor(
		readonly name: string,
		readonly client: positron.RuntimeClientInstance) {
	}
}

/**
 * A connection item representing a node in the tree objects allowed in
 * the database connection.
 *
 * @param kind The kind of the node (e.g. 'schema', 'table', etc.)
 * @param path The path to the node. This is represented as a list of tuples (name, type). Later,
 *   we can use the path to get the node children by doing something like
 * 	 `getChildren(schema='hello', table='world')`
 */
export class ConnectionItemNode extends ConnectionItem {
	readonly kind: string;
	readonly path: Array<{ name: string; kind: string }>;
	constructor(readonly name: string, kind: string, path: Array<{ name: string; kind: string }>, client: positron.RuntimeClientInstance) {
		super(name, client);
		this.kind = kind;
		this.path = path;
	}
}

/**
 * A connection item representing a database connection (top-level)
 */
export class ConnectionItemDatabase extends ConnectionItemNode {
	constructor(readonly name: string, readonly client: positron.RuntimeClientInstance) {
		super(name, 'database', [], client);
	}

	close() {
		this.client.dispose();
	}
}

/**
 * A connection item representing a table in a database
 */
export class ConnectionItemTable extends ConnectionItemNode {
	/**
	 * Preview the table's contents
	 */
	preview() {
		this.client.performRpc({ msg_type: 'preview_table', table: this.name, path: this.path });
	}
}

/**
 * A connection item representing a field in a table
 */
export class ConnectionItemField extends ConnectionItem {
	constructor(readonly name: string, readonly dtype: string, readonly client: positron.RuntimeClientInstance) {
		super(name, client);
		this.dtype = dtype;
	}
}

/**
 * Provides connection items to the Connections treeview.
 */
export class ConnectionItemsProvider implements vscode.TreeDataProvider<ConnectionItem> {

	// Fires when the tree data is changed. We fire this when a new connection
	// is created.
	private _onDidChangeTreeData: vscode.EventEmitter<ConnectionItem | undefined> =
		new vscode.EventEmitter<ConnectionItem | undefined>();

	// The list of active connections
	private _connections: ConnectionItem[] = [];

	/**
	 * Create a new ConnectionItemsProvider instance
	 *
	 * @param context The extension context
	 */
	constructor(readonly context: vscode.ExtensionContext) {
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
	}

	onDidChangeTreeData: vscode.Event<ConnectionItem | undefined> | undefined;

	/**
	 * Constructs a visual representation (TreeItem) from a ConnectionItem.
	 *
	 * @param item The item to get the tree item for
	 * @returns A TreeItem for the item
	 */
	getTreeItem(item: ConnectionItem): vscode.TreeItem {
		// Both databases and tables can be expanded.
		const collapsibleState = item instanceof ConnectionItemNode;

		// Create the tree item.
		const treeItem = new vscode.TreeItem(item.name,
			collapsibleState ?
				vscode.TreeItemCollapsibleState.Collapsed :
				vscode.TreeItemCollapsibleState.None);

		if (item instanceof ConnectionItemTable) {
			// Set the icon for tables
			treeItem.iconPath = vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'table.svg'));
			treeItem.contextValue = 'table';
		} else if (item instanceof ConnectionItemNode) {
			// Set the icon for databases
			treeItem.iconPath = vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'database.svg'));
		} else if (item instanceof ConnectionItemField) {
			// Set the icon for fields
			treeItem.iconPath = vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'field.svg'));
			treeItem.description = '<' + item.dtype + '>';
		}

		if (item instanceof ConnectionItemDatabase) {
			// adding the contextValue allows the TreView API to attach specific commands
			// to databases
			treeItem.contextValue = 'database';
		}

		return treeItem;
	}

	/**
	 * Adds a connection to the pane.
	 *
	 * @param client The client instance that owns the connection
	 * @param name The name of the connection
	 */
	addConnection(client: positron.RuntimeClientInstance, name: string) {
		// Add the connection to the list
		this._connections.push(new ConnectionItemDatabase(name, client));

		// Fire the event to indicate that the tree data has changed. This will
		// trigger a refresh.
		this._onDidChangeTreeData.fire(undefined);

		// Add an event listener to the client so that we can remove the
		// connection when it closes.
		client.onDidChangeClientState((state: positron.RuntimeClientState) => {
			if (state === positron.RuntimeClientState.Closed) {
				// Get the ID and discard the connection matching the ID
				const clientId = client.getClientId();
				this._connections = this._connections.filter((connection) => {
					return connection.client.getClientId() !== clientId;
				});
				this._onDidChangeTreeData.fire(undefined);
			}
		});

		// Add an event listener that tells the backend that the connection is
		// getting closed.
		// We need this because the CommMsg::Close event is not sent to the channel
		// that handles the connection.
		client.onDidChangeClientState((state: positron.RuntimeClientState) => {
			if (state === positron.RuntimeClientState.Closing) {
				client.performRpc({ msg_type: 'disconnect', name: name });
			}
		});
	}

	/**
	 * Gets the children of an element.
	 *
	 * @param element The element to get the children for
	 * @returns The children of the element
	 */
	getChildren(element?: ConnectionItem): Thenable<ConnectionItem[]> {
		// Fields don't have children
		if (element instanceof ConnectionItemField) {
			return Promise.resolve([]);
		}

		if (element) {
			return new Promise((resolve, _reject) => {
				if (element instanceof ConnectionItemTable) {
					element.client.performRpc({ msg_type: 'fields_request', table: element.name, path: element.path }).then(
						(response: any) => {
							const fields = response.fields as Array<{ name: string; dtype: string }>;
							const fieldItems = fields.map((field) => {
								return new ConnectionItemField(field.name, field.dtype, element.client);
							});
							resolve(fieldItems);
						}
					);
				} else if (element instanceof ConnectionItemNode) {
					element.client.performRpc({ msg_type: 'tables_request', name: element.name, kind: element.kind, path: element.path }).then(
						(response: any) => {
							const objects = response.tables as Array<{ name: string; kind: string }>;
							const objectItems = objects.map((obj) => {
								const path = [...element.path, { name: obj.name, kind: obj.kind }];
								if (obj.kind === 'table') {
									return new ConnectionItemTable(obj.name, obj.kind, path, element.client);
								} else {
									return new ConnectionItemNode(obj.name, obj.kind, path, element.client);
								}
							});
							resolve(objectItems);
						}
					);
				}
			});
		} else {
			// At the root, return the top-level connections
			return Promise.resolve(this._connections);
		}
	}
}
