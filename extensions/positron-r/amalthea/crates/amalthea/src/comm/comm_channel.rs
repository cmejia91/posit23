/*
 * comm_channel.rs
 *
 * Copyright (C) 2022 Posit Software, PBC. All rights reserved.
 *
 */

use serde_json::Value;
use strum_macros::EnumString;

/// Rust trait that defines a custom Jupyter communication channel
pub trait CommChannel: Send {
    fn handle_request(&self, data: &Value);
    fn target_name(&self) -> String;
    fn close(&self);
}

#[derive(EnumString, PartialEq)]
#[strum(serialize_all = "snake_case")]
pub enum Comm {
    Environment,
    Lsp
}
