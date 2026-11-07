use argon2::{
    password_hash::{PasswordHash, PasswordVerifier},
    Argon2,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::usuario::Usuario;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub rol: String,
    pub exp: usize,
    pub iat: usize,
}

pub async fn buscar_por_nombre(
    pool: &PgPool,
    nombre: &str,
) -> Result<Option<Usuario>, sqlx::Error> {
    sqlx::query_as::<_, Usuario>(
        r#"
        SELECT
            id,
            nombre_usuario,
            password_hash,
            rol,
            activo,
            ultimo_acceso,
            creado_en
        FROM usuarios
        WHERE LOWER(nombre_usuario) = LOWER($1)
        LIMIT 1
        "#,
    )
    .bind(nombre)
    .fetch_optional(pool)
    .await
}

pub fn verificar(password: &str, hash: &str) -> bool {
    let Ok(hash) = PasswordHash::new(hash) else {
        return false;
    };

    Argon2::default()
        .verify_password(password.as_bytes(), &hash)
        .is_ok()
}

pub fn generar_token(
    usuario: &Usuario,
    secreto: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let ahora = Utc::now();
    let vencimiento = ahora + Duration::hours(8);

    let claims = Claims {
        sub: usuario.id.to_string(),
        rol: usuario.rol.clone(),
        iat: ahora.timestamp() as usize,
        exp: vencimiento.timestamp() as usize,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secreto.as_bytes()),
    )
}

pub async fn actualizar_ultimo_acceso(pool: &PgPool, usuario_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1")
        .bind(usuario_id)
        .execute(pool)
        .await?;

    Ok(())
}
