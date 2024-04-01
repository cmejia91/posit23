/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import 'vs/css!./DeferredImage';

import * as React from 'react';
import { useServices } from 'vs/workbench/contrib/positronNotebook/browser/ServicesProvider';
import { useNotebookInstance } from 'vs/workbench/contrib/positronNotebook/browser/NotebookInstanceProvider';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { dirname } from 'vs/base/common/resources';
import { localize } from 'vs/nls';
import { createCancelablePromise, raceTimeout } from 'vs/base/common/async';

/**
 * This should match the error message defined in the command definition
 * (extensions/positron-notebooks/src/extension.ts)
 */
type CoversionErrorMsg = {
	status: 'error';
	message: string;
};

/**
 * Predicate function to allow us to be safe with our response processing from command.
 * @param x: Variable of unknown type to check if it is a `CoversionErrorMsg`.
 * @returns Whether the object is a `CoversionErrorMsg`.
 */
function isConversionErrorMsg(x: unknown): x is CoversionErrorMsg {
	return x !== null && typeof x === 'object' && 'status' in x && x.status === 'error' && 'message' in x;
}

type ImageDataResults = {
	status: 'pending';
} | {
	status: 'success';
	data: string;
} | {
	status: 'error';
	message: string;
};

/**
 * Special image component that defers loading of the image while it converts it to a data-url using
 * the `positronNotebookHelpers.convertImageToBase64` command.
 * @param props: Props for `img` element.
 * @returns Image tag that shows the image once it is loaded.
 */
// eslint-disable-next-line react/prop-types
export function DeferredImage({ src = 'no-source', ...props }: React.ComponentPropsWithoutRef<'img'>) {
	const services = useServices();
	const notebookInstance = useNotebookInstance();
	const baseLocation = getNotebookBaseUri(notebookInstance.uri).path;

	const [results, setResults] = React.useState<ImageDataResults>({ status: 'pending' });

	React.useEffect(() => {

		// Check for prefix of http or https to avoid converting remote images
		if (src.startsWith('http://') || src.startsWith('https://')) {
			setResults({ status: 'success', data: src });
			return;
		}

		const conversionTimeoutMs = 3000;
		const errorTimeoutMs = 1000;

		let delayedErrorMsg: NodeJS.Timeout;

		const conversionCancellablePromise = createCancelablePromise(() => raceTimeout(
			services.commandService.executeCommand('positronNotebookHelpers.convertImageToBase64', src, baseLocation),
			conversionTimeoutMs
		));

		conversionCancellablePromise.then((payload) => {
			if (typeof payload === 'string') {
				setResults({ status: 'success', data: payload });
			} else if (isConversionErrorMsg(payload)) {

				delayedErrorMsg = setTimeout(() => {
					services.logService.error(localize('failedToConvert', 'Failed to convert image to base64:'), src, payload.message);
				}, errorTimeoutMs);

				setResults(payload);
			} else {
				const unexpectedResponseString = localize('unexpectedResponse', 'Unexpected response from convertImageToBase64');
				delayedErrorMsg = setTimeout(() => {
					services.logService.error(unexpectedResponseString, payload);
				}, errorTimeoutMs);
				setResults({ status: 'error', message: unexpectedResponseString });
			}
		}).catch((err) => {
			setResults({ status: 'error', message: err.message });
		});

		return () => {
			clearTimeout(delayedErrorMsg);
			conversionCancellablePromise.cancel();
		};
	}, [src, baseLocation, services]);

	switch (results.status) {
		case 'pending':
			return <div
				className='positron-notebooks-deferred-img-placeholder'
				aria-label={localize('deferredImageLoading', 'Loading image...')}
				role='img'
				{...props}
			></div>;
		case 'error':
			// Show image tag without attempt to convert. Probably will be broken but will provide
			// clue as to what's going on.
			return <img {...props} aria-label={results.message} />;
		case 'success':
			return <img src={results.data} {...props} />;
	}
}

function getNotebookBaseUri(notebookUri: URI) {
	if (notebookUri.scheme === Schemas.untitled) {
		// TODO: Use workspace context service to set the base URI to workspace root
		throw new Error('Have not yet implemented untitled notebook URIs');
	}

	return dirname(notebookUri);
}
