//! SMART CLASSROOM — Modelo TipoSensor
//!
//! Representa los tipos de sensores disponibles
//! dentro del sistema SMART CLASSROOM.
//!
//! Corresponde a la tabla `tipos_sensor`
//! definida en PostgreSQL.
//!
//! Permite identificar qué variable ambiental
//! mide cada sensor y su unidad correspondiente.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ============================================================
// MODELO DE TIPO DE SENSOR
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TipoSensor {
    /// Identificador único del tipo de sensor.
    /// PostgreSQL: UUID PRIMARY KEY.
    pub id: Uuid,

    /// Nombre del tipo de sensor.
    ///
    /// Ejemplos:
    /// - temperatura
    /// - humedad
    /// - iluminacion
    /// - ruido
    pub nombre: String,

    /// Unidad de medida correspondiente.
    ///
    /// Ejemplos:
    /// - °C
    /// - %
    /// - lux
    /// - dB
    pub unidad: String,

    /// Descripción opcional del tipo de sensor.
    pub descripcion: Option<String>,
}
