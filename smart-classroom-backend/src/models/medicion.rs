//! SMART CLASSROOM — Modelo Medición
//!
//! Representa una medición ambiental individual
//! registrada por un sensor del sistema.
//!
//! Corresponde a la tabla `mediciones` de PostgreSQL.
//!
//! Cada registro almacena el valor de un único sensor.
//! El tipo de variable se determina mediante la relación:
//!
//! mediciones -> sensores -> tipos_sensor

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ============================================================
// MODELO DE MEDICIÓN
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Medicion {
    /// Identificador único de la medición.
    /// PostgreSQL: UUID PRIMARY KEY.
    pub id: Uuid,

    /// Identificador del sensor que generó la lectura.
    /// PostgreSQL: sensores(id).
    pub sensor_id: Uuid,

    /// Valor ambiental registrado.
    ///
    /// Su unidad depende del tipo de sensor:
    /// - Temperatura: °C
    /// - Humedad: %
    /// - Iluminación: lux
    /// - Ruido: dB
    ///
    /// PostgreSQL exige un valor finito.
    pub valor: f64,

    /// Fecha y hora en que se registró la medición.
    /// PostgreSQL: TIMESTAMPTZ.
    pub medido_en: DateTime<Utc>,
}
