use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================================
// MEDICION INDIVIDUAL
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Medicion {
    pub id: Uuid,
    pub sensor_id: Uuid,
    pub valor: f64,
    pub medido_en: DateTime<Utc>,
}

// ============================================================
// MEDICION CON INFORMACION DEL SENSOR Y AULA
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MedicionDetalle {
    pub id: Uuid,
    pub sensor_id: Uuid,
    pub dispositivo_id: Uuid,
    pub aula_id: Uuid,
    pub tipo_sensor: String,
    pub unidad: String,
    pub valor: f64,
    pub medido_en: DateTime<Utc>,
}

// ============================================================
// RESPUESTA GENERAL DE LA API
// ============================================================

#[derive(Debug, Serialize)]
pub struct MensajeRespuesta {
    pub mensaje: String,
}
