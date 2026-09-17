// Declara que handler.rs pertenece a este módulo...
pub mod handler;

// ...y reexporta lo que otros módulos necesitan usar,
// para poder escribir `use crate::websocket::{ws_handler, WsState}` directamente.
pub use handler::{ws_handler, WsState};
