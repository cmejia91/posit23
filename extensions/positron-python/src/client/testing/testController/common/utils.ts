// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as net from 'net';
import * as path from 'path';
import { CancellationToken, Position, TestController, TestItem, Uri, Range } from 'vscode';
import { traceError, traceLog, traceVerbose } from '../../../logging';

import { EnableTestAdapterRewrite } from '../../../common/experiments/groups';
import { IExperimentService } from '../../../common/types';
import { IServiceContainer } from '../../../ioc/types';
import { DebugTestTag, ErrorTestItemOptions, RunTestTag } from './testItemUtilities';
import { DiscoveredTestItem, DiscoveredTestNode, ITestResultResolver } from './types';

export function fixLogLines(content: string): string {
    const lines = content.split(/\r?\n/g);
    return `${lines.join('\r\n')}\r\n`;
}
export interface IJSONRPCContent {
    extractedJSON: string;
    remainingRawData: string;
}

export interface IJSONRPCHeaders {
    headers: Map<string, string>;
    remainingRawData: string;
}

export const JSONRPC_UUID_HEADER = 'Request-uuid';
export const JSONRPC_CONTENT_LENGTH_HEADER = 'Content-Length';
export const JSONRPC_CONTENT_TYPE_HEADER = 'Content-Type';

export function jsonRPCHeaders(rawData: string): IJSONRPCHeaders {
    const lines = rawData.split('\n');
    let remainingRawData = '';
    const headerMap = new Map<string, string>();
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line === '') {
            remainingRawData = lines.slice(i + 1).join('\n');
            break;
        }
        const [key, value] = line.split(':');
        if ([JSONRPC_UUID_HEADER, JSONRPC_CONTENT_LENGTH_HEADER, JSONRPC_CONTENT_TYPE_HEADER].includes(key)) {
            headerMap.set(key.trim(), value.trim());
        }
    }

    return {
        headers: headerMap,
        remainingRawData,
    };
}

export function jsonRPCContent(headers: Map<string, string>, rawData: string): IJSONRPCContent {
    const length = parseInt(headers.get('Content-Length') ?? '0', 10);
    const data = rawData.slice(0, length);
    const remainingRawData = rawData.slice(length);
    return {
        extractedJSON: data,
        remainingRawData,
    };
}

export function pythonTestAdapterRewriteEnabled(serviceContainer: IServiceContainer): boolean {
    const experiment = serviceContainer.get<IExperimentService>(IExperimentService);
    return experiment.inExperimentSync(EnableTestAdapterRewrite.experiment);
}

export async function startTestIdServer(testIds: string[]): Promise<number> {
    const startServer = (): Promise<number> =>
        new Promise((resolve, reject) => {
            const server = net.createServer((socket: net.Socket) => {
                // Convert the test_ids array to JSON
                const testData = JSON.stringify(testIds);

                // Create the headers
                const headers = [`Content-Length: ${Buffer.byteLength(testData)}`, 'Content-Type: application/json'];

                // Create the payload by concatenating the headers and the test data
                const payload = `${headers.join('\r\n')}\r\n\r\n${testData}`;

                // Send the payload to the socket
                socket.write(payload);

                // Handle socket events
                socket.on('data', (data) => {
                    traceLog('Received data:', data.toString());
                });

                socket.on('end', () => {
                    traceLog('Client disconnected');
                });
            });

            server.listen(0, () => {
                const { port } = server.address() as net.AddressInfo;
                traceLog(`Server listening on port ${port}`);
                resolve(port);
            });

            server.on('error', (error: Error) => {
                reject(error);
            });
        });

    // Start the server and wait until it is listening
    let returnPort = 0;
    try {
        await startServer()
            .then((assignedPort) => {
                traceVerbose(`Server started for pytest test ids server and listening on port ${assignedPort}`);
                returnPort = assignedPort;
            })
            .catch((error) => {
                traceError('Error starting server for pytest test ids server:', error);
                return 0;
            })
            .finally(() => returnPort);
        return returnPort;
    } catch {
        traceError('Error starting server for pytest test ids server, cannot get port.');
        return returnPort;
    }
}

export function buildErrorNodeOptions(uri: Uri, message: string, testType: string): ErrorTestItemOptions {
    const labelText = testType === 'pytest' ? 'Pytest Discovery Error' : 'Unittest Discovery Error';
    return {
        id: `DiscoveryError:${uri.fsPath}`,
        label: `${labelText} [${path.basename(uri.fsPath)}]`,
        error: message,
    };
}

export function populateTestTree(
    testController: TestController,
    testTreeData: DiscoveredTestNode,
    testRoot: TestItem | undefined,
    resultResolver: ITestResultResolver,
    token?: CancellationToken,
): void {
    // If testRoot is undefined, use the info of the root item of testTreeData to create a test item, and append it to the test controller.
    if (!testRoot) {
        testRoot = testController.createTestItem(testTreeData.path, testTreeData.name, Uri.file(testTreeData.path));

        testRoot.canResolveChildren = true;
        testRoot.tags = [RunTestTag, DebugTestTag];

        testController.items.add(testRoot);
    }

    // Recursively populate the tree with test data.
    testTreeData.children.forEach((child) => {
        if (!token?.isCancellationRequested) {
            if (isTestItem(child)) {
                const testItem = testController.createTestItem(child.id_, child.name, Uri.file(child.path));
                testItem.tags = [RunTestTag, DebugTestTag];

                const range = new Range(
                    new Position(Number(child.lineno) - 1, 0),
                    new Position(Number(child.lineno), 0),
                );
                testItem.canResolveChildren = false;
                testItem.range = range;
                testItem.tags = [RunTestTag, DebugTestTag];

                testRoot!.children.add(testItem);
                // add to our map
                resultResolver.runIdToTestItem.set(child.runID, testItem);
                resultResolver.runIdToVSid.set(child.runID, child.id_);
                resultResolver.vsIdToRunId.set(child.id_, child.runID);
            } else {
                let node = testController.items.get(child.path);

                if (!node) {
                    node = testController.createTestItem(child.id_, child.name, Uri.file(child.path));

                    node.canResolveChildren = true;
                    node.tags = [RunTestTag, DebugTestTag];
                    testRoot!.children.add(node);
                }
                populateTestTree(testController, child, node, resultResolver, token);
            }
        }
    });
}

function isTestItem(test: DiscoveredTestNode | DiscoveredTestItem): test is DiscoveredTestItem {
    return test.type_ === 'test';
}
