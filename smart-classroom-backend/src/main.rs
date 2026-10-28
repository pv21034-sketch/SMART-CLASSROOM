//! SMART CLASSROOM — Backend
//!
//! Servicio HTTP/WebSocket que recibe las mediciones de los dispositivos ESP32,
//! las valida, las almacena en PostgreSQL y expone la API para el dashboard.

// ============================================================
// MÓDULOS
// ============================================================

mod config;
mod db;
mod errors;
mod models;
mod routes;
mod schemas;
mod services;

// ============================================================
// IMPORTACIONES
// ============================================================

use anyhow::Context;
use axum::{http::StatusCode, routing::get, Extension, Json, Router};
use serde_json::{json, Value};
use sqlx::PgPool;
use tokio::{net::TcpListener, signal};
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::EnvFilter;

use crate::config::Config;

// ============================================================
// CONSTANTES
// ============================================================

const NOMBRE_SERVICIO: &str = "smart-classroom-backend";
const VERSION: &str = env!("CARGO_PKG_VERSION");

// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Variables de entorno definidas en .env (si el archivo no existe, se ignora).
    dotenvy::dotenv().ok();

    iniciar_logging();

    let config = Config::desde_entorno()?;

    // Base de datos
    let pool = db::crear_pool()
        .await
        .context("No se pudo establecer la conexión con PostgreSQL")?;
    tracing::info!("Conexión con PostgreSQL establecida correctamente");

    db::ejecutar_migraciones(&pool)
        .await
        .context("No se pudieron aplicar las migraciones de la base de datos")?;
    tracing::info!("Migraciones aplicadas correctamente");

        // if let (Some(usuario), Some(password)) = (&config.admin_usuario, &config.admin_password) {
    //     match services::usuarios::crear_admin_inicial(&pool, usuario, password).await {
    //         Ok(true) => tracing::info!("Administrador inicial '{usuario}' creado"),
    //         Ok(false) => {}
    //         Err(e) => tracing::error!("No se pudo crear el administrador inicial: {e}"),
    //     }
    // }
    // Primer administrador (solo si la tabla usuarios está vacía y hay credenciales en .env)
   // if let (Some(usuario), Some(password)) = (&config.admin_usuario, &config.admin_password) {
     //  match services::usuarios::crear_admin_inicial(&pool, usuario, password).await {
     //       Ok(true) => tracing::info!("Administrador inicial '{usuario}' creado"),
      //      Ok(false) => {}
       //     Err(e) => tracing::error!("No se pudo crear el administrador inicial: {e}"),
        //}
   // }
    //

    // Aplicación
    let direccion = config.direccion;
    let app = construir_app(pool, config);

    let listener = TcpListener::bind(direccion)
        .await
        .with_context(|| format!("No se pudo enlazar el servidor a {direccion}"))?;

    tracing::info!("{NOMBRE_SERVICIO} v{VERSION} ejecutándose en http://{direccion}");

    axum::serve(listener, app)
        .with_graceful_shutdown(senal_de_apagado())
        .await
        .context("Error en el servidor")?;

    tracing::info!("Servidor detenido correctamente");
    Ok(())
}

// ============================================================
// CONSTRUCCIÓN DEL ROUTER
// ============================================================

/// Arma el router completo con rutas base, rutas del sistema y middlewares.
///
/// El pool de PostgreSQL y la configuración se comparten con todos los
/// handlers mediante `Extension<PgPool>` y `Extension<Config>`.
fn construir_app(pool: PgPool, config: Config) -> Router {
    // CORS abierto para desarrollo: permite que el dashboard (HTML/JS) consuma la API
    // desde otro origen. En producción conviene restringir `allow_origin`.
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // Rutas base
        .route("/", get(inicio))
        .route("/api/salud", get(salud))
        // Rutas del sistema (mediciones, aulas, sensores, alertas, auth, WebSocket…)
        .merge(routes::create_router())
        // Respuesta JSON para rutas inexistentes
        .fallback(no_encontrado)
        // Middlewares (el último en agregarse es el primero en ejecutarse)
        .layer(Extension(pool))
        .layer(Extension(config))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
}

// ============================================================
// LOGGING
// ============================================================

/// Inicializa el sistema de logs. El nivel se controla con `RUST_LOG`
/// (por ejemplo: `RUST_LOG=debug`). Por defecto: `info`.
fn iniciar_logging() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(false)
        .init();
}

// ============================================================
// APAGADO CONTROLADO
// ============================================================

/// Espera Ctrl+C (o SIGTERM en Unix) para que el servidor termine
/// las peticiones en curso antes de cerrarse.
async fn senal_de_apagado() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("No se pudo instalar el manejador de Ctrl+C");
    };

    #[cfg(unix)]
    let terminar = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("No se pudo instalar el manejador de SIGTERM")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminar = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminar => {},
    }

    tracing::info!("Señal de apagado recibida, cerrando el servidor...");
}

// ============================================================
// ENDPOINT: INICIO
// ============================================================

/// Información básica del servicio.
///
/// GET /
async fn inicio() -> Json<Value> {
    Json(json!({
        "servicio": NOMBRE_SERVICIO,
        "version": VERSION,
    }))
}

// ============================================================
// ENDPOINT: SALUD
// ============================================================

/// Comprueba que el backend esté activo y que la base de datos responda.
/// Devuelve 200 si todo está bien y 503 si PostgreSQL no responde.
///
/// GET /api/salud
async fn salud(Extension(pool): Extension<PgPool>) -> (StatusCode, Json<Value>) {
    match db::verificar_conexion(&pool).await {
        Ok(()) => (
            StatusCode::OK,
            Json(json!({
                "estado": "ok",
                "servicio": NOMBRE_SERVICIO,
                "version": VERSION,
                "base_de_datos": "conectada",
            })),
        ),
        Err(error) => {
            tracing::error!("La comprobación de salud falló: {error}");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "estado": "error",
                    "servicio": NOMBRE_SERVICIO,
                    "version": VERSION,
                    "base_de_datos": "sin conexión",
                })),
            )
        }
    }
}

// ============================================================
// FALLBACK: RUTA NO ENCONTRADA
// ============================================================

/// Respuesta uniforme (JSON) para cualquier ruta que no exista.
async fn no_encontrado() -> (StatusCode, Json<Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "error": "Recurso no encontrado" })),
    )
}