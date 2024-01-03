/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	ColumnFilterCompareOp,
	ColumnFilterFilterType,
	ColumnFilterSearchType
} from 'vs/workbench/services/languageRuntime/common/positronDataToolComm';
import * as mocks from "vs/workbench/services/positronDataTool/common/positronDataToolMocks";

/**
 * Basic smoke tests for debugging the mock functions
 */
suite('DataToolMocks', () => {
	test('Test getTableSchema', () => {
		const schema = mocks.getTableSchema(1000, 10000);
		assert.equal(schema.columns.length, 10000);
		assert.equal(schema.num_rows, 1000);
	});

	test('Test getExampleTableData', () => {
		const schema = mocks.getTableSchema(1000, 10000);
		let data = mocks.getExampleTableData(schema, 0, 100, 0, 10);
		assert.equal(data.columns.length, 10);
		assert.equal(data.columns[0].length, 100);

		// Bounds respected
		data = mocks.getExampleTableData(schema, 999, 100, 9999, 100);
		assert.equal(data.columns.length, 1);
		assert.equal(data.columns[0].length, 1);

		data = mocks.getExampleTableData(schema, 1000, 100, 10000, 100);
		assert.equal(data.columns.length, 0);
	});

	test('Test getCompareFilter', () => {
		const filter = mocks.getCompareFilter('column_2', ColumnFilterCompareOp.Gt, '1234');
		assert.equal(filter.filter_type, ColumnFilterFilterType.Compare);
		assert.equal(filter.column, 'column_2');
		assert.equal(filter.compare_op, ColumnFilterCompareOp.Gt);
		assert.equal(filter.compare_value, '1234');
	});

	test('Test getIsNullFilter', () => {
		let filter = mocks.getIsNullFilter('column_3');
		assert.equal(filter.column, 'column_3');
		assert.equal(filter.filter_type, ColumnFilterFilterType.Isnull);

		filter = mocks.getNotNullFilter('column_3');
		assert.equal(filter.filter_type, ColumnFilterFilterType.Notnull);
	});

	test('Test getTextSearchFilter', () => {
		const filter = mocks.getTextSearchFilter('column_5', 'needle',
			ColumnFilterSearchType.Contains, false);
		assert.equal(filter.column, 'column_5');
		assert.equal(filter.filter_type, ColumnFilterFilterType.Search);
		assert.equal(filter.search_term, 'needle');
		assert.equal(filter.search_type, ColumnFilterSearchType.Contains);
		assert.equal(filter.search_case_sensitive, false);
	});

	test('Test getSetMemberFilter', () => {
		const set_values = ['need1', 'need2'];
		const filter = mocks.getSetMemberFilter('column_6', set_values, true);
		assert.equal(filter.column, 'column_6');
		assert.equal(filter.filter_type, ColumnFilterFilterType.SetMembership);
		assert.equal(filter.set_member_values, set_values);
		assert.equal(filter.set_member_inclusive, true);
	});

});
