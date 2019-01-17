// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

export enum EventName {
    COMPLETION = 'COMPLETION',
    COMPLETION_ADD_BRACKETS = 'COMPLETION.ADD_BRACKETS',
    DEFINITION = 'DEFINITION',
    HOVER_DEFINITION = 'HOVER_DEFINITION',
    REFERENCE = 'REFERENCE',
    SIGNATURE = 'SIGNATURE',
    SYMBOL = 'SYMBOL',
    FORMAT_SORT_IMPORTS = 'FORMAT.SORT_IMPORTS',
    FORMAT = 'FORMAT.FORMAT',
    FORMAT_ON_TYPE = 'FORMAT.FORMAT_ON_TYPE',
    EDITOR_LOAD = 'EDITOR.LOAD',
    LINTING = 'LINTING',
    GO_TO_OBJECT_DEFINITION = 'GO_TO_OBJECT_DEFINITION',
    UPDATE_PYSPARK_LIBRARY = 'UPDATE_PYSPARK_LIBRARY',
    REFACTOR_RENAME = 'REFACTOR_RENAME',
    REFACTOR_EXTRACT_VAR = 'REFACTOR_EXTRACT_VAR',
    REFACTOR_EXTRACT_FUNCTION = 'REFACTOR_EXTRACT_FUNCTION',
    REPL = 'REPL',
    PYTHON_INTERPRETER = 'PYTHON_INTERPRETER',
    PYTHON_INTERPRETER_DISCOVERY = 'PYTHON_INTERPRETER_DISCOVERY',
    PYTHON_INTERPRETER_AUTO_SELECTION = 'PYTHON_INTERPRETER_AUTO_SELECTION',
    PYTHON_INTERPRETER_ACTIVATION_ENVIRONMENT_VARIABLES = 'PYTHON_INTERPRETER_ACTIVATION_ENVIRONMENT_VARIABLES',
    PYTHON_INTERPRETER_ACTIVATION_FOR_RUNNING_CODE = 'PYTHON_INTERPRETER_ACTIVATION_FOR_RUNNING_CODE',
    PYTHON_INTERPRETER_ACTIVATION_FOR_TERMINAL = 'PYTHON_INTERPRETER_ACTIVATION_FOR_TERMINAL',
    WORKSPACE_SYMBOLS_BUILD = 'WORKSPACE_SYMBOLS.BUILD',
    WORKSPACE_SYMBOLS_GO_TO = 'WORKSPACE_SYMBOLS.GO_TO',
    EXECUTION_CODE = 'EXECUTION_CODE',
    EXECUTION_DJANGO = 'EXECUTION_DJANGO',
    DEBUGGER = 'DEBUGGER',
    DEBUGGER_ATTACH_TO_CHILD_PROCESS = 'DEBUGGER.ATTACH_TO_CHILD_PROCESS',
    DEBUGGER_PERFORMANCE = 'DEBUGGER.PERFORMANCE',
    DEBUGGER_CONFIGURATION_PROMPTS = 'DEBUGGER.CONFIGURATION.PROMPTS',
    UNITTEST_STOP = 'UNITTEST.STOP',
    UNITTEST_RUN = 'UNITTEST.RUN',
    UNITTEST_DISCOVER = 'UNITTEST.DISCOVER',
    UNITTEST_VIEW_OUTPUT = 'UNITTEST.VIEW_OUTPUT',
    PYTHON_LANGUAGE_SERVER_ANALYSISTIME = 'PYTHON_LANGUAGE_SERVER.ANALYSIS_TIME',
    PYTHON_LANGUAGE_SERVER_ENABLED = 'PYTHON_LANGUAGE_SERVER.ENABLED',
    PYTHON_LANGUAGE_SERVER_EXTRACTED = 'PYTHON_LANGUAGE_SERVER.EXTRACTED',
    PYTHON_LANGUAGE_SERVER_DOWNLOADED = 'PYTHON_LANGUAGE_SERVER.DOWNLOADED',
    PYTHON_LANGUAGE_SERVER_ERROR = 'PYTHON_LANGUAGE_SERVER.ERROR',
    PYTHON_LANGUAGE_SERVER_STARTUP = 'PYTHON_LANGUAGE_SERVER.STARTUP',
    PYTHON_LANGUAGE_SERVER_READY = 'PYTHON_LANGUAGE_SERVER.READY',
    PYTHON_LANGUAGE_SERVER_PLATFORM_NOT_SUPPORTED = 'PYTHON_LANGUAGE_SERVER.PLATFORM_NOT_SUPPORTED',
    PYTHON_LANGUAGE_SERVER_PLATFORM_SUPPORTED = 'PYTHON_LANGUAGE_SERVER.PLATFORM_SUPPORTED',
    PYTHON_LANGUAGE_SERVER_TELEMETRY = 'PYTHON_LANGUAGE_SERVER.EVENT',

    TERMINAL_CREATE = 'TERMINAL.CREATE',
    PYTHON_LANGUAGE_SERVER_LIST_BLOB_STORE_PACKAGES = 'PYTHON_LANGUAGE_SERVER.LIST_BLOB_PACKAGES',
    DIAGNOSTICS_ACTION = 'DIAGNOSTICS.ACTION',
    DIAGNOSTICS_MESSAGE = 'DIAGNOSTICS.MESSAGE',
    PLATFORM_INFO = 'PLATFORM.INFO',

    SELECT_LINTER = 'LINTING.SELECT',

    LINTER_NOT_INSTALLED_PROMPT = 'LINTER_NOT_INSTALLED_PROMPT'
}

export enum PlatformErrors {
    FailedToParseVersion = 'FailedToParseVersion',
    FailedToDetermineOS = 'FailedToDetermineOS'
}
