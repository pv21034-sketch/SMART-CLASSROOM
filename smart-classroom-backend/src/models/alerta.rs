use serde::{Deserialize, Serialize};

/// Representa una alerta generada por el sistema
/// SMART CLASSROOM.
///
/// Las alertas permiten informar sobre condiciones ambientales
/// que requieren atención dentro de un aula.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alerta {
    /// Identificador único de la alerta.
    pub id: i32,

    /// Identificador del aula donde se generó la alerta.
    pub aula_id: i32,

    /// Tipo de condición que originó la alerta.
    pub tipo: String,

    /// Descripción de la alerta.
    pub mensaje: String,

    /// Nivel de prioridad de la alerta.
    ///
    /// Ejemplos: baja, media, alta o crítica.
    pub nivel: String,

    /// Indica si la alerta continúa activa.
    pub activa: bool,

    /// Fecha y hora en que se generó la alerta.
    pub fecha_hora: String,
}