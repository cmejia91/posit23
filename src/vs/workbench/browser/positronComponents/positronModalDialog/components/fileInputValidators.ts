/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import { isValidBasename } from 'vs/base/common/extpath';
import { OS, OperatingSystem } from 'vs/base/common/platform';
import { localize } from 'vs/nls';

interface PathValidatorOptions {
	// Whether to forbid absolute paths. Defaults to false.
	noAbsolutePaths?: boolean;
}

// This is adapted from the `validateFileName` function in `vs/workbench/contrib/files/browser/fileActions.ts`.
// Returns an error message if the path is invalid, otherwise returns undefined.
export function checkIfPathValid(path: string | number, opts: PathValidatorOptions = {}): string | undefined {
	path = path.toString();

	// A series of simple checks we can do without calling out to file service.
	// This is to avoid unnecessary calls to the file service which may slow things down.
	if (path === '') {
		// Dont show an error message if the path is empty. This is just the equivalent to the `.`
		// path.
		return undefined;
	}

	// Relative paths only
	if (opts.noAbsolutePaths && (path[0] === '/' || path[0] === '\\')) {
		return localize('fileNameStartsWithSlashError', "A file or folder name cannot start with a slash.");
	}

	if (path.length > 256) {
		return localize('fileNameTooLongError', "File path is too long, must be under 256 characters.");
	}

	// Check for invalid file names
	// TODO: This may need to be changed to work with remote file systems with `remoteAgentService.getEnvironment()`
	const isWindows = OS === OperatingSystem.Windows;
	if (!isValidBasename(path, isWindows)) {
		// Make the path cleaner for display
		let sanitizedPath = path.replace(/\*/g, '\\*'); // CodeQL [SM02383] This only processes filenames which are enforced against having backslashes in them farther up in the stack.
		if (sanitizedPath.length > 256) {
			sanitizedPath = `${sanitizedPath.substr(0, 255)}...`;
		}

		return localize('invalidFileNameError', "The name **{0}** is not valid as a file or folder name. Please choose a different name.", sanitizedPath);
	}

	// Check for whitespace
	if (/^\s|\s$/.test(path)) {
		return localize('fileNameWhitespaceWarning', "Leading or trailing whitespace detected in file or folder name.");
	}

	return undefined;
}
