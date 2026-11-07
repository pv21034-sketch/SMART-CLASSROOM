//! SMART CLASSROOM — Modelo Dispositivo
//!
//! Representa un dispositivo ESP32 registrado
//! en el sistema SMART CLASSROOM.
//!
//! Un dispositivo puede asignarse manualmente
//! a diferentes aulas desde el frontend.
//!
//! Corresponde a la tabla `dispositivos`.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Dispositivo {
    /// Identificador único del dispositivo.
    pub id: Uuid,

    /// Aula actualmente asignada al dispositivo.
    pub aula_id: Uuid,

    /// Nombre descriptivo del dispositivo.
    pub nombre: String,

    /// Identificador único enviado por el ESP32.
    pub identificador: String,

    /// Estado operativo:
    /// activo, inactivo o mantenimiento.
    pub estado: String,

    /// Fecha y hora de la última conexión.
    pub ultima_conexion: Option<DateTime<Utc>>,

    /// Fecha y hora de registro.
    pub creado_en: DateTime<Utc>,
}
