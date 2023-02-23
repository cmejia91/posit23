//
// environment.rs
//
// Copyright (C) 2022 Posit Software, PBC. All rights reserved.
//
//

use amalthea::comm::comm_channel::CommChannel;
use serde_json::Value;

pub struct EnvironmentInstance {
}

impl CommChannel for EnvironmentInstance {
    fn handle_request(&self, data: &Value) {
        println!("EnvironmentComm::handle_request - data: {:?}", data);
    }

    fn target_name(&self) -> String {
        "environment".to_string()
    }

    fn close(&self) {
        println!("EnvironmentComm::close");
    }
}


