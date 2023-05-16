//
// r-data-viewer.rs
//
// Copyright (C) 2023 by Posit Software, PBC
//
//

use amalthea::comm::event::CommEvent;
use amalthea::socket::comm::CommInitiator;
use amalthea::socket::comm::CommSocket;
use anyhow::bail;
use harp::exec::RFunction;
use harp::exec::RFunctionExt;
use harp::object::RObject;
use harp::utils::r_inherits;
use harp::utils::r_is_matrix;
use harp::utils::r_is_null;
use harp::utils::r_is_simple_vector;
use harp::utils::r_typeof;
use harp::vector::CharacterVector;
use harp::vector::Vector;
use libR_sys::INTEGER_ELT;
use libR_sys::R_DimSymbol;
use libR_sys::R_MissingArg;
use libR_sys::R_NamesSymbol;
use libR_sys::R_NilValue;
use libR_sys::R_RowNamesSymbol;
use libR_sys::Rf_getAttrib;
use libR_sys::SEXP;
use libR_sys::STRSXP;
use libR_sys::VECTOR_ELT;
use libR_sys::XLENGTH;
use libR_sys::R_CallMethodDef;
use serde::Deserialize;
use serde::Serialize;
use stdext::spawn;
use uuid::Uuid;

use crate::lsp::globals::comm_manager_tx;

pub struct RDataViewer {
    pub id: String,
    pub title: String,
    pub data: RObject,
    pub comm: CommSocket,
}

#[derive(Deserialize, Serialize)]
pub struct DataColumn {
    pub name: String,

    #[serde(rename = "type")]
    pub column_type: String,

    pub data: Vec<String>
}

#[derive(Deserialize, Serialize)]
pub struct DataSet {
    pub id: String,
    pub title: String,
    pub columns: Vec<DataColumn>,

    #[serde(rename = "rowCount")]
    pub row_count: usize
}

impl DataSet {

    fn extract_columns(object: RObject, name: Option<String>, columns: &mut Vec<DataColumn>) -> Result<(), anyhow::Error> {
        if r_inherits(*object, "data.frame") {
            unsafe {
                let names = Rf_getAttrib(*object, R_NamesSymbol);
                if r_typeof(names) != STRSXP {
                    bail!("data frame without names");
                }
                let names = CharacterVector::new_unchecked(names);

                let n_columns = XLENGTH(*object);
                for i in 0..n_columns {
                    let name = match name {
                        Some(ref prefix) => format!("{}${}", prefix, names.get_unchecked(i).unwrap()),
                        None         => names.get_unchecked(i).unwrap()
                    };

                    Self::extract_columns(RObject::view(VECTOR_ELT(*object, i)), Some(name), columns)?;
                }
            }

        } else if r_is_matrix(*object) {
            unsafe {
                let dim = Rf_getAttrib(*object, R_DimSymbol);
                let n_columns = INTEGER_ELT(dim, 1);

                for i in 0..n_columns {
                    let name = match name {
                        Some(ref prefix) => format!("{}[, {}]", prefix, i + 1),
                        None => format!("[, {}]", i + 1)
                    };

                    let matrix_column = RFunction::from("[")
                        .add(*object)
                        .param("i", R_MissingArg)
                        .param("j", i + 1)
                        .call()?;

                    Self::extract_columns(matrix_column, Some(name), columns)?;
                }
            }
        } else {
            let mut formatted = object;
            if !r_is_simple_vector(*formatted) {
                formatted = unsafe { RFunction::from("format").add(*formatted).call()? };
                if r_typeof(*formatted) != STRSXP {
                    bail!("problem formatting data frame column {}", name.unwrap())
                }
            }
            let data = harp::vector::format(*formatted);

            columns.push(DataColumn{
                name: name.unwrap(),

                // TODO: String here is a placeholder
                column_type: String::from("String"),
                data
            });

        }

        Ok(())
    }

    pub fn from_data_frame(id: String, title: String, object: RObject) -> Result<Self, anyhow::Error> {
        let row_count = unsafe {
            let row_names = Rf_getAttrib(*object, R_RowNamesSymbol);
            XLENGTH(row_names) as usize
        };

        let mut columns = vec![];
        Self::extract_columns(object, None, &mut columns)?;

        Ok(Self {
            id,
            title,
            columns,
            row_count
        })

    }
}

impl RDataViewer {

    pub fn start(title: String, data: RObject) {
        spawn!("ark-data-viewer", move || {
            let id = Uuid::new_v4().to_string();
            let comm = CommSocket::new(
                CommInitiator::BackEnd,
                id.clone(),
                String::from("positron.dataViewer"),
            );
            let viewer = Self {
                id,
                title,
                data,
                comm
            };
            viewer.execution_thread()
        });
    }

    pub fn execution_thread(self) -> Result<(), anyhow::Error> {
        let data_set = DataSet::from_data_frame(self.id.clone(), self.title, self.data)?;
        let json = serde_json::to_value(data_set)?;

        let comm_manager_tx = comm_manager_tx();
        let event = CommEvent::Opened(self.comm.clone(), json);
        comm_manager_tx.send(event)?;

        // TODO: some sort of select!() loop to listen for events from the comm

        Ok(())
    }

}

#[harp::register]
pub unsafe extern "C" fn ps_view_data_frame(x: SEXP, title: SEXP) -> SEXP {
    let title = match String::try_from(RObject::view(title)) {
        Ok(s) => s,
        Err(_) => String::from("")
    };
    RDataViewer::start(title, RObject::from(x));

    R_NilValue
}
