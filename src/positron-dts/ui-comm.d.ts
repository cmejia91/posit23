/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

//
// Copied from src/vs/workbench/services/languageRuntime/common/positronUiComm.ts; do not edit.
//

/**
 * Editor metadata
 */
export interface EditorContextResult {
	/**
	 * Document metadata
	 */
	document: TextDocument;

	/**
	 * Document contents
	 */
	contents: Array<string>;

	/**
	 * The primary selection, i.e. selections[0]
	 */
	selection: Selection;

	/**
	 * The selections in this text editor.
	 */
	selections: Array<Selection>;

}

/**
 * Document metadata
 */
export interface TextDocument {
	/**
	 * URI of the resource viewed in the editor
	 */
	path: string;

	/**
	 * End of line sequence
	 */
	eol: string;

	/**
	 * Whether the document has been closed
	 */
	isClosed: boolean;

	/**
	 * Whether the document has been modified
	 */
	isDirty: boolean;

	/**
	 * Whether the document is untitled
	 */
	isUntitled: boolean;

	/**
	 * Language identifier
	 */
	languageId: string;

	/**
	 * Number of lines in the document
	 */
	lineCount: number;

	/**
	 * Version number of the document
	 */
	version: number;

}

/**
 * A line and character position, such as the position of the cursor.
 */
export interface Position {
	/**
	 * The zero-based character value, as a Unicode code point offset.
	 */
	character: number;

	/**
	 * The zero-based line value.
	 */
	line: number;

}

/**
 * Selection metadata
 */
export interface Selection {
	/**
	 * Position of the cursor.
	 */
	active: Position;

	/**
	 * Start position of the selection
	 */
	start: Position;

	/**
	 * End position of the selection
	 */
	end: Position;

	/**
	 * Text of the selection
	 */
	text: string;

}
