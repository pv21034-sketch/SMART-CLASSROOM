use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================================
// DATOS PARA REGISTRAR UN SENSOR
// ============================================================

#[derive(Debug, Deserialize)]
pub struct NuevoSensor {
    pub dispositivo_id: Uuid,
    pub tipo_sensor_id: Uuid,
    pub nombre: String,
    pub pin_gpio: Option<i16>,
}

// ============================================================
// DATOS PARA ACTUALIZAR UN SENSOR
// ============================================================

#[derive(Debug, Deserialize)]
pub struct ActualizarSensor {
    pub nombre: Option<String>,
    pub pin_gpio: Option<i16>,
    pub estado: Option<String>,
}

// ============================================================
// REPRESENTACION DE UN SENSOR
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sensor {
    pub id: Uuid,
    pub dispositivo_id: Uuid,
    pub tipo_sensor_id: Uuid,
    pub nombre: String,
    pub pin_gpio: Option<i16>,
    pub estado: String,
    pub creado_en: DateTime<Utc>,
}

// ============================================================
// RESPUESTA DE LA API
// ============================================================

#[derive(Debug, Serialize)]
pub struct RespuestaSensor {
    pub mensaje: String,
}

// ============================================================
// SENSOR CON INFORMACION ADICIONAL
// ============================================================

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SensorDetalle {
    pub id: Uuid,
    pub dispositivo_id: Uuid,
    pub aula_id: Uuid,
    pub tipo_sensor_id: Uuid,
    pub tipo_nombre: String,
    pub unidad: String,
    pub nombre: String,
    pub pin_gpio: Option<i16>,
    pub estado: String,
    pub creado_en: DateTime<Utc>,
}
