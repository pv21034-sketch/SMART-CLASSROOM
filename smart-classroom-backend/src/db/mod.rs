//! SMART CLASSROOM — Capa de acceso a datos
//!
//! Centraliza la conexión y las operaciones
//! relacionadas con PostgreSQL.

pub mod postgres;

pub use postgres::{crear_pool, ejecutar_migraciones, verificar_conexion};
