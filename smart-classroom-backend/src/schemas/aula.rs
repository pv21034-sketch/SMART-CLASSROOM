use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct NuevaAula {
    pub codigo: String,
    pub nombre: String,
    pub ubicacion: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ActualizarAula {
    pub codigo: Option<String>,
    pub nombre: Option<String>,
    pub ubicacion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aula {
    pub id: Uuid,
    pub codigo: String,
    pub nombre: String,
    pub ubicacion: Option<String>,
    pub creado_en: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct RespuestaAula {
    pub mensaje: String,
}
