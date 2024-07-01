/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainThreadModalDialogsShape, MainPositronContext } from '../../common/positron/extHost.positron.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IPositronModalDialogsService } from 'vs/workbench/services/positronModalDialogs/common/positronModalDialogs';

@extHostNamedCustomer(MainPositronContext.MainThreadModalDialogs)
export class MainThreadModalDialogs implements MainThreadModalDialogsShape {

	private readonly _disposables = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@IPositronModalDialogsService private readonly _positronModalDialogsService: IPositronModalDialogsService
	) { }

	$showSimpleModalDialogPrompt(title: string, message: string, okButtonTitle?: string, cancelButtonTitle?: string): Promise<boolean> {
		return this._positronModalDialogsService.showSimpleModalDialogPrompt(title, message, okButtonTitle, cancelButtonTitle);
	}

	$showSimpleModalDialogMessage(title: string, message: string, okButtonTitle?: string): Promise<null> {
		return this._positronModalDialogsService.showSimpleModalDialogMessage(title, message, okButtonTitle);
	}

	public dispose(): void {
		this._disposables.dispose();
	}
}
