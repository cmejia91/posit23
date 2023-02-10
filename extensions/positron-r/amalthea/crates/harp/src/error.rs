//
// error.rs
//
// Copyright (C) 2022 by Posit Software, PBC
//
//

use std::fmt;
use std::str::Utf8Error;

use libR_sys::*;

use crate::object::RObject;
use crate::protect::RProtect;
use crate::r_symbol;
use crate::utils::{r_type2char, r_inherits};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug)]
pub enum Error {
    HelpTopicNotFoundError { topic: String, package: Option<String> },
    ParseError { code: String, message: String },
    EvaluationError { code: String, message: String },
    UnsafeEvaluationError(String),
    UnexpectedLength(u32, u32),
    UnexpectedType(u32, Vec<u32>),
    InvalidUtf8(Utf8Error),
    TopLevelExecError()
}

pub struct RError(pub RObject);

impl RError {
    pub fn new(condition: SEXP) -> Self {
        RError(RObject::from(condition))
    }

    pub fn condition(&self) -> SEXP {
        *self.0
    }

    pub fn classes(&self) -> Result<Vec<String>>  {
        unsafe {
            RObject::from(Rf_getAttrib(*self.0, R_ClassSymbol)).try_into()
        }
    }

    pub fn message(&self) -> Result<Vec<String>> {
        unsafe {
            let mut protect = RProtect::new();
            let call = protect.add(Rf_lang2(r_symbol!("conditionMessage"), *self.0));

            RObject::from(Rf_eval(call, R_BaseEnv)).try_into()
        }
    }

    pub fn inherits(&self, class: &str) -> bool {
        unsafe {
            r_inherits(*self.0, &class)
        }
    }

}

// empty implementation required for 'anyhow'
impl std::error::Error for Error {

    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::InvalidUtf8(source) => Some(source),
            _ => None,
        }
    }

}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {

            Error::HelpTopicNotFoundError { topic, package } => {
                match package {
                    Some(package) => write!(f, "Help topic '{}' not available in package '{}'", topic, package),
                    None => write!(f, "Help topic '{}' not available", topic),
                }
            }

            Error::ParseError { code, message } => {
                write!(f, "Error parsing {}: {}", code, message)
            }

            Error::EvaluationError { code, message } => {
                write!(f, "Error evaluating {}: {}", code, message)
            }

            Error::UnsafeEvaluationError(code) => {
                write!(f, "Evaluation of function calls not supported in this context: {}", code)
            }

            Error::UnexpectedLength(actual, expected) => {
                write!(f, "Unexpected vector length (expected {}; got {})", expected, actual)
            }

            Error::UnexpectedType(actual, expected) => {
                unsafe {
                    let actual = r_type2char(*actual);
                    let expected = expected.iter().map(|value| r_type2char(*value)).collect::<Vec<_>>().join(" | ");
                    write!(f, "Unexpected vector type (expected {}; got {})", expected, actual)
                }
            }

            Error::InvalidUtf8(error) => {
                write!(f, "Invalid UTF-8 in string: {}", error)
            }

            Error::TopLevelExecError() => {
                write!(f, "Top Level exec error")
            }


        }
    }
}

impl From<Utf8Error> for Error {
    fn from(error: Utf8Error) -> Self {
        Self::InvalidUtf8(error)
    }
}
