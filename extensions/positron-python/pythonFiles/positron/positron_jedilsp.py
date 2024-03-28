"""Positron extenstions to the Jedi Language Server."""

import asyncio
import logging
import os
import sys

from pygls.protocol import lsp_method

# Add the lib path to our sys path so jedi_language_server can find its references
EXTENSION_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(EXTENSION_ROOT, "pythonFiles", "lib", "jedilsp"))

from threading import Event
from typing import TYPE_CHECKING, Any, Callable, List, Optional, Union

from jedi.api import Interpreter
from jedi_language_server import jedi_utils, pygls_utils
from jedi_language_server.server import (
    JediLanguageServer,
    JediLanguageServerProtocol,
    _choose_markup,
    completion_item_resolve,
    definition,
    did_change_configuration,
    did_close_diagnostics,
    document_symbol,
    highlight,
    hover,
    references,
    rename,
    signature_help,
    type_definition,
    workspace_symbol,
)
from lsprotocol.types import (
    COMPLETION_ITEM_RESOLVE,
    EXIT,
    TEXT_DOCUMENT_CODE_ACTION,
    TEXT_DOCUMENT_COMPLETION,
    TEXT_DOCUMENT_DEFINITION,
    TEXT_DOCUMENT_DID_CHANGE,
    TEXT_DOCUMENT_DID_CLOSE,
    TEXT_DOCUMENT_DID_OPEN,
    TEXT_DOCUMENT_DID_SAVE,
    TEXT_DOCUMENT_DOCUMENT_HIGHLIGHT,
    TEXT_DOCUMENT_DOCUMENT_SYMBOL,
    TEXT_DOCUMENT_HOVER,
    TEXT_DOCUMENT_REFERENCES,
    TEXT_DOCUMENT_RENAME,
    TEXT_DOCUMENT_SIGNATURE_HELP,
    TEXT_DOCUMENT_TYPE_DEFINITION,
    WORKSPACE_DID_CHANGE_CONFIGURATION,
    WORKSPACE_SYMBOL,
    CodeAction,
    CodeActionKind,
    CodeActionOptions,
    CodeActionParams,
    CompletionItem,
    CompletionList,
    CompletionOptions,
    CompletionParams,
    DidChangeConfigurationParams,
    DidChangeTextDocumentParams,
    DidCloseTextDocumentParams,
    DidOpenTextDocumentParams,
    DidSaveTextDocumentParams,
    DocumentHighlight,
    DocumentSymbol,
    DocumentSymbolParams,
    Hover,
    Location,
    RenameParams,
    SignatureHelp,
    SignatureHelpOptions,
    SymbolInformation,
    TextDocumentPositionParams,
    WorkspaceEdit,
    WorkspaceSymbolParams,
)
from pygls.capabilities import get_capability
from pygls.feature_manager import has_ls_param_or_annotation

if TYPE_CHECKING:
    from .positron_ipkernel import PositronIPyKernel


logger = logging.getLogger(__name__)


class PositronJediLanguageServerProtocol(JediLanguageServerProtocol):
    """Positron extension to the Jedi language server protocol."""

    @lsp_method(EXIT)
    def lsp_exit(self, *args) -> None:
        """Override superclass to avoid system exit."""
        if self.transport is not None:
            self.transport.close()

        # --- Start Positron
        # Instead of calling sys.exit (which pygls catches to call self.shutdown) call shutdown directly.
        asyncio.create_task(POSITRON.shutdown())
        # --- End Positron

    def connection_lost(self, exc):
        """Override superclass to avoid system exit."""
        logger.info("Connection lost")
        if exc is not None:
            logger.error("Connection lost with error:", exc_info=exc)

    def eof_received(self):
        """Override superclass to avoid closing on eof (e.g. when the Positron browser is refreshed)."""
        return True


class PositronJediLanguageServer(JediLanguageServer):
    """Positron extension to the Jedi language server."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)

        # Reference to an IPyKernel set on server start
        self.kernel: Optional["PositronIPyKernel"] = None

    def feature(self, feature_name: str, options: Optional[Any] = None) -> Callable:
        def decorator(f):
            # Unfortunately Jedi doesn't handle subclassing of the LSP, so we
            # need to detect and reject features we did not register.
            if not has_ls_param_or_annotation(f, type(self)):
                return None

            """(Re-)register a feature with the LSP."""
            lsp: JediLanguageServerProtocol = self.lsp  # type: ignore

            if feature_name in lsp.fm.features:
                del lsp.fm.features[feature_name]
            if feature_name in lsp.fm.feature_options:
                del lsp.fm.feature_options[feature_name]

            return lsp.fm.feature(feature_name, options)(f)

        return decorator

    def start(self, lsp_host: str, lsp_port: int, kernel: "PositronIPyKernel") -> None:
        """
        Start the LSP with a reference to Positron's IPyKernel to enhance
        completions with awareness of live variables from user's namespace.
        """
        self.kernel = kernel
        asyncio.create_task(self._start_jedi(lsp_host, lsp_port))

    async def _start_jedi(self, lsp_host, lsp_port):
        """
        Starts Jedi LSP as a TCP server using existing asyncio loop.

        Adapted from `pygls.server.Server.start_tcp` to use existing asyncio loop.
        """
        self._stop_event = Event()
        self.lsp: PositronJediLanguageServerProtocol
        loop = asyncio.get_event_loop_policy().get_event_loop()
        self._server = await loop.create_server(self.lsp, lsp_host, lsp_port)

    async def shutdown(self):
        """Override superclass to allow running async and avoid stopping the event loop."""
        logger.info("Shutting down the language server")

        self._stop_event.set()

        if self._thread_pool:
            self._thread_pool.terminate()
            self._thread_pool.join()

        if self._thread_pool_executor:
            self._thread_pool_executor.shutdown()

        if self._server:
            self._server.close()
            # --- Start Positron
            await self._server.wait_closed()
            # --- End Positron

        logger.info("Language server is shut down")


POSITRON = PositronJediLanguageServer(
    name="jedi-language-server",
    version="0.18.2",
    protocol_cls=PositronJediLanguageServerProtocol,
)

# Server Features
# Unfortunately we need to re-register these as Pygls Feature Management does
# not support subclassing of the LSP, and Jedi did not use the expected "ls"
# name for the LSP server parameter in the feature registration methods.


@POSITRON.feature(
    TEXT_DOCUMENT_COMPLETION,
    CompletionOptions(trigger_characters=[".", "'", '"'], resolve_provider=True),
)
def positron_completion(
    server: PositronJediLanguageServer, params: CompletionParams
) -> Optional[CompletionList]:
    """
    Completion feature.
    """
    # pylint: disable=too-many-locals
    snippet_disable = server.initialization_options.completion.disable_snippets
    resolve_eagerly = server.initialization_options.completion.resolve_eagerly
    ignore_patterns = server.initialization_options.completion.ignore_patterns
    document = server.workspace.get_document(params.text_document.uri)

    # --- Start Positron ---
    # Unfortunately we need to override this entire method to add the kernel
    # interpreter namespace to the list of jedi completions.

    # Get a reference to the kernel's namespace for enhanced completions
    namespaces = []
    if server.kernel is not None:
        ns = server.kernel.get_user_ns()
        namespaces.append(ns)

    # Use Interpreter instead of Script to include the kernel namespaces in completions
    jedi_script = Interpreter(
        document.source, namespaces, path=document.path, project=server.project
    )
    # --- End Positron ---

    try:
        jedi_lines = jedi_utils.line_column(params.position)
        completions_jedi_raw = jedi_script.complete(*jedi_lines)
        if not ignore_patterns:
            # A performance optimization. ignore_patterns should usually be empty;
            # this special case avoid repeated filter checks for the usual case.
            completions_jedi = (comp for comp in completions_jedi_raw)
        else:
            completions_jedi = (
                comp
                for comp in completions_jedi_raw
                if not any(i.match(comp.name) for i in ignore_patterns)
            )
        snippet_support = get_capability(
            server.client_capabilities,
            "text_document.completion.completion_item.snippet_support",
            False,
        )
        markup_kind = _choose_markup(server)
        is_import_context = jedi_utils.is_import(
            script_=jedi_script,
            line=jedi_lines[0],
            column=jedi_lines[1],
        )
        enable_snippets = snippet_support and not snippet_disable and not is_import_context
        char_before_cursor = pygls_utils.char_before_cursor(
            document=server.workspace.get_document(params.text_document.uri),
            position=params.position,
        )
        jedi_utils.clear_completions_cache()
        # number of characters in the string representation of the total number of
        # completions returned by jedi.
        total_completion_chars = len(str(len(completions_jedi_raw)))
        completion_items = [
            jedi_utils.lsp_completion_item(
                completion=completion,
                char_before_cursor=char_before_cursor,
                enable_snippets=enable_snippets,
                resolve_eagerly=resolve_eagerly,
                markup_kind=markup_kind,
                sort_append_text=str(count).zfill(total_completion_chars),
            )
            for count, completion in enumerate(completions_jedi)
        ]
    except ValueError:
        # Ignore LSP errors for completions from invalid line/column ranges.
        logger.info("LSP completion error", exc_info=True)
        completion_items = []

    return CompletionList(is_incomplete=False, items=completion_items) if completion_items else None


@POSITRON.feature(COMPLETION_ITEM_RESOLVE)
def positron_completion_item_resolve(
    server: PositronJediLanguageServer, params: CompletionItem
) -> CompletionItem:
    return completion_item_resolve(server, params)


@POSITRON.feature(
    TEXT_DOCUMENT_SIGNATURE_HELP,
    SignatureHelpOptions(trigger_characters=["(", ","]),
)
def positron_signature_help(
    server: PositronJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[SignatureHelp]:
    return signature_help(server, params)


@POSITRON.feature(TEXT_DOCUMENT_DEFINITION)
def positron_definition(
    server: PositronJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[Location]]:
    return definition(server, params)


@POSITRON.feature(TEXT_DOCUMENT_TYPE_DEFINITION)
def positron_type_definition(
    server: PositronJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[Location]]:
    return type_definition(server, params)


@POSITRON.feature(TEXT_DOCUMENT_DOCUMENT_HIGHLIGHT)
def positron_highlight(
    server: PositronJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[DocumentHighlight]]:
    return highlight(server, params)


@POSITRON.feature(TEXT_DOCUMENT_HOVER)
def positron_hover(
    server: PositronJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[Hover]:
    try:
        return hover(server, params)
    except ValueError:
        # Ignore LSP errors for hover over invalid line/column ranges.
        logger.info("LSP hover error", exc_info=True)

    return None


@POSITRON.feature(TEXT_DOCUMENT_REFERENCES)
def positron_references(
    server: PositronJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[Location]]:
    return references(server, params)


@POSITRON.feature(TEXT_DOCUMENT_DOCUMENT_SYMBOL)
def positron_document_symbol(
    server: PositronJediLanguageServer, params: DocumentSymbolParams
) -> Optional[Union[List[DocumentSymbol], List[SymbolInformation]]]:
    return document_symbol(server, params)


@POSITRON.feature(WORKSPACE_SYMBOL)
def positron_workspace_symbol(
    server: PositronJediLanguageServer, params: WorkspaceSymbolParams
) -> Optional[List[SymbolInformation]]:
    return workspace_symbol(server, params)


@POSITRON.feature(TEXT_DOCUMENT_RENAME)
def positron_rename(
    server: PositronJediLanguageServer, params: RenameParams
) -> Optional[WorkspaceEdit]:
    return rename(server, params)


@POSITRON.feature(
    TEXT_DOCUMENT_CODE_ACTION,
    CodeActionOptions(
        code_action_kinds=[
            CodeActionKind.RefactorInline,
            CodeActionKind.RefactorExtract,
        ],
    ),
)
def positron_code_action(
    server: PositronJediLanguageServer, params: CodeActionParams
) -> Optional[List[CodeAction]]:
    # Code Actions are currently causing the kernel process to hang in certain cases, for example,
    # when the document contains `from fastai.vision.all import *`. Temporarily disable these
    # until we figure out the underlying issue.

    # try:
    #     return code_action(server, params)
    # except ValueError:
    #     # Ignore LSP errors for actions with invalid line/column ranges.
    #     logger.info("LSP codeAction error", exc_info=True)

    return None


@POSITRON.feature(WORKSPACE_DID_CHANGE_CONFIGURATION)
def positron_did_change_configuration(
    server: PositronJediLanguageServer,  # pylint: disable=unused-argument
    params: DidChangeConfigurationParams,  # pylint: disable=unused-argument
) -> None:
    return did_change_configuration(server, params)


@POSITRON.feature(TEXT_DOCUMENT_DID_SAVE)
def positron_did_save_diagnostics(
    server: PositronJediLanguageServer, params: DidSaveTextDocumentParams
) -> None:
    return did_save_diagnostics(server, params)


@POSITRON.feature(TEXT_DOCUMENT_DID_CHANGE)
def positron_did_change_diagnostics(
    server: PositronJediLanguageServer, params: DidChangeTextDocumentParams
) -> None:
    return did_change_diagnostics(server, params)


@POSITRON.feature(TEXT_DOCUMENT_DID_OPEN)
def positron_did_open_diagnostics(
    server: PositronJediLanguageServer, params: DidOpenTextDocumentParams
) -> None:
    return did_open_diagnostics(server, params)


@POSITRON.feature(TEXT_DOCUMENT_DID_CLOSE)
def positron_did_close_diagnostics(
    server: PositronJediLanguageServer, params: DidCloseTextDocumentParams
) -> None:
    return did_close_diagnostics(server, params)


# Copied from jedi_language_server/server.py to handle exceptions. Exceptions should be handled by
# pygls, but the debounce decorator causes the function to run in a separate thread thus a separate
# stack from pygls' exception handler.
@jedi_utils.debounce(1, keyed_by="uri")
def _publish_diagnostics(server: JediLanguageServer, uri: str) -> None:
    """Helper function to publish diagnostics for a file."""
    # The debounce decorator delays the execution by 1 second
    # canceling notifications that happen in that interval.
    # Since this function is executed after a delay, we need to check
    # whether the document still exists
    if uri not in server.workspace.documents:
        return

    doc = server.workspace.get_document(uri)

    # --- Start Positron ---
    try:
        diagnostic = jedi_utils.lsp_python_diagnostic(uri, doc.source)
    except Exception:
        logger.exception(f"Failed to publish diagnostics for uri {uri}", exc_info=True)
        diagnostic = None
    # --- End Positron ---

    diagnostics = [diagnostic] if diagnostic else []

    server.publish_diagnostics(uri, diagnostics)


def did_save_diagnostics(server: JediLanguageServer, params: DidSaveTextDocumentParams) -> None:
    """Actions run on textDocument/didSave: diagnostics."""
    _publish_diagnostics(server, params.text_document.uri)


def did_change_diagnostics(server: JediLanguageServer, params: DidChangeTextDocumentParams) -> None:
    """Actions run on textDocument/didChange: diagnostics."""
    _publish_diagnostics(server, params.text_document.uri)


def did_open_diagnostics(server: JediLanguageServer, params: DidOpenTextDocumentParams) -> None:
    """Actions run on textDocument/didOpen: diagnostics."""
    _publish_diagnostics(server, params.text_document.uri)
