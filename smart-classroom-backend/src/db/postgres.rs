//! SMART CLASSROOM — PostgreSQL
//!
//! Configuración del pool SQLx, ejecución de migraciones
//! y verificación de conectividad.
//!
//! Compatible con PostgreSQL y Supabase.

use std::{env, time::Duration};

use sqlx::{postgres::PgPoolOptions, PgPool};

// ============================================================
// CONFIGURACIÓN DEL POOL
// ============================================================

/// Lee una variable numérica positiva.
fn leer_entero(nombre: &str, predeterminado: u32) -> Result<u32, sqlx::Error> {
    match env::var(nombre) {
        Ok(valor) => {
            let numero = valor.parse::<u32>().map_err(|_| {
                error_configuracion(format!("{nombre} debe ser un número entero positivo"))
            })?;

            if numero == 0 {
                return Err(error_configuracion(format!(
                    "{nombre} debe ser mayor que cero"
                )));
            }

            Ok(numero)
        }

        Err(env::VarError::NotPresent) => Ok(predeterminado),

        Err(error) => Err(error_configuracion(format!(
            "No se pudo leer {nombre}: {error}"
        ))),
    }
}

/// Construye un error de configuración SQLx.
fn error_configuracion(mensaje: String) -> sqlx::Error {
    sqlx::Error::Configuration(mensaje.into())
}

// ============================================================
// CONEXIÓN POSTGRESQL
// ============================================================

/// Crea un pool de conexiones PostgreSQL.
///
/// Variables:
/// - DATABASE_URL
/// - DB_MAX_CONNECTIONS (por defecto 5)
/// - DB_MIN_CONNECTIONS (por defecto 0)
/// - DB_ACQUIRE_TIMEOUT (por defecto 10 segundos)
///
/// Los valores predeterminados son conservadores
/// para entornos con conexiones limitadas.
pub async fn crear_pool() -> Result<PgPool, sqlx::Error> {
    // Obtener URL.
    let database_url = env::var("DATABASE_URL")
        .map_err(|_| error_configuracion("DATABASE_URL no está configurada".to_string()))?;

    if database_url.trim().is_empty() {
        return Err(error_configuracion(
            "DATABASE_URL no puede estar vacía".to_string(),
        ));
    }

    // Configuración del pool.
    let max_conexiones = leer_entero("DB_MAX_CONNECTIONS", 5)?;

    let min_conexiones = match env::var("DB_MIN_CONNECTIONS") {
        Ok(valor) => valor.parse::<u32>().map_err(|_| {
            error_configuracion("DB_MIN_CONNECTIONS debe ser un entero no negativo".to_string())
        })?,

        Err(env::VarError::NotPresent) => 0,

        Err(error) => {
            return Err(error_configuracion(format!(
                "No se pudo leer DB_MIN_CONNECTIONS: {error}"
            )));
        }
    };

    if min_conexiones > max_conexiones {
        return Err(error_configuracion(
            "DB_MIN_CONNECTIONS no puede superar DB_MAX_CONNECTIONS".to_string(),
        ));
    }

    let timeout = leer_entero("DB_ACQUIRE_TIMEOUT", 10)?;

    tracing::info!(
        "Configurando pool PostgreSQL: mínimo={}, máximo={}",
        min_conexiones,
        max_conexiones
    );

    // Crear y conectar el pool.
    let pool = PgPoolOptions::new()
        .max_connections(max_conexiones)
        .min_connections(min_conexiones)
        .acquire_timeout(Duration::from_secs(u64::from(timeout)))
        .idle_timeout(Duration::from_secs(300))
        .max_lifetime(Duration::from_secs(1800))
        .connect(&database_url)
        .await?;

    tracing::info!("Pool de conexiones PostgreSQL creado correctamente");

    Ok(pool)
}

// ============================================================
// MIGRACIONES
// ============================================================

/// Ejecuta migraciones pendientes.
///
/// La ejecución se controla desde main.rs
/// mediante RUN_MIGRATIONS.
///
/// No ejecuta SQL directamente si no se invoca.
pub async fn ejecutar_migraciones(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    tracing::info!("Verificando migraciones SQLx");

    sqlx::migrate!("./migrations").run(pool).await?;

    tracing::info!("Migraciones SQLx finalizadas");

    Ok(())
}

// ============================================================
// VERIFICACIÓN DE CONEXIÓN
// ============================================================

/// Ejecuta SELECT 1 para comprobar PostgreSQL.
///
/// No modifica registros ni tablas.
pub async fn verificar_conexion(pool: &PgPool) -> Result<(), sqlx::Error> {
    let resultado: i32 = sqlx::query_scalar("SELECT 1").fetch_one(pool).await?;

    if resultado != 1 {
        return Err(sqlx::Error::Protocol(
            "PostgreSQL devolvió un resultado inesperado".to_string(),
        ));
    }

    Ok(())
}
