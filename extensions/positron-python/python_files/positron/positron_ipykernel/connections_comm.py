#
# Copyright (C) 2024 Posit Software, PBC. All rights reserved.
#

#
# AUTO-GENERATED from connections.json; do not edit.
#

# flake8: noqa

# For forward declarations
from __future__ import annotations

import enum
from typing import Any, List, Literal, Optional, Union

from ._vendor.pydantic import BaseModel, Field


class ObjectSchema(BaseModel):
    """
    ObjectSchema in Schemas
    """

    name: str = Field(
        description="Name of the underlying object",
    )

    kind: str = Field(
        description="The object type (table, catalog, schema)",
    )


class FieldSchema(BaseModel):
    """
    FieldSchema in Schemas
    """

    name: str = Field(
        description="Name of the field",
    )

    dtype: str = Field(
        description="The field data type",
    )


@enum.unique
class ConnectionsBackendRequest(str, enum.Enum):
    """
    An enumeration of all the possible requests that can be sent to the backend connections comm.
    """

    # List objects within a data source
    ListObjects = "list_objects"

    # List fields of an object
    ListFields = "list_fields"

    # Check if an object contains data
    ContainsData = "contains_data"

    # Get icon of an object
    GetIcon = "get_icon"

    # Preview object data
    PreviewObject = "preview_object"


class ListObjectsParams(BaseModel):
    """
    List objects within a data source, such as schemas, catalogs, tables
    and views.
    """

    path: List[ObjectSchema] = Field(
        description="The path to object that we want to list children.",
    )


class ListObjectsRequest(BaseModel):
    """
    List objects within a data source, such as schemas, catalogs, tables
    and views.
    """

    params: ListObjectsParams = Field(
        description="Parameters to the ListObjects method",
    )

    method: Literal[ConnectionsBackendRequest.ListObjects] = Field(
        description="The JSON-RPC method name (list_objects)",
    )

    jsonrpc: str = Field(
        default="2.0",
        description="The JSON-RPC version specifier",
    )


class ListFieldsParams(BaseModel):
    """
    List fields of an object, such as columns of a table or view.
    """

    path: List[ObjectSchema] = Field(
        description="The path to object that we want to list fields.",
    )


class ListFieldsRequest(BaseModel):
    """
    List fields of an object, such as columns of a table or view.
    """

    params: ListFieldsParams = Field(
        description="Parameters to the ListFields method",
    )

    method: Literal[ConnectionsBackendRequest.ListFields] = Field(
        description="The JSON-RPC method name (list_fields)",
    )

    jsonrpc: str = Field(
        default="2.0",
        description="The JSON-RPC version specifier",
    )


class ContainsDataParams(BaseModel):
    """
    Check if an object contains data, such as a table or view.
    """

    path: List[ObjectSchema] = Field(
        description="The path to object that we want to check if it contains data.",
    )


class ContainsDataRequest(BaseModel):
    """
    Check if an object contains data, such as a table or view.
    """

    params: ContainsDataParams = Field(
        description="Parameters to the ContainsData method",
    )

    method: Literal[ConnectionsBackendRequest.ContainsData] = Field(
        description="The JSON-RPC method name (contains_data)",
    )

    jsonrpc: str = Field(
        default="2.0",
        description="The JSON-RPC version specifier",
    )


class GetIconParams(BaseModel):
    """
    Get icon of an object, such as a table or view.
    """

    path: List[ObjectSchema] = Field(
        description="The path to object that we want to get the icon.",
    )


class GetIconRequest(BaseModel):
    """
    Get icon of an object, such as a table or view.
    """

    params: GetIconParams = Field(
        description="Parameters to the GetIcon method",
    )

    method: Literal[ConnectionsBackendRequest.GetIcon] = Field(
        description="The JSON-RPC method name (get_icon)",
    )

    jsonrpc: str = Field(
        default="2.0",
        description="The JSON-RPC version specifier",
    )


class PreviewObjectParams(BaseModel):
    """
    Preview object data, such as a table or view.
    """

    path: List[ObjectSchema] = Field(
        description="The path to object that we want to preview.",
    )


class PreviewObjectRequest(BaseModel):
    """
    Preview object data, such as a table or view.
    """

    params: PreviewObjectParams = Field(
        description="Parameters to the PreviewObject method",
    )

    method: Literal[ConnectionsBackendRequest.PreviewObject] = Field(
        description="The JSON-RPC method name (preview_object)",
    )

    jsonrpc: str = Field(
        default="2.0",
        description="The JSON-RPC version specifier",
    )


class ConnectionsBackendMessageContent(BaseModel):
    comm_id: str
    data: Union[
        ListObjectsRequest,
        ListFieldsRequest,
        ContainsDataRequest,
        GetIconRequest,
        PreviewObjectRequest,
    ] = Field(..., discriminator="method")


@enum.unique
class ConnectionsFrontendEvent(str, enum.Enum):
    """
    An enumeration of all the possible events that can be sent to the frontend connections comm.
    """

    # Request to focus the Connections pane
    Focus = "focus"

    # Request the UI to refresh the connection information
    Update = "update"


ObjectSchema.update_forward_refs()

FieldSchema.update_forward_refs()

ListObjectsParams.update_forward_refs()

ListObjectsRequest.update_forward_refs()

ListFieldsParams.update_forward_refs()

ListFieldsRequest.update_forward_refs()

ContainsDataParams.update_forward_refs()

ContainsDataRequest.update_forward_refs()

GetIconParams.update_forward_refs()

GetIconRequest.update_forward_refs()

PreviewObjectParams.update_forward_refs()

PreviewObjectRequest.update_forward_refs()
