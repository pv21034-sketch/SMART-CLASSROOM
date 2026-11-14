use axum::{
    extract::{Extension, Path, Query},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::db::mapear;
use crate::models::rango_sensor::RangoSensor;
use crate::schemas::rango_sensor::{ActualizarRango, FiltroRangos, NuevoRango};
use crate::services::rangos as servicio;

type ApiResult<T> = Result<Json<T>, (StatusCode, String)>;

pub fn router() -> Router {
    Router::new()
        .route("/api/rangos", get(listar).post(crear))
        .route("/api/rangos/{id}", get(obtener).put(actualizar))
}

/// GET /rangos            -> todos
/// GET /rangos?aula_id=.. -> solo los de esa aula
async fn listar(
    Extension(pool): Extension<PgPool>,
    Query(filtro): Query<FiltroRangos>,
) -> ApiResult<Vec<RangoSensor>> {
    servicio::listar(&pool, filtro.aula_id)
        .await
        .map(Json)
        .map_err(mapear)
}

async fn obtener(Extension(pool): Extension<PgPool>, Path(id): Path<Uuid>) -> ApiResult<RangoSensor> {
    match servicio::obtener(&pool, id).await.map_err(mapear)? {
        Some(r) => Ok(Json(r)),
        None => Err((StatusCode::NOT_FOUND, "Rango no encontrado".into())),
    }
}

async fn crear(
    Extension(pool): Extension<PgPool>,
    Json(nuevo): Json<NuevoRango>,
) -> Result<(StatusCode, Json<RangoSensor>), (StatusCode, String)> {
    if !(nuevo.valor_minimo < nuevo.valor_maximo) {
        return Err((StatusCode::BAD_REQUEST, "valor_minimo debe ser menor que valor_maximo".into()));
    }
    let creado = servicio::crear(&pool, nuevo).await.map_err(mapear)?;
    Ok((StatusCode::CREATED, Json(creado)))
}

async fn actualizar(
    Extension(pool): Extension<PgPool>,
    Path(id): Path<Uuid>,
    Json(datos): Json<ActualizarRango>,
) -> ApiResult<RangoSensor> {
    // Si vienen los dos, se valida aquí; si viene solo uno, lo valida el CHECK de la base (400).
    if let (Some(min), Some(max)) = (datos.valor_minimo, datos.valor_maximo) {
        if !(min < max) {
            return Err((StatusCode::BAD_REQUEST, "valor_minimo debe ser menor que valor_maximo".into()));
        }
    }
    match servicio::actualizar(&pool, id, datos).await.map_err(mapear)? {
        Some(r) => Ok(Json(r)),
        None => Err((StatusCode::NOT_FOUND, "Rango no encontrado".into())),
    }
}