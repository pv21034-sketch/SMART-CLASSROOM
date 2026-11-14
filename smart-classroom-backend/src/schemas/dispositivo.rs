
use serde::Deserialize;
use uuid::Uuid;

pub const ESTADOS_VALIDOS: [&str; 3] = [
    "activo",
    "inactivo",
    "mantenimiento",
];

#[derive(Debug, Deserialize)]
pub struct NuevoDispositivo {
    pub aula_id: Uuid,
    pub nombre: String,
    pub identificador: String,
    pub estado: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ActualizarDispositivo {
    pub aula_id: Option<Uuid>,
    pub nombre: Option<String>,
    pub identificador: Option<String>,
    pub estado: Option<String>,
}
