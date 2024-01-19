/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorPaneRegistry, EditorPaneDescriptor } from 'vs/workbench/browser/editor';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { EditorExtensions } from 'vs/workbench/common/editor';

import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { PositronNotebookEditorInput } from './PositronNotebookEditorInput';
import { PositronNotebookEditor } from './PositronNotebookEditor';


/**
 * Positron notebook action category.
 */
const POSITRON_NOTEBOOK_CATEGORY = localize(
	'positronNotebookCategory',
	"Positron Notebook"
);

/**
 * The category for the actions below.
 */
const category: ILocalizedString = {
	value: POSITRON_NOTEBOOK_CATEGORY,
	original: 'Open Positron Notebook'
};


export class OpenPositronNotebook extends Action2 {
	constructor() {
		super({
			id: 'openPositronNotebook',
			title: { value: localize('openPositronNotebook', "Open Positron Notebook"), original: 'Open Positron Notebook' },
			category: category,
			f1: true,

		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const notifictionService = accessor.get(INotificationService);
		const editorService = accessor.get(IEditorService);

		notifictionService.info('Hello Positron!');

		// Open the editor.
		const positronNotebookUri = URI.from({
			scheme: Schemas.positronNotebook,
			// TODO: Use a legitimate ID instead of "5"
			path: `positron-notebook-5`
		});

		editorService.openEditor({
			resource: positronNotebookUri
		});
	}
}

registerAction2(OpenPositronNotebook);



/**
 * PositronNotebookContribution class.
 */
class PositronNotebookContribution extends Disposable {
	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			// The glob pattern for this registration
			`${Schemas.positronNotebook}:**/**`,
			// Information about the registration
			{
				id: PositronNotebookEditorInput.EditorID,
				label: localize('positronNotebook', "Positron Notebook"),
				priority: RegisteredEditorPriority.builtin
			},
			// Specific options which apply to this registration
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === Schemas.positronNotebook
			},
			// The editor input factory functions
			{
				// Right now this doesn't do anything because we hijack the
				// vscode built in notebook factories to open our notebooks.
				createEditorInput: ({ resource, options }) => {
					// TODO: Make this be based on the actual file.
					const temporaryViewType = 'jupyter-notebook';
					return { editor: instantiationService.createInstance(PositronNotebookEditorInput, resource, temporaryViewType), options };
				}
			}
		));
	}
}

// Register the Positron notebook editor pane.
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		PositronNotebookEditor,
		PositronNotebookEditorInput.EditorID,
		localize('positronNotebookEditor', "Positron Notebook Editor")
	),
	[
		new SyncDescriptor(PositronNotebookEditorInput)
	]
);

// Register workbench contributions.
const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(PositronNotebookContribution, LifecyclePhase.Starting);

