use axum::{http::StatusCode, routing::post, Extension, Json, Router};
use sqlx::PgPool;

use crate::config::Config;
use crate::schemas::usuario::{LoginRequest, LoginResponse};
use crate::services::usuarios as servicio;

type ErrorHttp = (StatusCode, String);

pub fn router() -> Router {
    Router::new().route("/api/auth/login", post(login))
}

async fn login(
    Extension(pool): Extension<PgPool>,
    Extension(config): Extension<Config>,
    Json(datos): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, ErrorHttp> {
    let credenciales_invalidas = || {
        (
            StatusCode::UNAUTHORIZED,
            "Usuario o contraseña incorrectos".to_string(),
        )
    };

    if datos.identifier.trim().is_empty() || datos.password.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Completa usuario y contraseña".to_string(),
        ));
    }

    let usuario = servicio::buscar_por_nombre(&pool, datos.identifier.trim())
        .await
        .map_err(|error| {
            tracing::error!("Error consultando usuario: {error}");

            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Error interno del servidor".to_string(),
            )
        })?
        .ok_or_else(credenciales_invalidas)?;

    if !usuario.activo || !servicio::verificar(&datos.password, &usuario.password_hash) {
        return Err(credenciales_invalidas());
    }

    let token = servicio::generar_token(&usuario, &config.jwt_secret).map_err(|error| {
        tracing::error!("Error generando JWT: {error}");

        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "No se pudo generar el token".to_string(),
        )
    })?;

    if let Err(error) = servicio::actualizar_ultimo_acceso(&pool, usuario.id).await {
        tracing::warn!("No se pudo actualizar ultimo_acceso: {error}");
    }

    Ok(Json(LoginResponse {
        token,
        usuario: (&usuario).into(),
    }))
}
