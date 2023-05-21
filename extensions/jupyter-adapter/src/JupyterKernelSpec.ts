/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/**
 * Represents a registered Jupyter Kernel.
 */
export interface JupyterKernelSpec {
	/** The kernel's path */
	path: string;

	/** Command used to start the kernel and an array of command line arguments */
	argv: Array<string>;

	/** The kernel's display name */
	display_name: string;  // eslint-disable-line

	/** The language the kernel executes */
	language: string;

	/** Interrupt mode (signal or message) */
	interrupt_mode?: string; // eslint-disable-line

	/** Environment variables to set when starting the kernel */
	env?: { [key: string]: string };
}
