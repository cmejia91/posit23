//
// lib.rs
//
// Copyright (C) 2022 by Posit, PBC
//
//

pub mod all;
pub mod any;
pub mod case;
pub mod local;
pub mod join;
pub mod push;
pub mod unwrap;

#[macro_export]
macro_rules! cargs {

    ($($expr:expr),*) => {{
        vec![$($crate::cstr!($expr)),*]
    }};

}


#[macro_export]
macro_rules! cstr {

    ($value:literal) => {{
        use std::os::raw::c_char;
        let value = concat!($value, "\0");
        value.as_ptr() as *mut c_char
    }};

}
