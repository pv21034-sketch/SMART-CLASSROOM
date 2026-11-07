
// SMART CLASSROOM - Creacion segura del primer administrador

use anyhow::{bail, Context, Result};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use sqlx::postgres::PgPoolOptions;
use std::io::{self, Write};

fn solicitar(mensaje: &str) -> Result<String> {
    print!("{mensaje}");
    io::stdout().flush()?;

    let mut entrada = String::new();
    io::stdin().read_line(&mut entrada)?;

    Ok(entrada.trim().to_string())
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    println!("======================================");
    println!(" SMART CLASSROOM - PRIMER ADMINISTRADOR");
    println!("======================================");

    let database_url = std::env::var("DATABASE_URL")
        .context("Falta DATABASE_URL en el archivo .env")?;

    // Conectar con PostgreSQL de Supabase.
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .context("No se pudo conectar con PostgreSQL")?;

    // Evitar crear otro administrador inicial.
    let existe_admin: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM usuarios
            WHERE rol = 'administrador'
        )",
    )
    .fetch_one(&pool)
    .await?;

    if existe_admin {
        bail!(
            "Ya existe un administrador. \
             No se creara otro mediante este programa."
        );
    }

    let nombre = solicitar("Nombre del administrador: ")?;

    if nombre.is_empty() || nombre.chars().count() > 100 {
        bail!("El nombre debe tener entre 1 y 100 caracteres.");
    }

    let existe_nombre: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM usuarios
            WHERE LOWER(nombre_usuario) = LOWER($1)
        )",
    )
    .bind(&nombre)
    .fetch_one(&pool)
    .await?;

    if existe_nombre {
        bail!("Ese nombre de usuario ya existe.");
    }

    // La contraseña se lee sin mostrarla en pantalla.
    let password = rpassword::prompt_password("Contrasena: ")?;
    let confirmacion =
        rpassword::prompt_password("Confirmar contrasena: ")?;

    if password != confirmacion {
        bail!("Las contrasenas no coinciden.");
    }

    if password.chars().count() < 12 {
        bail!("La contrasena debe tener al menos 12 caracteres.");
    }

    // Generar hash Argon2id con sal aleatoria.
    let salt = SaltString::generate(&mut OsRng);

    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("Error al generar hash: {e}"))?
        .to_string();

    // Insertar solo si sigue sin existir un administrador.
    // El bloqueo evita que dos ejecuciones simultaneas creen
    // dos administradores iniciales.
    let mut tx = pool.begin().await?;

    sqlx::query("SELECT pg_advisory_xact_lock(2026, 1107)")
        .execute(&mut *tx)
        .await?;

    let id: Option<uuid::Uuid> = sqlx::query_scalar(
        r#"
        INSERT INTO usuarios
            (nombre_usuario, password_hash, rol, activo)
        SELECT $1, $2, 'administrador', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM usuarios
            WHERE rol = 'administrador'
        )
        RETURNING id
        "#,
    )
    .bind(&nombre)
    .bind(&hash)
    .fetch_optional(&mut *tx)
    .await?;

    tx.commit().await?;

    match id {
        Some(id) => {
            println!("\nAdministrador creado correctamente.");
            println!("Usuario: {nombre}");
            println!("ID: {id}");
            println!("Rol: administrador");
            println!("La contrasena se almaceno con Argon2id.");
        }
        None => {
            println!("Ya existe un administrador. No se realizaron cambios.");
        }
    }

    pool.close().await;
    Ok(())
}
