//
// error.rs
//
// Copyright (C) 2022 by RStudio, PBC
//
//

use std::fmt;

use crate::r::utils::r_type2char;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug)]
pub enum Error {
    EvaluationError(String, String),
    UnexpectedLength(u32, u32),
    UnexpectedType(u32, u32),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {

            Error::EvaluationError(expression, message) => {
                write!(f, "Error evaluating {}: {}", expression, message)
            }

            Error::UnexpectedLength(expected, actual) => {
                write!(f, "Unexpected vector length (expected {}; got {})", expected, actual)
            }

            Error::UnexpectedType(expected, actual) => {
                let expected = unsafe { r_type2char(*expected) };
                let actual   = unsafe { r_type2char(*actual) };
                write!(f, "Unexpected vector type (expected {}; got {})", expected, actual)
            }

        }
    }
}
