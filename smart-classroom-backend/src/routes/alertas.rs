use axum::{
    extract::{Extension, Path, Query},
    routing::{get, put},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::{ApiError, ApiResult};

// ============================================================
// REGISTRO DE RUTAS
// ============================================================

pub fn alertas_routes() -> Router {
    Router::new()
        .route("/api/alertas", get(listar))
        .route("/api/alertas/:id/estado", put(cambiar_estado))
}

// ============================================================
// FILTROS Y RESPUESTAS
// ============================================================

#[derive(Debug, Deserialize)]
struct FiltroAlertas {
    estado: Option<String>,
    aula_id: Option<Uuid>,
    limit: Option<i64>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct FilaAlerta {
    id: Uuid,
    estado: String,
    tipo: String,
    mensaje: Option<String>,
    generada_en: DateTime<Utc>,
    resuelta_en: Option<DateTime<Utc>>,
    aula_id: Uuid,
    aula_codigo: String,
    dispositivo_id: Uuid,
    sensor_id: Uuid,
    tipo_sensor: String,
    unidad: String,
    valor: f64,
    valor_minimo: f64,
    valor_maximo: f64,
    medido_en: DateTime<Utc>,
}

// ============================================================
// GET /api/alertas
// ============================================================

async fn listar(
    Extension(pool): Extension<PgPool>,
    Query(filtro): Query<FiltroAlertas>,
) -> ApiResult<Json<Vec<FilaAlerta>>> {
    if let Some(estado) = &filtro.estado {
        if !["activa", "revisada", "resuelta"].contains(&estado.as_str()) {
            return Err(ApiError::BadRequest(
                "estado debe ser: activa, revisada o resuelta".into(),
            ));
        }
    }

    let limite = filtro.limit.unwrap_or(100).clamp(1, 1000);

    let filas = sqlx::query_as::<_, FilaAlerta>(
        r#"
        SELECT
            id,
            estado,
            tipo,
            mensaje,
            generada_en,
            resuelta_en,
            aula_id,
            aula_codigo,
            dispositivo_id,
            sensor_id,
            tipo_sensor,
            unidad,
            valor,
            valor_minimo,
            valor_maximo,
            medido_en
        FROM vw_alertas_detalle
        WHERE ($1::text IS NULL OR estado = $1)
          AND ($2::uuid IS NULL OR aula_id = $2)
        ORDER BY generada_en DESC
        LIMIT $3
        "#,
    )
    .bind(filtro.estado)
    .bind(filtro.aula_id)
    .bind(limite)
    .fetch_all(&pool)
    .await?;

    Ok(Json(filas))
}

// ============================================================
// PUT /api/alertas/:id/estado
// ============================================================

#[derive(Debug, Deserialize)]
struct CambioEstado {
    estado: String,
}

async fn cambiar_estado(
    Extension(pool): Extension<PgPool>,
    Path(id): Path<Uuid>,
    Json(datos): Json<CambioEstado>,
) -> ApiResult<Json<Value>> {
    let nuevo_estado = datos.estado.trim().to_lowercase();

    if !["revisada", "resuelta"].contains(&nuevo_estado.as_str()) {
        return Err(ApiError::BadRequest(
            "estado debe ser: revisada o resuelta".into(),
        ));
    }

    // Transiciones permitidas:
    //
    // activa   -> revisada
    // activa   -> resuelta
    // revisada -> resuelta
    //
    // Una alerta resuelta no puede reabrirse.

    let actualizada: Option<(Uuid,)> = sqlx::query_as(
        r#"
        UPDATE alertas
        SET
            estado = $2,
            resuelta_en = CASE
                WHEN $2 = 'resuelta' THEN NOW()
                ELSE NULL
            END
        WHERE id = $1
          AND (
              (estado = 'activa'
                  AND $2 IN ('revisada', 'resuelta'))
              OR
              (estado = 'revisada'
                  AND $2 = 'resuelta')
          )
        RETURNING id
        "#,
    )
    .bind(id)
    .bind(&nuevo_estado)
    .fetch_optional(&pool)
    .await?;

    if actualizada.is_some() {
        return Ok(Json(json!({
            "id": id,
            "estado": nuevo_estado,
            "mensaje": "Estado actualizado correctamente"
        })));
    }

    // Si no se actualizo, determinar si no existe
    // o si la transicion solicitada no esta permitida.

    let estado_actual: Option<(String,)> =
        sqlx::query_as("SELECT estado FROM alertas WHERE id = $1")
            .bind(id)
            .fetch_optional(&pool)
            .await?;

    match estado_actual {
        None => Err(ApiError::NotFound(format!("No existe la alerta {id}"))),

        Some((estado,)) => Err(ApiError::BadRequest(format!(
            "No se permite cambiar una alerta de '{estado}' a '{nuevo_estado}'"
        ))),
    }
}
