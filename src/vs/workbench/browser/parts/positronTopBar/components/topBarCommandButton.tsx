/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit, PBC.
 *--------------------------------------------------------------------------------------------*/

import React = require('react');
import { usePositronTopBarContext } from 'vs/workbench/browser/parts/positronTopBar/positronTopBarContext';
import { TopBarButton } from 'vs/workbench/browser/parts/positronTopBar/components/topBarButton/topBarButton';
import { CommandCenter } from 'vs/platform/commandCenter/common/commandCenter';

/**
 * TopBarCommandButtonProps interface.
 */
interface TopBarCommandButtonProps {
	iconId: string;
	commandId: string;
}

/**
 * TopBarCommandButton component.
 * @param props A TopBarCommandButtonProps that contains the component properties.
 * @returns The component.
 */
export const TopBarCommandButton = ({ iconId, commandId }: TopBarCommandButtonProps) => {
	// Hooks.
	const positronTopBarContext = usePositronTopBarContext();

	// Handlers.
	const executeHandler = () => {
		positronTopBarContext?.commandService.executeCommand(commandId);
	};

	// Returns a dynamic tooltip for the command button.
	const tooltip = (): string | undefined => {
		// Get the title for the command from the command center.
		const title = CommandCenter.title(commandId);
		if (!title) {
			return undefined;
		}

		// Get the keybinding label for the command from the keybinding service.
		const keybindingLabel = positronTopBarContext?.keybindingService.lookupKeybinding(commandId)?.getLabel();
		if (!keybindingLabel) {
			return title;
		}

		// Return the tooltip.
		return `${title} (${keybindingLabel})`;
	};

	// Render.
	return <TopBarButton iconId={iconId} tooltip={tooltip} onClick={executeHandler} />;
};
