// SMART CLASSROOM — Modelo RangoSensor
//
// Representa los límites ambientales configurados
// para un tipo de sensor dentro de un aula.
//
// Corresponde a la tabla `rangos_sensor` de PostgreSQL.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ============================================================
// MODELO DE RANGO DE SENSOR
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RangoSensor {
    /// Identificador único del rango.
    pub id: Uuid,

    /// Identificador del aula a la que pertenece.
    pub aula_id: Uuid,

    /// Identificador del tipo de sensor.
    pub tipo_sensor_id: Uuid,

    /// Valor mínimo permitido.
    pub valor_minimo: f64,

    /// Valor máximo permitido.
    pub valor_maximo: f64,

    /// Indica si el rango está habilitado.
    pub activo: bool,

    /// Fecha y hora de creación.
    pub creado_en: DateTime<Utc>,
}

// ============================================================
// VALIDACIÓN DE RANGOS
// ============================================================

impl RangoSensor {
    /// Comprueba si los límites son válidos.
    pub fn limites_validos(&self) -> bool {
        self.valor_minimo.is_finite()
            && self.valor_maximo.is_finite()
            && self.valor_minimo < self.valor_maximo
    }

    /// Determina si un valor está fuera de los límites.
    ///
    /// Devuelve:
    /// - Some("por_debajo") cuando es inferior al mínimo.
    /// - Some("por_encima") cuando supera el máximo.
    /// - None cuando está dentro del rango, el rango está
    ///   desactivado o los valores no son válidos.
    pub fn evaluar_valor(&self, valor: f64) -> Option<&'static str> {
        if !self.activo || !self.limites_validos() || !valor.is_finite() {
            return None;
        }

        if valor < self.valor_minimo {
            Some("por_debajo")
        } else if valor > self.valor_maximo {
            Some("por_encima")
        } else {
            None
        }
    }
}
