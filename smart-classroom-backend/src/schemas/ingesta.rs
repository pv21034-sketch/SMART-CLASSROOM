use serde::Deserialize;

/// JSON que envía el ESP32 en cada lectura:
///
/// ```json
/// {
///   "dispositivo_id": "esp32-a101",
///   "temperatura": 28.6,
///   "humedad": 64.2,
///   "iluminacion": 380,
///   "ruido": 48
/// }
/// ```
///
/// `dispositivo_id` es el texto guardado en `dispositivos.identificador`
/// (no el UUID interno). Las cuatro variables son opcionales para que el
/// ESP32 pueda seguir enviando si un sensor falla; se exige al menos una.
#[derive(Debug, Deserialize)]
pub struct NuevaMedicion {
    pub dispositivo_id: String,
    pub temperatura: Option<f64>,
    pub humedad: Option<f64>,
    pub iluminacion: Option<f64>,
    pub ruido: Option<f64>,
}
