#
# Copyright (C) 2024 Posit Software, PBC. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

#
# AUTO-GENERATED from plot.json; do not edit.
#

# flake8: noqa

# For forward declarations
from __future__ import annotations

import enum
from typing import Any, List, Literal, Optional, Union

from ._vendor.pydantic import BaseModel, Field, StrictBool, StrictFloat, StrictInt, StrictStr


@enum.unique
class RenderFormat(str, enum.Enum):
    """
    Possible values for Format in Render
    """

    Png = "png"

    Jpeg = "jpeg"

    Svg = "svg"

    Pdf = "pdf"


class PlotResult(BaseModel):
    """
    A rendered plot
    """

    data: StrictStr = Field(
        description="The plot data, as a base64-encoded string",
    )

    mime_type: StrictStr = Field(
        description="The MIME type of the plot data",
    )


@enum.unique
class PlotBackendRequest(str, enum.Enum):
    """
    An enumeration of all the possible requests that can be sent to the backend plot comm.
    """

    # Render a plot
    Render = "render"


class RenderParams(BaseModel):
    """
    Requests a plot to be rendered at a given height and width. The plot
    data is returned in a base64-encoded string.
    """

    height: StrictInt = Field(
        description="The requested plot height, in pixels",
    )

    width: StrictInt = Field(
        description="The requested plot width, in pixels",
    )

    pixel_ratio: Union[StrictInt, StrictFloat] = Field(
        description="The pixel ratio of the display device",
    )

    format: RenderFormat = Field(
        description="The requested plot format",
    )


class RenderRequest(BaseModel):
    """
    Requests a plot to be rendered at a given height and width. The plot
    data is returned in a base64-encoded string.
    """

    params: RenderParams = Field(
        description="Parameters to the Render method",
    )

    method: Literal[PlotBackendRequest.Render] = Field(
        description="The JSON-RPC method name (render)",
    )

    jsonrpc: str = Field(
        default="2.0",
        description="The JSON-RPC version specifier",
    )


class PlotBackendMessageContent(BaseModel):
    comm_id: str
    data: RenderRequest


@enum.unique
class PlotFrontendEvent(str, enum.Enum):
    """
    An enumeration of all the possible events that can be sent to the frontend plot comm.
    """

    # Notification that a plot has been updated on the backend.
    Update = "update"

    # Show a plot.
    Show = "show"


PlotResult.update_forward_refs()

RenderParams.update_forward_refs()

RenderRequest.update_forward_refs()
