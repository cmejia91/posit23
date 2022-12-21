/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit Software, PBC.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { events, PositronEventDefinition } from './positron-events';

type TypeMap = {
	[key: string]: string;
};

const rustTypesMap = <TypeMap>{
	boolean: 'bool',
	string: 'String',
	integer: 'i32',
};

const tsTypesMap = <TypeMap>{
	boolean: 'boolean',
	string: 'string',
	integer: 'integer'
};

function camel(value: string): string {

	let snakeCased = value.replace(/[A-Z]/g, (letter) => {
		return `_${letter.toLowerCase()}`;
	});

	if (snakeCased.startsWith('_')) {
		snakeCased = snakeCased.substring(1);
	}

	return snakeCased.replace(/_event$/, '');

}

function indent(value: string, indent: string): string {
	return value.replace(/(^|\n)/g, `$1${indent}`);
}

function currentYear() {
	return new Date().getFullYear();
}

function generateRustEvent(event: PositronEventDefinition) {

	const lines: string[] = [];

	const comment = event.comment.trimEnd().replace(/(^|\n)/g, '$1/// ');
	lines.push(comment);
	lines.push(`#[positron::event("${camel(event.name)}")]`);
	lines.push(`pub struct ${event.name}Event {`);
	lines.push('');

	for (const param of event.params) {
		lines.push(`    /// ${param.comment}`);
		lines.push(`    pub ${param.name}: ${rustTypesMap[param.type]},`);
		lines.push('');
	}

	lines.push('}');
	lines.push('');

	return lines.join('\n');

}

function generateRustPositronEventEnum() {

	const lines: string[] = [];

	lines.push('#[derive(Debug, Clone)]');
	lines.push('pub enum PositronEvent {');
	for (const event of events) {
		lines.push(`    ${event.name}(${event.name}Event),`);
	}
	lines.push('}');

	return lines.join('\n');

}

function generateRustClientEventHelper() {

	const dispatchLines = events.map((event) => {
		return `PositronEvent::${event.name}(data) => Self::as_evt(data),`;
	}).join('\n');

	return `impl From<PositronEvent> for ClientEvent {
    fn from(event: PositronEvent) -> Self {
        match event {
${indent(dispatchLines, '            ')}
        }
    }
}`;

}

function updateRustEventsFile(rustEventsFile: string) {

	// Generate event definitions for Ark
	const rustEvents = events.map(generateRustEvent);

	const rustHeader = `//
// mod.rs
//
// Copyright (C) ${currentYear()} by Posit Software, PBC
//
//
// Auto-generated by 'positron/scripts/generate-events.ts'.
// Please do not modify this file directly.
//

use crate::positron;

pub trait PositronEventType {
    fn event_type(&self) -> String;
}
`;

	rustEvents.unshift(rustHeader);

	const eventsEnum = generateRustPositronEventEnum();
	rustEvents.push(eventsEnum);
	rustEvents.push('');

	writeFileSync(rustEventsFile, rustEvents.join('\n'));

}

function updateRustClientEventsFile(path: string) {

	const contents = readFileSync(path, { encoding: 'utf-8' });
	const lines = contents.split(/\r?\n/);

	const startIndex = lines.findIndex((line) => {
		return line.endsWith('/** begin rust-client-event */');
	});

	const endIndex = lines.findIndex((line) => {
		return line.endsWith('/** end rust-client-event */');
	});

	const replacement = generateRustClientEventHelper();
	lines.splice(startIndex + 1, endIndex - startIndex - 1, replacement);

	const replacedContents = lines.join('\n');
	writeFileSync(path, replacedContents);


}

function generateLanguageRuntimeEventTypeEnum() {

	const lines: string[] = [];
	lines.push('export enum LanguageRuntimeEventType {');
	for (const event of events) {
		const lhs = event.name;
		const rhs = camel(lhs);
		lines.push(`\t${lhs} = '${rhs}',`);
	}
	lines.push('}');

	return lines.join('\n');

}

function updatePositronDefinitionsFile(path: string, needsIndent: boolean) {

	const contents = readFileSync(path, { encoding: 'utf-8' });
	const lines = contents.split(/\r?\n/);

	const startIndex = lines.findIndex((line) => {
		return line.endsWith('/** begin positron-language-runtime-event-type */');
	});

	const endIndex = lines.findIndex((line) => {
		return line.endsWith('/** end positron-language-runtime-event-type */');
	});

	let replacement = generateLanguageRuntimeEventTypeEnum();
	if (needsIndent) {
		replacement = indent(replacement, '\t');
	}

	lines.splice(startIndex + 1, endIndex - startIndex - 1, replacement);

	const replacedContents = lines.join('\n');
	writeFileSync(path, replacedContents);

}

function generateLanguageRuntimeEventDefinitions() {

	const lines: string[] = [];

	for (const event of events) {

		const comment = event.comment.trimEnd().replace(/(^|\n)/g, '$1// ');
		lines.push(comment);
		lines.push(`export interface ${event.name}Event extends LanguageRuntimeEventData {`);
		lines.push('');
		for (const param of event.params) {
			lines.push(`\t/** ${param.comment} */`);
			lines.push(`\t${param.name}: ${tsTypesMap[param.type]};`);
			lines.push('');
		}
		lines.push('}');
		lines.push('');
	}

	return lines.join('\n');

}

function generateLanguageRuntimeEventsFile(languageRuntimeEventsFile: string) {

	const languageRuntimeEventEnum = generateLanguageRuntimeEventTypeEnum();
	const languageRuntimeEventDefinitions = generateLanguageRuntimeEventDefinitions();

	const generatedContents = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit Software, PBC.
 *--------------------------------------------------------------------------------------------*/

// This file was automatically generated by 'positron/scripts/generate-events.ts'.
// Please do not modify this file directly.

export interface LanguageRuntimeEventData { }

${languageRuntimeEventEnum}

${languageRuntimeEventDefinitions}
`;

	writeFileSync(languageRuntimeEventsFile, generatedContents);

}

// Move to project root directory.
while (!existsSync(`${process.cwd()}/.git`)) {
	process.chdir('..');
}

const rustEventsFile = 'extensions/positron-r/amalthea/crates/amalthea/src/events/mod.rs';
updateRustEventsFile(rustEventsFile);

const rustClientEventsFile = 'extensions/positron-r/amalthea/crates/amalthea/src/wire/client_event.rs';
updateRustClientEventsFile(rustClientEventsFile);

const positronDefinitionsPath = 'src/positron-dts/positron.d.ts';
updatePositronDefinitionsFile(positronDefinitionsPath, true);

const extHostTypesPath = 'src/vs/workbench/api/common/positron/extHostTypes.positron.ts';
updatePositronDefinitionsFile(extHostTypesPath, false);

const languageRuntimeEventsFile = 'src/vs/workbench/services/languageRuntime/common/languageRuntimeEvents.ts';
generateLanguageRuntimeEventsFile(languageRuntimeEventsFile);
