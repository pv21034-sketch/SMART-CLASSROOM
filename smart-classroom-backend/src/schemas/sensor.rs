
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TipoSensor {
    Temperatura,
    Humedad,
    Co2,
    Ruido,
    Luminosidad,
}

#[derive(Debug, Deserialize)]
pub struct NuevoSensor {
    pub nombre: String,
    pub tipo: TipoSensor,
    pub aula_id: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct Sensor {
    pub id: u32,
    pub nombre: String,
    pub tipo: TipoSensor,
    pub aula_id: u32,
    pub activo: bool,
}

#[derive(Debug, Serialize)]
pub struct RespuestaSensor {
    pub mensaje: String,
}