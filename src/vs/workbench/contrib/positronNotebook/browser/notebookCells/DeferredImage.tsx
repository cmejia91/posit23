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
		services.commandService.executeCommand(
			'positronNotebookHelpers.convertImageToBase64',
			src, baseLocation
		).then((res: unknown) => {
			if (typeof res === 'string') {
				setResults({ status: 'success', data: res });
			} else if (isConversionErrorMsg(res)) {
				services.logService.error('Failed to convert image to base64', src, res.message);
				setResults(res);
			} else {
				services.logService.error('Unexpected response from convertImageToBase64', res);
				setResults({ status: 'error', message: 'Unexpected response from convertImageToBase64' });
			}
		});
	}, [src, baseLocation, services]);

	switch (results.status) {
		case 'pending':
			return <div
				className='positron-notebooks-deferred-img-placeholder'
				aria-label='Loading image...'
				role='img'
				{...props}
			></div>;
		case 'error':
			return <img src={src} aria-label={results.message} {...props} />;
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
