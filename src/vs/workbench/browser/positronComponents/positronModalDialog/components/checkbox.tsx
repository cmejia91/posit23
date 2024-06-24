/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import 'vs/css!./checkbox';

// React.
import * as React from 'react';
import { useRef, useState } from 'react'; // eslint-disable-line no-duplicate-imports

// Other dependencies.
import { generateUuid } from 'vs/base/common/uuid';

/**
 * CheckboxProps interface.
 */
interface CheckboxProps {
	label: string;
	initialChecked?: boolean;
	onChanged: (checked: boolean) => void;
}

// Toggle component.
export const Checkbox = ({ label, initialChecked, onChanged }: CheckboxProps) => {
	// Hooks.
	const [id] = useState(generateUuid());
	const [checked, setChecked] = useState(initialChecked ?? false);
	const buttonRef = useRef<HTMLButtonElement>(undefined!);

	// Click handler.
	const clickHandler = () => {
		buttonRef.current.setAttribute('aria-checked', !checked ? 'true' : 'false');
		setChecked(!checked);
		onChanged(!checked);
	};


	// Render.
	return (
		<div className='checkbox'>
			<button ref={buttonRef} id={id} className='checkbox-button' aria-checked='false' tabIndex={0} role='checkbox' onClick={clickHandler}>
				{checked && <div className='check-indicator codicon codicon-check' />}
			</button>
			<label htmlFor={id}>{label}</label>
		</div>
	);
};
