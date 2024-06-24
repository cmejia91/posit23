/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./okActionBar';

// React.
import * as React from 'react';

// Other dependencies.
import { localize } from 'vs/nls';
import { Button } from 'vs/base/browser/ui/positronComponents/button/button';

/**
 * okActionBarProps interface.
 */
interface OKActionBarProps {
	okButtonTitle?: string;
	onAccept: () => void;
}

/**
 * OKActionBar component.
 * @param props An OKActionBarProps that contains the component properties.
 * @returns The rendered component.
 */
export const OKActionBar = (props: OKActionBarProps) => {
	// Render.
	return (
		<div className='ok-action-bar top-separator'>
			<Button className='action-bar-button default' onPressed={props.onAccept}>
				{props.okButtonTitle ?? localize('positronOK', "OK")}
			</Button>
		</div>
	);
};
