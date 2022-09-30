/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RStudio, PBC.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./contentAreaComponent';
const React = require('react');
import * as _ from 'react';

/**
 * ContentAreaComponent component.
 */
export const ContentAreaComponent = ({ children }: { children: React.ReactNode }) => {
	// Render.
	return (
		<div className='content-area'>
			{children}
		</div>
	);
};
