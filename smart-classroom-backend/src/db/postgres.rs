use std::{env, time::Duration};

use sqlx::{postgres::PgPoolOptions, PgPool};

/// Crea y configura el pool de conexiones a PostgreSQL.
///
/// Variables de entorno:
/// - `DATABASE_URL`: URL de conexión a PostgreSQL.
/// - `DB_MAX_CONNECTIONS`: número máximo de conexiones
///   simultáneas. Por defecto: 10.
pub async fn crear_pool() -> Result<PgPool, sqlx::Error> {
    let database_url = env::var("DATABASE_URL").map_err(|_| {
        sqlx::Error::Configuration(
            "La variable de entorno DATABASE_URL no está definida"
                .to_string()
                .into(),
        )
    })?;

    let max_conexiones = env::var("DB_MAX_CONNECTIONS")
        .ok()
        .and_then(|valor| valor.parse::<u32>().ok())
        .unwrap_or(10);

    PgPoolOptions::new()
        .max_connections(max_conexiones)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&database_url)
        .await
}

/// Ejecuta las migraciones pendientes de la base de datos.
///
/// Las migraciones se obtienen desde la carpeta `migrations/`.
pub async fn ejecutar_migraciones(
    pool: &PgPool,
) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
}

/// Verifica que PostgreSQL responda correctamente.
///
/// Ejecuta una consulta mínima (`SELECT 1`) sin modificar
/// ningún dato de la base de datos.
pub async fn verificar_conexion(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT 1")
        .execute(pool)
        .await?;

    Ok(())
}