/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { DisposableStore } from 'vs/base/common/lifecycle';

/**
 * Create a disposable store for the component.
 * Will cleanup/dispose stored disposables when the component is unmounted.
 */
export function useDisposableStore(): DisposableStore {
	const disposables = React.useRef(new DisposableStore());
	React.useEffect(() => {
		const current = disposables.current;
		return () => current.dispose();
	}, []);
	return disposables.current;
}
