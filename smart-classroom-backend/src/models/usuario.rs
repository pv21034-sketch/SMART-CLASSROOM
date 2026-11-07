//! SMART CLASSROOM — Modelo Usuario
//!
//! Representa un usuario registrado en el sistema.
//!
//! Corresponde a la tabla `usuarios` de PostgreSQL.
//!
//! IMPORTANTE:
//! El campo password_hash contiene información sensible.
//! Nunca debe enviarse al frontend en una respuesta JSON.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

// ============================================================
// MODELO DE USUARIO
// ============================================================

#[derive(Clone, FromRow)]
pub struct Usuario {
    /// Identificador único del usuario.
    pub id: Uuid,

    /// Nombre de usuario utilizado para iniciar sesión.
    pub nombre_usuario: String,

    /// Hash de la contraseña almacenada.
    /// Nunca debe contener una contraseña en texto plano.
    pub password_hash: String,

    /// Rol asignado al usuario.
    ///
    /// Valores permitidos:
    /// - administrador
    /// - estudiante
    /// - observador
    pub rol: String,

    /// Indica si la cuenta está habilitada.
    pub activo: bool,

    /// Fecha del último acceso.
    pub ultimo_acceso: Option<DateTime<Utc>>,

    /// Fecha de creación del usuario.
    pub creado_en: DateTime<Utc>,
}

// ============================================================
// REPRESENTACIÓN PÚBLICA DEL USUARIO
// ============================================================

/// Información que puede devolverse al frontend
/// sin exponer el hash de la contraseña.
#[derive(Debug, Clone, Serialize)]
pub struct UsuarioPublico {
    pub id: Uuid,
    pub nombre_usuario: String,
    pub rol: String,
    pub activo: bool,
    pub ultimo_acceso: Option<DateTime<Utc>>,
    pub creado_en: DateTime<Utc>,
}

impl From<&Usuario> for UsuarioPublico {
    fn from(usuario: &Usuario) -> Self {
        Self {
            id: usuario.id,
            nombre_usuario: usuario.nombre_usuario.clone(),
            rol: usuario.rol.clone(),
            activo: usuario.activo,
            ultimo_acceso: usuario.ultimo_acceso,
            creado_en: usuario.creado_en,
        }
    }
}

// ============================================================
// DEBUG SEGURO
// ============================================================

/// Evita imprimir accidentalmente el hash
/// de la contraseña en los registros del servidor.
impl std::fmt::Debug for Usuario {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Usuario")
            .field("id", &self.id)
            .field("nombre_usuario", &self.nombre_usuario)
            .field("password_hash", &"[PROTEGIDO]")
            .field("rol", &self.rol)
            .field("activo", &self.activo)
            .field("ultimo_acceso", &self.ultimo_acceso)
            .field("creado_en", &self.creado_en)
            .finish()
    }
}
