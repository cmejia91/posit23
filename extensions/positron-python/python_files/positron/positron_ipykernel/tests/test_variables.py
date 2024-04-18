#
# Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
#

from __future__ import annotations

import asyncio
from typing import Any, List, Type, cast
from unittest.mock import Mock

import numpy as np
import pandas as pd
import polars as pl
import pytest

from positron_ipykernel.access_keys import encode_access_key
from positron_ipykernel.positron_comm import JsonRpcErrorCode
from positron_ipykernel.positron_ipkernel import PositronIPyKernel
from positron_ipykernel.utils import JsonRecord, not_none
from positron_ipykernel.variables import (
    VariablesService,
    _summarize_children,
    _summarize_variable,
)

from .conftest import DummyComm, PositronShell
from .utils import (
    assert_register_table_called,
    comm_open_message,
    json_rpc_error,
    json_rpc_notification,
    json_rpc_request,
    json_rpc_response,
)

BIG_ARRAY_LENGTH = 10_000_001
TARGET_NAME = "target_name"


def test_comm_open(kernel: PositronIPyKernel) -> None:
    service = VariablesService(kernel)

    # Double-check that comm is not yet open
    assert service._comm is None

    # Open a comm
    variables_comm = DummyComm(TARGET_NAME)
    service.on_comm_open(variables_comm, {})

    # Check that the comm_open and empty refresh messages were sent
    assert variables_comm.messages == [
        comm_open_message(TARGET_NAME),
        json_rpc_notification("refresh", {"variables": [], "length": 0, "version": 0}),
    ]


@pytest.mark.parametrize(
    ("import_code", "value_codes"),
    [
        #
        # Same types
        #
        ("import numpy as np", [f"np.array({x})" for x in [3, [3], [[3]]]]),
        ("import torch", [f"torch.tensor({x})" for x in [3, [3], [[3]]]]),
        pytest.param(
            "import pandas as pd",
            [f"pd.Series({x})" for x in [[], [3], [3, 3], ["3"]]],
        ),
        pytest.param(
            "import polars as pl",
            [f"pl.Series({x})" for x in [[], [3], [3, 3], ["3"]]],
        ),
        (
            "import pandas as pd",
            [
                f"pd.DataFrame({x})"
                for x in [
                    {"a": []},
                    {"a": [3]},
                    {"a": ["3"]},
                    {"a": [3], "b": [3]},
                ]
            ],
        ),
        (
            "import polars as pl",
            [
                f"pl.DataFrame({x})"
                for x in [
                    {"a": []},
                    {"a": [3]},
                    {"a": ["3"]},
                    {"a": [3], "b": [3]},
                ]
            ],
        ),
        #
        # Changing types
        #
        ("", ["3", "'3'"]),
        ("import numpy as np", ["3", "np.array(3)"]),
    ],
)
def test_change_detection(
    import_code: str,
    value_codes: List[str],
    shell: PositronShell,
    variables_comm: DummyComm,
) -> None:
    """
    Test change detection when updating the value of the same name.
    """
    _import_library(shell, import_code)
    for value_code in value_codes:
        _assert_assigned(shell, value_code, variables_comm)


def _assert_assigned(shell: PositronShell, value_code: str, variables_comm: DummyComm):
    # Assign the value to a variable.
    shell.run_cell(f"x = {value_code}")

    # Test that the expected `update` message was sent with the
    # expected `assigned` value.
    assert variables_comm.messages == [
        json_rpc_notification(
            "update",
            {
                "assigned": [not_none(_summarize_variable("x", shell.user_ns["x"])).dict()],
                "removed": [],
                "version": 0,
            },
        )
    ]

    # Clear messages for the next assignment.
    variables_comm.messages.clear()


def _import_library(shell: PositronShell, import_code: str):
    # Import the necessary library.
    if import_code:
        if import_code.endswith("torch"):  # temporary workaround for python 3.12
            pytest.skip()
        shell.run_cell(import_code)


def test_change_detection_over_limit(shell: PositronShell, variables_comm: DummyComm):
    _import_library(shell, "import numpy as np")

    big_array = f"x = np.arange({BIG_ARRAY_LENGTH})"
    shell.run_cell(big_array)
    variables_comm.messages.clear()

    _assert_assigned(shell, big_array, variables_comm)
    _assert_assigned(shell, big_array, variables_comm)
    _assert_assigned(shell, big_array, variables_comm)


def test_handle_refresh(shell: PositronShell, variables_comm: DummyComm) -> None:
    shell.user_ns["x"] = 3

    msg = json_rpc_request("list", comm_id="dummy_comm_id")
    variables_comm.handle_msg(msg)

    # A list message is sent
    assert variables_comm.messages == [
        json_rpc_response(
            {
                "variables": [
                    not_none(_summarize_variable("x", shell.user_ns["x"])).dict(),
                ],
                "length": 1,
                "version": 0,
            }
        )
    ]


@pytest.mark.asyncio
async def test_handle_clear(
    shell: PositronShell,
    variables_service: VariablesService,
    variables_comm: DummyComm,
) -> None:
    shell.user_ns.update({"x": 3, "y": 5})

    msg = json_rpc_request("clear", {"include_hidden_objects": False}, comm_id="dummy_comm_id")
    variables_comm.handle_msg(msg)

    # Wait until all resulting kernel tasks are processed
    await asyncio.gather(*variables_service._pending_tasks)

    # We should get a result
    assert variables_comm.messages == [
        json_rpc_response({}),
        json_rpc_notification(
            "update",
            {
                "assigned": [],
                "removed": [encode_access_key("x"), encode_access_key("y")],
                "version": 0,
            },
        ),
        json_rpc_notification("refresh", {"length": 0, "variables": [], "version": 0}),
    ]

    # All user variables are removed
    assert "x" not in shell.user_ns
    assert "y" not in shell.user_ns


def test_handle_delete(shell: PositronShell, variables_comm: DummyComm) -> None:
    shell.user_ns.update({"x": 3, "y": 5})

    msg = json_rpc_request("delete", {"names": ["x"]}, comm_id="dummy_comm_id")
    variables_comm.handle_msg(msg)

    # Only the `x` variable is removed
    assert "x" not in shell.user_ns
    assert "y" in shell.user_ns

    assert variables_comm.messages == [
        json_rpc_response([encode_access_key("x")]),
    ]


def test_handle_delete_error(variables_comm: DummyComm) -> None:
    msg = json_rpc_request("delete", {"names": ["x"]}, comm_id="dummy_comm_id")
    variables_comm.handle_msg(msg)

    # No variables are removed, since there are no variables named `x`
    assert variables_comm.messages == [json_rpc_response([])]


def _assert_inspect(value: Any, path: List[Any], variables_comm: DummyComm) -> None:
    encoded_path = [encode_access_key(key) for key in path]
    msg = json_rpc_request(
        "inspect",
        # TODO(pyright): We shouldn't need to cast; may be a pyright bug
        cast(JsonRecord, {"path": encoded_path}),
        comm_id="dummy_comm_id",
    )
    variables_comm.handle_msg(msg)

    assert len(variables_comm.messages) == 1

    children = _summarize_children(value)
    assert variables_comm.messages == [
        json_rpc_response(
            {
                "children": [child.dict() for child in children],
                "length": len(children),
            }
        )
    ]

    variables_comm.messages.clear()


@pytest.mark.parametrize(
    ("value_fn"),
    [
        lambda: {0: [0], "0": [1]},
        lambda: pd.DataFrame({0: [0], "0": [1]}),
        lambda: pl.DataFrame({"a": [1, 2], "b": ["3", "4"]}),
        lambda: np.array([[0, 1], [2, 3]]),
        # Inspecting large objects should not trigger update messages: https://github.com/posit-dev/positron/issues/2308.
        lambda: np.arange(BIG_ARRAY_LENGTH),
    ],
)
def test_handle_inspect(value_fn, shell: PositronShell, variables_comm: DummyComm) -> None:
    """
    Test that we can inspect root-level objects.
    """
    value = value_fn()
    shell.user_ns["x"] = value

    _assert_inspect(value, ["x"], variables_comm)


@pytest.mark.parametrize(
    ("cls", "data"),
    [
        # We should be able to inspect the children of a map/table with keys that have the same string representation.
        (dict, {0: [0], "0": [1]}),
        (pd.DataFrame, {0: [0], "0": [1]}),
        # DataFrames
        (pd.DataFrame, {"a": [1, 2], "b": ["3", "4"]}),
        (pl.DataFrame, {"a": [1, 2], "b": ["3", "4"]}),
        # Arrays
        (np.array, [[0, 1], [2, 3]]),  # 2D
    ],
)
def test_handle_inspect_2d(
    cls: Type, data: Any, shell: PositronShell, variables_comm: DummyComm
) -> None:
    """
    Test that we can inspect children of "two-dimensional" objects.
    """
    value = cls(data)
    shell.user_ns["x"] = value

    keys = data.keys() if isinstance(data, dict) else range(len(data))
    for key in keys:
        _assert_inspect(value[key], ["x", key], variables_comm)


def test_handle_inspect_error(variables_comm: DummyComm) -> None:
    path = [encode_access_key("x")]
    # TODO(pyright): We shouldn't need to cast; may be a pyright bug
    msg = json_rpc_request("inspect", cast(JsonRecord, {"path": path}), comm_id="dummy_comm_id")
    variables_comm.handle_msg(msg)

    # An error message is sent
    assert variables_comm.messages == [
        json_rpc_error(
            JsonRpcErrorCode.INVALID_PARAMS,
            f"Cannot find variable at '{path}' to inspect",
        )
    ]


def test_handle_clipboard_format(shell: PositronShell, variables_comm: DummyComm) -> None:
    shell.user_ns.update({"x": 3, "y": 5})

    msg = json_rpc_request(
        "clipboard_format",
        {
            "path": [encode_access_key("x")],
            "format": "text/plain",
        },
        comm_id="dummy_comm_id",
    )
    variables_comm.handle_msg(msg)

    assert variables_comm.messages == [json_rpc_response({"content": "3"})]


def test_handle_clipboard_format_error(variables_comm: DummyComm) -> None:
    path = [encode_access_key("x")]
    # TODO(pyright): We shouldn't need to cast; may be a pyright bug
    msg = json_rpc_request(
        "clipboard_format",
        cast(JsonRecord, {"path": path, "format": "text/plain"}),
        comm_id="dummy_comm_id",
    )
    variables_comm.handle_msg(msg)

    # An error message is sent
    assert variables_comm.messages == [
        json_rpc_error(
            JsonRpcErrorCode.INVALID_PARAMS,
            f"Cannot find variable at '{path}' to format",
        )
    ]


def test_handle_view(
    shell: PositronShell,
    variables_comm: DummyComm,
    mock_dataexplorer_service: Mock,
) -> None:
    shell.user_ns["x"] = pd.DataFrame({"a": [0]})

    msg = json_rpc_request("view", {"path": [encode_access_key("x")]}, comm_id="dummy_comm_id")
    variables_comm.handle_msg(msg)

    # An acknowledgment message is sent
    assert variables_comm.messages == [json_rpc_response({})]

    assert_register_table_called(mock_dataexplorer_service, shell.user_ns["x"], "x")


def test_handle_view_error(variables_comm: DummyComm) -> None:
    path = [encode_access_key("x")]
    # TODO(pyright): We shouldn't need to cast; may be a pyright bug
    msg = json_rpc_request("view", cast(JsonRecord, {"path": path}), comm_id="dummy_comm_id")
    variables_comm.handle_msg(msg)

    # An error message is sent
    assert variables_comm.messages == [
        json_rpc_error(
            JsonRpcErrorCode.INVALID_PARAMS,
            f"Cannot find variable at '{path}' to view",
        )
    ]


def test_handle_unknown_method(variables_comm: DummyComm) -> None:
    msg = json_rpc_request("unknown_method", comm_id="dummy_comm_id")
    variables_comm.handle_msg(msg)

    assert variables_comm.messages == [
        json_rpc_error(
            JsonRpcErrorCode.METHOD_NOT_FOUND,
            "Unknown method 'unknown_method'",
        )
    ]


@pytest.mark.asyncio
async def test_shutdown(variables_service: VariablesService, variables_comm: DummyComm) -> None:
    # Double-check that the comm is not yet closed
    assert not variables_comm._closed

    await variables_service.shutdown()

    # Comm is closed
    assert variables_comm._closed
