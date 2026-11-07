//! SMART CLASSROOM — Modelo Aula
//!
//! Representa una fila de la tabla `aulas`
//! definida en PostgreSQL.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Aula {
    /// Llave primaria UUID.
    pub id: Uuid,

    /// Código único del aula.
    pub codigo: String,

    /// Nombre del aula.
    pub nombre: String,

    /// Ubicación física, si está registrada.
    pub ubicacion: Option<String>,

    /// Fecha de creación del registro.
    pub creado_en: DateTime<Utc>,
}
