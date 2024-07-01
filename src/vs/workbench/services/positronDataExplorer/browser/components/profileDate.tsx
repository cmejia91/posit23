/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./profileDate';

// React.
import * as React from 'react';
import { useEffect, useRef } from 'react'; // eslint-disable-line no-duplicate-imports

// Other dependencies.
import { DisposableStore } from 'vs/base/common/lifecycle';
import { editorFontApplier } from 'vs/workbench/browser/editorFontApplier';
import { TableSummaryDataGridInstance } from 'vs/workbench/services/positronDataExplorer/browser/tableSummaryDataGridInstance';

/**
 * profileDateProps interface.
 */
interface profileDateProps {
	instance: TableSummaryDataGridInstance;
	columnIndex: number;
}

/**
 * profileDate component.
 * @param props A ProfileStringProps that contains the component properties.
 * @returns The rendered component.
 */
export const ProfileDate = (props: profileDateProps) => {
	let stats: any = props.instance.getColumnSummaryStats(props.columnIndex)?.date_stats!;
	const nullCount = props.instance.getColumnNullCount(props.columnIndex);
	if (!stats) {
		stats = {};
	}

	// Reference hooks.
	const ref = useRef<HTMLDivElement>(undefined!);

	// Main useEffect.
	useEffect(() => {
		// Create the disposable store for cleanup.
		const disposableStore = new DisposableStore();

		// Use the editor font.
		disposableStore.add(
			editorFontApplier(
				props.instance.configurationService,
				ref.current
			)
		);

		// Return the cleanup function that will dispose of the disposables.
		return () => disposableStore.dispose();
	}, [props.instance.configurationService]);

	// Render.
	return (
		<div ref={ref} className='tabular-info'>
			<div className='labels'>
				<div className='label'>NA</div>
				<div className='label'>Min:</div>
				<div className='label'>Mean:</div>
				<div className='label'>Median:</div>
				<div className='label'>Max:</div>
			</div>
			<div className='values'>
				<div className='values-left'>
					<div className='value'>{nullCount}</div>
					<div className='value'>{stats.min_date}</div>
					<div className='value'>{stats.mean_date}</div>
					<div className='value'>{stats.median_date}</div>
					<div className='value'>{stats.max_date}</div>
				</div>
			</div>
		</div>
	);
};
