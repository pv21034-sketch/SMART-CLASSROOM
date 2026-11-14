use axum::{
    extract::{Extension, Path},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::db::mapear;
use crate::models::dispositivo::Dispositivo;
use crate::schemas::dispositivo::{ActualizarDispositivo, NuevoDispositivo, ESTADOS_VALIDOS};
use crate::services::dispositivos as servicio;

type ApiResult<T> = Result<Json<T>, (StatusCode, String)>;

pub fn router() -> Router {
    Router::new()
        .route("/api/dispositivos", get(listar).post(crear))
        .route("/api/dispositivos/{id}", get(obtener).put(actualizar))
}

fn validar_estado(estado: &Option<String>) -> Result<(), (StatusCode, String)> {
    if let Some(e) = estado {
        if !ESTADOS_VALIDOS.contains(&e.as_str()) {
            return Err((
                StatusCode::BAD_REQUEST,
                "estado debe ser: activo, inactivo o mantenimiento".into(),
            ));
        }
    }
    Ok(())
}

async fn listar(Extension(pool): Extension<PgPool>) -> ApiResult<Vec<Dispositivo>> {
    servicio::listar(&pool).await.map(Json).map_err(mapear)
}

async fn obtener(Extension(pool): Extension<PgPool>, Path(id): Path<Uuid>) -> ApiResult<Dispositivo> {
    match servicio::obtener(&pool, id).await.map_err(mapear)? {
        Some(d) => Ok(Json(d)),
        None => Err((StatusCode::NOT_FOUND, "Dispositivo no encontrado".into())),
    }
}

async fn crear(
    Extension(pool): Extension<PgPool>,
    Json(nuevo): Json<NuevoDispositivo>,
) -> Result<(StatusCode, Json<Dispositivo>), (StatusCode, String)> {
    if nuevo.nombre.trim().is_empty() || nuevo.identificador.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "nombre e identificador son obligatorios".into()));
    }
    validar_estado(&nuevo.estado)?;
    let creado = servicio::crear(&pool, nuevo).await.map_err(mapear)?;
    Ok((StatusCode::CREATED, Json(creado)))
}

async fn actualizar(
    Extension(pool): Extension<PgPool>,
    Path(id): Path<Uuid>,
    Json(datos): Json<ActualizarDispositivo>,
) -> ApiResult<Dispositivo> {
    if let Some(n) = &datos.nombre {
        if n.trim().is_empty() {
            return Err((StatusCode::BAD_REQUEST, "El nombre no puede estar vacío".into()));
        }
    }
    validar_estado(&datos.estado)?;
    match servicio::actualizar(&pool, id, datos).await.map_err(mapear)? {
        Some(d) => Ok(Json(d)),
        None => Err((StatusCode::NOT_FOUND, "Dispositivo no encontrado".into())),
    }
}