
 // ============================================================
 // SMART CLASSROOM - MODULO DE ERRORES
 // ============================================================

 // Manejo general de errores de la API.
 pub mod api_error;

 // Manejo de errores de PostgreSQL / SQLx.
 pub mod db;

 // Reexportamos los tipos existentes para mantener
 // la compatibilidad con el resto del backend.
 pub use api_error::{ApiError, ApiResult};
