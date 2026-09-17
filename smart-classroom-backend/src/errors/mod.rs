// Este archivo es la "puerta de entrada" del módulo errors.
// Declara que api_error.rs es parte de este módulo...
pub mod api_error;

// ...y reexporta ApiError y ApiResult para que el resto del proyecto
// pueda escribir `use crate::errors::ApiError` en vez de
// `use crate::errors::api_error::ApiError` (más corto y limpio).
pub use api_error::{ApiError, ApiResult};
