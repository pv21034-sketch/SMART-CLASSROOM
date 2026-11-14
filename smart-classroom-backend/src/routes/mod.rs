
pub mod alertas;
pub mod aulas;
pub mod mediciones;
pub mod sensores;

// ============================================
// SMART CLASSROOM - RUTAS NUEVAS
// ============================================

pub mod dispositivos;
pub mod rangos;

#[path = "Auth.rs"]
pub mod auth;

use axum::{routing::get, Router};

// ============================================
// REGISTRO GENERAL DE RUTAS
// ============================================

pub fn create_router() -> Router {
    Router::new()
        // Autenticación
        .merge(auth::router())

        // Mediciones
        .merge(mediciones::mediciones_routes())

        // Alertas
        .merge(alertas::alertas_routes())

        // Aulas
        .nest("/api", aulas::aulas_routes())

        // Sensores
        .merge(sensores::sensores_routes())

        // Dispositivos ESP32
        .merge(dispositivos::router())

        // Rangos ambientales
        .merge(rangos::router())

        // WebSocket
        .route("/ws", get(crate::websocket::ws_handler))
}
