//
// unwrap.rs
//
// Copyright (C) 2022 by RStudio, PBC
//
//

#[derive(Debug, Clone)]
pub struct EmptyOptionError {
}

impl std::fmt::Display for EmptyOptionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Unexpected empty option value")
    }
}

impl std::error::Error for EmptyOptionError {}

pub trait IntoResult<T, E> {
    fn into_result(self) -> Result<T, E>;
}

impl<T, E> IntoResult<T, E> for Result<T, E> {
    fn into_result(self) -> Result<T, E> { self }
}

impl<T> IntoResult<T, EmptyOptionError> for Option<T> {
    fn into_result(self) -> Result<T, EmptyOptionError> {
        self.ok_or(EmptyOptionError {})
    }
}

#[doc(hidden)]
pub fn _into_result<T, E>(object: impl IntoResult<T, E>) -> Result<T, E> {
    object.into_result()
}

#[macro_export]
macro_rules! unwrap {

    ($value: expr, $id: ident $error: block) => {
        match $crate::unwrap::_into_result($value) {
            Ok(value) => value,
            Err($id) => $error,
        }
    };

    ($value: expr, $error: block) => {
        match $crate::unwrap::_into_result($value) {
            Ok(value) => value,
            Err(_error) => $error,
        }
    }

}
