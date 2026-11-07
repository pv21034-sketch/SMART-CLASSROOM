use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================================
// ALERTA ALMACENADA EN POSTGRESQL
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alerta {
    pub id: Uuid,
    pub medicion_id: Uuid,
    pub rango_sensor_id: Uuid,
    pub tipo: String,
    pub mensaje: Option<String>,
    pub estado: String,
    pub valor_minimo_aplicado: f64,
    pub valor_maximo_aplicado: f64,
    pub generada_en: DateTime<Utc>,
    pub resuelta_en: Option<DateTime<Utc>>,
}

// ============================================================
// CAMBIO DE ESTADO DE UNA ALERTA
// ============================================================

#[derive(Debug, Deserialize)]
pub struct CambioEstadoAlerta {
    pub estado: String,
}

// ============================================================
// ALERTA DETALLADA PARA EL FRONTEND
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AlertaDetalle {
    pub id: Uuid,
    pub estado: String,
    pub tipo: String,
    pub mensaje: Option<String>,
    pub generada_en: DateTime<Utc>,
    pub resuelta_en: Option<DateTime<Utc>>,
    pub aula_id: Uuid,
    pub aula_codigo: String,
    pub dispositivo_id: Uuid,
    pub sensor_id: Uuid,
    pub tipo_sensor: String,
    pub unidad: String,
    pub valor: f64,
    pub valor_minimo: f64,
    pub valor_maximo: f64,
    pub medido_en: DateTime<Utc>,
}

// ============================================================
// RESPUESTA GENERAL DE LA API
// ============================================================

#[derive(Debug, Serialize)]
pub struct RespuestaAlerta {
    pub mensaje: String,
}
