//
// environment.rs
//
// Copyright (C) 2022 Posit Software, PBC. All rights reserved.
//
//

use std::cmp::Ordering;
use std::ops::Deref;

use c2rust_bitfields::BitfieldStruct;
use itertools::Itertools;
use libR_sys::*;

use crate::exec::RFunction;
use crate::exec::RFunctionExt;
use crate::object::RObject;
use crate::symbol::RSymbol;
use crate::utils::r_assert_type;
use crate::utils::r_inherits;
use crate::utils::r_typeof;
use crate::vector::CharacterVector;
use crate::vector::Factor;
use crate::vector::IntegerVector;
use crate::vector::LogicalVector;
use crate::vector::NumericVector;
use crate::vector::RawVector;
use crate::vector::Vector;
use crate::with_vector;

#[derive(Copy, Clone, BitfieldStruct)]
#[repr(C)]
pub struct Sxpinfo {
    #[bitfield(name = "rtype", ty = "libc::c_uint", bits = "0..=4")]
    #[bitfield(name = "scalar", ty = "libc::c_uint", bits = "5..=5")]
    #[bitfield(name = "obj", ty = "libc::c_uint", bits = "6..=6")]
    #[bitfield(name = "alt", ty = "libc::c_uint", bits = "7..=7")]
    #[bitfield(name = "gp", ty = "libc::c_uint", bits = "8..=23")]
    #[bitfield(name = "mark", ty = "libc::c_uint", bits = "24..=24")]
    #[bitfield(name = "debug", ty = "libc::c_uint", bits = "25..=25")]
    #[bitfield(name = "trace", ty = "libc::c_uint", bits = "26..=26")]
    #[bitfield(name = "spare", ty = "libc::c_uint", bits = "27..=27")]
    #[bitfield(name = "gcgen", ty = "libc::c_uint", bits = "28..=28")]
    #[bitfield(name = "gccls", ty = "libc::c_uint", bits = "29..=31")]
    #[bitfield(name = "named", ty = "libc::c_uint", bits = "32..=47")]
    #[bitfield(name = "extra", ty = "libc::c_uint", bits = "48..=63")]
    pub rtype_scalar_obj_alt_gp_mark_debug_trace_spare_gcgen_gccls_named_extra: [u8; 8],
}

pub static mut ACTIVE_BINDING_MASK: libc::c_uint = 1 << 15;
pub static mut S4_OBJECT_MASK: libc::c_uint = 1 << 4;

impl Sxpinfo {

    pub fn interpret(x: &SEXP) -> &Self {
        unsafe {
            (*x as *mut Sxpinfo).as_ref().unwrap()
        }
    }

    pub fn is_active(&self) -> bool {
        self.gp() & unsafe {ACTIVE_BINDING_MASK} != 0
    }

    pub fn is_immediate(&self) -> bool {
        self.extra() != 0
    }

    pub fn is_s4(&self) -> bool {
        self.gp() & unsafe {S4_OBJECT_MASK} != 0
    }
}

#[derive(Debug, Eq, PartialEq)]
pub enum BindingKind {
    Regular,
    Active,
    Promise(bool),
}

#[derive(Debug, Eq, PartialEq)]
pub struct Binding {
    pub name: RSymbol,
    pub value: SEXP,
    pub kind: BindingKind
}

impl Ord for Binding {
    fn cmp(&self, other: &Self) -> Ordering {
        self.name.cmp(&other.name)
    }
}

impl PartialOrd for Binding {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

pub struct BindingValue {
    pub display_value: String,
    pub is_truncated: bool
}

impl BindingValue {
    pub fn new(display_value: String, is_truncated: bool) -> Self {
        BindingValue {
            display_value,
            is_truncated
        }
    }

    pub fn empty() -> Self {
        Self::new(String::from(""), false)
    }

    pub fn from(x: SEXP) -> Self {
        regular_binding_display_value(x)
    }
}

pub struct BindingType {
    pub display_type: String,
    pub type_info: String
}

impl BindingType {

    pub fn from(value: SEXP) -> Self {
        if value == unsafe { R_NilValue } {
            return Self::simple(String::from("NULL"))
        }

        if RObject::view(value).is_s4() {
            return Self::from_class(value, String::from("S4"));
        }

        if is_simple_vector(value) {
            return vec_type_info(value);
        }

        let rtype = r_typeof(value);
        match rtype {
            EXPRSXP => Self::from_class(value, format!("expression [{}]", unsafe { XLENGTH(value) })),
            LANGSXP => Self::from_class(value, String::from("language")),
            CLOSXP  => Self::from_class(value, String::from("function")),
            ENVSXP  => Self::from_class(value, String::from("environment")),
            SYMSXP  => {
                if value == unsafe { R_MissingArg } {
                    Self::simple(String::from("missing"))
                } else {
                    Self::simple(String::from("symbol"))
                }
            },

            LISTSXP => {
                match pairlist_size(value) {
                    Ok(n)  => Self::simple(format!("pairlist [{}]", n)),
                    Err(_) => Self::simple(String::from("pairlist [?]"))
                }
            },

            VECSXP => unsafe {
                if r_inherits(value, "data.frame") {
                    let dfclass = first_class(value).unwrap();

                    let dim = RFunction::new("base", "dim.data.frame")
                        .add(value)
                        .call()
                        .unwrap();

                    let dim = IntegerVector::new(dim).unwrap();
                    let shape = dim.format(",", 0).1;

                    Self::simple(
                        format!("{} [{}]", dfclass, shape)
                    )
                } else {
                    Self::from_class(value, format!("list [{}]", XLENGTH(value)))
                }
            },
            _      => Self::from_class(value, String::from("???"))
        }

    }

    pub fn simple(display_type: String) -> Self {
        Self {
            display_type,
            type_info: String::from("")
        }
    }

    fn from_class(value: SEXP, default: String) -> Self {
        match first_class(value) {
            None        => Self::simple(default),
            Some(class) => Self::new(class, all_classes(value))
        }
    }

    fn new(display_type: String, type_info: String) -> Self {
        Self {
            display_type,
            type_info
        }
    }

}

impl Binding {
    pub fn new(env: SEXP, frame: SEXP) -> Self {
        unsafe {
            let name = RSymbol::new(TAG(frame));

            let info = Sxpinfo::interpret(&frame);

            if info.is_immediate() {
                // force the immediate bindings before we can safely call CAR()
                Rf_findVarInFrame(env, *name);
            }
            let value = CAR(frame);

            let kind = if info.is_active() {
                BindingKind::Active
            } else {
                match r_typeof(value) {
                    PROMSXP => BindingKind::Promise(PRVALUE(value) != R_UnboundValue),
                    _       => BindingKind::Regular
                }
            };

            Self {
                name, value, kind
            }
        }

    }

    pub fn get_value(&self) -> BindingValue {
        match self.kind {
            BindingKind::Regular => regular_binding_display_value(self.value),
            BindingKind::Promise(true) => regular_binding_display_value(unsafe{PRVALUE(self.value)}),

            BindingKind::Active => BindingValue::empty(),
            BindingKind::Promise(false) => BindingValue::empty()
        }
    }

    pub fn get_type(&self) -> BindingType {
        match self.kind {
            BindingKind::Active => BindingType::simple(String::from("active binding")),
            BindingKind::Promise(false) => BindingType::simple(String::from("promise")),

            BindingKind::Regular => BindingType::from(self.value),
            BindingKind::Promise(true) => BindingType::from(unsafe{PRVALUE(self.value)})
        }
    }

    pub fn has_children(&self) -> bool {
        match self.kind {
            BindingKind::Regular => has_children(self.value),
            BindingKind::Promise(true) => has_children(unsafe{PRVALUE(self.value)}),

            // TODO:
            //   - BindingKind::Promise(false) could have code and env as their children
            //   - BindingKind::Active could have their function
            _ => false
        }
    }

    pub fn is_hidden(&self) -> bool {
        String::from(self.name).starts_with(".")
    }

}

pub fn has_children(value: SEXP) -> bool {
    if RObject::view(value).is_s4() {
        unsafe {
            let names = RFunction::new("methods", ".slotNames").add(value).call().unwrap();
            let names = CharacterVector::new_unchecked(names);
            names.len() > 0
        }
    } else {
        match r_typeof(value) {
            VECSXP   => unsafe { XLENGTH(value) != 0 },
            EXPRSXP  => unsafe { XLENGTH(value) != 0 },
            LISTSXP  => true,
            ENVSXP   => true,
            _        => false
        }
    }
}

fn is_simple_vector(value: SEXP) -> bool {
    unsafe {
        let class = Rf_getAttrib(value, R_ClassSymbol);

        match r_typeof(value) {
            LGLSXP  => class == R_NilValue,
            INTSXP  => class == R_NilValue || r_inherits(value, "factor"),
            REALSXP => class == R_NilValue,
            CPLXSXP => class == R_NilValue,
            STRSXP  => class == R_NilValue,
            RAWSXP  => class == R_NilValue,

            _       => false
        }
    }
}

fn first_class(value: SEXP) -> Option<String> {
    unsafe {
        let classes = Rf_getAttrib(value, R_ClassSymbol);
        if classes == R_NilValue {
            None
        } else {
            let classes = CharacterVector::new_unchecked(classes);
            Some(classes.get_unchecked(0).unwrap())
        }
    }
}

fn all_classes(value: SEXP) -> String {
    unsafe {
        let classes = Rf_getAttrib(value, R_ClassSymbol);
        let classes = CharacterVector::new_unchecked(classes);
        classes.format("/", 0).1
    }
}

fn regular_binding_display_value(value: SEXP) -> BindingValue {
    let rtype = r_typeof(value);
    if is_simple_vector(value) {
        with_vector!(value, |v| {
            let formatted = v.format(" ", 100);
            BindingValue::new(formatted.1, formatted.0)
        }).unwrap()
    } else if rtype == VECSXP && ! unsafe{r_inherits(value, "POSIXlt")}{
        // This includes data frames
        BindingValue::empty()
    } else if rtype == LISTSXP {
        BindingValue::empty()
    } else if rtype == SYMSXP && value == unsafe{ R_MissingArg } {
        BindingValue::new(String::from("<missing>"), false)
    } else if rtype == CLOSXP {
        unsafe {
            let args      = RFunction::from("args").add(value).call().unwrap();
            let formatted = RFunction::from("format").add(*args).call().unwrap();
            let formatted = CharacterVector::new_unchecked(formatted);
            let out = formatted.iter().take(formatted.len() -1).map(|o|{ o.unwrap() }).join("");
            BindingValue::new(out, false)
        }
    } else {
        format_display_value(value)
    }
}

fn format_display_value(value: SEXP) -> BindingValue {
    unsafe {
        // try to call format() on the object
        let formatted = RFunction::new("base", "format")
            .add(value)
            .call();

        match formatted {
            Ok(fmt) => {
                if r_typeof(*fmt) == STRSXP {
                    let fmt = CharacterVector::unquoted(*fmt);
                    let fmt = fmt.format(" ", 100);

                    BindingValue::new(fmt.1, fmt.0)
                } else {
                    BindingValue::new(String::from("???"), false)
                }
            },
            Err(_) => {
                BindingValue::new(String::from("???"), false)
            }
        }
    }
}

fn pairlist_size(mut pairlist: SEXP) -> Result<isize, crate::error::Error> {
    let mut n = 0;
    unsafe {
        while pairlist != R_NilValue {
            r_assert_type(pairlist, &[LISTSXP])?;

            pairlist = CDR(pairlist);
            n = n + 1;
        }
    }
    Ok(n)
}

fn vec_type(value: SEXP) -> String {
    match r_typeof(value) {
        INTSXP  => unsafe {
            if r_inherits(value, "factor") {
                let levels = Rf_getAttrib(value, R_LevelsSymbol);
                format!("fct({})", XLENGTH(levels))
            } else {
                String::from("int")
            }
        },
        REALSXP => String::from("dbl"),
        LGLSXP  => String::from("lgl"),
        STRSXP  => String::from("str"),
        RAWSXP  => String::from("raw"),
        CPLXSXP => String::from("cplx"),

        // TODO: this should not happen
        _       => String::from("???")
    }
}

fn vec_type_info(value: SEXP) -> BindingType {
    let display_type = format!("{} [{}]", vec_type(value), vec_shape(value));

    let mut type_info = display_type.clone();
    if unsafe{ ALTREP(value) == 1} {
        type_info.push_str(altrep_class(value).as_str())
    }

    BindingType::new(display_type, type_info)
}

fn vec_shape(value: SEXP) -> String {
    unsafe {
        let dim = RObject::new(Rf_getAttrib(value, R_DimSymbol));

        if *dim == R_NilValue {
            format!("{}", Rf_xlength(value))
        } else {
            let dim = IntegerVector::new(dim).unwrap();
            dim.format(",", 0).1
        }
    }
}

fn altrep_class(object: SEXP) -> String {
    let serialized_klass = unsafe{
        ATTRIB(ALTREP_CLASS(object))
    };

    let klass = RSymbol::new(unsafe{CAR(serialized_klass)});
    let pkg = RSymbol::new(unsafe{CADR(serialized_klass)});

    format!("{}::{}", pkg, klass)
}

pub struct Environment {
    env: RObject,
}

impl Deref for Environment {
    type Target = SEXP;
    fn deref(&self) -> &Self::Target {
        &self.env.sexp
    }
}

pub struct HashedEnvironmentIter<'a> {
    env: &'a Environment,

    hashtab: SEXP,
    hashtab_index: R_xlen_t,
    frame: SEXP
}

impl<'a> HashedEnvironmentIter<'a> {
    pub fn new(env: &'a Environment) -> Self {
        unsafe {
            let hashtab = HASHTAB(**env);
            let hashtab_len = XLENGTH(hashtab);
            let mut hashtab_index = 0;
            let mut frame = R_NilValue;

            // look for the first non null frame
            loop {
                let f = VECTOR_ELT(hashtab, hashtab_index);
                if f != R_NilValue {
                    frame = f;
                    break;
                }

                hashtab_index = hashtab_index + 1;
                if hashtab_index == hashtab_len {
                    break;
                }
            }

            Self {
                env,
                hashtab,
                hashtab_index,
                frame
            }

        }
    }
}

impl<'a> Iterator for HashedEnvironmentIter<'a> {
    type Item = Binding;

    fn next(&mut self) -> Option<Self::Item> {

        unsafe {
            if self.frame == R_NilValue {
                return None;
            }

            // grab the next Binding
            let binding = Binding::new(*self.env.env, self.frame);

            // and advance to next binding
            self.frame = CDR(self.frame);

            if self.frame == R_NilValue {
                // end of frame: move to the next non empty frame
                let hashtab_len = XLENGTH(self.hashtab);
                loop {
                    // move to the next frame
                    self.hashtab_index = self.hashtab_index + 1;

                    // end of iteration
                    if self.hashtab_index == hashtab_len {
                        self.frame = R_NilValue;
                        break;
                    }

                    // skip empty frames
                    self.frame = VECTOR_ELT(self.hashtab, self.hashtab_index);
                    if self.frame != R_NilValue {
                        break;
                    }
                }
            }

            Some(binding)

        }
    }
}

pub struct NonHashedEnvironmentIter<'a> {
    env: &'a Environment,

    frame: SEXP
}

impl<'a> NonHashedEnvironmentIter<'a> {
    pub fn new(env: &'a Environment) -> Self {
        unsafe {
            Self {
                env,
                frame: FRAME(**env),
            }
        }
    }
}

impl<'a> Iterator for NonHashedEnvironmentIter<'a> {
    type Item = Binding;

    fn next(&mut self) -> Option<Self::Item> {
        unsafe {
            if self.frame == R_NilValue {
                None
            } else {
                let binding = Binding::new(*self.env.env, self.frame);
                self.frame = CDR(self.frame);
                Some(binding)
            }
        }
    }
}

pub enum EnvironmentIter<'a> {
    Hashed(HashedEnvironmentIter<'a>),
    NonHashed(NonHashedEnvironmentIter<'a>)
}

impl<'a> EnvironmentIter<'a> {
    pub fn new(env: &'a Environment) -> Self {

        unsafe {
            let hashtab = HASHTAB(**env);
            if hashtab == R_NilValue {
                EnvironmentIter::NonHashed(NonHashedEnvironmentIter::new(env))
            } else {
                EnvironmentIter::Hashed(HashedEnvironmentIter::new(env))
            }
        }
    }
}

impl<'a> Iterator for EnvironmentIter<'a> {
    type Item = Binding;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            EnvironmentIter::Hashed(iter) => iter.next(),
            EnvironmentIter::NonHashed(iter) => iter.next()
        }
    }
}

impl Environment {
    pub fn new(value: SEXP) -> Self {
        Self {
            env: unsafe{ RObject::new(value) }
        }
    }

    pub fn iter(&self) -> EnvironmentIter {
        EnvironmentIter::new(&self)
    }
}

#[cfg(test)]
mod tests {
    use libR_sys::*;

    use crate::r_symbol;
    use crate::r_test;

    use super::*;

    unsafe fn test_environment_iter_impl(hash: bool) {
        let test_env = RFunction::new("base", "new.env")
            .param("parent", R_EmptyEnv)
            .param("hash", RObject::from(hash))
            .call()
            .unwrap();

        let sym = r_symbol!("a");
        Rf_defineVar(sym, Rf_ScalarInteger(42), test_env.sexp);

        let sym = r_symbol!("b");
        Rf_defineVar(sym, Rf_ScalarInteger(43), test_env.sexp);

        let sym = r_symbol!("c");
        Rf_defineVar(sym, Rf_ScalarInteger(44), test_env.sexp);

        let env = Environment::new(*test_env);
        assert_eq!(env.iter().count(), 3);
    }

    #[test]
    #[allow(non_snake_case)]
    fn test_environment_iter() { r_test! {
        test_environment_iter_impl(true);
        test_environment_iter_impl(false);
    }}

}