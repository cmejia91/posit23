// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export interface ITestingSettings {
    readonly promptToConfigure: boolean;
    readonly debugPort: number;
    readonly nosetestsEnabled: boolean;
    nosetestPath: string;
    nosetestArgs: string[];
    readonly pytestEnabled: boolean;
    pytestPath: string;
    pytestArgs: string[];
    readonly unittestEnabled: boolean;
    unittestArgs: string[];
    cwd?: string;
    readonly autoTestDiscoverOnSaveEnabled: boolean;
}

export type TestSettingsPropertyNames = {
    enabledName: keyof ITestingSettings;
    argsName: keyof ITestingSettings;
    pathName?: keyof ITestingSettings;
};
