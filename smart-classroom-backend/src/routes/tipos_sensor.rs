use axum::{
    extract::{Extension, Path},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::db::mapear;
use crate::models::tipo_sensor::TipoSensor;

type ApiResult<T> = Result<Json<T>, (StatusCode, String)>;

/// Catálogo de solo lectura (temperatura, humedad, iluminacion, ruido ya vienen en el SQL).
pub fn router() -> Router {
    Router::new()
        .route("/api/tipos-sensor", get(listar))
        .route("/api/tipos-sensor/{id}", get(obtener))
}

async fn listar(Extension(pool): Extension<PgPool>) -> ApiResult<Vec<TipoSensor>> {
    sqlx::query_as::<_, TipoSensor>(
        "SELECT id, nombre, unidad, descripcion FROM tipos_sensor ORDER BY nombre",
    )
    .fetch_all(&pool)
    .await
    .map(Json)
    .map_err(mapear)
}

async fn obtener(Extension(pool): Extension<PgPool>, Path(id): Path<Uuid>) -> ApiResult<TipoSensor> {
    let fila = sqlx::query_as::<_, TipoSensor>(
        "SELECT id, nombre, unidad, descripcion FROM tipos_sensor WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(mapear)?;

    match fila {
        Some(t) => Ok(Json(t)),
        None => Err((StatusCode::NOT_FOUND, "Tipo de sensor no encontrado".into())),
    }
}