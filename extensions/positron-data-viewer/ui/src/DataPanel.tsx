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
import { DataFragment } from './DataFragment';
import { LoadingOverlay } from './LoadingOverlay';
import { DataFetcher, ResolverLookup } from './fetchData';
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

	// A reference to the scrollable table container element.
	const tableContainerRef = React.useRef<HTMLDivElement>(null);
	const headerRef = React.useRef<HTMLTableSectionElement>(null);
	const scrollPages = React.useRef<{top: number; bottom: number}>({top: 0, bottom: 0});

	const {initialData, fetchSize, vscode} = props;

	// The resolver functions and request queue need to persist between re-renders
	const requestResolvers = React.useRef<ResolverLookup>({});
	const requestQueue = React.useRef<number[]>([]);

	// Count total rows and pages, including those we have not yet fetched
	const totalRows = initialData.rowCount;
	const maxPage = Math.ceil(totalRows / fetchSize) - 1;

	// Makes an async request to the backend for data, and handles updating the request queue and
	// calling the appropriate resolve or reject function when the request completes.
	const fetcher = new DataFetcher(requestQueue.current, requestResolvers.current, totalRows, vscode);

	React.useEffect(() => {
		const handleMessage = ((event: any) => {
			// Update the data model in place and resolve/reject the outstanding request
			DataFragment.handleDataMessage(event, requestQueue.current, requestResolvers.current);
		});

		window.addEventListener('message', handleMessage);

		return () => {
			window.removeEventListener('message', handleMessage);
		};
	}, []);

	// Create the column definitions (metadata) for the table.
	// These use the 'any' type since the data model is generic.
	// They do not contain data and therefore do not need to change when the data model changes.
	const columns = React.useMemo<ReactTable.ColumnDef<any>[]>(() => {
		return initialData.columns.map((column, colIdx) => {
			return {
				id: '' + colIdx,
				accessorKey: colIdx,
				accessorFn: (row: any[]) => row[colIdx],
				header: column.name
			};
		});
	}, []);

	const initialDataFragment: DataFragment = new DataFragment(initialData.columns, 0, Math.min(fetchSize, totalRows));

	// Use a React Query infinite query to fetch data from the data model
	const {data, fetchNextPage, fetchPreviousPage, hasNextPage, hasPreviousPage} = ReactQuery.useInfiniteQuery(
	{
		queryKey: ['table-data'],
		queryFn: ({pageParam}) => fetcher.fetchNextDataFragment(pageParam, fetchSize),
		initialPageParam: 0,
		initialData: {
			pages: [initialDataFragment],
			pageParams: [0]
		},
		getPreviousPageParam: (_page, _pages, _firstPageParam, allPageParams) => {
			return allPageParams.includes(scrollPages.current.top)
				? undefined // don't refetch if we have already fetched data for this page
				: scrollPages.current.top; // otherwise, use scroll position to determine previous page
		},
		getNextPageParam: (_page, _pages, _lastPageParam, allPageParams) => {
			return allPageParams.includes(scrollPages.current.bottom)
				? undefined // don't refetch if we have already fetched data for this page
				: scrollPages.current.bottom; // otherwise, use scroll position to determine next page
		},
		// we don't need to check for active network connection before retrying a query
		networkMode: 'always',
		staleTime: Infinity,
		refetchOnWindowFocus: false
	});

	// Transpose and flatten the data. The data model stores data in a column-major
	// format, but React Table expects data in a row-major format, so we need to
	// transpose the data. We also need to pad the array with placeholder rows
	const flatData = React.useMemo(() => {
		// If we have skipped over pages while scrolling, those pages will not exist
		// So we need to iterate over all indices from 0 to the max page in pageParams
		// and insert empty placeholder rows for the missing pages
		if (!data.pages.length || !data.pageParams) {
			return [];
		}

		const highestPage = Math.max(...data.pageParams as number[]);
		const allPages = Array.from({ length: highestPage + 1 }, (_, pageParam) => pageParam);
		const numColumns = data.pages[0].columns.length ?? 0;
		const emptyPage = Array(fetchSize).fill(Array(numColumns).fill(undefined));

		return allPages.flatMap(pageParam => {
			const index = data.pageParams.indexOf(pageParam);
			const page = data.pages[index];

			if (!page || !page.columns.length ) {
				// No data for this page, fill to correct dimensions with empty data
				return emptyPage;
			} else {
				return page.transpose();
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
		count: totalRows,
		getScrollElement: () => tableContainerRef.current,
		// For now, we assume all rows are of constant height
		// TODO: account for variable height rows, here and below in the totalSize variable
		estimateSize: () => rowHeightPx,
		overscan: scrollOverscan
	});

	const virtualRows = rowVirtualizer.getVirtualItems();

	const {paddingTop, paddingBottom} = React.useMemo(() => {
		const totalSize = rowVirtualizer.getTotalSize();
		// Compute the padding for the table container.
		const paddingTop = virtualRows?.[0]?.start || 0;
		const paddingBottom = totalSize - (virtualRows?.[virtualRows.length - 1]?.end || 0);
		return {paddingTop, paddingBottom};
	}, [virtualRows]);

	// Callback, invoked on scroll, that will fetch more data from the backend if we have reached
	// the end of the virtualized rows by sending a new MessageRequest.
	const fetchMorePages = React.useCallback(() => {
		if (hasNextPage) {
			fetchNextPage({cancelRefetch: false});
		}
		if (hasPreviousPage) {
			fetchPreviousPage({cancelRefetch: false});
		}
	}, [fetchNextPage, hasNextPage, fetchPreviousPage, hasPreviousPage]);

	// Compute the current scroll page based on the virtualized rows
	const updateScroll = React.useCallback((firstVirtualRow: number, lastVirtualRow: number) => {
		// The virtual rows exist before we've fetched them, they are just empty
		const top = Math.floor(firstVirtualRow / fetchSize);
		const bottom = Math.min(Math.floor(lastVirtualRow / fetchSize), maxPage);
		scrollPages.current = {top, bottom};
	}, []);

	const firstVirtualRow = virtualRows?.[0]?.index ?? 0;
	const lastVirtualRow = virtualRows?.[virtualRows.length - 1]?.index ?? 0;

	React.useEffect(() => {
		// Make sure we've caught up with the latest scroll position
		// Otherwise the data can get stuck out of sync with the scroll if the user has scrolled quickly
		// Also ensures that we fetch both the previous and next page if both are needed
		// (i.e. the viewport crosses a page boundary)
		updateScroll(firstVirtualRow, lastVirtualRow);
		fetchMorePages();
	}, [firstVirtualRow, lastVirtualRow, fetchMorePages, rowVirtualizer.isScrolling]);

	const columnId = columns[0].id;
	const topHasData = (
		!!columnId &&
		rows.length > firstVirtualRow &&
		rows[firstVirtualRow].getValue(columnId) !== undefined
	);
	const bottomHasData = (
		!!columnId &&
		rows.length > lastVirtualRow &&
		rows[lastVirtualRow].getValue(columnId) !== undefined
	);
	const isLoading = !topHasData || !bottomHasData;

	return (
		<div
			className='container'
			ref={tableContainerRef}
		>
			<table>
				<thead ref={headerRef}>
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
					{
						isLoading ?
							null :
							virtualRows.map(virtualRow => {
							const row = rows[virtualRow.index] as ReactTable.Row<any>;

							return (
								<tr
									key={virtualRow.key}
									data-index={virtualRow.index}
									style={{height: `${virtualRow.size}px`}}
								>
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
			</table>
			<LoadingOverlay
				isLoading={isLoading}
				container={tableContainerRef.current}
				header={headerRef.current}
			/>
		</div>
	);
};
