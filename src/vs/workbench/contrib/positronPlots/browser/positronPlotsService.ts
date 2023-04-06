/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IPlotClientMessageInput, IPlotClientMessageOutput, IPositronPlotMetadata, PlotClientInstance } from 'vs/workbench/services/languageRuntime/common/languageRuntimePlotClient';
import { ILanguageRuntime, ILanguageRuntimeMessageOutput, ILanguageRuntimeService, IRuntimeClientInstance, RuntimeClientType } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { IPositronPlotsService, PositronPlotClient } from 'vs/workbench/services/positronPlots/common/positronPlots';
import { Emitter, Event } from 'vs/base/common/event';
import { StaticPlotClient } from 'vs/workbench/services/positronPlots/common/staticPlotClient';
import { IStorageService, StorageTarget, StorageScope } from 'vs/platform/storage/common/storage';

/** The maximum number of recent executions to store. */
const MaxRecentExecutions = 10;

/**
 * PositronPlotsService class.
 */
export class PositronPlotsService extends Disposable implements IPositronPlotsService {
	/** Needed for service branding in dependency injector. */
	declare readonly _serviceBrand: undefined;

	/** The list of Positron plots. */
	private readonly _plots: PositronPlotClient[] = [];

	/** The emitter for the onDidEmitPlot event */
	private readonly _onDidEmitPlot = new Emitter<PositronPlotClient>();

	/** The emitter for the onDidSelectPlot event */
	private readonly _onDidSelectPlot = new Emitter<string>();

	/** The emitter for the onDidRemovePlot event */
	private readonly _onDidRemovePlot = new Emitter<string>();

	/** The ID Of the currently selected plot, if any */
	private _selectedPlotId: string | undefined;

	/**
	 * A map of recently executed code; the map is from the parent ID to the
	 * code executed. We keep around the last 10 executions so that when a plot
	 * is emitted, we can generally find the code that generated it and display
	 * it in the plot view.
	 */
	private readonly _recentExecutions = new Map<string, string>();
	private readonly _recentExecutionIds = new Array<string>();

	/** Creates the Positron plots service instance */
	constructor(
		@ILanguageRuntimeService private _languageRuntimeService: ILanguageRuntimeService,
		@IStorageService private _storageService: IStorageService,) {
		super();

		// Register for language runtime service startups
		this._register(this._languageRuntimeService.onDidStartRuntime((runtime) => {
			this.attachRuntime(runtime);
		}));

		// Listen for plots being selected and update the selected plot ID
		this._register(this._onDidSelectPlot.event((id) => {
			this._selectedPlotId = id;
		}));
	}

	/**
	 * Attaches to a language runtime.
	 *
	 * @param runtime The language runtime to attach to.
	 */
	private attachRuntime(runtime: ILanguageRuntime) {
		// Get the list of existing plot clients; these are expected in the
		// case of reconnecting to a running language runtime, and represent
		// the user's active set of plot objects.
		runtime.listClients(RuntimeClientType.Plot).then(clients => {
			const plotClients: Array<PlotClientInstance> = [];
			clients.forEach((client) => {
				if (client.getClientType() === RuntimeClientType.Plot) {

					// Attempt to load the metadata for this plot from storage
					const storedMetadata = this._storageService.get(
						this.generateStorageKey(runtime.metadata.runtimeId, client.getClientId()),
						StorageScope.WORKSPACE);

					// If we have metadata, try to parse it and register the plot
					let registered = false;
					if (storedMetadata) {
						try {
							const metadata = JSON.parse(storedMetadata) as IPositronPlotMetadata;
							plotClients.push(new PlotClientInstance(client, metadata));
							registered = true;
						} catch (error) {
							console.warn(`Error parsing plot metadata: ${error}`);
						}
					}
					// If we don't have metadata, register the plot with a default metadata object
					if (!registered) {
						const metadata: IPositronPlotMetadata = {
							created: Date.now(),
							id: client.getClientId(),
							runtime_id: runtime.metadata.runtimeId,
							parent_id: '',
							code: '',
						};
						plotClients.push(new PlotClientInstance(client, metadata));
					}
				} else {
					console.warn(
						`Unexpected client type ${client.getClientType()} ` +
						`(expected ${RuntimeClientType.Plot})`);
				}
			});

			// Sort the plot clients by creation time, oldest first
			plotClients.sort((a, b) => {
				return a.metadata.created - b.metadata.created;
			});

			// Register each plot client with the plots service
			plotClients.forEach((client) => {
				this.registerPlotClient(client);
			});
		});

		this._register(runtime.onDidReceiveRuntimeMessageInput((message) => {
			// Add this code to the recent executions map. If the map is
			// already at the maximum size, remove the oldest entry.
			this._recentExecutionIds.push(message.parent_id);
			if (this._recentExecutionIds.length > MaxRecentExecutions) {
				const id = this._recentExecutionIds.shift();
				if (id) {
					this._recentExecutions.delete(id);
				}
			}
			this._recentExecutions.set(message.parent_id, message.code);
		}));

		// Listen for new dynamic plots being emitted, and register each one
		// with the plots service.
		this._register(runtime.onDidCreateClientInstance((event) => {
			if (event.client.getClientType() === RuntimeClientType.Plot) {
				// Get the code that generated this plot, if we have it
				const code = this._recentExecutions.has(event.message.parent_id) ?
					this._recentExecutions.get(event.message.parent_id)! : '';

				// Create the metadata object
				const metadata: IPositronPlotMetadata = {
					created: Date.parse(event.message.when),
					id: event.client.getClientId(),
					runtime_id: runtime.metadata.runtimeId,
					parent_id: event.message.parent_id,
					code,
				};

				// Save the metadata to storage so that we can restore it when
				// the plot is reconnected.
				this._storageService.store(
					this.generateStorageKey(metadata.runtime_id, metadata.id),
					JSON.stringify(metadata),
					StorageScope.WORKSPACE,
					StorageTarget.MACHINE);

				// Register the plot client
				const plotClient = new PlotClientInstance(event.client, metadata);
				this.registerPlotClient(plotClient);
			}
		}));

		// Listen for static plots being emitted, and register each one with
		// the plots service.
		this._register(runtime.onDidReceiveRuntimeMessageOutput((message) => {
			const code = this._recentExecutions.has(message.parent_id) ?
				this._recentExecutions.get(message.parent_id) : '';
			const imageKey = Object.keys(message.data).find(key => key.startsWith('image/'));
			if (imageKey) {
				this.registerStaticPlot(runtime.metadata.runtimeId, message, code);
			}
		}));
	}

	/**
	 * Creates a new plot client instance wrapper and registers it with the
	 * service.
	 *
	 * @param plotClient The plot client instance to wrap.
	 */
	private registerPlotClient(plotClient: PlotClientInstance) {

		// Add to our list of plots and fire the event notifying subscribers
		this._plots.unshift(plotClient);
		this._onDidEmitPlot.fire(plotClient);
		this._onDidSelectPlot.fire(plotClient.id);

		// Remove the plot from our list when it is closed
		plotClient.onDidClose(() => {
			const index = this._plots.indexOf(plotClient);
			if (index >= 0) {
				this._plots.splice(index, 1);
			}
			// Clear the plot's metadata from storage
			this._storageService.remove(
				this.generateStorageKey(plotClient.metadata.runtime_id, plotClient.metadata.id),
				StorageScope.WORKSPACE);
		});

		// Dispose the plot client when this service is disposed (we own this
		// object)
		this._register(plotClient);
	}

	/**
	 * Creates a new static plot client instance and registers it with the
	 * service.
	 *
	 * @param message The message containing the static plot data.
	 * @param code The code that generated the plot, if available.
	 */
	private registerStaticPlot(
		runtimeId: string,
		message: ILanguageRuntimeMessageOutput,
		code?: string) {
		const client = new StaticPlotClient(runtimeId, message, code);
		this._plots.unshift(client);
		this._onDidEmitPlot.fire(client);
		this._onDidSelectPlot.fire(client.id);
		this._register(client);
	}

	onDidEmitPlot: Event<PositronPlotClient> = this._onDidEmitPlot.event;
	onDidSelectPlot: Event<string> = this._onDidSelectPlot.event;
	onDidRemovePlot: Event<string> = this._onDidRemovePlot.event;

	// Gets the individual plot instances.
	get positronPlotInstances(): PositronPlotClient[] {
		return this._plots;
	}

	/**
	 * Select a plot by ID
	 *
	 * @param index The ID of the plot to select.
	 */
	selectPlot(id: string): void {
		this._onDidSelectPlot.fire(id);
	}

	/**
	 * Remove a plot by ID
	 *
	 * @param id The ID of the plot to remove
	 */
	removePlot(id: string): void {
		// Find the plot with the given ID and remove it from the list
		this._plots.forEach((plot, index) => {
			if (plot.id === id) {
				plot.dispose();

				// Remove the plot from the list
				this._plots.splice(index, 1);
			}
		});

		// If this plot was selected, select the first plot in the list
		if (this._selectedPlotId === id) {
			if (this._plots.length > 0) {
				// There are still some plots; select the first one
				this._onDidSelectPlot.fire(this._plots[0].id);
			}
			else {
				// There are no plots; clear the selected plot ID
				this._selectedPlotId = undefined;
			}
		}

		// Fire the event notifying subscribers
		this._onDidRemovePlot.fire(id);
	}

	/**
	 * Generates a storage key for a plot.
	 *
	 * @param runtimeId The ID of the runtime that owns the plot.
	 * @param plotId The ID of the plot itself.
	 */
	generateStorageKey(runtimeId: string, plotId: string): string {
		return `positron.plot.${runtimeId}.${plotId}`;
	}

	/**
	 * Placeholder for service initialization.
	 */
	initialize() {
	}
}
