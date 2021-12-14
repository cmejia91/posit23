// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ImportMock } from 'ts-mock-imports';
import { SemVer } from 'semver';
import { ExecutionResult } from '../../../../client/common/process/types';
import { IDisposableRegistry } from '../../../../client/common/types';
import { Architecture } from '../../../../client/common/utils/platform';
import { InterpreterInformation } from '../../../../client/pythonEnvironments/base/info/interpreter';
import { parseVersion } from '../../../../client/pythonEnvironments/base/info/pythonVersion';
import * as ExternalDep from '../../../../client/pythonEnvironments/common/externalDependencies';
import {
    EnvironmentInfoServiceQueuePriority,
    getEnvironmentInfoService,
} from '../../../../client/pythonEnvironments/base/info/environmentInfoService';
import { buildEnvInfo } from '../../../../client/pythonEnvironments/base/info/env';
import { PythonEnvKind } from '../../../../client/pythonEnvironments/base/info';
import { Conda, CONDA_RUN_VERSION } from '../../../../client/pythonEnvironments/common/environmentManagers/conda';

suite('Environment Info Service', () => {
    let stubShellExec: sinon.SinonStub;
    let disposables: IDisposableRegistry;

    function createExpectedEnvInfo(executable: string): InterpreterInformation {
        return {
            version: {
                ...parseVersion('3.8.3-final'),
                sysVersion: '3.8.3 (tags/v3.8.3:6f8c832, May 13 2020, 22:37:02) [MSC v.1924 64 bit (AMD64)]',
            },
            arch: Architecture.x64,
            executable: {
                filename: executable,
                sysPrefix: 'path',
                mtime: -1,
                ctime: -1,
            },
        };
    }

    setup(() => {
        disposables = [];
        stubShellExec = ImportMock.mockFunction(
            ExternalDep,
            'shellExecute',
            new Promise<ExecutionResult<string>>((resolve) => {
                resolve({
                    stdout:
                        'SomeGarbage>>>JSON\n{"versionInfo": [3, 8, 3, "final", 0], "sysPrefix": "path", "sysVersion": "3.8.3 (tags/v3.8.3:6f8c832, May 13 2020, 22:37:02) [MSC v.1924 64 bit (AMD64)]", "is64Bit": true}\n<<<JSON_SomeGarbage',
                    stderr: 'Some std error', // This should be ignored.
                });
            }),
        );
        sinon.stub(Conda, 'getConda').resolves(new Conda('conda'));
        sinon.stub(Conda.prototype, 'getCondaVersion').resolves(new SemVer(CONDA_RUN_VERSION));
    });
    teardown(() => {
        sinon.restore();
        disposables.forEach((d) => d.dispose());
    });
    test('Add items to queue and get results', async () => {
        const envService = getEnvironmentInfoService(disposables);
        const promises: Promise<InterpreterInformation | undefined>[] = [];
        const expected: InterpreterInformation[] = [];
        for (let i = 0; i < 10; i = i + 1) {
            const path = `any-path${i}`;
            if (i < 5) {
                promises.push(envService.getEnvironmentInfo(buildEnvInfo({ executable: path })));
            } else {
                promises.push(
                    envService.getEnvironmentInfo(
                        buildEnvInfo({ executable: path }),
                        EnvironmentInfoServiceQueuePriority.High,
                    ),
                );
            }
            expected.push(createExpectedEnvInfo(path));
        }

        await Promise.all(promises).then((r) => {
            // The processing order is non-deterministic since we don't know
            // how long each work item will take. So we compare here with
            // results of processing in the same order as we have collected
            // the promises.
            assert.deepEqual(r, expected);
        });
    });

    test('Add same item to queue', async () => {
        const envService = getEnvironmentInfoService(disposables);
        const promises: Promise<InterpreterInformation | undefined>[] = [];
        const expected: InterpreterInformation[] = [];

        const path = 'any-path';
        // Clear call counts
        stubShellExec.resetHistory();
        // Evaluate once so the result is cached.
        await envService.getEnvironmentInfo(buildEnvInfo({ executable: path }));

        for (let i = 0; i < 10; i = i + 1) {
            promises.push(envService.getEnvironmentInfo(buildEnvInfo({ executable: path })));
            expected.push(createExpectedEnvInfo(path));
        }

        await Promise.all(promises).then((r) => {
            assert.deepEqual(r, expected);
        });
        assert.ok(stubShellExec.calledOnce);
    });

    test('isInfoProvided() returns true for items already processed', async () => {
        const envService = getEnvironmentInfoService(disposables);
        let result: boolean;
        const promises: Promise<InterpreterInformation | undefined>[] = [];
        const path1 = 'any-path1';
        const path2 = 'any-path2';

        promises.push(envService.getEnvironmentInfo(buildEnvInfo({ executable: path1 })));
        promises.push(envService.getEnvironmentInfo(buildEnvInfo({ executable: path2 })));

        await Promise.all(promises);
        result = envService.isInfoProvided(path1);
        assert.strictEqual(result, true);
        result = envService.isInfoProvided(path2);
        assert.strictEqual(result, true);
    });

    test('isInfoProvided() returns false otherwise', async () => {
        const envService = getEnvironmentInfoService(disposables);
        const promises: Promise<InterpreterInformation | undefined>[] = [];
        const path1 = 'any-path1';
        const path2 = 'any-path2';

        promises.push(envService.getEnvironmentInfo(buildEnvInfo({ executable: path1 })));
        promises.push(envService.getEnvironmentInfo(buildEnvInfo({ executable: path2 })));

        let result = envService.isInfoProvided(path1);
        assert.strictEqual(result, false);
        result = envService.isInfoProvided(path2);
        assert.strictEqual(result, false);
        result = envService.isInfoProvided('some-random-path');
        assert.strictEqual(result, false);
    });

    test('Returns expected item if interpreter type is conda', async () => {
        const envService = getEnvironmentInfoService(disposables);
        const path = `any-path`;
        const info = await envService.getEnvironmentInfo(buildEnvInfo({ executable: path, kind: PythonEnvKind.Conda }));
        assert.deepEqual(info, createExpectedEnvInfo(path));
    });
});
