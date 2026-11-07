//! SMART CLASSROOM — Modelo Alerta
//!
//! Representa una alerta ambiental generada
//! cuando una medición supera los límites
//! configurados para un sensor.
//!
//! Corresponde a la tabla `alertas` de PostgreSQL.
//!
//! Los valores mínimo y máximo aplicados se
//! conservan como referencia histórica, incluso
//! si posteriormente cambia la configuración
//! del rango del sensor.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ============================================================
// MODELO DE ALERTA
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Alerta {
    /// Identificador único de la alerta.
    /// PostgreSQL: UUID PRIMARY KEY.
    pub id: Uuid,

    /// Identificador de la medición que originó la alerta.
    /// PostgreSQL: mediciones(id).
    pub medicion_id: Uuid,

    /// Identificador del rango de sensor aplicado.
    /// PostgreSQL: rangos_sensor(id).
    pub rango_sensor_id: Uuid,

    /// Tipo de condición que generó la alerta.
    ///
    /// Valores permitidos:
    /// - por_debajo
    /// - por_encima
    pub tipo: String,

    /// Mensaje descriptivo de la alerta.
    /// Puede ser NULL en PostgreSQL.
    pub mensaje: Option<String>,

    /// Estado actual de la alerta.
    ///
    /// Valores permitidos:
    /// - activa
    /// - revisada
    /// - resuelta
    pub estado: String,

    /// Valor mínimo vigente cuando se generó la alerta.
    /// Se conserva como dato histórico.
    pub valor_minimo_aplicado: f64,

    /// Valor máximo vigente cuando se generó la alerta.
    /// Se conserva como dato histórico.
    pub valor_maximo_aplicado: f64,

    /// Fecha y hora de generación de la alerta.
    pub generada_en: DateTime<Utc>,

    /// Fecha y hora de resolución.
    ///
    /// Es None mientras la alerta no esté resuelta.
    pub resuelta_en: Option<DateTime<Utc>>,
}
