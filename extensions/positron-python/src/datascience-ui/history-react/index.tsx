// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import './index.css';

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Provider } from 'react-redux';

import { IVsCodeApi } from '../react-common/postOffice';
import { detectBaseTheme } from '../react-common/themeDetector';
import { getConnectedInteractiveEditor } from './interactivePanel';
import { createStore } from './redux/store';

// This special function talks to vscode from a web panel
export declare function acquireVsCodeApi(): IVsCodeApi;
const baseTheme = detectBaseTheme();
// tslint:disable-next-line: no-any
const testMode = (window as any).inTestMode;
// tslint:disable-next-line: no-typeof-undefined
const skipDefault = testMode ? false : typeof acquireVsCodeApi !== 'undefined';

// Create the redux store
const store = createStore(skipDefault, baseTheme, testMode);

// Wire up a connected react control for our InteractiveEditor
const ConnectedInteractiveEditor = getConnectedInteractiveEditor();

// Stick them all together
// tslint:disable:no-typeof-undefined
ReactDOM.render(
    <Provider store={store}>
        <ConnectedInteractiveEditor />
    </Provider>,
    document.getElementById('root') as HTMLElement
);
