/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/


import { Code } from '../code';

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

export enum InterpreterType {
	Python = 'Python',
	R = 'R'
}

/*
 *  Reuseable Positron interpreter selection functionality for tests to leverage.
 */
export class StartInterpreter {

	constructor(private code: Code) { }

	async selectInterpreter(desiredInterpreterType: InterpreterType, desiredInterpreterString: string) {

		await this.code.waitAndClick(INTERPRETER_SELECTOR);
		await this.code.waitForElement(POSITRON_MODAL_POPUP);

		const primaryInterpreter = await this.awaitDesiredPrimaryInterpreterGroupLoaded(desiredInterpreterType);
		this.code.logger.log(`Found primary interpreter ${primaryInterpreter.description} at index ${primaryInterpreter.index}`);

		const primaryIsMatch = primaryInterpreter.description.includes(desiredInterpreterString);
		let chosenInterpreter;
		if (!primaryIsMatch) {

			const secondaryInterpreters = await this.getSecondaryInterpreters(primaryInterpreter.index);
			this.code.logger.log('Secondary Interpreters:');
			secondaryInterpreters.forEach(interpreter => this.code.logger.log(interpreter.description));

			for (const secondaryInterpreter of secondaryInterpreters) {
				if (secondaryInterpreter.description.includes(desiredInterpreterString)) {
					chosenInterpreter = this.code.driver.getLocator(`${SECONDARY_INTERPRETER}:nth-of-type(${secondaryInterpreter.index})`);

					await chosenInterpreter.scrollIntoViewIfNeeded();
					await chosenInterpreter.isVisible();

					await chosenInterpreter.click();
					break;
				}
			}

		} else {
			this.code.logger.log('Primary interpreter matched');
			chosenInterpreter = this.code.driver.getLocator(`${INTERPRETER_GROUPS}:nth-of-type(${primaryInterpreter.index})`);
			await chosenInterpreter.waitFor({ state: 'visible' });
			await chosenInterpreter.click();
		}

		for (let i = 0; i < 10; i++) {
			try {
				const dialog = this.code.driver.getLocator(POSITRON_MODAL_POPUP);
				await dialog.waitFor({ state: 'detached', timeout: 2000 });
				break;
			} catch (e) {
				this.code.logger.log(`Error: ${e}, Retrying row click`);
				try {
					await chosenInterpreter!.click({ timeout: 1000 });
				} catch (f) {
					this.code.logger.log(`Inner Error: ${f}}`);
				}
			}
		}
	}

	private async awaitDesiredPrimaryInterpreterGroupLoaded(interpreterNamePrefix: string): Promise<InterpreterGroupLocation> {

		let iterations = 0;
		while (iterations < 30) {

			const interpreters = await this.code.getElements(PRIMARY_INTERPRETER_GROUP_NAMES, false);

			const loadedInterpreters: string[] = [];
			interpreters?.forEach((interpreter) => {
				loadedInterpreters.push(interpreter.textContent);
			});

			let found: string = '';
			let groupIndex = 0;
			for (const loadedInterpreter of loadedInterpreters) {
				groupIndex++;
				this.code.logger.log(`Found interpreter: ${loadedInterpreter}`);
				if (loadedInterpreter.startsWith(interpreterNamePrefix)) {
					found = loadedInterpreter;
					break;
				}
			}

			if (found) {
				return { description: found, index: groupIndex };
			} else {
				iterations++;
				this.code.logger.log(`Waiting for ${interpreterNamePrefix} to load, try ${iterations}`);
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
