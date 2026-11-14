use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// SMART CLASSROOM
/// Datos ambientales enviados por el ESP32.
///
/// Medicion normal:
/// {
///   "dispositivo_id": "esp32-a101",
///   "temperatura": 28.6,
///   "humedad": 64.2
/// }
///
/// Medicion con aula:
/// {
///   "dispositivo_id": "esp32-a101",
///   "aula_codigo": "AULA-2B",
///   "temperatura": 28.6,
///   "humedad": 64.2
/// }
///
/// Medicion historica:
/// {
///   "dispositivo_id": "esp32-a101",
///   "temperatura": 24.8,
///   "humedad": 82.0,
///   "medido_en": "2026-10-07T09:00:00-06:00"
/// }
///
/// Si no se proporciona medido_en,
/// el backend utiliza la fecha actual.
///
/// aula_codigo es opcional para mantener
/// compatibilidad con solicitudes anteriores.

#[derive(Debug, Deserialize, Serialize)]
pub struct NuevaMedicion {
    pub dispositivo_id: String,
    pub temperatura: f64,
    pub humedad: f64,

    #[serde(default)]
    pub medido_en: Option<DateTime<Utc>>,

    #[serde(default)]
    pub aula_codigo: Option<String>,
}
