/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import * as nls from 'vs/nls';
import { IAction, Separator } from 'vs/base/common/actions';
import { ActionBarMenuButton } from 'vs/platform/positronActionBar/browser/components/actionBarMenuButton';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IPositronPlotsService } from 'vs/workbench/services/positronPlots/common/positronPlots';
import { showSetPlotSizeModalDialog } from 'vs/workbench/contrib/positronPlots/browser/modalDialogs/setPlotSizeModalDialog';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { PlotSizingPolicyCustom } from 'vs/workbench/services/positronPlots/common/sizingPolicyCustom';

interface SizingPolicyMenuButtonProps {
	readonly plotsService: IPositronPlotsService;
	readonly layoutService: IWorkbenchLayoutService;
}

const sizingPolicyTooltip = nls.localize('positronSizingPolicyTooltip', "Set how the plot's shape and size are determined");
const newCustomPolicyTooltip = nls.localize('positronNewCustomSize', "New Custom Size...");
const changeCustomPolicyTooltip = nls.localize('positronChangeCustomSize', "Change Custom Size...");

/**
 * SizingPolicyMenuButton component.
 * @param props A SizingPolicyMenuButtonProps that contains the component properties.
 * @returns The rendered component.
 */
export const SizingPolicyMenuButton = (props: SizingPolicyMenuButtonProps) => {

	// State.
	const [activePolicyLabel, setActivePolicyLabel] =
		React.useState(props.plotsService.selectedSizingPolicy.name);

	React.useEffect(() => {
		const disposables = new DisposableStore();
		disposables.add(props.plotsService.onDidChangeSizingPolicy(policy => {
			setActivePolicyLabel(policy.name);
		}));
		return () => disposables.dispose();
	}, [props.plotsService.selectedSizingPolicy]);

	// Builds the actions.
	const actions = () => {
		const selectedPolicy = props.plotsService.selectedSizingPolicy;

		// Build the actions for all sizing policies except the custom policy.
		const actions: IAction[] = [];
		props.plotsService.sizingPolicies.map(policy => {
			if (policy.id !== PlotSizingPolicyCustom.ID) {
				actions.push({
					id: policy.id,
					label: policy.name,
					tooltip: '',
					class: undefined,
					enabled: true,
					checked: policy.id === selectedPolicy.id,
					run: () => {
						props.plotsService.selectSizingPolicy(policy.id);
					}
				});
			}
		});

		// Add a separator and the custom policy, if it exists.
		actions.push(new Separator());
		const customPolicy = props.plotsService.sizingPolicies.find(
			policy => policy.id === PlotSizingPolicyCustom.ID) as PlotSizingPolicyCustom;
		if (customPolicy) {
			actions.push({
				id: customPolicy.id,
				label: customPolicy.name,
				tooltip: '',
				class: undefined,
				enabled: true,
				checked: customPolicy.id === selectedPolicy.id,
				run: () => {
					props.plotsService.selectSizingPolicy(customPolicy.id);
				}
			});
		}

		actions.push({
			id: 'custom',
			label: customPolicy ? changeCustomPolicyTooltip : newCustomPolicyTooltip,
			tooltip: '',
			class: undefined,
			enabled: true,
			run: async () => {
				const result = await showSetPlotSizeModalDialog(customPolicy ?
					customPolicy.size : undefined, props.layoutService);
				if (result) {
					props.plotsService.setCustomPlotSize(result.size);
				}
			}
		});

		return actions;
	};

	return (
		<ActionBarMenuButton
			iconId='symbol-ruler'
			text={activePolicyLabel}
			tooltip={sizingPolicyTooltip}
			actions={actions}
		/>
	);
};
