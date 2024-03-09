/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./addRowFilterModalPopup';

// React.
import * as React from 'react';

// Other dependencies.
import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { Button } from 'vs/base/browser/ui/positronComponents/button/button';
import { ComboBox } from 'vs/base/browser/ui/positronComponents/comboBox/comboBox';
import { ComboBoxItem } from 'vs/base/browser/ui/positronComponents/comboBox/comboBoxItem';
import { PositronModalPopup } from 'vs/base/browser/ui/positronModalPopup/positronModalPopup';
import { ComboBoxSeparator } from 'vs/base/browser/ui/positronComponents/comboBox/comboBoxSeparator';
import { PositronModalReactRenderer } from 'vs/base/browser/ui/positronModalReactRenderer/positronModalReactRenderer';

/**
 * Constants.
 */
const CONDITION_IS_EMPTY = 'is-empty';
const CONDITION_IS_NOT_EMPTY = 'is-not-empty';
const CONDITION_IS_LESS_THAN = 'is-less-than';
const CONDITION_IS_GREATER_THAN = 'is-greater-than';
const CONDITION_IS_EXACTLY = 'is-exactly';
const CONDITION_IS_BETWEEN = 'is-between';
const CONDITION_IS_NOT_BETWEEN = 'is-not-between';

/**
 * Shows the add row filter modal popup.
 * @param layoutService The layout service.
 * @param anchorElement The anchor element for the modal popup.
 * @returns A promise that resolves when the popup is dismissed.
 */
export const addRowFilterModalPopup = async (
	layoutService: ILayoutService,
	anchorElement: HTMLElement
): Promise<void> => {
	// Build the condition combo box entries.
	const conditionEntries = [
		new ComboBoxItem({
			id: CONDITION_IS_EMPTY,
			label: localize('positron.isEmpty', "is empty"),
		}),
		new ComboBoxItem({
			id: CONDITION_IS_NOT_EMPTY,
			label: localize('positron.isNotEmpty', "is not empty"),
		}),
		new ComboBoxSeparator(),
		new ComboBoxItem({
			id: CONDITION_IS_LESS_THAN,
			label: localize('positron.isLessThan', "is less than"),
		}),
		new ComboBoxItem({
			id: CONDITION_IS_GREATER_THAN,
			label: localize('positron.isGreaterThan', "is greater than"),
		}),
		new ComboBoxItem({
			id: CONDITION_IS_EXACTLY,
			label: localize('positron.isExactly', "is exactly"),
		}),
		new ComboBoxItem({
			id: CONDITION_IS_BETWEEN,
			label: localize('positron.isBetween', "is between"),
		}),
		new ComboBoxItem({
			id: CONDITION_IS_NOT_BETWEEN,
			label: localize('positron.isNotBetween', "is not between"),
		})
	];

	// Return a promise that resolves when the popup is done.
	return new Promise<void>(resolve => {
		// Get the container for the anchor element.
		const containerElement = layoutService.getContainer(DOM.getWindow(anchorElement));

		// Create the modal React renderer.
		const positronModalReactRenderer = new PositronModalReactRenderer(
			containerElement
		);

		// The modal popup component.
		const ModalPopup = () => {
			/**
			 * Dismisses the popup.
			 */
			const dismiss = () => {
				positronModalReactRenderer.dispose();
				resolve();
			};

			// Render.
			return (
				<PositronModalPopup
					renderer={positronModalReactRenderer}
					containerElement={containerElement}
					anchorElement={anchorElement}
					popupPosition='bottom'
					popupAlignment='left'
					minWidth={275}
					width={'max-content'}
					height={'min-content'}
					onDismiss={() => dismiss()}
				>
					<div className='add-row-filter-modal-popup-body' tabIndex={0}>
						<ComboBox
							layoutService={layoutService}
							title='Select Column'
							entries={conditionEntries}
						/>
						<ComboBox
							layoutService={layoutService}
							title='Select Condition'
							entries={conditionEntries}
						/>
						<Button className='button-apply-filter'>
							APPLY FILTER
						</Button>
					</div>
				</PositronModalPopup>
			);
		};

		// Render the modal popup component.
		positronModalReactRenderer.render(<ModalPopup />);
	});
};
