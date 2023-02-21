/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Codicon } from 'vs/base/common/codicons';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { PositronConsoleViewPane } from 'vs/workbench/contrib/positronConsole/browser/positronConsoleView';
import { PositronConsoleService } from 'vs/workbench/contrib/positronConsole/browser/positronConsoleService';
import { IPositronConsoleService } from 'vs/workbench/services/positronConsole/common/positronConsoleService';
import { registerPositronConsoleActions } from 'vs/workbench/contrib/positronConsole/browser/positronConsoleActions';
import { PositronConsoleCommandId, POSITRON_CONSOLE_VIEW_ID } from 'vs/workbench/contrib/positronConsole/common/positronConsole';
import { ViewContainer, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, IViewsRegistry } from 'vs/workbench/common/views';

// Register the Positron console service.
registerSingleton(IPositronConsoleService, PositronConsoleService, InstantiationType.Delayed);

// The Positron console view icon.
const positronConsoleViewIcon = registerIcon('positron-console-view-icon', Codicon.positronConsoleView, nls.localize('positronConsoleViewIcon', 'View icon of the Positron console view.'));

// Register the Positron console view container.
const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: POSITRON_CONSOLE_VIEW_ID,
	title: nls.localize('positron.console', "Console"),
	icon: positronConsoleViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [POSITRON_CONSOLE_VIEW_ID, {
		mergeViewWithContainerWhenSingleView: true
	}]),
	storageId: POSITRON_CONSOLE_VIEW_ID,
	hideIfEmpty: true,
	order: 3,
}, ViewContainerLocation.Panel, {
	doNotRegisterOpenCommand: true,
	isDefault: true
});

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: POSITRON_CONSOLE_VIEW_ID,
	name: nls.localize('positron.console', "Console"),
	containerIcon: positronConsoleViewIcon,
	canMoveView: true,
	canToggleVisibility: false,
	ctorDescriptor: new SyncDescriptor(PositronConsoleViewPane),
	openCommandActionDescriptor: {
		id: PositronConsoleCommandId.Open,
		mnemonicTitle: nls.localize({ key: 'miOpenConsole', comment: ['&& denotes a mnemonic'] }, "&&Console"),
		keybindings: {},
		order: 3,
	}
}], VIEW_CONTAINER);

// Register all the Positron console actions.
registerPositronConsoleActions();
