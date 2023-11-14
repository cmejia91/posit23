/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';

/**
 * Represents an HTML dependency of an R HTML widget. This data structure is a
 * JSON-serialized form of the htmltools::htmlDependency R object.
 */
export interface RHtmlDependency {
	all_files: boolean; // eslint-disable-line
	head: string | null;
	meta: string | null;
	name: string | null;
	script: string | string[] | null;
	src: {
		file: string;
	};
	stylesheet: string | string[] | null;
	version: string | null;
}


export interface WidgetSizingPolicy {
	defaultHeight: string | null;
	defaultWidth: string | null;
	fill: boolean | null;
	padding: number | null;
}

export interface ViewerSizingPolicy extends WidgetSizingPolicy {
	paneHeight: number | null;
	suppress: boolean | null;
}

export interface BrowserSizingPolicy extends WidgetSizingPolicy {
	external: boolean | null;
}

export interface KnitrSizingPolicy extends WidgetSizingPolicy {
	figure: boolean | null;
}

export interface HtmlWidgetSizingPolicy extends WidgetSizingPolicy {
	viewer: ViewerSizingPolicy;
	browser: BrowserSizingPolicy;
	knitr: KnitrSizingPolicy;
}

/**
 * Represents an R HTML widget.
 */
export interface RHtmlWidget {
	dependencies: RHtmlDependency[];
	// eslint-disable-next-line
	sizing_policy: HtmlWidgetSizingPolicy;
	tags: string;
}

/**
 * Get the resource roots for R HTML widgets.
 */
export function getResourceRoots(widget: RHtmlWidget) {
	const roots: Uri[] = [];

	// Mark each dependency as a local resource root.
	widget.dependencies.forEach((dep: RHtmlDependency) => {
		if (dep.src.file) {
			roots.push(Uri.file(dep.src.file));
		}
	});

	return roots;
}
