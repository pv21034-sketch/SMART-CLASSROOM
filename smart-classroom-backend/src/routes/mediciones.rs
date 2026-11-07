//! Rutas de mediciones.
//!
//! - `POST /api/mediciones`            → el ESP32 envía una lectura (Fase 8).
//! - `GET  /api/mediciones`            → historial con filtros, para gráficas e historial.
//! - `GET  /api/aulas/:id/ultima`      → últimos valores, confort y estado para el dashboard.

use std::sync::Arc;

use axum::{
    extract::{Extension, Path, Query},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::{ApiError, ApiResult};
use crate::schemas::ingesta::NuevaMedicion;
use crate::services::{confort, ingesta};
use crate::websocket::WsState;

pub fn mediciones_routes() -> Router {
    Router::new()
        .route("/api/mediciones", get(historial).post(recibir))
        .route("/api/aulas/:id/ultima", get(ultima))
}

// ============================================================
// POST /api/mediciones  (ESP32 → backend)
// ============================================================

/// Mensaje que se difunde por WebSocket a todos los dashboards conectados.
#[derive(Serialize)]
struct EventoMedicion<'a> {
    evento: &'static str,
    #[serde(flatten)]
    datos: &'a ingesta::ResultadoIngesta,
}

async fn recibir(
    Extension(pool): Extension<PgPool>,
    Extension(ws): Extension<Arc<WsState>>,
    Json(datos): Json<NuevaMedicion>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let resultado = ingesta::procesar(&pool, datos).await?;

    // Tiempo real: se difunde DESPUÉS de guardar en PostgreSQL (el commit ya se hizo).
    let evento = EventoMedicion {
        evento: "medicion",
        datos: &resultado,
    };
    match serde_json::to_string(&evento) {
        Ok(texto) => ws.broadcast_measurement(texto),
        Err(e) => tracing::error!("No se pudo serializar el evento WebSocket: {e}"),
    }

    // Respuesta mínima: el ESP32 no necesita nada más.
    Ok((
        StatusCode::CREATED,
        Json(json!({
            "estado": "ok",
            "medido_en": resultado.medido_en,
            "alertas": resultado.alertas.len(),
        })),
    ))
}

// ============================================================
// GET /api/mediciones  (historial / gráficas)
// ============================================================

#[derive(Debug, Deserialize)]
struct FiltroHistorial {
    aula_id: Option<Uuid>,
    /// temperatura | humedad | iluminacion | ruido
    tipo: Option<String>,
    /// Fecha ISO 8601 (ej. 2026-10-30T00:00:00Z)
    desde: Option<DateTime<Utc>>,
    hasta: Option<DateTime<Utc>>,
    /// Máximo de filas (por defecto 500, tope 5000).
    limit: Option<i64>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct FilaMedicion {
    id: Uuid,
    sensor_id: Uuid,
    dispositivo_id: Uuid,
    aula_id: Uuid,
    tipo_sensor: String,
    unidad: String,
    valor: f64,
    medido_en: DateTime<Utc>,
}

/// Devuelve las filas de la más reciente a la más antigua.
/// Para Chart.js conviene invertir el arreglo en el frontend (`.reverse()`).
async fn historial(
    Extension(pool): Extension<PgPool>,
    Query(filtro): Query<FiltroHistorial>,
) -> ApiResult<Json<Vec<FilaMedicion>>> {
    let limite = filtro.limit.unwrap_or(500).clamp(1, 5000);

    let filas = sqlx::query_as::<_, FilaMedicion>(
        "SELECT id, sensor_id, dispositivo_id, aula_id, tipo_sensor, unidad, valor, medido_en
           FROM vw_mediciones_detalle
          WHERE ($1::uuid        IS NULL OR aula_id     = $1)
            AND ($2::text        IS NULL OR tipo_sensor = $2)
            AND ($3::timestamptz IS NULL OR medido_en  >= $3)
            AND ($4::timestamptz IS NULL OR medido_en  <= $4)
          ORDER BY medido_en DESC
          LIMIT $5",
    )
    .bind(filtro.aula_id)
    .bind(filtro.tipo)
    .bind(filtro.desde)
    .bind(filtro.hasta)
    .bind(limite)
    .fetch_all(&pool)
    .await?;

    Ok(Json(filas))
}

// ============================================================
// GET /api/aulas/:id/ultima  (dashboard)
// ============================================================

async fn ultima(
    Extension(pool): Extension<PgPool>,
    Path(aula_id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let aula: Option<(String, String)> =
        sqlx::query_as("SELECT codigo, nombre FROM aulas WHERE id = $1")
            .bind(aula_id)
            .fetch_optional(&pool)
            .await?;

    let (codigo, nombre) =
        aula.ok_or_else(|| ApiError::NotFound(format!("No existe el aula {aula_id}")))?;

    // Último valor de cada variable.
    let filas: Vec<(String, String, f64, DateTime<Utc>)> = sqlx::query_as(
        "SELECT DISTINCT ON (tipo_sensor) tipo_sensor, unidad, valor, medido_en
           FROM vw_mediciones_detalle
          WHERE aula_id = $1
          ORDER BY tipo_sensor, medido_en DESC",
    )
    .bind(aula_id)
    .fetch_all(&pool)
    .await?;

    let mut valores = Map::new();
    for (tipo, unidad, valor, medido_en) in filas {
        valores.insert(
            tipo,
            json!({ "valor": valor, "unidad": unidad, "medido_en": medido_en }),
        );
    }

    // Último índice de confort (0–100).
    let indice: Option<(f64, DateTime<Utc>)> = sqlx::query_as(
        "SELECT valor, calculado_en FROM indices_confort
          WHERE aula_id = $1 ORDER BY calculado_en DESC LIMIT 1",
    )
    .bind(aula_id)
    .fetch_optional(&pool)
    .await?;

    let confort_json = indice.map(|(valor, calculado_en)| {
        json!({
            "valor": valor,
            "estado": confort::obtener_estado_confort(valor / 100.0),
            "calculado_en": calculado_en,
        })
    });

    let (alertas_activas,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM vw_alertas_detalle WHERE aula_id = $1 AND estado = 'activa'",
    )
    .bind(aula_id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(json!({
        "aula": { "id": aula_id, "codigo": codigo, "nombre": nombre },
        "valores": valores,
        "confort": confort_json,
        "alertas_activas": alertas_activas,
        "estado": if alertas_activas > 0 { "ALERTA" } else { "NORMAL" },
    })))
}
