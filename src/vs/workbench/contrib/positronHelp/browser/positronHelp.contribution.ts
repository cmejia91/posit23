/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable } from 'vs/base/common/lifecycle';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { PositronHelpFocused } from 'vs/workbench/common/contextkeys';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { PositronHelpView } from 'vs/workbench/contrib/positronHelp/browser/positronHelpView';
import { POSITRON_HELP_VIEW_ID } from 'vs/workbench/contrib/positronHelp/browser/positronHelpService';
import { POSITRON_HELP_COPY } from 'vs/workbench/contrib/positronHelp/browser/positronHelpIdentifiers';
import { ICommandAndKeybindingRule, KeybindingWeight, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { ViewContainer, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, IViewsRegistry } from 'vs/workbench/common/views';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { LookupHelpTopic, ShowHelpAtCursor } from 'vs/workbench/contrib/positronHelp/browser/positronHelpActions';

// The Positron help view icon.
const positronHelpViewIcon = registerIcon('positron-help-view-icon', Codicon.positronHelpView, nls.localize('positronHelpViewIcon', 'View icon of the Positron help view.'));

// Register the Positron help container.
const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(
	ViewContainerExtensions.ViewContainersRegistry
).registerViewContainer(
	{
		id: POSITRON_HELP_VIEW_ID,
		title: {
			value: nls.localize('positron.help', "Help"),
			original: 'Help'
		},
		icon: positronHelpViewIcon,
		order: 2,
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [POSITRON_HELP_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
		storageId: POSITRON_HELP_VIEW_ID,
		hideIfEmpty: true,
	},
	ViewContainerLocation.AuxiliaryBar,
	{
		doNotRegisterOpenCommand: false,
		isDefault: false
	}
);

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: POSITRON_HELP_VIEW_ID,
	name: {
		value: nls.localize('positron.help', "Help"),
		original: 'Help'
	},
	containerIcon: positronHelpViewIcon,
	canMoveView: true,
	canToggleVisibility: false,
	ctorDescriptor: new SyncDescriptor(PositronHelpView),
	positronAlwaysOpenView: true,
	openCommandActionDescriptor: {
		id: 'workbench.action.positron.openHelp',
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyH,
		},
		order: 1,
	}
}], VIEW_CONTAINER);

// Register keybinding rule for copy.
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: POSITRON_HELP_COPY,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.KeyC,
	when: PositronHelpFocused,
	handler: accessor => { }
} satisfies ICommandAndKeybindingRule);



class PositronHelpContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.positronHelp';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this.registerActions();
	}

	private registerActions(): void {
		registerAction2(ShowHelpAtCursor);
		registerAction2(LookupHelpTopic);
	}
}

// Really does need to be `WorkbenchPhase.BlockStartup`. Any later and the keybindings registered
// by `ShowHelpAtCursor` are registered "too late", i.e. after the core set of system keybindings
// have been set https://github.com/posit-dev/positron/issues/2523.
registerWorkbenchContribution2(PositronHelpContribution.ID, PositronHelpContribution, WorkbenchPhase.BlockStartup);
