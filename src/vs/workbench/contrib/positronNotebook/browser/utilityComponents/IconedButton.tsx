/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import 'vs/css!./IconedButton';

import * as React from 'react';
import { Button } from 'vs/base/browser/ui/positronComponents/button/button';

/**
 * Button with icon to the left for notebook actions etc..
 * @param codicon The codicon to use for the button
 * @param label The label for the button
 * @param onClick The function to call when the button is clicked
 * @returns A button with an icon as given by a codicon to the left.
 */
export function IconedButton({ codicon, label, onClick, bordered = false }: { codicon: string; label: string; onClick: () => void; bordered?: boolean }) {
	return <Button
		className={`action action-button positron-iconed-button ${bordered ? 'bordered' : ''}`}
		ariaLabel={label}
		onPressed={onClick}
	>
		<div className={`button-icon codicon codicon-${codicon}`} />
		<span className='action-label'>
			{label}
		</span>
	</Button>;
}
