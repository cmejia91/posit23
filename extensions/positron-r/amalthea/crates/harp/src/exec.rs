//
// exec.rs
//
// Copyright (C) 2022 by Posit Software, PBC
//
//

use std::ffi::CStr;
use std::mem;
use std::os::raw::c_int;
use std::os::raw::c_void;
use std::os::raw::c_char;

use libR_sys::*;

use crate::error::Error;
use crate::error::Result;
use crate::object::RObject;
use crate::protect::RProtect;
use crate::r_symbol;
use crate::utils::r_inherits;
use crate::utils::r_stringify;
use crate::utils::r_typeof;

extern "C" {
    pub static R_ParseError: c_int;
}

extern "C" {
    pub static R_ParseErrorMsg: [c_char; 256usize];
}

extern "C" {
    pub static R_ParseContext: [c_char; 256usize];
}

pub struct RArgument {
    pub name: String,
    pub value: RObject,
}

impl RArgument {

    pub fn new(name: &str, value: RObject) -> Self {
        Self {
            name: name.to_string(),
            value: value
        }
    }

}

pub struct RFunction {
    package: String,
    function: String,
    arguments: Vec<RArgument>,
}

pub trait RFunctionExt<T> {
    fn param(&mut self, name: &str, value: T) -> &mut Self;
    fn add(&mut self, value: T) -> &mut Self;
}

impl<T: Into<RObject>> RFunctionExt<Option<T>> for RFunction {

    fn param(&mut self, name: &str, value: Option<T>) -> &mut Self {
        if let Some(value) = value {
            self._add(name, value.into());
        }
        self
    }

    fn add(&mut self, value: Option<T>) -> &mut Self {
        if let Some(value) = value {
            self._add("", value.into());
        }
        self
    }

}

impl<T: Into<RObject>> RFunctionExt<T> for RFunction {

    fn param(&mut self, name: &str, value: T) -> &mut Self {
        let value : RObject = value.into();
        return self._add(name, value);
    }

    fn add(&mut self, value: T) -> &mut Self {
        let value : RObject = value.into();
        return self._add("", value);
    }

}

impl RFunction {

    pub fn new(package: &str, function: &str) -> Self {

        RFunction {
            package: package.to_string(),
            function: function.to_string(),
            arguments: Vec::new(),
        }

    }

    fn _add(&mut self, name: &str, value: RObject) -> &mut Self {
        self.arguments.push(RArgument {
            name: name.to_string(),
            value: value,
        });
        self
    }

    pub unsafe fn call(&mut self) -> Result<RObject> {

        let mut protect = RProtect::new();

        // start building the call to be evaluated
        let mut lhs = r_symbol!(self.function);
        if !self.package.is_empty() {
            lhs = protect.add(Rf_lang3(r_symbol!(":::"), r_symbol!(self.package), lhs));
        }

        // now, build the actual call to be evaluated
        let size = (1 + self.arguments.len()) as R_xlen_t;
        let call = protect.add(Rf_allocVector(LANGSXP, size));
        SET_TAG(call, R_NilValue);
        SETCAR(call, lhs);

        // append arguments to the call
        let mut slot = CDR(call);
        for argument in self.arguments.iter() {

            // quote language objects by default
            let mut sexp = argument.value.sexp;
            if matches!(r_typeof(sexp), LANGSXP | SYMSXP | EXPRSXP) {
                let quote = protect.add(Rf_lang3(r_symbol!("::"), r_symbol!("base"), r_symbol!("quote")));
                sexp = protect.add(Rf_lang2(quote, sexp));
            }

            SETCAR(slot, sexp);
            if !argument.name.is_empty() {
                SET_TAG(slot, r_symbol!(argument.name));
            }

            slot = CDR(slot);
        }

        // now, wrap call in tryCatch, so that errors don't longjmp
        let try_catch = protect.add(Rf_lang3(r_symbol!("::"), r_symbol!("base"), r_symbol!("tryCatch")));
        let call = protect.add(Rf_lang4(try_catch, call, r_symbol!("identity"), r_symbol!("identity")));
        SET_TAG(call, R_NilValue);
        SET_TAG(CDDR(call), r_symbol!("error"));
        SET_TAG(CDDDR(call), r_symbol!("interrupt"));

        // evaluate the call
        let envir = if self.package.is_empty() { R_GlobalEnv } else { R_BaseEnv };
        let result = protect.add(Rf_eval(call, envir));

        if r_inherits(result, "error") {

            let code = r_stringify(call, "\n")?;
            let message = geterrmessage();
            return Err(Error::EvaluationError {
                code: code,
                message: message,
            });

        }

        return Ok(RObject::new(result));

    }

}

impl From<&str> for RFunction {
    fn from(function: &str) -> Self {
        RFunction::new("", function)
    }
}

pub unsafe fn geterrmessage() -> String {

    let buffer = R_curErrorBuf();
    let cstr = CStr::from_ptr(buffer);

    match cstr.to_str() {
        Ok(value) => return value.to_string(),
        Err(_) => return "".to_string(),
    }

}

pub unsafe fn r_top_level_exec<F>(mut f: F) -> bool where F: FnMut() {
    let mut cb: &mut dyn FnMut() = &mut f;
    let cb = &mut cb;

    extern fn top_level_exec_fn(arg: *mut c_void) {
        let closure: &mut &mut dyn FnMut() = unsafe { mem::transmute(arg) };
        closure()
    }

    let success = R_ToplevelExec(
        Some(top_level_exec_fn),
        cb as *mut _ as *mut c_void
    );

    success == Rboolean_TRUE
}

pub enum ParseResult {
    Ok(SEXP),
    Incomplete(),
    Error {
        message: String
    },
    SyntaxError {
        message: String,
        line: i32
    }
}

#[allow(non_upper_case_globals)]
pub unsafe fn r_parse_vector(code: String) -> ParseResult {

    let mut ps : ParseStatus = 0;
    let mut protect = RProtect::new();
    let r_code = protect.add(crate::r_string!(code));

    let mut out: SEXP = R_NilValue;

    let success = r_top_level_exec(|| {
        out = R_ParseVector(r_code, -1, &mut ps, R_NilValue);
    });

    match success {
        false => ParseResult::Error{
            message: geterrmessage()
        },
        true => {
            match ps {
                ParseStatus_PARSE_OK => ParseResult::Ok(out),
                ParseStatus_PARSE_INCOMPLETE => ParseResult::Incomplete(),
                _ => {
                    ParseResult::SyntaxError{
                        message: CStr::from_ptr(R_ParseErrorMsg.as_ptr()).to_string_lossy().to_string(),
                        line: R_ParseError as i32
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {

    use std::io::Write;

    use crate::r_lock;
    use crate::r_test;
    use crate::r_test_unlocked;

    use super::*;

    #[test]
    fn test_basic_function() { r_test! {

        // try adding some numbers
        let result = RFunction::new("", "+")
            .add(2)
            .add(2)
            .call()
            .unwrap();

        // check the result
        assert!(Rf_isInteger(*result) != 0);
        assert!(Rf_asInteger(*result) == 4);

    }}

    #[test]
    fn test_utf8_strings() { r_test! {

        // try sending some UTF-8 strings to and from R
        let result = RFunction::new("base", "paste")
            .add("世界")
            .add("您好".to_string())
            .call()
            .unwrap();

        assert!(Rf_isString(*result) != 0);

        let value = TryInto::<String>::try_into(result);
        assert!(value.is_ok());
        if let Ok(value) = value {
            assert!(value == "世界 您好")
        }

    }}

    #[test]
    fn test_named_arguments() { r_test! {

        let result = RFunction::new("stats", "rnorm")
            .add(1.0)
            .param("mean", 10)
            .param("sd", 0)
            .call()
            .unwrap();

        assert!(Rf_isNumeric(*result) != 0);
        assert!(Rf_asInteger(*result) == 10);

    }}

    #[test]
    fn test_threads() { r_test_unlocked! {

        // Spawn a bunch of threads that try to interact with R.
        const N : i32 = 1000;
        let mut handles : Vec<_> = Vec::new();
        for _i in 1..20 {
            let handle = std::thread::spawn(move || {
                let id = std::thread::current().id();
                for _j in 1..20 {
                    r_lock! {
                        println!("Thread {:?} acquiring R lock.", id);
                        std::io::stdout().flush().unwrap();
                        let mut protect = RProtect::new();
                        let code = protect.add(Rf_lang2(r_symbol!("rnorm"), Rf_ScalarInteger(N)));
                        println!("Thread {:?} about to evaluate R code.", id);
                        std::io::stdout().flush().unwrap();
                        let result = protect.add(Rf_eval(code, R_GlobalEnv));
                        println!("Thread {:?} finished evaluating R code.", id);
                        std::io::stdout().flush().unwrap();
                        assert!(Rf_length(result) == N);
                        println!("Thread {:?} releasing R lock.", std::thread::current().id());
                        std::io::stdout().flush().unwrap();
                    };
                }
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

    }}

    #[test]
    fn test_top_level_exec() { r_test! {
        let mut ps : ParseStatus = 0;
        let mut protect = RProtect::new();
        let code = protect.add(crate::r_string!("force(42)"));

        let mut out: SEXP = R_NilValue;

        // successfull
        let success = r_top_level_exec(|| {
            out = R_ParseVector(code, -1, &mut ps, R_NilValue);
        });
        assert_eq!(success, true);
        assert_eq!(r_typeof(out), EXPRSXP as u32);

        let call = VECTOR_ELT(out, 0);
        assert_eq!(r_typeof(call), LANGSXP as u32);
        assert_eq!(Rf_length(call), 2);
        assert_eq!(CAR(call), r_symbol!("force"));

        let arg = CADR(call);
        assert_eq!(r_typeof(arg), REALSXP as u32);
        assert_eq!(*REAL(arg), 42.0);

        // failed
        let code = protect.add(crate::r_string!("42 + _"));
        let success = r_top_level_exec(|| {
            out = R_ParseVector(code, -1, &mut ps, R_NilValue);
        });
        assert_eq!(success, false);
    }}

    #[test]
    fn test_parse_vector() { r_test! {
        // complete
        assert!(
            match r_parse_vector(String::from("force(42)")) {
                ParseResult::Ok(out) => {
                    assert_eq!(r_typeof(out), EXPRSXP as u32);

                    let call = VECTOR_ELT(out, 0);
                    assert_eq!(r_typeof(call), LANGSXP as u32);
                    assert_eq!(Rf_length(call), 2);
                    assert_eq!(CAR(call), r_symbol!("force"));

                    let arg = CADR(call);
                    assert_eq!(r_typeof(arg), REALSXP as u32);
                    assert_eq!(*REAL(arg), 42.0);

                    true
                },
                _ => false
            }
        );

        // incomplete
        assert!(match r_parse_vector(String::from("force(42")) {
            ParseResult::Incomplete() => true,
            _ => false
        });

        // error
        assert!(match r_parse_vector(String::from("42 + _")) {
            ParseResult::Error {message} => {
                assert!(message.contains("invalid use of pipe placeholder"));

                true
            },
            _ => false
        });

        // "normal" syntax error
        assert!(match r_parse_vector(String::from("1+1\n*42")) {
            ParseResult::SyntaxError {message, line} => {
                assert!(message.contains("unexpected"));
                assert_eq!(line, 2);

                true
            },
            _ => false
        });

    }}



}

