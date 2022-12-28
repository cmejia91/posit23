/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit Software, PBC.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { IListItem } from 'vs/base/common/positronStuff';
import { HeaderValues } from 'vs/workbench/contrib/positronEnvironment/browser/components/headerValues';

/**
 * ValuesHeaderListItem class.
 */
export class ValuesHeaderListItem implements IListItem {
	/**
	 * Gets the ID.
	 */
	readonly id = '9805e7dc-a379-4a04-ae0d-2542f5fdd003';

	/**
	 * Gets the height.
	 */
	readonly height = 24;

	/**
	 * Gets the element.
	 */
	readonly element = <HeaderValues />;
}
