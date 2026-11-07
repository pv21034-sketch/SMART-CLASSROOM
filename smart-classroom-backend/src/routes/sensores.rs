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
// MODELOS PARA RESPUESTAS HTTP
// ============================================================

#[derive(Debug, Serialize, FromRow)]
struct Sensor {
    id: Uuid,
    dispositivo_id: Uuid,
    tipo_sensor_id: Uuid,
    nombre: String,
    pin_gpio: Option<i16>,
    estado: String,
    creado_en: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct NuevoSensor {
    dispositivo_id: Uuid,
    tipo_sensor_id: Uuid,
    nombre: String,
    pin_gpio: Option<i16>,
}

#[derive(Debug, Serialize, FromRow)]
struct SensorDetalle {
    id: Uuid,
    dispositivo_id: Uuid,
    tipo_sensor_id: Uuid,
    nombre: String,
    pin_gpio: Option<i16>,
    estado: String,
    creado_en: DateTime<Utc>,
    aula_id: Uuid,
    tipo_nombre: String,
    unidad: String,
}

// ============================================================
// REGISTRO DE RUTAS
// ============================================================

pub fn sensores_routes() -> Router {
    Router::new()
        .route("/sensores", get(listar_sensores).post(crear_sensor))
        .route(
            "/sensores/:id",
            get(obtener_sensor).delete(desactivar_sensor),
        )
}

// ============================================================
// MANEJO DE ERRORES
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
    tracing::error!("Error PostgreSQL en sensores: {error}");

    if let sqlx::Error::Database(ref db_error) = error {
        match db_error.code().as_deref() {
            Some("23503") => {
                return error_http(
                    StatusCode::BAD_REQUEST,
                    "El dispositivo o tipo de sensor no existe",
                );
            }
            Some("23505") => {
                return error_http(StatusCode::CONFLICT, "Ya existe un sensor con esos datos");
            }
            Some("23514") => {
                return error_http(
                    StatusCode::BAD_REQUEST,
                    "Los datos incumplen una restriccion",
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

// ============================================================
// GET /sensores
// LISTAR SENSORES
// ============================================================

async fn listar_sensores(Extension(pool): Extension<PgPool>) -> Response {
    let resultado = sqlx::query_as::<_, SensorDetalle>(
        r#"
        SELECT
            s.id,
            s.dispositivo_id,
            s.tipo_sensor_id,
            s.nombre,
            s.pin_gpio,
            s.estado,
            s.creado_en,
            d.aula_id,
            ts.nombre AS tipo_nombre,
            ts.unidad
        FROM sensores s
        INNER JOIN dispositivos d
            ON d.id = s.dispositivo_id
        INNER JOIN tipos_sensor ts
            ON ts.id = s.tipo_sensor_id
        ORDER BY s.nombre
        "#,
    )
    .fetch_all(&pool)
    .await;

    match resultado {
        Ok(sensores) => (StatusCode::OK, Json(sensores)).into_response(),
        Err(error) => error_bd(error),
    }
}

// ============================================================
// GET /sensores/:id
// OBTENER SENSOR POR UUID
// ============================================================

async fn obtener_sensor(Path(id): Path<Uuid>, Extension(pool): Extension<PgPool>) -> Response {
    let resultado = sqlx::query_as::<_, SensorDetalle>(
        r#"
        SELECT
            s.id,
            s.dispositivo_id,
            s.tipo_sensor_id,
            s.nombre,
            s.pin_gpio,
            s.estado,
            s.creado_en,
            d.aula_id,
            ts.nombre AS tipo_nombre,
            ts.unidad
        FROM sensores s
        INNER JOIN dispositivos d
            ON d.id = s.dispositivo_id
        INNER JOIN tipos_sensor ts
            ON ts.id = s.tipo_sensor_id
        WHERE s.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await;

    match resultado {
        Ok(Some(sensor)) => (StatusCode::OK, Json(sensor)).into_response(),
        Ok(None) => error_http(StatusCode::NOT_FOUND, "Sensor no encontrado"),
        Err(error) => error_bd(error),
    }
}

// ============================================================
// POST /sensores
// CREAR SENSOR EN POSTGRESQL
// ============================================================

async fn crear_sensor(
    Extension(pool): Extension<PgPool>,
    Json(payload): Json<NuevoSensor>,
) -> Response {
    if payload.nombre.trim().is_empty() {
        return error_http(
            StatusCode::BAD_REQUEST,
            "El nombre del sensor no puede estar vacio",
        );
    }

    if let Some(pin) = payload.pin_gpio {
        if pin < 0 {
            return error_http(StatusCode::BAD_REQUEST, "El pin GPIO no puede ser negativo");
        }
    }

    let resultado = sqlx::query_as::<_, Sensor>(
        r#"
        INSERT INTO sensores (
            dispositivo_id,
            tipo_sensor_id,
            nombre,
            pin_gpio,
            estado
        )
        VALUES ($1, $2, $3, $4, 'activo')
        RETURNING
            id,
            dispositivo_id,
            tipo_sensor_id,
            nombre,
            pin_gpio,
            estado,
            creado_en
        "#,
    )
    .bind(payload.dispositivo_id)
    .bind(payload.tipo_sensor_id)
    .bind(payload.nombre.trim())
    .bind(payload.pin_gpio)
    .fetch_one(&pool)
    .await;

    match resultado {
        Ok(sensor) => (StatusCode::CREATED, Json(sensor)).into_response(),
        Err(error) => error_bd(error),
    }
}

// ============================================================
// DELETE /sensores/:id
// DESACTIVACION LOGICA
// ============================================================

async fn desactivar_sensor(Path(id): Path<Uuid>, Extension(pool): Extension<PgPool>) -> Response {
    // No eliminamos el sensor fisicamente porque
    // sus mediciones historicas deben conservarse.

    let resultado = sqlx::query_as::<_, Sensor>(
        r#"
        UPDATE sensores
        SET estado = 'inactivo'
        WHERE id = $1
        RETURNING
            id,
            dispositivo_id,
            tipo_sensor_id,
            nombre,
            pin_gpio,
            estado,
            creado_en
        "#,
    )
    .bind(id)
    .fetch_optional(&pool)
    .await;

    match resultado {
        Ok(Some(sensor)) => (
            StatusCode::OK,
            Json(json!({
                "mensaje": "Sensor desactivado correctamente",
                "sensor": sensor
            })),
        )
            .into_response(),
        Ok(None) => error_http(StatusCode::NOT_FOUND, "Sensor no encontrado"),
        Err(error) => error_bd(error),
    }
}
