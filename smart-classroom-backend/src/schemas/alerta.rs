use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NivelAlerta {
    Baja,
    Media,
    Alta,
}

#[derive(Debug, Deserialize)]
pub struct NuevaAlerta {
    pub sensor_id: u32,
    pub aula_id: u32,
    pub mensaje: String,
    pub nivel: NivelAlerta,
}

#[derive(Debug, Clone, Serialize)]
pub struct Alerta {
    pub id: u32,
    pub sensor_id: u32,
    pub aula_id: u32,
    pub mensaje: String,
    pub nivel: NivelAlerta,
    pub atendida: bool,
    pub fecha: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct RespuestaAlerta {
    pub mensaje: String,
}