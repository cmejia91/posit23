/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/


import { Code } from './code';

interface InterpreterGroupLocation {
	description: string;
	index: number;
}


const INTERPRETER_SELECTOR = '.top-action-bar-interpreters-manager .left';
const POSITRON_MODAL_POPUP = '.positron-modal-popup';

const INTERPRETER_GROUPS = '.positron-modal-popup .interpreter-groups .interpreter-group';
const PRIMARY_INTERPRETER_GROUP_NAMES = `${INTERPRETER_GROUPS} .primary-interpreter .line:nth-of-type(1)`;
const SECONDARY_INTERPRETER_GROUP_NAMES = `${INTERPRETER_GROUPS} .secondary-interpreter .line:nth-of-type(1)`;
const SECONDARY_INTERPRETER = `${INTERPRETER_GROUPS} .secondary-interpreter`;
const INTERPRETER_ACTION_BUTTON = '.primary-interpreter .interpreter-actions .action-button span';

export class StartInterpreter {

	constructor(private code: Code) { }

	async selectInterpreter(desiredInterpreterType: string, desiredPython: string) {

		await this.code.waitAndClick(INTERPRETER_SELECTOR);
		await this.code.waitForElement(POSITRON_MODAL_POPUP);

		const primaryPython = await this.awaitDesiredPrimaryInterpreterGroupLoaded(desiredInterpreterType);
		console.log(`Found primary python ${primaryPython.description} at index ${primaryPython.index}`);

		const primaryIsMatch = primaryPython.description.includes(desiredPython);
		if (!primaryIsMatch) {

			const secondaryInterpreters = await this.getSecondaryInterpreters(primaryPython.index);
			console.log('Secondary Interpreters:');
			secondaryInterpreters.forEach(interpreter => console.log(interpreter.description));

			for (const secondaryInterpreter of secondaryInterpreters) {
				if (secondaryInterpreter.description.includes(desiredPython)) {
					await this.code.waitAndClick(`${SECONDARY_INTERPRETER}:nth-of-type(${secondaryInterpreter.index})`);
					break;
				}
			}

		} else {
			console.log('Primary Python interpreter matched');
			await this.code.waitAndClick(INTERPRETER_GROUPS, primaryPython.index);
		}
	}

	private async awaitDesiredPrimaryInterpreterGroupLoaded(interpreterNamePrefix: string): Promise<InterpreterGroupLocation> {

		let iterations = 0;
		while (iterations < 10) {

			const interpreters = await this.code.getElements(PRIMARY_INTERPRETER_GROUP_NAMES, false);

			const loadedInterpreters: string[] = [];
			interpreters?.forEach((interpreter) => { loadedInterpreters.push(interpreter.textContent); });

			let found: string = '';
			let groupIndex = 0;
			for (const loadedInterpreter of loadedInterpreters) {
				groupIndex++;
				if (loadedInterpreter.startsWith(interpreterNamePrefix)) {
					found = loadedInterpreter;
					break;
				}
			}

			if (found) {
				return { description: found, index: groupIndex };
			} else {
				iterations++;
				console.log(`Waiting for ${interpreterNamePrefix} to load, try ${iterations}`);
				await this.code.driver.wait(3000);
			}
		}
		return { description: '', index: -1 };

	}

	private async getSecondaryInterpreters(primaryGroupIndex: number): Promise<InterpreterGroupLocation[]> {

		const subSelector = `${INTERPRETER_GROUPS}:nth-of-type(${primaryGroupIndex}) ${INTERPRETER_ACTION_BUTTON}`;
		await this.code.waitAndClick(subSelector);

		const secondaryInterpreters = await this.code.getElements(SECONDARY_INTERPRETER_GROUP_NAMES, false);

		const loadedInterpreters: string[] = [];
		secondaryInterpreters?.forEach((interpreter) => { loadedInterpreters.push(interpreter.textContent); });

		const groups: InterpreterGroupLocation[] = [];
		let secondaryGroupIndex = 0;
		for (const interpreter of loadedInterpreters) {
			secondaryGroupIndex++;
			groups.push({ description: interpreter, index: secondaryGroupIndex });
		}
		return groups;

	}
}
