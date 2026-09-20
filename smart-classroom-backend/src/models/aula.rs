use serde::{Deserialize, Serialize};

/// Representa un aula dentro del sistema SMART CLASSROOM.
///
/// Contiene la información básica necesaria para identificar,
/// ubicar y controlar el estado de un aula monitoreada.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aula {
    /// Identificador único del aula.
    pub id: i32,

    /// Nombre o código identificador del aula.
    pub nombre: String,

    /// Ubicación física del aula.
    pub ubicacion: Option<String>,

    /// Capacidad máxima de estudiantes.
    pub capacidad: Option<i32>,

    /// Indica si el aula se encuentra disponible para monitoreo.
    pub activa: bool,
}