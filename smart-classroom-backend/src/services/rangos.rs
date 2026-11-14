
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::rango_sensor::RangoSensor;
use crate::schemas::rango_sensor::{
    ActualizarRango,
    NuevoRango,
};

pub async fn listar(
    pool: &PgPool,
    aula_id: Option<Uuid>,
) -> Result<Vec<RangoSensor>, sqlx::Error> {
    sqlx::query_as::<_, RangoSensor>(
        r#"
        SELECT
            id, aula_id, tipo_sensor_id,
            valor_minimo, valor_maximo,
            activo, creado_en
        FROM rangos_sensor
        WHERE ($1::uuid IS NULL OR aula_id = $1)
        ORDER BY creado_en DESC
        "#,
    )
    .bind(aula_id)
    .fetch_all(pool)
    .await
}

pub async fn obtener(
    pool: &PgPool,
    id: Uuid,
) -> Result<Option<RangoSensor>, sqlx::Error> {
    sqlx::query_as::<_, RangoSensor>(
        r#"
        SELECT
            id, aula_id, tipo_sensor_id,
            valor_minimo, valor_maximo,
            activo, creado_en
        FROM rangos_sensor
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn crear(
    pool: &PgPool,
    nuevo: NuevoRango,
) -> Result<RangoSensor, sqlx::Error> {
    sqlx::query_as::<_, RangoSensor>(
        r#"
        INSERT INTO rangos_sensor (
            aula_id, tipo_sensor_id,
            valor_minimo, valor_maximo, activo
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
            id, aula_id, tipo_sensor_id,
            valor_minimo, valor_maximo,
            activo, creado_en
        "#,
    )
    .bind(nuevo.aula_id)
    .bind(nuevo.tipo_sensor_id)
    .bind(nuevo.valor_minimo)
    .bind(nuevo.valor_maximo)
    .bind(nuevo.activo.unwrap_or(true))
    .fetch_one(pool)
    .await
}

pub async fn actualizar(
    pool: &PgPool,
    id: Uuid,
    datos: ActualizarRango,
) -> Result<Option<RangoSensor>, sqlx::Error> {
    sqlx::query_as::<_, RangoSensor>(
        r#"
        UPDATE rangos_sensor
        SET
            valor_minimo = COALESCE($2, valor_minimo),
            valor_maximo = COALESCE($3, valor_maximo),
            activo = COALESCE($4, activo)
        WHERE id = $1
          AND COALESCE($2, valor_minimo)
              < COALESCE($3, valor_maximo)
        RETURNING
            id, aula_id, tipo_sensor_id,
            valor_minimo, valor_maximo,
            activo, creado_en
        "#,
    )
    .bind(id)
    .bind(datos.valor_minimo)
    .bind(datos.valor_maximo)
    .bind(datos.activo)
    .fetch_optional(pool)
    .await
}
