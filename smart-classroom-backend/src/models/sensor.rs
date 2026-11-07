//! SMART CLASSROOM — Modelo Sensor
//!
//! Representa un sensor físico asociado a un dispositivo
//! ESP32 dentro del sistema SMART CLASSROOM.
//!
//! Este modelo corresponde a la tabla `sensores`
//! definida en PostgreSQL.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ============================================================
// MODELO DE SENSOR
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Sensor {
    /// Identificador único del sensor.
    /// PostgreSQL: UUID PRIMARY KEY.
    pub id: Uuid,

    /// Identificador del dispositivo ESP32 al que pertenece.
    /// PostgreSQL: dispositivos(id).
    pub dispositivo_id: Uuid,

    /// Identificador del tipo de sensor.
    /// PostgreSQL: tipos_sensor(id).
    pub tipo_sensor_id: Uuid,

    /// Nombre descriptivo del sensor.
    pub nombre: String,

    /// Pin GPIO utilizado en el ESP32.
    ///
    /// Puede ser NULL cuando no corresponde
    /// asignar un pin físico.
    pub pin_gpio: Option<i16>,

    /// Estado operativo del sensor.
    ///
    /// Valores permitidos por PostgreSQL:
    /// - activo
    /// - inactivo
    /// - mantenimiento
    pub estado: String,

    /// Fecha y hora de creación del registro.
    pub creado_en: DateTime<Utc>,
}
