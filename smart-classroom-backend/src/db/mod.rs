//! Capa de acceso a datos de SMART CLASSROOM.
//!
//! Este módulo centraliza la configuración y las operaciones
//! relacionadas con la conexión a PostgreSQL.

pub mod postgres;

pub use postgres::{
    crear_pool,
    ejecutar_migraciones,
    verificar_conexion,
};