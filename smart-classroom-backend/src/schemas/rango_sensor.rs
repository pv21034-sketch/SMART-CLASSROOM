
use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct NuevoRango {
    pub aula_id: Uuid,
    pub tipo_sensor_id: Uuid,
    pub valor_minimo: f64,
    pub valor_maximo: f64,
    pub activo: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ActualizarRango {
    pub valor_minimo: Option<f64>,
    pub valor_maximo: Option<f64>,
    pub activo: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct FiltroRangos {
    pub aula_id: Option<Uuid>,
}
