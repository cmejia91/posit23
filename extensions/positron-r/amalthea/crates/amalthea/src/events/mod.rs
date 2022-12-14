//
// mod.rs
//
// Copyright (C) 2022 by Posit, PBC
//
//
// Auto-generated by 'positron/scripts/generate-events.ts'.
// Please do not modify this file directly.
//

use crate::positron;

pub trait PositronEventType {
    fn event_type(&self) -> String;
}

/// Represents a change in the runtime's busy state.
/// Note that this represents the busy state of the underlying computation engine, not the busy state of the kernel.
/// The kernel is busy when it is processing a request, but the runtime is busy only when a computation is running.
#[positron::event("busy")]
pub struct BusyEvent {

    /// Whether the runtime is busy.
    pub busy: bool,

}

/// Use this event to show a message to the user.
#[positron::event("show_message")]
pub struct ShowMessageEvent {

    /// The message to show to the user.
    pub message: String,

}

/// Show a URL in the Help pane.
#[positron::event("show_help_url")]
pub struct ShowHelpUrlEvent {

    /// The URL to be shown in the Help pane.
    pub url: String,

}

#[derive(Debug, Clone)]
pub enum PositronEvent {
    Busy(BusyEvent),
    ShowMessage(ShowMessageEvent),
    ShowHelpUrl(ShowHelpUrlEvent),
}
