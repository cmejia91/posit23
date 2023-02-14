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
macro_rules! r_double {
    ($id:expr) => {{
        use libR_sys::*;
        Rf_ScalarReal($id)
    }}
}

#[macro_export]
macro_rules! r_pairlist_impl {

    ($head:expr, $tail:expr) => {{

        use libR_sys::*;

        let mut protect = $crate::protect::RProtect::new();
        let head = protect.add($head);
        let tail = protect.add($tail);
        let value = protect.add(Rf_cons(head, tail));

        value

    }};

}

#[macro_export]
macro_rules! r_pairlist {

    // Dotted (named) pairlist entry: '<name> = <expr>'; base case.
    ($name:ident = $head:expr$(,)?) => {{

        use libR_sys::*;

        let value = $crate::r_pairlist!($head, R_NilValue);
        SET_TAG(value, $crate::r_symbol!(stringify!($name)));

        value

    }};

    // Dotted (named) pairlist entry: '<name> = <expr>'; recursive case.
    ($name:ident = $head:expr, $($rest:tt)+) => {{

        use libR_sys::*;

        let value = $crate::r_pairlist!($head, $($rest)*);
        SET_TAG(value, $crate::r_symbol!(stringify!($name)));

        value

    }};

    // Pairlist entry; base case.
    ($head:expr$(,)?) => {
        $crate::r_pairlist_impl!($head, R_NilValue)
    };

    // Pairlist entry; recursive case.
    ($head:expr, $($rest:tt)+) => {
        $crate::r_pairlist_impl!($head, $crate::r_pairlist!($($rest)*))
    };

    // Empty pairlist.
    ($(,)?) => {
        R_NilValue
    }

}

#[macro_export]
macro_rules! r_lang {

    ($(rest:tt)*) => {
        let value = $crate::r_pairlist!($($rest)*);
        SET_TYPEOF(value, LISTSXP);
        value
    }

}

#[cfg(test)]
mod tests {
    use libR_sys::*;
    use crate::object::RObject;
    use crate::utils::r_typeof;

    use super::*;

    #[test]
    fn test_pairlist() { r_test! {

        let value = RObject::new(r_pairlist! {
            A = r_symbol!("a"),
            B = r_symbol!("b"),
            r_symbol!("c"),
            r_symbol!("d"),
        });

        assert!(CAR(*value) == r_symbol!("a"));
        assert!(CADR(*value) == r_symbol!("b"));
        assert!(CADDR(*value) == r_symbol!("c"));
        assert!(CADDDR(*value) == r_symbol!("d"));

        assert!(TAG(*value) == r_symbol!("A"));
        assert!(TAG(CDR(*value)) == r_symbol!("B"));

        let value = RObject::new(r_pairlist! {
            r_symbol!("a"),
            r_string!("b"),
            r_double!(42.0),
        });

        assert!(Rf_length(*value) == 3);

        let e1 = CAR(*value);
        assert!(r_typeof(e1) == SYMSXP);

        let e2 = CADR(*value);
        assert!(r_typeof(e2) == STRSXP);
        assert!(RObject::view(e2).to::<String>().unwrap() == "b");

        let e3 = CADDR(*value);
        assert!(r_typeof(e3) == REALSXP);
        assert!(RObject::view(e3).to::<f64>().unwrap() == 42.0);

        let value = RObject::new(r_pairlist! {});
        assert!(Rf_length(*value) == 0);

    }}

}

