
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::dispositivo::Dispositivo;
use crate::schemas::dispositivo::{
    ActualizarDispositivo,
    NuevoDispositivo,
};

pub async fn listar(
    pool: &PgPool,
) -> Result<Vec<Dispositivo>, sqlx::Error> {
    sqlx::query_as::<_, Dispositivo>(
        r#"
        SELECT
            id, aula_id, nombre, identificador,
            estado, ultima_conexion, creado_en
        FROM dispositivos
        ORDER BY creado_en DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

pub async fn obtener(
    pool: &PgPool,
    id: Uuid,
) -> Result<Option<Dispositivo>, sqlx::Error> {
    sqlx::query_as::<_, Dispositivo>(
        r#"
        SELECT
            id, aula_id, nombre, identificador,
            estado, ultima_conexion, creado_en
        FROM dispositivos
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn crear(
    pool: &PgPool,
    nuevo: NuevoDispositivo,
) -> Result<Dispositivo, sqlx::Error> {
    sqlx::query_as::<_, Dispositivo>(
        r#"
        INSERT INTO dispositivos (
            aula_id, nombre, identificador, estado
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
            id, aula_id, nombre, identificador,
            estado, ultima_conexion, creado_en
        "#,
    )
    .bind(nuevo.aula_id)
    .bind(nuevo.nombre)
    .bind(nuevo.identificador)
    .bind(nuevo.estado.unwrap_or_else(|| "activo".to_string()))
    .fetch_one(pool)
    .await
}

pub async fn actualizar(
    pool: &PgPool,
    id: Uuid,
    datos: ActualizarDispositivo,
) -> Result<Option<Dispositivo>, sqlx::Error> {
    sqlx::query_as::<_, Dispositivo>(
        r#"
        UPDATE dispositivos
        SET
            aula_id = COALESCE($2, aula_id),
            nombre = COALESCE($3, nombre),
            identificador = COALESCE($4, identificador),
            estado = COALESCE($5, estado)
        WHERE id = $1
        RETURNING
            id, aula_id, nombre, identificador,
            estado, ultima_conexion, creado_en
        "#,
    )
    .bind(id)
    .bind(datos.aula_id)
    .bind(datos.nombre)
    .bind(datos.identificador)
    .bind(datos.estado)
    .fetch_optional(pool)
    .await
}
