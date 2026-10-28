//! Configuración del servidor, leída desde variables de entorno (.env).
//!
//! - `SERVER_HOST`    (por defecto `0.0.0.0`, necesario para que el ESP32
//!                     pueda conectarse desde otro dispositivo de la red).
//! - `SERVER_PORT`    (por defecto `3000`).
//! - `JWT_SECRET`     (obligatoria: clave para firmar los tokens del login).
//! - `ADMIN_USUARIO` / `ADMIN_PASSWORD` (opcionales: crean el primer
//!                     administrador si la tabla `usuarios` está vacía).

use std::{env, net::SocketAddr};

use anyhow::Context;

#[derive(Clone, Debug)]
pub struct Config {
    pub direccion: SocketAddr,
    pub jwt_secret: String,
    pub admin_usuario: Option<String>,
    pub admin_password: Option<String>,
}

impl Config {
    pub fn desde_entorno() -> anyhow::Result<Self> {
        let host = env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let puerto = env::var("SERVER_PORT").unwrap_or_else(|_| "3000".to_string());

        let direccion: SocketAddr = format!("{host}:{puerto}")
            .parse()
            .with_context(|| format!("Dirección de servidor inválida: {host}:{puerto}"))?;

        let jwt_secret = env::var("JWT_SECRET")
            .context("JWT_SECRET no está definida en el archivo .env")?;

        Ok(Self {
            direccion,
            jwt_secret,
            admin_usuario: env::var("ADMIN_USUARIO").ok().filter(|v| !v.trim().is_empty()),
            admin_password: env::var("ADMIN_PASSWORD").ok().filter(|v| !v.is_empty()),
        })
    }
}