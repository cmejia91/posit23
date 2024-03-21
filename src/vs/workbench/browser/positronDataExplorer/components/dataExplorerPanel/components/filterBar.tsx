/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./filterBar';

// React.
import * as React from 'react';
import { useRef, useState } from 'react'; // eslint-disable-line no-duplicate-imports

// Other dependencies.
import { localize } from 'vs/nls';
import { Button } from 'vs/base/browser/ui/positronComponents/button/button';
import { showContextMenu } from 'vs/workbench/browser/positronComponents/contextMenu/contextMenu';
import { ContextMenuItem } from 'vs/workbench/browser/positronComponents/contextMenu/contextMenuItem';
import { ContextMenuSeparator } from 'vs/workbench/browser/positronComponents/contextMenu/contextMenuSeparator';
import { usePositronDataExplorerContext } from 'vs/workbench/browser/positronDataExplorer/positronDataExplorerContext';
import { PositronModalReactRenderer } from 'vs/workbench/browser/positronModalReactRenderer/positronModalReactRenderer';
import { AddRowFilterModalPopup } from 'vs/workbench/browser/positronDataExplorer/components/dataExplorerPanel/components/addRowFilterModalPopup';

/**
 * Localized strings.
 */
const filterButtonAriaLabel = localize('positron.dataExplorer.filtering', "Filtering");
const addFilterButtonAriaLabel = localize('positron.dataExplorer.addFilter', "Add filter");

// Temporary filter.
interface Filter {
	name: string;
	width: number;
}

/**
 * FilterBar component.
 * @returns The rendered component.
 */
export const FilterBar = () => {
	// Context hooks.
	const context = usePositronDataExplorerContext();

	// Reference hooks.
	const filterButtonRef = useRef<HTMLButtonElement>(undefined!);
	const addFilterButtonRef = useRef<HTMLButtonElement>(undefined!);

	// Temporary state code.
	const [filters, setFilters] = useState<Filter[]>([]);
	const [filtersHidden, setFiltersHidden] = useState(false);

	const addFilterSelectedHandler = () => {
		const renderer = new PositronModalReactRenderer({...context});
		renderer.render(
			<AddRowFilterModalPopup
				renderer={renderer}
				anchor={filterButtonRef.current}
				accepted={result => console.log(result)}
			/>
		);
	};

	/**
	 * Filter button pressed handler.
	 */
	const filterButtonPressedHandler = async () => {
		// Build the context menu entries.
		const entries: (ContextMenuItem | ContextMenuSeparator)[] = [];
		entries.push(new ContextMenuItem({
			label: localize('positron.addFilter', "Add filter"),
			icon: 'positron-add-filter',
			onSelected: addFilterSelectedHandler
		}));
		entries.push(new ContextMenuSeparator());
		if (!filtersHidden) {
			entries.push(new ContextMenuItem({
				label: localize('positron.hideFilters', "Hide filters"),
				icon: 'positron-hide-filters',
				disabled: filters.length === 0,
				onSelected: () => setFiltersHidden(true)
			}));
		} else {
			entries.push(new ContextMenuItem({
				label: localize('positron.showFilters', "Show filters"),
				icon: 'positron-show-filters',
				onSelected: () => setFiltersHidden(false)
			}));
		}
		entries.push(new ContextMenuSeparator());
		entries.push(new ContextMenuItem({
			label: localize('positron.clearFilters', "Clear filters"),
			icon: 'positron-clear-row-filters',
			disabled: filters.length === 0,
			onSelected: () => setFilters([])
		}));

		// Show the context menu.
		await showContextMenu(
			context.keybindingService,
			context.layoutService,
			filterButtonRef.current,
			'left',
			200,
			entries
		);
	};

	// Temporary code.
	const addFilter = async () => {
		const width = Math.floor(Math.random() * 120) + 80;
		setFilters(filters => [...filters, { name: `Filter ${filters.length + 1}`, width }]);
		setFiltersHidden(false);
	};

	// Render.
	return (
		<div className='filter-bar'>
			<div className='filter'>
				<Button
					ref={filterButtonRef}
					className='filter-button'
					ariaLabel={filterButtonAriaLabel}
					onPressed={filterButtonPressedHandler}
				>
					<div className='codicon codicon-positron-row-filter' />
					{filters.length !== 0 && <div className='counter'>{filters.length}</div>}
				</Button>
			</div>
			<div className='filter-entries'>
				{!filtersHidden && filters.map((filter, index) =>
					<div key={index} className='filter' style={{ width: filter.width }}>{filter.name}</div>
				)}
				<Button
					ref={addFilterButtonRef}
					className='add-filter-button'
					ariaLabel={addFilterButtonAriaLabel}
					onPressed={addFilter}
				>
					<div className='codicon codicon-positron-add-filter' />
				</Button>
			</div>
		</div>
	);
};
