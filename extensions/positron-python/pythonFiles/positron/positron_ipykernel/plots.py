#
# Copyright (C) 2023-2024 Posit Software, PBC. All rights reserved.
#

import base64
import codecs
import io
import logging
import pickle
import uuid
from typing import Dict, List, Optional, Tuple

import comm
from IPython.core.formatters import format_display_data

from .plot_comm import PlotBackendMessageContent, PlotResult, RenderRequest
from .positron_comm import CommMessage, JsonRpcErrorCode, PositronComm
from .utils import JsonRecord
from .widget import _WIDGET_MIME_TYPE

logger = logging.getLogger(__name__)


# Matplotlib Default Figure Size
DEFAULT_WIDTH_IN = 6.4
DEFAULT_HEIGHT_IN = 4.8
BASE_DPI = 100


class PositronDisplayPublisherHook:
    def __init__(self, target_name: str):
        self.comms: Dict[str, PositronComm] = {}
        self.figures: Dict[str, str] = {}
        self.target_name = target_name
        self.fignums: List[int] = []

    def __call__(self, msg, *args, **kwargs) -> Optional[dict]:
        if msg["msg_type"] == "display_data":
            # If there is no image for our display, don't create a
            # positron.plot comm and let the parent deal with the msg.
            data = msg["content"]["data"]
            if _WIDGET_MIME_TYPE in data:
                # This is a widget, let the widget hook handle it
                return msg
            if "image/png" not in data:
                return msg

            # Otherwise, try to pickle the current figure so that we
            # can restore the context for future renderings. We construct
            # a new plot comm to advise the client of the new figure.
            pickled = self._pickle_current_figure()
            if pickled is not None:
                id = str(uuid.uuid4())
                self.figures[id] = pickled

                # Creating a comm per plot figure allows the client
                # to request new renderings of each plot at a later time,
                # e.g. on resizing the plots view
                self._create_comm(id)

                # Returning None implies our hook has processed the message
                # and it stops the parent from sending the display_data via
                # the standard iopub channel
                return None

        return msg

    def _create_comm(self, comm_id: str) -> None:
        """
        Create a new plot comm with the given id.
        """
        plot_comm = PositronComm(comm.create_comm(target_name=self.target_name, comm_id=comm_id))
        self.comms[comm_id] = plot_comm
        plot_comm.on_msg(self.handle_msg, PlotBackendMessageContent)

    def handle_msg(self, msg: CommMessage[PlotBackendMessageContent], raw_msg: JsonRecord) -> None:
        """
        Handle client messages to render a plot figure.
        """
        comm_id = msg.content.comm_id
        request = msg.content.data

        figure_comm = self.comms.get(comm_id, None)
        if figure_comm is None:
            logger.warning(f"Plot figure comm {comm_id} not found")
            return

        if isinstance(request, RenderRequest):
            pickled = self.figures.get(comm_id, None)
            if pickled is None:
                figure_comm.send_error(
                    code=JsonRpcErrorCode.INVALID_PARAMS, message=f"Figure {comm_id} not found"
                )
                return

            width_px = request.params.width or 0
            height_px = request.params.height or 0
            pixel_ratio = request.params.pixel_ratio or 1.0

            if width_px != 0 and height_px != 0:
                format_dict, md_dict = self._resize_pickled_figure(
                    pickled, width_px, height_px, pixel_ratio
                )
                data = format_dict["image/png"]
                output = PlotResult(data=data, mime_type="image/png").dict()
                figure_comm.send_result(data=output, metadata=md_dict)

        else:
            logger.warning(f"Unhandled request: {request}")

    def shutdown(self) -> None:
        """
        Shutdown plot comms and release any resources.
        """
        for figure_comm in self.comms.values():
            try:
                figure_comm.close()
            except Exception:
                pass
        self.comms.clear()
        self.figures.clear()

    # -- Private Methods --

    def _pickle_current_figure(self) -> Optional[str]:
        pickled = None
        figure = None

        # Delay importing matplotlib until the kernel and shell has been initialized
        # otherwise the graphics backend will be reset to the gui
        import matplotlib.pyplot as plt

        # We turn off interactive mode before accessing the plot context
        was_interactive = plt.isinteractive()
        plt.ioff()

        # Check to see if there are any figures left in stack to display
        # If not, get the number of figures to display from matplotlib
        if len(self.fignums) == 0:
            self.fignums = plt.get_fignums()

        # Get the current figure, remove from it from being called next hook
        if len(self.fignums) > 0:
            figure = plt.figure(self.fignums.pop(0))

        # Pickle the current figure
        if figure is not None and not self._is_figure_empty(figure):
            pickled = codecs.encode(pickle.dumps(figure), "base64").decode()

        if was_interactive:
            plt.ion()

        return pickled

    def _resize_pickled_figure(
        self,
        pickled: str,
        new_width_px: int = 614,
        new_height_px: int = 460,
        pixel_ratio: float = 1.0,
        formats: list = ["image/png"],
    ) -> Tuple[dict, dict]:
        # Delay importing matplotlib until the kernel and shell has been
        # initialized otherwise the graphics backend will be reset to the gui
        import matplotlib.pyplot as plt

        # Turn off interactive mode before, including before unpickling a
        # figures (otherwise it will cause and endless loop of plot changes)
        was_interactive = plt.isinteractive()
        plt.ioff()

        figure = pickle.loads(codecs.decode(pickled.encode(), "base64"))
        figure_buffer = io.BytesIO()

        # Adjust the DPI based on pixel_ratio to accommodate high
        # resolution displays...
        dpi = BASE_DPI * pixel_ratio
        figure.set_dpi(dpi)
        figure.set_layout_engine("tight")  # eliminates whitespace around the figure

        # ... but use base DPI to convert to inch based dimensions.
        width_in, height_in = figure.get_size_inches()
        new_width_in = new_width_px / BASE_DPI
        new_height_in = new_height_px / BASE_DPI

        # Try to determine if the figure had an explicit width or height set.
        if width_in == DEFAULT_WIDTH_IN and height_in == DEFAULT_HEIGHT_IN:
            # If default values are still set, apply new size, even if this
            # resets the aspect ratio
            width_in = new_width_in
            height_in = new_height_in
        else:
            # Preserve the existing aspect ratio, constraining the scale
            # based on the shorter dimension
            if width_in < height_in:
                height_in = height_in * (new_width_in / width_in)
                width_in = new_width_in
            else:
                width_in = width_in * (new_height_in / height_in)
                height_in = new_height_in

        figure.set_size_inches(width_in, height_in)

        # Render the figure to a buffer
        # using format_display_data() crops the figure to smaller than requested size
        figure.savefig(figure_buffer, format="png", dpi=dpi)
        figure_buffer.seek(0)
        image_data = base64.b64encode(figure_buffer.read()).decode()

        format_dict = {"image/png": image_data}

        plt.close(figure)

        if was_interactive:
            plt.ion()
        return (format_dict, {})

    def _is_figure_empty(self, figure):
        children = figure.get_children()
        if len(children) < 1:
            return True

        for child in children:
            if child.get_visible():
                return False

        return True
