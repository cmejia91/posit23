/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IRemoteAgentService, remoteConnectionLatencyMeasurer } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { localize } from 'vs/nls';
import { isWeb } from 'vs/base/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { getRemoteName } from 'vs/platform/remote/common/remoteHosts';
import { IBannerService } from 'vs/workbench/services/banner/browser/bannerService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IProductService } from 'vs/platform/product/common/productService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Codicon } from 'vs/base/common/codicons';
import Severity from 'vs/base/common/severity';


const REMOTE_UNSUPPORTED_CONNECTION_CHOICE_KEY = 'remote.unsupportedConnectionChoice';

export class InitialRemoteConnectionHealthContribution implements IWorkbenchContribution {

	constructor(
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IBannerService private readonly bannerService: IBannerService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IHostService private readonly hostService: IHostService,
		@IStorageService private readonly storageService: IStorageService,
		@IProductService private readonly productService: IProductService,
	) {
		if (this._environmentService.remoteAuthority) {
			this._checkInitialRemoteConnectionHealth();
		}
	}

	private async _confirmConnection(): Promise<boolean> {
		const enum ConnectionChoice {
			Allow = 1,
			LearnMore = 2,
			Cancel = 0
		}

		const { result, checkboxChecked } = await this.dialogService.prompt<ConnectionChoice>({
			type: Severity.Warning,
			message: localize('unsupportedGlibcWarning', "You are about to connect to an OS version that is unsupported by {0}.", this.productService.nameLong),
			buttons: [
				{
					label: localize({ key: 'allow', comment: ['&& denotes a mnemonic'] }, "&&Allow"),
					run: () => ConnectionChoice.Allow
				},
				{
					label: localize({ key: 'learnMore', comment: ['&& denotes a mnemonic'] }, "&&Learn More"),
					run: async () => { await this.openerService.open('https://aka.ms/vscode-remote/faq/old-linux'); return ConnectionChoice.LearnMore; }
				}
			],
			cancelButton: {
				run: () => ConnectionChoice.Cancel
			},
			checkbox: {
				label: localize('remember', "Do not show again"),
			}
		});

		if (result === ConnectionChoice.LearnMore) {
			return await this._confirmConnection();
		}

		const allowed = result === ConnectionChoice.Allow;
		if (allowed && checkboxChecked) {
			this.storageService.store(`${REMOTE_UNSUPPORTED_CONNECTION_CHOICE_KEY}.${this._environmentService.remoteAuthority}`, allowed, StorageScope.PROFILE, StorageTarget.MACHINE);
		}

		return allowed;
	}

	private async _checkInitialRemoteConnectionHealth(): Promise<void> {
		try {
			const environment = await this._remoteAgentService.getRawEnvironment();

			if (environment && environment.isUnsupportedGlibc) {
				let allowed = this.storageService.getBoolean(`${REMOTE_UNSUPPORTED_CONNECTION_CHOICE_KEY}.${this._environmentService.remoteAuthority}`, StorageScope.PROFILE);
				if (allowed === undefined) {
					allowed = await this._confirmConnection();
				}
				if (allowed) {
					const actions = [
						{
							label: localize('unsupportedGlibcBannerLearnMore', "Learn More"),
							href: 'https://aka.ms/vscode-remote/faq/old-linux'
						}
					];
					this.bannerService.show({
						id: 'unsupportedGlibcWarning.banner',
						message: localize('unsupportedGlibcWarning.banner', "You are connected to an OS version that is unsupported by {0}.", this.productService.nameLong),
						actions,
						icon: Codicon.warning,
						disableCloseAction: true
					});
				} else {
					this.hostService.openWindow({ forceReuseWindow: true, remoteAuthority: null });
					return;
				}
			}

			type RemoteConnectionSuccessClassification = {
				owner: 'alexdima';
				comment: 'The initial connection succeeded';
				web: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Is web ui.' };
				connectionTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time, in ms, until connected'; isMeasurement: true };
				remoteName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The name of the resolver.' };
			};
			type RemoteConnectionSuccessEvent = {
				web: boolean;
				connectionTimeMs: number | undefined;
				remoteName: string | undefined;
			};
			this._telemetryService.publicLog2<RemoteConnectionSuccessEvent, RemoteConnectionSuccessClassification>('remoteConnectionSuccess', {
				web: isWeb,
				connectionTimeMs: await this._remoteAgentService.getConnection()?.getInitialConnectionTimeMs(),
				remoteName: getRemoteName(this._environmentService.remoteAuthority)
			});

			await this._measureExtHostLatency();

		} catch (err) {

			type RemoteConnectionFailureClassification = {
				owner: 'alexdima';
				comment: 'The initial connection failed';
				web: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Is web ui.' };
				remoteName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The name of the resolver.' };
				connectionTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time, in ms, until connection failure'; isMeasurement: true };
				message: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Error message' };
			};
			type RemoteConnectionFailureEvent = {
				web: boolean;
				remoteName: string | undefined;
				connectionTimeMs: number | undefined;
				message: string;
			};
			this._telemetryService.publicLog2<RemoteConnectionFailureEvent, RemoteConnectionFailureClassification>('remoteConnectionFailure', {
				web: isWeb,
				connectionTimeMs: await this._remoteAgentService.getConnection()?.getInitialConnectionTimeMs(),
				remoteName: getRemoteName(this._environmentService.remoteAuthority),
				message: err ? err.message : ''
			});

		}
	}

	private async _measureExtHostLatency() {
		const measurement = await remoteConnectionLatencyMeasurer.measure(this._remoteAgentService);
		if (measurement === undefined) {
			return;
		}

		type RemoteConnectionLatencyClassification = {
			owner: 'connor4312';
			comment: 'The latency to the remote extension host';
			web: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether this is running on web' };
			remoteName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Anonymized remote name' };
			latencyMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Latency to the remote, in milliseconds'; isMeasurement: true };
		};
		type RemoteConnectionLatencyEvent = {
			web: boolean;
			remoteName: string | undefined;
			latencyMs: number;
		};

		this._telemetryService.publicLog2<RemoteConnectionLatencyEvent, RemoteConnectionLatencyClassification>('remoteConnectionLatency', {
			web: isWeb,
			remoteName: getRemoteName(this._environmentService.remoteAuthority),
			latencyMs: measurement.current
		});
	}
}
