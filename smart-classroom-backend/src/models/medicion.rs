use serde::{Deserialize, Serialize};

/// Representa una medición ambiental registrada por el sistema
/// SMART CLASSROOM.
///
/// Agrupa los valores obtenidos de los sensores de un aula
/// junto con la fecha y hora en que fueron registrados.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Medicion {
    /// Identificador único de la medición.
    pub id: i32,

    /// Identificador del aula donde se realizó la medición.
    pub aula_id: i32,

    /// Identificador del sensor que generó la medición.
    pub sensor_id: Option<i32>,

    /// Temperatura registrada en grados Celsius.
    pub temperatura: Option<f64>,

    /// Humedad relativa registrada en porcentaje.
    pub humedad: Option<f64>,

    /// Nivel de iluminación registrado en lux.
    pub iluminacion: Option<f64>,

    /// Nivel de ruido registrado en decibelios.
    pub ruido: Option<f64>,

    /// Índice de confort calculado para el aula.
    pub confort: Option<f64>,

    /// Fecha y hora en que se registró la medición.
    pub fecha_hora: String,
}