/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as positron from 'positron';
import * as vscode from 'vscode';
import { CancellationToken, LanguageClient, Position, Range, RequestType, VersionedTextDocumentIdentifier } from 'vscode-languageclient/node';

interface StatementRangeParams {
	textDocument: VersionedTextDocumentIdentifier;
	position: Position;
}

interface StatementRangeResponse {
	range: Range;
	code?: string;
}

export namespace StatementRangeRequest {
	export const type: RequestType<StatementRangeParams, StatementRangeResponse | undefined, any> = new RequestType('positron/textDocument/statementRange');
}

/**
 * A StatementRangeProvider implementation for R
 */
export class RStatementRangeProvider implements positron.StatementRangeProvider {

	/** The language client instance */
	private readonly _client: LanguageClient;

	constructor(
		readonly client: LanguageClient,
	) {
		this._client = client;
	}

	async provideStatementRange(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken): Promise<positron.StatementRange | undefined> {

		const params: StatementRangeParams = {
			textDocument: this._client.code2ProtocolConverter.asVersionedTextDocumentIdentifier(document),
			position: this._client.code2ProtocolConverter.asPosition(position)
		};

		const response = this._client.sendRequest(StatementRangeRequest.type, params, token);

		return response.then(data => {
			if (!data) {
				return undefined;
			}
			const range = this._client.protocol2CodeConverter.asRange(data.range);
			// Explicitly normalize non-strings to `undefined` (i.e. a possible `null`)
			const code = typeof data.code === 'string' ? data.code : undefined;
			return { range: range, code: code } as positron.StatementRange;
		});
	}
}
