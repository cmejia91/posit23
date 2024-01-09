#
# Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
#

import enum
from typing import Dict, Optional

import comm

from .utils import JsonData


## Create an enum of JSON-RPC error codes
class JsonRpcErrorCode(enum.IntEnum):
    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603


class PositronComm:
    """A wrapper around a base IPython comm that provides a JSON-RPC interface"""

    def __init__(self, comm: comm.base_comm.BaseComm) -> None:
        self.comm = comm

    def send_result(
        self, data: JsonData = None, metadata: Optional[Dict[str, JsonData]] = None
    ) -> None:
        """Send a JSON-RPC result to the frontend-side version of this comm"""
        result = dict(
            jsonrpc="2.0",
            result=data,
        )
        self.comm.send(
            data=result,
            metadata=metadata,
            buffers=None,
        )

    def send_event(self, name: str, payload: Dict[str, JsonData]) -> None:
        """Send a JSON-RPC notification (event) to the frontend-side version of this comm"""
        event = dict(
            jsonrpc="2.0",
            method=name,
            params=payload,
        )
        self.comm.send(data=event)

    def send_error(self, code: JsonRpcErrorCode, message: Optional[str] = None) -> None:
        """Send a JSON-RPC result to the frontend-side version of this comm"""
        error = dict(
            jsonrpc="2.0",
            error=dict(
                code=code.value,
                message=message,
            ),
        )
        self.comm.send(
            data=error,
            metadata=None,
            buffers=None,
        )

    def close(self) -> None:
        """Close the underlying comm."""
        self.comm.close()
