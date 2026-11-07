pub mod alertas;
pub mod aulas;
pub mod mediciones;
pub mod sensores;

#[path = "Auth.rs"]
pub mod auth;

use axum::{routing::get, Router};

pub fn create_router() -> Router {
    Router::new()
        .merge(auth::router())
        .merge(mediciones::mediciones_routes())
        .merge(alertas::alertas_routes())
        .merge(aulas::aulas_routes())
        .merge(sensores::sensores_routes())
        .route("/ws", get(crate::websocket::ws_handler))
}
