use serde::{Deserialize, Serialize};

/// Representa un sensor asociado a un aula dentro del sistema
/// SMART CLASSROOM.
///
/// Permite identificar el sensor, conocer qué tipo de variable
/// mide y determinar si se encuentra activo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sensor {
    /// Identificador único del sensor.
    pub id: i32,

    /// Identificador del aula al que pertenece el sensor.
    pub aula_id: i32,

    /// Tipo de sensor utilizado.
    ///
    /// Ejemplos: temperatura, humedad, iluminación o ruido.
    pub tipo: String,

    /// Nombre descriptivo del sensor.
    pub nombre: String,

    /// Unidad de medida utilizada por el sensor.
    ///
    /// Ejemplos: °C, %, lux o dB.
    pub unidad: String,

    /// Indica si el sensor se encuentra activo.
    pub activo: bool,
}