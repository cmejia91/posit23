/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./dataGrid';

// React.
import * as React from 'react';

// Other dependencies.
import { positronClassNames } from 'vs/base/common/positronUtilities';
import { DataGridWaffle } from 'vs/base/browser/ui/dataGrid/components/dataGridWaffle';
import { DataGridConfiguration, DataGridContextProvider } from 'vs/base/browser/ui/dataGrid/dataGridContext';

/**
 * DataGridProps interface.
 */
interface DataGridProps extends DataGridConfiguration {
	width: number;
	height: number;
	borderTop?: boolean;
	borderLeft?: boolean;
}

/**
 * DataGrid component.
 * @param props A DataGridProps that contains the component properties.
 * @returns The rendered component.
 */
export const DataGrid = (props: DataGridProps) => {
	// Render.
	return (
		<DataGridContextProvider {...props}>
			<div
				className={positronClassNames(
					'data-grid',
					{ 'border-top': props.borderTop },
					{ 'border-left': props.borderLeft }
				)}
			>
				<DataGridWaffle {...props} />
			</div>
		</DataGridContextProvider>
	);
};
