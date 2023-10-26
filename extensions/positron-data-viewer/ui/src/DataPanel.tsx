/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import './DataPanel.css';

// External libraries.
import * as React from 'react';
import * as ReactVirtual from '@tanstack/react-virtual';
import * as ReactQuery from '@tanstack/react-query';
import * as ReactTable from '@tanstack/react-table';

// Local modules.
import { DataFragment, DataModel } from './DataModel';
import { DataSet } from './positron-data-viewer';

interface DataPanelProps {
	/**
	 * The initial batch of data to display, before additional data requests have been made
	 */
	initialData: DataSet;
	/**
	 * The number of rows to fetch at a time from the backend
	 */
	fetchSize: number;
	/**
	 * Global injected by VS Code when the extension is loaded, used to post messages
	 */
	vscode: any;
}

/**
 * React component that displays a tabular data panel.
 *
 * @param props The properties for the component.
 */
export const DataPanel = (props: DataPanelProps) => {

	// The height of a single row of data
	const rowHeightPx = 30;

	// The number of rows to render above and below the visible area of the table.
	const scrollOverscan = 30;

	// The number of rows away from the bottom (not including scrollOverscan) when we should
	// trigger a fetch for more data.
	const scrollThresholdRows = 10;

	// A reference to the table container element.
	const tableContainerRef = React.useRef<HTMLDivElement>(null);

	const {initialData, fetchSize, vscode} = props;

	const [dataModel, updateDataModel] = React.useState(new DataModel(initialData));
	const requestQueue = React.useRef<number[]>([]);

	// Count total rows and pages, including those we have not yet fetched
	const totalRows = dataModel.rowCount;
	const maxPages = Math.ceil(totalRows / fetchSize);

	// We store functions used to resolve a Promise for a DataFragment
	// resolver functions are indexed by the request ID (the start row number)
	// and resolved when that request is fulfilled in the event handler.
	interface ResolverLookup {
		[requestId: number]: {
			resolve: (fragment: DataFragment) => void;
			reject: any;
		};
	}
	// The resolver functions need to persist between re-renders
	const requestResolvers = React.useRef<ResolverLookup>({});

	React.useEffect(() => {
		const handleMessage = ((event: any) => {
			// Update state for the data model and resolve the outstanding request,
			// indexed by requestId with the new DataFragment
			updateDataModel((prevDataModel) => {
				const fragment = prevDataModel.handleDataMessage(event);
				if (!fragment) {
					return prevDataModel;
				}
				const requestId: number = event!.data!.start_row;
				requestResolvers.current[requestId].resolve(fragment);
				return prevDataModel.appendFragment(fragment);
			});
		});

		window.addEventListener('message', handleMessage);

		return () => {
			window.removeEventListener('message', handleMessage);
		};
	}, []);

	React.useEffect(() => {
		// When the dataModel updates, filter out fulfilled requests from the queue
		requestQueue.current = requestQueue.current.filter(
			rowRequest => !dataModel.renderedRows.includes(rowRequest)
		);
	}, [dataModel]);

	// Create the columns for the table. These use the 'any' type since the data
	// model is generic.
	const columns = React.useMemo<ReactTable.ColumnDef<any>[]>(() => {
		return dataModel.columns.map((column, idx) => {
			return {
				id: '' + idx,
				accessorKey: idx,
				accessorFn: (_row: any, rowIdx: number) => {
					return column.data[rowIdx];
				},
				header: column.name
			};
		});
	}, [dataModel]);

	async function fetchNextDataFragment(pageParam: number, fetchSize: number): Promise<DataFragment> {
		// Fetches a single page of data from the data model.
		const startRow = pageParam * fetchSize;
		// Overwrite fetchSize so that we never request rows past the end of the dataset
		fetchSize = Math.min(fetchSize, totalRows - startRow);

		// Request more rows from the server if we don't have them in the cache
		if (startRow > 0 && !dataModel.renderedRows.includes(startRow)) {
			// Don't send duplicate requests
			if (!requestQueue.current.includes(startRow)) {
				vscode.postMessage({
					msg_type: 'request_rows',
					start_row: startRow,
					fetch_size: fetchSize
				});
				// Add the outstanding request to the front of the queue
				requestQueue.current = [startRow, ...requestQueue.current];
			}

			const promisedFragment = new Promise<DataFragment>((resolve, reject) => {
				// This promise will be resolved in the event handler
				requestResolvers.current[startRow] = {resolve, reject};
			});
			return await promisedFragment;
		} else {
			// No need to wait for a response, return the fragment immediately
			return dataModel.loadDataFragment(startRow, fetchSize);
		}
	}

	const initialDataFragment: DataFragment = {
		rowStart: 0,
		rowEnd: Math.min(fetchSize, totalRows),
		columns: initialData.columns
	};

	// Use a React Query infinite query to fetch data from the data model,
	// with the loaded row count as cache key so we re-query when new data comes in.
	const {
		data,
		isLoading,
		isFetchingNextPage,
		fetchNextPage,
		hasNextPage
	} = ReactQuery.useInfiniteQuery(
	{
		queryKey: ['table-data', dataModel.loadedRowCount],
		queryFn: ({pageParam}) => fetchNextDataFragment(pageParam, fetchSize),
		initialPageParam: 0,
		initialData: {
			pages: [initialDataFragment],
			pageParams: [0]
		},
		// undefined if we are on the final page of data
		getNextPageParam: (_page, fetchedPages) => {
			return fetchedPages.length === maxPages ? undefined : fetchedPages.length;
		},
		refetchOnWindowFocus: false,
		placeholderData: (previousData) => previousData
	});


	// Transpose and flatten the data. The data model stores data in a column-major
	// format, but React Table expects data in a row-major format, so we need to
	// transpose the data.
	const flatData = React.useMemo(() => {
		// Loop over each page of data and transpose the data for that page.
		// Then flatten all the transposed data pages together

		// data and pages will never be null because we declared initialData
		return data?.pages?.flatMap(page => {
			// Get the number of rows for the current page
			if (page.columns.length) {
				return page.columns[0].data.map(
					// Transpose the data for the current page
					(_, rowIdx) => page.columns.map(col => col.data[rowIdx])
				);
			} else {
				// No data available for current page
				return [[]];
			}

		});
	}, [data]);

	// Define the main ReactTable instance.
	const table = ReactTable.useReactTable(
	{
		data: flatData,
		columns,
		getCoreRowModel: ReactTable.getCoreRowModel(),
		debugTable: false,
		enableSorting: false,
	});

	const {rows} = table.getRowModel();

	// Use a virtualizer to render only the rows that are visible.
	const rowVirtualizer = ReactVirtual.useVirtualizer(
	{
		count: rows.length,
		getScrollElement: () => tableContainerRef.current,
		// For now, we assume all rows are of constant height
		// TODO: account for variable height rows, here and below in the totalSize variable
		estimateSize: () => rowHeightPx,
		overscan: scrollOverscan
	});

	// Compute the padding for the table container.
	const virtualRows = rowVirtualizer.getVirtualItems();
	const totalSize = rowHeightPx * totalRows;
	const paddingTop =
		virtualRows.length > 0
			? virtualRows?.[0]?.start || 0
			: 0;
	const paddingBottom =
		virtualRows.length > 0
			? totalSize - (virtualRows?.[virtualRows.length - 1]?.end || 0)
			: 0;

	// Callback, invoked on scroll, that will fetch more data from the backend if we have reached
	// the end of the virtualized rows by sending a new MessageRequest.
	const fetchMoreOnBottomReached = React.useCallback(() => {
		const [lastVirtualRow] = [...virtualRows].reverse();
		const [lastFetchedRow] = [...rows].reverse();
		const nextStartRow = lastFetchedRow.index + 1;

		if (!lastVirtualRow || !hasNextPage || isFetchingNextPage) {
			return;
		}

		// don't trigger fetchNextPage if the data has already been requested
		if (requestQueue.current.includes(nextStartRow)) {
			return;
		}

		const virtualRowsRemaining = lastFetchedRow.index - lastVirtualRow.index;
		if (virtualRowsRemaining < scrollThresholdRows) {
			fetchNextPage();
		}
	}, [fetchNextPage, isFetchingNextPage, hasNextPage, rows, virtualRows]);

	// a check on mount and after a fetch to see if the table is already scrolled to the bottom
	// and immediately needs to fetch more data
	React.useEffect(() => {
		fetchMoreOnBottomReached();
	}, [fetchMoreOnBottomReached]);

	if (isLoading) {
		return <>Loading...</>;
	}

	return (
		<div
			className='container'
			onScroll={fetchMoreOnBottomReached}
			ref={tableContainerRef}
		>
			<table>
				<thead>
					{table.getHeaderGroups().map(headerGroup => (
						<tr key={headerGroup.id}>
							{headerGroup.headers.map(header => {
								return (
									<th
										key={header.id}
										colSpan={header.colSpan}
										style={{ width: header.getSize() }}
									>
										{header.isPlaceholder ? null : (
											<div
												{...{
													className: header.column.getCanSort()
														? 'cursor-pointer select-none'
														: '',
													onClick: header.column.getToggleSortingHandler(),
												}}
											>
												{ReactTable.flexRender(
													header.column.columnDef.header,
													header.getContext()
												)}
												{{
													asc: '🔼', // allow-any-unicode-next-line
													desc: '🔽', // allow-any-unicode-next-line
												}[header.column.getIsSorted() as string] ?? null}
											</div>
										)}
									</th>
								);
							})}
						</tr>
					))}
				</thead>
				<tbody>
					{paddingTop > 0 && (
						<tr>
							<td style={{ height: `${paddingTop}px` }} />
						</tr>
					)}
					{virtualRows.map(virtualRow => {
						const row = rows[virtualRow.index] as ReactTable.Row<any>;

						return (
							<tr key={row.id}>
							{
								row.getVisibleCells().map(cell => {
									return (
										<td key={cell.id}>
											{ReactTable.flexRender(
												cell.column.columnDef.cell,
												cell.getContext()
											)}
										</td>
									);
								})
							}
							</tr>
						);
					})}
					{paddingBottom > 0 && (
						<tr>
							<td style={{ height: `${paddingBottom}px` }} />
						</tr>
					)}
				</tbody>
			{ isFetchingNextPage ?
				<tfoot>
					<tr>
						<th className='processing' colSpan={columns.length}>
							Loading more rows...
						</th>
					</tr>
				</tfoot> :
				null
			}
			</table>
		</div>
	);
};
