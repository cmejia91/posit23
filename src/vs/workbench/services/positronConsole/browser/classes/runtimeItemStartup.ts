/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { ANSIOutput, ANSIOutputLine } from 'vs/base/common/ansiOutput';
import { RuntimeItem } from 'vs/workbench/services/positronConsole/browser/classes/runtimeItem';

/**
 * RuntimeItemStartup class.
 */
export class RuntimeItemStartup extends RuntimeItem {
	//#region Public Properties

	/**
	 * Gets the output lines.
	 */
	readonly outputLines: readonly ANSIOutputLine[];

	//#endregion Public Properties

	//#region Constructor

	/**
	 * Constructor.
	 * @param id The identifier.
	 * @param banner The banner.
	 * @param implementationVersion The implementation version.
	 * @param languageVersion The language version.
	 */
	constructor(
		id: string,
		banner: string,
		readonly implementationVersion: string,
		readonly languageVersion: string
	) {
		// Call the base class's constructor.
		super(id);

		// Process the banner directly into ANSI output lines suitable for rendering.
		this.outputLines = ANSIOutput.processOutput(banner);
	}

	//#endregion Constructor
}
