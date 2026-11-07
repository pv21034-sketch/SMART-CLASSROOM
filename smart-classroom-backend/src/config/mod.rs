//! SMART CLASSROOM — Configuración del servidor
//!
//! Lee y valida las variables de entorno.
//!
//! Variables:
//! - SERVER_HOST o HOST: dirección del servidor.
//! - SERVER_PORT o PORT: puerto HTTP.
//! - JWT_SECRET: clave de firma de tokens JWT.
//! - ADMIN_USUARIO: usuario administrador inicial (opcional).
//! - ADMIN_PASSWORD: contraseña inicial (opcional).
//!
//! La conexión DATABASE_URL se administra desde db/.

use std::{
    env, fmt,
    net::{IpAddr, SocketAddr},
};

use anyhow::{bail, Context, Result};

// ============================================================
// CONFIGURACIÓN
// ============================================================

#[derive(Clone)]
pub struct Config {
    pub direccion: SocketAddr,
    pub jwt_secret: String,
    pub admin_usuario: Option<String>,
    pub admin_password: Option<String>,
}

// Implementación segura de Debug:
// nunca muestra contraseñas ni secretos.
impl fmt::Debug for Config {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Config")
            .field("direccion", &self.direccion)
            .field("jwt_secret", &"[OCULTO]")
            .field("admin_usuario", &self.admin_usuario)
            .field(
                "admin_password",
                &self.admin_password.as_ref().map(|_| "[OCULTO]"),
            )
            .finish()
    }
}

// ============================================================
// IMPLEMENTACIÓN
// ============================================================

impl Config {
    /// Construye y valida la configuración del backend.
    pub fn desde_entorno() -> Result<Self> {
        let host = leer_variable_compatible("SERVER_HOST", "HOST", "0.0.0.0")?;

        let puerto = leer_variable_compatible("SERVER_PORT", "PORT", "3000")?;

        // Validar dirección IP.
        let ip: IpAddr = host.parse().with_context(|| {
            format!("SERVER_HOST/HOST debe ser una dirección IP válida: {host}")
        })?;

        // Validar puerto.
        let puerto: u16 = puerto
            .parse()
            .with_context(|| "SERVER_PORT/PORT debe ser un número entre 1 y 65535")?;

        if puerto == 0 {
            bail!("El puerto del servidor no puede ser 0");
        }

        let direccion = SocketAddr::new(ip, puerto);

        // JWT obligatorio.
        let jwt_secret =
            env::var("JWT_SECRET").context("Falta JWT_SECRET en las variables de entorno")?;

        if jwt_secret.trim().is_empty() {
            bail!("JWT_SECRET no puede estar vacío");
        }

        if jwt_secret.as_bytes().len() < 32 {
            bail!("JWT_SECRET debe contener al menos 32 bytes");
        }

        // Credenciales opcionales del administrador.
        let admin_usuario = leer_opcional("ADMIN_USUARIO")?;
        let admin_password = leer_opcional("ADMIN_PASSWORD")?;

        // Evitar configuraciones incompletas.
        if admin_usuario.is_some() != admin_password.is_some() {
            bail!("ADMIN_USUARIO y ADMIN_PASSWORD deben configurarse juntos");
        }

        if let Some(ref usuario) = admin_usuario {
            if usuario.chars().count() < 3 {
                bail!("ADMIN_USUARIO debe contener al menos 3 caracteres");
            }
        }

        if let Some(ref password) = admin_password {
            if password.chars().count() < 12 {
                bail!("ADMIN_PASSWORD debe contener al menos 12 caracteres");
            }
        }

        Ok(Self {
            direccion,
            jwt_secret,
            admin_usuario,
            admin_password,
        })
    }
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/// Lee la variable principal o su alternativa.
///
/// Prioridad:
/// 1. Variable principal.
/// 2. Variable alternativa.
/// 3. Valor predeterminado.
fn leer_variable_compatible(
    principal: &str,
    alternativa: &str,
    predeterminado: &str,
) -> Result<String> {
    if let Some(valor) = leer_opcional(principal)? {
        return Ok(valor);
    }

    if let Some(valor) = leer_opcional(alternativa)? {
        return Ok(valor);
    }

    Ok(predeterminado.to_string())
}

/// Lee una variable opcional y descarta cadenas vacías.
fn leer_opcional(nombre: &str) -> Result<Option<String>> {
    match env::var(nombre) {
        Ok(valor) => {
            let valor = valor.trim();

            if valor.is_empty() {
                Ok(None)
            } else {
                Ok(Some(valor.to_string()))
            }
        }

        Err(env::VarError::NotPresent) => Ok(None),

        Err(error) => Err(error).with_context(|| format!("No se pudo leer la variable {nombre}")),
    }
}

// ============================================================
// PRUEBAS UNITARIAS
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direccion_ipv4_valida() {
        let ip: IpAddr = "0.0.0.0".parse().unwrap();
        let direccion = SocketAddr::new(ip, 3000);

        assert_eq!(direccion.port(), 3000);
        assert!(direccion.is_ipv4());
    }

    #[test]
    fn direccion_ipv6_valida() {
        let ip: IpAddr = "::1".parse().unwrap();
        let direccion = SocketAddr::new(ip, 3000);

        assert!(direccion.is_ipv6());
    }

    #[test]
    fn debug_no_revela_secretos() {
        let config = Config {
            direccion: "127.0.0.1:3000".parse().unwrap(),
            jwt_secret: "clave-super-secreta".to_string(),
            admin_usuario: Some("admin".to_string()),
            admin_password: Some("password-super-secreto".to_string()),
        };

        let salida = format!("{config:?}");

        assert!(!salida.contains("clave-super-secreta"));
        assert!(!salida.contains("password-super-secreto"));
    }
}
