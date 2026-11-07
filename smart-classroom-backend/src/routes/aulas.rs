use axum::{
    extract::Path,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Extension, Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

// ============================================================
// ESTRUCTURAS PARA POSTGRESQL Y JSON
// ============================================================

#[derive(Debug, Serialize, FromRow)]
struct Aula {
    id: Uuid,
    codigo: String,
    nombre: String,
    ubicacion: Option<String>,
    creado_en: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct NuevaAula {
    codigo: String,
    nombre: String,
    ubicacion: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ActualizarAula {
    codigo: String,
    nombre: String,
    ubicacion: Option<String>,
}

// ============================================================
// REGISTRO DE RUTAS
// ============================================================

pub fn aulas_routes() -> Router {
    Router::new()
        .route("/aulas", get(listar_aulas).post(crear_aula))
        .route(
            "/aulas/:id",
            get(obtener_aula).put(actualizar_aula).delete(eliminar_aula),
        )
}

// ============================================================
// RESPUESTAS Y ERRORES
// ============================================================

fn error_http(estado: StatusCode, mensaje: &str) -> Response {
    (
        estado,
        Json(json!({
            "error": mensaje
        })),
    )
        .into_response()
}

fn error_bd(error: sqlx::Error) -> Response {
    tracing::error!("Error PostgreSQL en aulas: {error}");

    if let sqlx::Error::Database(ref db_error) = error {
        match db_error.code().as_deref() {
            Some("23505") => {
                return error_http(
                    StatusCode::CONFLICT,
                    "Ya existe un aula con esos datos unicos",
                );
            }
            Some("23503") => {
                return error_http(
                    StatusCode::CONFLICT,
                    "La operacion afecta registros relacionados",
                );
            }
            _ => {}
        }
    }

    error_http(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Error interno de base de datos",
    )
}

fn validar_aula(codigo: &str, nombre: &str) -> Result<(), Response> {
    if codigo.trim().is_empty() {
        return Err(error_http(
            StatusCode::BAD_REQUEST,
            "El codigo del aula no puede estar vacio",
        ));
    }

    if nombre.trim().is_empty() {
        return Err(error_http(
            StatusCode::BAD_REQUEST,
            "El nombre del aula no puede estar vacio",
        ));
    }

    Ok(())
}

// ============================================================
// GET /aulas
// LISTAR TODAS LAS AULAS
// ============================================================

async fn listar_aulas(Extension(pool): Extension<PgPool>) -> Response {
    let resultado = sqlx::query_as::<_, Aula>(
        r#"
        SELECT id, codigo, nombre, ubicacion, creado_en
        FROM aulas
        ORDER BY codigo
        "#,
    )
    .fetch_all(&pool)
    .await;

    match resultado {
        Ok(aulas) => (StatusCode::OK, Json(aulas)).into_response(),
        Err(error) => error_bd(error),
    }
}

// ============================================================
// GET /aulas/:id
// OBTENER AULA POR UUID
// ============================================================

async fn obtener_aula(Path(id): Path<Uuid>, Extension(pool): Extension<PgPool>) -> Response {
    let resultado = sqlx::query_as::<_, Aula>(
        r#"
        SELECT id, codigo, nombre, ubicacion, creado_en
        FROM aulas
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await;

    match resultado {
        Ok(Some(aula)) => (StatusCode::OK, Json(aula)).into_response(),
        Ok(None) => error_http(StatusCode::NOT_FOUND, "Aula no encontrada"),
        Err(error) => error_bd(error),
    }
}

// ============================================================
// POST /aulas
// CREAR AULA EN POSTGRESQL
// ============================================================

async fn crear_aula(
    Extension(pool): Extension<PgPool>,
    Json(payload): Json<NuevaAula>,
) -> Response {
    if let Err(respuesta) = validar_aula(&payload.codigo, &payload.nombre) {
        return respuesta;
    }

    let resultado = sqlx::query_as::<_, Aula>(
        r#"
        INSERT INTO aulas (codigo, nombre, ubicacion)
        VALUES ($1, $2, $3)
        RETURNING id, codigo, nombre, ubicacion, creado_en
        "#,
    )
    .bind(payload.codigo.trim())
    .bind(payload.nombre.trim())
    .bind(payload.ubicacion.as_deref())
    .fetch_one(&pool)
    .await;

    match resultado {
        Ok(aula) => (StatusCode::CREATED, Json(aula)).into_response(),
        Err(error) => error_bd(error),
    }
}

// ============================================================
// PUT /aulas/:id
// ACTUALIZAR AULA EN POSTGRESQL
// ============================================================

async fn actualizar_aula(
    Path(id): Path<Uuid>,
    Extension(pool): Extension<PgPool>,
    Json(payload): Json<ActualizarAula>,
) -> Response {
    if let Err(respuesta) = validar_aula(&payload.codigo, &payload.nombre) {
        return respuesta;
    }

    let resultado = sqlx::query_as::<_, Aula>(
        r#"
        UPDATE aulas
        SET codigo = $1,
            nombre = $2,
            ubicacion = $3
        WHERE id = $4
        RETURNING id, codigo, nombre, ubicacion, creado_en
        "#,
    )
    .bind(payload.codigo.trim())
    .bind(payload.nombre.trim())
    .bind(payload.ubicacion.as_deref())
    .bind(id)
    .fetch_optional(&pool)
    .await;

    match resultado {
        Ok(Some(aula)) => (StatusCode::OK, Json(aula)).into_response(),
        Ok(None) => error_http(StatusCode::NOT_FOUND, "Aula no encontrada"),
        Err(error) => error_bd(error),
    }
}

// ============================================================
// DELETE /aulas/:id
// ELIMINAR AULA DE POSTGRESQL
// ============================================================

async fn eliminar_aula(Path(id): Path<Uuid>, Extension(pool): Extension<PgPool>) -> Response {
    let resultado = sqlx::query(
        r#"
        DELETE FROM aulas
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&pool)
    .await;

    match resultado {
        Ok(resultado) if resultado.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({
                "mensaje": "Aula eliminada correctamente",
                "id": id
            })),
        )
            .into_response(),
        Ok(_) => error_http(StatusCode::NOT_FOUND, "Aula no encontrada"),
        Err(error) => error_bd(error),
    }
}
