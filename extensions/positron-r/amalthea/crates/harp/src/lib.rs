//
// lib.rs
//
// Copyright (C) 2022 by Posit Software, PBC
//
//

pub mod eval;
pub mod error;
pub mod exec;
pub mod lock;
pub mod object;
pub mod protect;
pub mod routines;
pub mod test;
pub mod utils;
pub mod vector;

pub use harp_macros::register;

pub fn initialize() {
    lock::initialize();
}

#[macro_export]
macro_rules! r_lock {

    ($($expr:tt)*) => {{
        #[allow(unused_unsafe)]
        $crate::lock::with_r_lock(|| {
            unsafe { $($expr)* } }
        )
    }}

}

#[macro_export]
macro_rules! r_symbol {

    ($id:literal) => {{
        use std::os::raw::c_char;
        let value = concat!($id, "\0");
        libR_sys::Rf_install(value.as_ptr() as *const c_char)
    }};

    ($id:expr) => {{
        use std::os::raw::c_char;
        let cstr = [&*$id, "\0"].concat();
        libR_sys::Rf_install(cstr.as_ptr() as *const c_char)
    }};

}

#[macro_export]
macro_rules! r_string {

    ($id:expr) => {{
        use std::os::raw::c_char;
        use libR_sys::*;

        let mut protect = $crate::protect::RProtect::new();
        let value = &*$id;
        let string_sexp = protect.add(Rf_allocVector(STRSXP, 1));
        let char_sexp = Rf_mkCharLenCE(value.as_ptr() as *mut c_char, value.len() as i32, cetype_t_CE_UTF8);
        SET_STRING_ELT(string_sexp, 0, char_sexp);
        string_sexp
    }}

}

#[macro_export]
macro_rules! r_pairlist {

    ($head:expr) => {{

        use libR_sys::*;

        let mut protect = $crate::protect::RProtect::new();
        let head = $head;
        protect.add(head);

        Rf_cons($head, R_NilValue)

    }};

    ($head:expr, $($rest:expr$(,)?)*) => {{

        use libR_sys::*;

        let mut protect = $crate::protect::RProtect::new();
        let head = $head;
        protect.add(head);

        let tail = $crate::r_pairlist!($($rest),*);
        let value = Rf_cons(head, tail);
        value

    }};

}

#[cfg(test)]
mod tests {
    use libR_sys::*;
    use super::*;

    #[test]
    fn test_pairlist() { r_test! {

        let value = r_pairlist! {
            r_symbol!("a"),
            r_symbol!("b"),
            r_symbol!("c"),
        };

        assert!(CAR(value) == r_symbol!("a"));
        assert!(CADR(value) == r_symbol!("b"));
        assert!(CADDR(value) == r_symbol!("c"));


    }}

}

