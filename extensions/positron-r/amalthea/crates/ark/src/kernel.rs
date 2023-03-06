//
// kernel.rs
//
// Copyright (C) 2022 Posit Software, PBC. All rights reserved.
//
//

use amalthea::events::PositronEvent;
use amalthea::socket::iopub::IOPubMessage;
use amalthea::wire::exception::Exception;
use amalthea::wire::execute_input::ExecuteInput;
use amalthea::wire::execute_reply::ExecuteReply;
use amalthea::wire::execute_reply_exception::ExecuteReplyException;
use amalthea::wire::execute_request::ExecuteRequest;
use amalthea::wire::execute_response::ExecuteResponse;
use amalthea::wire::execute_result::ExecuteResult;
use amalthea::wire::input_request::InputRequest;
use amalthea::wire::input_request::ShellInputRequest;
use amalthea::wire::jupyter_message::Status;
use amalthea::wire::stream::Stream;
use amalthea::wire::stream::StreamOutput;
use anyhow::*;
use bus::Bus;
use crossbeam::channel::Sender;
use harp::exec::RFunction;
use harp::exec::RFunctionExt;
use harp::object::RObject;
use harp::r_symbol;
use harp::utils::r_inherits;
use libR_sys::*;
use log::*;
use serde_json::json;
use std::result::Result::Err;
use std::result::Result::Ok;

use crate::request::Request;

/// Represents the Rust state of the R kernel
pub struct Kernel {
    pub execution_count: u32,
    iopub_tx: Sender<IOPubMessage>,
    console_tx: Sender<Option<String>>,
    kernel_init_tx: Bus<KernelInfo>,
    execute_response_tx: Option<Sender<ExecuteResponse>>,
    input_request_tx: Option<Sender<ShellInputRequest>>,
    banner: String,
    initializing: bool,
}

/// Represents kernel metadata (available after the kernel has fully started)
#[derive(Debug, Clone)]
pub struct KernelInfo {
    pub version: String,
    pub banner: String,
}

impl Kernel {
    /// Create a new R kernel instance
    pub fn new(
        iopub_tx: Sender<IOPubMessage>,
        console_tx: Sender<Option<String>>,
        kernel_init_tx: Bus<KernelInfo>,
    ) -> Self {
        Self {
            iopub_tx,
            execution_count: 0,
            console_tx,
            banner: String::new(),
            initializing: true,
            kernel_init_tx,
            execute_response_tx: None,
            input_request_tx: None,
        }
    }

    /// Completes the kernel's initialization
    pub fn complete_intialization(&mut self) {
        if self.initializing {
            let version = unsafe {
                let version = Rf_findVarInFrame(R_BaseNamespace, r_symbol!("R.version.string"));
                RObject::new(version).to::<String>().unwrap()
            };

            let kernel_info = KernelInfo {
                version: version.clone(),
                banner: self.banner.clone(),
            };

            debug!("Sending kernel info: {}", version);
            self.kernel_init_tx.broadcast(kernel_info);
            self.initializing = false;
        } else {
            warn!("Initialization already complete!");
        }
    }

    /// Service an execution request from the front end
    pub fn fulfill_request(&mut self, req: &Request) {
        match req {
            Request::ExecuteCode(req, _, sender) => {
                let sender = sender.clone();
                self.handle_execute_request(req, sender);
            }
            Request::Shutdown(_) => {
                if let Err(err) = self.console_tx.send(None) {
                    warn!("Error sending shutdown message to console: {}", err);
                }
            }
            Request::EstablishInputChannel(sender) => self.establish_input_handler(sender.clone()),
            Request::DeliverEvent(event) =>  self.handle_event(event)
        }
    }

    /// Handle an event from the back end to the front end
    pub fn handle_event(&mut self, event: &PositronEvent){
        if let Err(err) = self.iopub_tx.send(IOPubMessage::Event(event.clone())) {
            warn!("Error attempting to deliver client event: {}", err);
        }
    }

    /// Handle an execute request from the front end
    pub fn handle_execute_request(
        &mut self,
        req: &ExecuteRequest,
        execute_response_tx: Sender<ExecuteResponse>,
    ) {
        // Clear output and error accumulators from previous execution
        self.execute_response_tx = Some(execute_response_tx);

        // Increment counter if we are storing this execution in history
        if req.store_history {
            self.execution_count = self.execution_count + 1;
        }

        // If the code is not to be executed silently, re-broadcast the
        // execution to all frontends
        if !req.silent {
            if let Err(err) = self.iopub_tx.send(IOPubMessage::ExecuteInput(ExecuteInput {
                code: req.code.clone(),
                execution_count: self.execution_count,
            })) {
                warn!(
                    "Could not broadcast execution input {} to all front ends: {}",
                    self.execution_count, err
                );
            }
        }

        // Send the code to the R console to be evaluated
        self.console_tx.send(Some(req.code.clone())).unwrap();
    }

    /// Converts a data frame to HTML
    pub fn to_html(frame: SEXP) -> Result<String> {
        unsafe {
            let result = RFunction::from(".ps.format.toHtml")
                .add(frame)
                .call()?
                .to::<String>()?;
            Ok(result)
        }
    }

    /// Report an incomplete request to the front end
    pub fn report_incomplete_request(&self, req: &Request) {
        let code = match req {
            Request::ExecuteCode(req, _, _) => req.code.clone(),
            _ => String::new(),
        };
        if let Some(sender) = self.execute_response_tx.as_ref() {
            let reply = ExecuteReplyException {
                status: Status::Error,
                execution_count: self.execution_count,
                exception: Exception {
                    ename: "IncompleteInput".to_string(),
                    evalue: format!("Code fragment is not complete: {}", code),
                    traceback: vec![],
                },
            };
            if let Err(err) = sender.send(ExecuteResponse::ReplyException(reply)) {
                warn!("Error sending incomplete reply: {}", err);
            }
        }
    }

    /// Finishes the active execution request
    pub fn finish_request(&self) {
        // TODO: detect if an error stopped code execution.
        if true {
            self.emit_output();
        } else {
            self.emit_error();
        }
    }

    /// Requests input from the front end
    pub fn request_input(&self, originator: &Vec<u8>, prompt: &str) {
        if let Some(requestor) = &self.input_request_tx {
            trace!("Requesting input from front-end for prompt: {}", prompt);
            requestor
                .send(ShellInputRequest {
                    originator: originator.clone(),
                    request: InputRequest {
                        prompt: prompt.to_string(),
                        password: false,
                    },
                })
                .unwrap();
        } else {
            warn!("Unable to request input: no input requestor set!");
        }

        // Send an execute reply to the front end
        if let Some(sender) = &self.execute_response_tx {
            sender
                .send(ExecuteResponse::Reply(ExecuteReply {
                    status: Status::Ok,
                    execution_count: self.execution_count,
                    user_expressions: json!({}),
                }))
                .unwrap();
        }
    }

    fn emit_error(&self) {
        // Send the reply to the front end
        if let Some(sender) = &self.execute_response_tx {
            sender
                .send(ExecuteResponse::ReplyException(ExecuteReplyException {
                    status: Status::Error,
                    execution_count: self.execution_count,
                    exception: Exception {
                        ename: "CodeExecution".to_string(),
                        evalue: "An unknown error!".to_string(),
                        traceback: vec![],
                    },
                }))
                .unwrap();
        }
    }

    fn emit_output(&self) {

        let mut data = serde_json::Map::new();
        data.insert("text/plain".to_string(), json!(""));

        // Include HTML representation of data.frame
        let value = unsafe { Rf_findVarInFrame(R_GlobalEnv, r_symbol!(".Last.value")) };
        let is_data_frame = unsafe { r_inherits(value, "data.frame") };
        if is_data_frame {
            match Kernel::to_html(value) {
                Ok(html) => data.insert("text/html".to_string(), json!(html)),
                Err(error) => {
                    error!("{:?}", error);
                    None
                }
            };
        }

        if let Err(err) = self.iopub_tx.send(IOPubMessage::ExecuteResult(ExecuteResult {
            execution_count: self.execution_count,
            data: serde_json::Value::Object(data),
            metadata: json!({}),
        })) {
            warn!(
                "Could not publish result of statement {} on iopub: {}",
                self.execution_count, err
            );
        }

        // Send the reply to the front end
        if let Some(sender) = &self.execute_response_tx {
            sender
                .send(ExecuteResponse::Reply(ExecuteReply {
                    status: Status::Ok,
                    execution_count: self.execution_count,
                    user_expressions: json!({}),
                }))
                .unwrap();
        }
    }

    /// Called from R when console data is written.
    pub fn write_console(&mut self, content: &str, otype: i32) {
        debug!("Write console {} from R: {}", otype, content);
        if self.initializing {
            // During init, consider all output to be part of the startup banner
            self.banner.push_str(content);
            return;
        }

        // Otherwise, emit output.
        log::info!("Got R console output: {}", content);
        let result = self.iopub_tx.send(IOPubMessage::Stream(StreamOutput {
            stream: if otype == 1 { Stream::Stdout } else { Stream::Stderr },
            text: content.to_string(),
        }));

        if let Err(error) = result {
            log::error!("{}", error);
        }
    }

    /// Establishes the input handler for the kernel to request input from the
    /// user
    pub fn establish_input_handler(&mut self, input_request_tx: Sender<ShellInputRequest>) {
        self.input_request_tx = Some(input_request_tx);
    }

    /// Sends an event to the front end (Positron-specific)
    pub fn send_event(&self, event: PositronEvent) {
        info!("Sending Positron event: {:?}", event);
        if let Err(err) = self.iopub_tx.send(IOPubMessage::Event(event)) {
            warn!("Could not publish event on iopub: {}", err);
        }
    }
}
