//
// utils.rs
//
// Copyright (C) 2022 by Posit Software, PBC
//
//

use std::ffi::CStr;
use std::ffi::CString;

use libR_sys::*;

use crate::error::Error;
use crate::error::Result;
use crate::exec::RArgument;
use crate::exec::RFunction;
use crate::exec::RFunctionExt;
use crate::object::RObject;
use crate::r_symbol;
use crate::vector::CharacterVector;
use crate::vector::Vector;

pub unsafe fn r_assert_type(object: SEXP, expected: &[u32]) -> Result<u32> {
    let actual = r_typeof(object);

    if !expected.contains(&actual) {
        return Err(Error::UnexpectedType(actual, expected.to_vec()));
    }

    Ok(actual)
}

pub unsafe fn r_assert_capacity(object: SEXP, required: u32) -> Result<u32> {
    let actual = Rf_length(object) as u32;
    if actual < required {
        return Err(Error::UnexpectedLength(actual, required));
    }

    Ok(actual)
}

pub unsafe fn r_assert_length(object: SEXP, expected: u32) -> Result<u32> {
    let actual = Rf_length(object) as u32;
    if actual != expected {
        return Err(Error::UnexpectedLength(actual, expected));
    }

    Ok(actual)
}

// used for [&str] and [String]
macro_rules! partial_eq_RObject_slice {
    ($type:ty) => {
        impl PartialEq<[$type]> for RObject {
            fn eq(&self, other: &[$type]) -> bool {
                unsafe {
                    let object = self.sexp;
                    if r_typeof(object) != STRSXP {
                        return false;
                    }

                    let n = Rf_xlength(object) as isize;
                    if n != other.len() as isize {
                        return false;
                    }
                    for i in 0..n {
                        if !other[i as usize].eq(CStr::from_ptr(R_CHAR(STRING_ELT(object, i))).to_str().unwrap()) {
                            return false;
                        }
                    }
                    true
                }
            }
        }

    };
}

partial_eq_RObject_slice!{ &str }
partial_eq_RObject_slice!{ String }

macro_rules! partial_eq_RObject_slice2 {
    ([$($vars:tt)*] $type:ty) => {
        impl<$($vars)*> PartialEq<$type> for RObject {
            fn eq(&self, other: &$type) -> bool {
                self.eq(&other[..])
            }
        }

    }
}
partial_eq_RObject_slice2!{ [const N: usize] [&str; N]}
partial_eq_RObject_slice2!{ [] Vec<&str> }
partial_eq_RObject_slice2!{ [const N: usize] [String; N]}
partial_eq_RObject_slice2!{ [] Vec<String>}

macro_rules! partial_eq_RObject_rhs {
    ([$($vars:tt)*] $type:ty) => {
        impl<$($vars)*> PartialEq<RObject> for $type {
            fn eq(&self, other: &RObject) -> bool {
                other.eq(self)
            }
        }
    }
}
partial_eq_RObject_rhs!{ [] [&str] }
partial_eq_RObject_rhs!{ [const N: usize] [&str; N] }
partial_eq_RObject_rhs!{ [] Vec<&str> }

partial_eq_RObject_rhs!{ [] [String] }
partial_eq_RObject_rhs!{ [const N: usize] [String; N] }
partial_eq_RObject_rhs!{ [] Vec<String> }

pub unsafe fn r_typeof(object: SEXP) -> u32 {
    TYPEOF(object) as u32
}

pub unsafe fn r_type2char<T: Into<u32>>(kind: T) -> String {
    let kind = Rf_type2char(kind.into());
    let cstr = CStr::from_ptr(kind);
    return cstr.to_str().unwrap().to_string();
}

pub unsafe fn r_get_option<T: TryFrom<RObject, Error = Error>>(name: &str) -> Result<T> {
    let result = Rf_GetOption1(r_symbol!(name));
    return RObject::new(result).try_into();
}

pub unsafe fn r_inherits(object: SEXP, class: &str) -> bool {
    let class = CString::new(class).unwrap();
    return Rf_inherits(object, class.as_ptr()) != 0;
}

pub unsafe fn r_formals(object: SEXP) -> Result<Vec<RArgument>> {

    // convert primitive functions into equivalent closures
    let mut object = RObject::new(object);
    if r_typeof(*object) == BUILTINSXP || r_typeof(*object) == SPECIALSXP {
        object = RFunction::new("base", "args").add(*object).call()?;
        if r_typeof(*object) != CLOSXP {
            return Ok(Vec::new());
        }
    }

    // validate we have a closure now
    r_assert_type(*object, &[CLOSXP])?;

    // get the formals
    let mut formals = FORMALS(*object);

    // iterate through the entries
    let mut arguments = Vec::new();

    while formals != R_NilValue {

        let name = RObject::from(TAG(formals)).to::<String>()?;
        let value = CAR(formals);
        arguments.push(RArgument::new(name.as_str(), RObject::new(value)));
        formals = CDR(formals);

    }

    Ok(arguments)

}

pub unsafe fn r_envir_name(envir: SEXP) -> Result<String> {

    r_assert_type(envir, &[ENVSXP])?;

    if R_IsPackageEnv(envir) != 0 {
        let name = RObject::from(R_PackageEnvName(envir));
        return name.to::<String>();
    }

    if R_IsNamespaceEnv(envir) != 0 {
        let spec = CharacterVector::try_from(R_NamespaceEnvSpec(envir))?;
        let package = spec.elt(0)?;
        return Ok(package);
    }

    let name = Rf_getAttrib(envir, r_symbol!("name"));
    if r_typeof(name) == STRSXP {
        let name = RObject::view(name).to::<String>()?;
        return Ok(name);
    }

    Ok(format!("{:p}", envir))

}

pub unsafe fn r_stringify(object: SEXP, delimiter: &str) -> Result<String> {

    // handle SYMSXPs upfront
    if r_typeof(object) == SYMSXP {
        return RObject::view(object).to::<String>();
    }

    // call format on the object
    let object = RFunction::new("base", "format")
        .add(object)
        .call()?;

    // paste into a single string
    let object = RFunction::new("base", "paste")
        .add(object)
        .param("collapse", delimiter)
        .call()?
        .to::<String>()?;

    Ok(object)

}
