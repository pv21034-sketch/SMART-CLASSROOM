use axum::{http::StatusCode, routing::post, Extension, Json, Router};
use sqlx::PgPool;

use crate::config::Config;
use crate::errors::db::mapear;
use crate::schemas::usuario::{LoginRequest, LoginResponse};
use crate::services::usuarios as servicio;

/// POST /api/auth/login
pub fn router() -> Router {
    Router::new().route("/api/auth/login", post(login))
}

async fn login(
    Extension(pool): Extension<PgPool>,
    Extension(config): Extension<Config>,
    Json(datos): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, String)> {
    let credenciales_invalidas =
        || (StatusCode::UNAUTHORIZED, "Usuario o contraseña incorrectos".to_string());

    if datos.identifier.trim().is_empty() || datos.password.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Completa usuario y contraseña".into()));
    }

    let usuario = servicio::buscar_por_nombre(&pool, datos.identifier.trim())
        .await
        .map_err(mapear)?
        .ok_or_else(credenciales_invalidas)?;

    if !servicio::verificar(&datos.password, &usuario.password_hash) {
        return Err(credenciales_invalidas());
    }

    let token = servicio::generar_token(&usuario, &config.jwt_secret).map_err(|e| {
        eprintln!("Error generando token: {e}");
        (StatusCode::INTERNAL_SERVER_ERROR, "No se pudo generar el token".to_string())
    })?;

    Ok(Json(LoginResponse { token, usuario: usuario.into() }))
}