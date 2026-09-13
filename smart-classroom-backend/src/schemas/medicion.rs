use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TipoMedicion{
    Temperatura,
    Humedad,
    Co2,
    Ruido,
    Luminosidad, 
}

#[derive(Debug, Deserialize)]
pub struct NuevaMedicion{
    // definimos nuestra estructura con los siguientes parametros 
    pub aula_id: u32,
    pub sensor_id: u32,
    pub tipo: TipoMedicion,
    pub valor: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct Medicion{
    pub id: u32,
    pub aula_id: u32,
    pub sensor_id: u32,
    pub tipo: TipoMedicion,
    pub valor: f32,
    pub fecha: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct MensajeRespuesta{
    pub mensaje: String, 
}