//! SMART CLASSROOM — Backend
//!
//! Servicio HTTP/WebSocket para recibir mediciones del ESP32,
//! procesarlas, almacenarlas en PostgreSQL y exponer la API.

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
mod websocket;

// ============================================================
// IMPORTACIONES
// ============================================================

use std::{env, net::SocketAddr, sync::Arc, time::Duration};

use anyhow::Context;
use axum::{
    http::{HeaderValue, Method, StatusCode},
    routing::get,
    Extension, Json, Router,
};
use serde_json::{json, Value};
use sqlx::PgPool;
use tokio::{net::TcpListener, signal};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::EnvFilter;

use crate::config::Config;
use crate::websocket::WsState;

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
    // Cargar variables locales si existe .env.
    dotenvy::dotenv().ok();

    iniciar_logging();

    tracing::info!("Iniciando {} v{}", NOMBRE_SERVICIO, VERSION);

    // Validar configuración.
    let config = Config::desde_entorno().context("Configuración del servidor inválida")?;

    let direccion: SocketAddr = config.direccion;

    // Conectar a PostgreSQL.
    let pool = db::crear_pool()
        .await
        .context("No se pudo conectar con PostgreSQL")?;

    tracing::info!("Pool PostgreSQL inicializado");

    // Las migraciones se ejecutan solo si se habilitan.
    // Valor predeterminado: false.
    if variable_booleana("RUN_MIGRATIONS", false)? {
        tracing::info!("Ejecutando migraciones SQLx...");

        db::ejecutar_migraciones(&pool)
            .await
            .context("Error ejecutando migraciones")?;

        tracing::info!("Migraciones verificadas");
    } else {
        tracing::info!("Migraciones automáticas desactivadas");
    }

    // Construir aplicación.
    let app = construir_app(pool, config)?;

    // Iniciar servidor HTTP.
    let listener = TcpListener::bind(direccion)
        .await
        .with_context(|| format!("No se pudo iniciar el servidor en {direccion}"))?;

    tracing::info!(
        "{} v{} escuchando en http://{}",
        NOMBRE_SERVICIO,
        VERSION,
        direccion
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(senal_de_apagado())
        .await
        .context("Error durante la ejecución del servidor")?;

    tracing::info!("Servidor detenido correctamente");

    Ok(())
}

// ============================================================
// VARIABLES DE ENTORNO
// ============================================================

/// Lee una variable booleana.
/// Acepta true/false y 1/0.
fn variable_booleana(nombre: &str, predeterminado: bool) -> anyhow::Result<bool> {
    match env::var(nombre) {
        Ok(valor) => match valor.trim().to_ascii_lowercase().as_str() {
            "true" | "1" => Ok(true),
            "false" | "0" => Ok(false),
            _ => anyhow::bail!("{nombre} debe ser true, false, 1 o 0"),
        },
        Err(env::VarError::NotPresent) => Ok(predeterminado),
        Err(error) => Err(error.into()),
    }
}

// ============================================================
// CONSTRUCCIÓN DEL ROUTER
// ============================================================

/// Configura las rutas y los middlewares del backend.
fn construir_app(pool: PgPool, config: Config) -> anyhow::Result<Router> {
    let cors = configurar_cors()?;

    // Estado compartido para WebSocket.
    let ws_state: Arc<WsState> = WsState::new(256);

    let app = Router::new()
        // Rutas públicas del servidor.
        .route("/", get(inicio))
        .route("/api/salud", get(salud))
        // Rutas de SMART CLASSROOM.
        .merge(routes::create_router())
        // Rutas inexistentes.
        .fallback(no_encontrado)
        // Dependencias compartidas.
        .layer(Extension(pool))
        .layer(Extension(config))
        .layer(Extension(ws_state))
        // Observabilidad.
        .layer(TraceLayer::new_for_http())
        // CORS.
        .layer(cors);

    Ok(app)
}

// ============================================================
// CONFIGURACIÓN CORS
// ============================================================

/// Lee CORS_ORIGINS como una lista separada por comas.
///
/// Ejemplo:
/// CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
///
/// Sin configuración, no se autorizan orígenes
/// de navegador adicionales.
fn configurar_cors() -> anyhow::Result<CorsLayer> {
    let origenes = env::var("CORS_ORIGINS").unwrap_or_default();

    let mut permitidos = Vec::new();

    for origen in origenes.split(',') {
        let origen = origen.trim();

        if origen.is_empty() {
            continue;
        }

        let header = HeaderValue::from_str(origen)
            .with_context(|| format!("Origen CORS inválido: {origen}"))?;

        permitidos.push(header);
    }

    let cors = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
        ])
        .allow_origin(permitidos);

    Ok(cors)
}

// ============================================================
// LOGGING
// ============================================================

fn iniciar_logging() {
    let filtro = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::fmt()
        .with_env_filter(filtro)
        .with_target(false)
        .init();
}

// ============================================================
// APAGADO CONTROLADO
// ============================================================

async fn senal_de_apagado() {
    let ctrl_c = async {
        if let Err(error) = signal::ctrl_c().await {
            tracing::error!("No se pudo escuchar Ctrl+C: {error}");
            std::future::pending::<()>().await
        }
    };

    #[cfg(unix)]
    let terminar = async {
        match signal::unix::signal(signal::unix::SignalKind::terminate()) {
            Ok(mut senal) => {
                senal.recv().await;
            }
            Err(error) => {
                tracing::error!("No se pudo escuchar SIGTERM: {error}");
                std::future::pending::<()>().await
            }
        }
    };

    #[cfg(not(unix))]
    let terminar = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminar => {},
    }

    tracing::info!("Señal de apagado recibida. Cerrando servidor...");
}

// ============================================================
// ENDPOINT: INICIO
// ============================================================

/// GET /
async fn inicio() -> Json<Value> {
    Json(json!({
        "servicio": NOMBRE_SERVICIO,
        "version": VERSION,
        "estado": "activo"
    }))
}

// ============================================================
// ENDPOINT: SALUD
// ============================================================

/// GET /api/salud
///
/// Comprueba la disponibilidad de PostgreSQL.
async fn salud(Extension(pool): Extension<PgPool>) -> (StatusCode, Json<Value>) {
    // Evitar que una consulta bloqueada deje esperando
    // indefinidamente la comprobación de salud.
    let resultado =
        tokio::time::timeout(Duration::from_secs(3), db::verificar_conexion(&pool)).await;

    match resultado {
        Ok(Ok(())) => (
            StatusCode::OK,
            Json(json!({
                "estado": "ok",
                "servicio": NOMBRE_SERVICIO,
                "version": VERSION,
                "base_de_datos": "conectada"
            })),
        ),

        Ok(Err(error)) => {
            tracing::error!("Error verificando PostgreSQL: {error}");

            respuesta_salud_no_disponible()
        }

        Err(_) => {
            tracing::warn!("Tiempo de espera agotado verificando PostgreSQL");

            respuesta_salud_no_disponible()
        }
    }
}

fn respuesta_salud_no_disponible() -> (StatusCode, Json<Value>) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({
            "estado": "error",
            "servicio": NOMBRE_SERVICIO,
            "version": VERSION,
            "base_de_datos": "no disponible"
        })),
    )
}

// ============================================================
// FALLBACK
// ============================================================

/// Respuesta JSON para rutas no encontradas.
async fn no_encontrado() -> (StatusCode, Json<Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(json!({
            "error": "Recurso no encontrado",
            "codigo": 404
        })),
    )
}
