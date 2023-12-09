/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { revive } from 'vs/base/common/marshalling';
import { IOffsetRange, OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IRange } from 'vs/editor/common/core/range';
import { IChatAgent, IChatAgentCommand } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatSlashData } from 'vs/workbench/contrib/chat/common/chatSlashCommands';
import { IChatRequestVariableValue } from 'vs/workbench/contrib/chat/common/chatVariables';

// These are in a separate file to avoid circular dependencies with the dependencies of the parser

export interface IParsedChatRequest {
	readonly parts: ReadonlyArray<IParsedChatRequestPart>;
	readonly text: string;
}

export interface IParsedChatRequestPart {
	readonly kind: string; // for serialization
	readonly range: IOffsetRange;
	readonly editorRange: IRange;
	readonly text: string;
	readonly promptText: string;
}

export class ChatRequestTextPart implements IParsedChatRequestPart {
	static readonly Kind = 'text';
	readonly kind = ChatRequestTextPart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly text: string) { }

	get promptText(): string {
		return this.text;
	}
}

// warning, these also show up in a regex in the parser
export const chatVariableLeader = '#';
export const chatAgentLeader = '@';
export const chatSubcommandLeader = '/';

/**
 * An invocation of a static variable that can be resolved by the variable service
 */
export class ChatRequestVariablePart implements IParsedChatRequestPart {
	static readonly Kind = 'var';
	readonly kind = ChatRequestVariablePart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly variableName: string, readonly variableArg: string) { }

	get text(): string {
		const argPart = this.variableArg ? `:${this.variableArg}` : '';
		return `${chatVariableLeader}${this.variableName}${argPart}`;
	}

	get promptText(): string {
		return this.text;
	}
}

/**
 * An invocation of an agent that can be resolved by the agent service
 */
export class ChatRequestAgentPart implements IParsedChatRequestPart {
	static readonly Kind = 'agent';
	readonly kind = ChatRequestAgentPart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly agent: IChatAgent) { }

	get text(): string {
		return `${chatAgentLeader}${this.agent.id}`;
	}

	get promptText(): string {
		return '';
	}
}

/**
 * An invocation of an agent's subcommand
 */
export class ChatRequestAgentSubcommandPart implements IParsedChatRequestPart {
	static readonly Kind = 'subcommand';
	readonly kind = ChatRequestAgentSubcommandPart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly command: IChatAgentCommand) { }

	get text(): string {
		return `${chatSubcommandLeader}${this.command.name}`;
	}

	get promptText(): string {
		return '';
	}
}

/**
 * An invocation of a standalone slash command
 */
export class ChatRequestSlashCommandPart implements IParsedChatRequestPart {
	static readonly Kind = 'slash';
	readonly kind = ChatRequestSlashCommandPart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly slashCommand: IChatSlashData) { }

	get text(): string {
		return `${chatSubcommandLeader}${this.slashCommand.command}`;
	}

	get promptText(): string {
		return `${chatSubcommandLeader}${this.slashCommand.command}`;
	}
}

/**
 * An invocation of a dynamic reference like '#file:'
 */
export class ChatRequestDynamicVariablePart implements IParsedChatRequestPart {
	static readonly Kind = 'dynamic';
	readonly kind = ChatRequestDynamicVariablePart.Kind;
	constructor(readonly range: OffsetRange, readonly editorRange: IRange, readonly text: string, readonly data: IChatRequestVariableValue[]) { }

	get referenceText(): string {
		return this.text;
	}

	get promptText(): string {
		// This needs to be dynamically generated for de-duping
		return ``;
	}
}

export function reviveParsedChatRequest(serialized: IParsedChatRequest): IParsedChatRequest {
	return {
		text: serialized.text,
		parts: serialized.parts.map(part => {
			if (part.kind === ChatRequestTextPart.Kind) {
				return new ChatRequestTextPart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					part.text
				);
			} else if (part.kind === ChatRequestVariablePart.Kind) {
				return new ChatRequestVariablePart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					(part as ChatRequestVariablePart).variableName,
					(part as ChatRequestVariablePart).variableArg
				);
			} else if (part.kind === ChatRequestAgentPart.Kind) {
				return new ChatRequestAgentPart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					(part as ChatRequestAgentPart).agent
				);
			} else if (part.kind === ChatRequestAgentSubcommandPart.Kind) {
				return new ChatRequestAgentSubcommandPart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					(part as ChatRequestAgentSubcommandPart).command
				);
			} else if (part.kind === ChatRequestSlashCommandPart.Kind) {
				return new ChatRequestSlashCommandPart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					(part as ChatRequestSlashCommandPart).slashCommand
				);
			} else if (part.kind === ChatRequestDynamicVariablePart.Kind) {
				return new ChatRequestDynamicVariablePart(
					new OffsetRange(part.range.start, part.range.endExclusive),
					part.editorRange,
					(part as ChatRequestDynamicVariablePart).text,
					revive((part as ChatRequestDynamicVariablePart).data)
				);
			} else {
				throw new Error(`Unknown chat request part: ${part.kind}`);
			}
		})
	};
}
