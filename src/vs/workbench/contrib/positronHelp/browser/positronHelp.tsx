/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit, PBC.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./positronHelp';
import * as React from 'react';
import { PropsWithChildren, useEffect, useRef, useState } from 'react'; // eslint-disable-line no-duplicate-imports
import { localize } from 'vs/nls';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IReactComponentContainer } from 'vs/base/browser/positronReactRenderer';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { PositronActionBar } from 'vs/platform/positronActionBar/browser/positronActionBar';
import { IPositronHelpService } from 'vs/workbench/services/positronHelp/common/positronHelp';
import { ActionBarFind } from 'vs/platform/positronActionBar/browser/components/actionBarFind';
import { TestContent } from 'vs/workbench/contrib/positronHelp/browser/components/testContent';
import { ActionBarButton } from 'vs/platform/positronActionBar/browser/components/actionBarButton';
import { ActionBarSeparator } from 'vs/platform/positronActionBar/browser/components/actionBarSeparator';
import { PositronActionBarContextProvider } from 'vs/platform/positronActionBar/browser/positronActionBarContext';
import { MarkdownString } from 'vs/base/common/htmlContent';

// Constants.
const kSecondaryActionBarGap = 4;
const kPaddingLeft = 14;
const kPaddingRight = 4;

/**
 * PositronHelpProps interface.
 */
export interface PositronHelpProps {
	reactComponentContainer: IReactComponentContainer;
	commandService: ICommandService;
	configurationService: IConfigurationService;
	contextKeyService: IContextKeyService;
	contextMenuService: IContextMenuService;
	keybindingService: IKeybindingService;
	positronHelpService: IPositronHelpService;
}

/**
 * PositronHelp component.
 * @param props A PositronHelpProps that contains the component properties.
 */
export const PositronHelp = (props: PropsWithChildren<PositronHelpProps>) => {
	// Hooks.
	const historyButtonRef = useRef<HTMLDivElement>(undefined!);
	const [alternateFind, setAlternateFind] = useState(false);
	const [findText, setFindText] = useState('');

	// Add IReactComponentContainer event handlers.
	useEffect(() => {
		// Create the disposable store for cleanup.
		const disposableStore = new DisposableStore();

		// Add IReactComponentContainer event handlers.

		// Add the onSizeChanged event handler.
		disposableStore.add(props.reactComponentContainer.onSizeChanged(size => {
			setAlternateFind(size.width - kPaddingLeft - historyButtonRef.current.offsetWidth - kSecondaryActionBarGap < 180);
		}));

		// Add the onVisibilityChanged event handler.
		disposableStore.add(props.reactComponentContainer.onVisibilityChanged(visibility => {
			console.log(`PositronHelp got onVisibilityChanged ${visibility}`);
		}));

		// Add IPositronHelpService event handlers.
		disposableStore.add(props.positronHelpService.onRenderHelp(help => {
			console.log('PositronHelp got onRenderHelp');
			console.log(help);
		}));

		// Return the cleanup function that will dispose of the event handlers.
		return () => disposableStore.dispose();
	}, []);

	// Find text changed handler.
	const findTextChangedHandler = (findText: string) => {
		console.log('FIND TEXT CHANGED CALLBACK');
		setFindText(findText);
	};

	const findPreviousHandler = () => {
		props.positronHelpService.findPrevious();
		props.positronHelpService.openHelpMarkdown(new MarkdownString(
			`This is help text ${new Date().toTimeString()}.\n\nHere is some **bold text**.\n\nHere is a list:\n\n* One.\n* Two.\n* Three.\n\n***The End***`
		));
	};

	const findNextHandler = () => {
		props.positronHelpService.findNext();
	};

	// Render.
	return (
		<div className='positron-help'>
			<PositronActionBarContextProvider {...props}>
				<PositronActionBar size='small' paddingLeft={kPaddingLeft} paddingRight={kPaddingRight}>
					<ActionBarButton iconId='positron-left-arrow' tooltip={localize('positronPreviousTopic', "Previous topic")} />
					<ActionBarButton iconId='positron-right-arrow' tooltip={localize('positronNextTopic', "Next topic")} />
					<ActionBarButton iconId='positron-home' tooltip={localize('positronShowPositronHelp', "Show Positron help")} />
					<ActionBarSeparator />
					<ActionBarButton iconId='positron-open-in-new-window' tooltip={localize('positronShowInNewWindow', "Show in new window")} />
				</PositronActionBar>
				<PositronActionBar size='small' gap={kSecondaryActionBarGap} borderBottom={!alternateFind} paddingLeft={kPaddingLeft} paddingRight={kPaddingRight}>
					<ActionBarButton ref={historyButtonRef} text='Home' maxTextWidth={120} dropDown={true} tooltip={localize('positronHelpHistory', "Help history")} />
					{!alternateFind && (
						<ActionBarFind
							width={300}
							placeholder={localize('positronFindPlaceholder', "find")}
							initialFindText={findText}
							onFindTextChanged={findTextChangedHandler}
							onFindPrevious={findPreviousHandler}
							onFindNext={findNextHandler} />
					)}
				</PositronActionBar>
				{alternateFind && (
					<PositronActionBar size='small' gap={kSecondaryActionBarGap} borderBottom={true} paddingLeft={kPaddingLeft} paddingRight={kPaddingRight}>
						<ActionBarFind
							width={300}
							placeholder={localize('positronFindPlaceholder', "find")}
							initialFindText={findText}
							onFindTextChanged={findTextChangedHandler}
							onFindPrevious={findPreviousHandler}
							onFindNext={findNextHandler} />
					</PositronActionBar>
				)}
			</PositronActionBarContextProvider>
			<TestContent message='Help React' />
		</div>
	);
};
