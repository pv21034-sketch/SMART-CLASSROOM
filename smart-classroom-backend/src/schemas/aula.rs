// Importamos la serde para Serializar y Desarializar 
use serde::{Deserialize, Serialize};


// Depurar y poder recibir datos externos 
#[derive(Debug, Deserialize)]
pub struct NuevaAula{
    pub nombre: String,
    pub ubicacion: String,
    pub capacidad: u32,
}



#[derive(Debug, Clone, Serialize)]
pub struct Aula{
    pub id: u32,
    pub nombre: String,
    pub ubicacion: String,
    pub capacidad: u32,
}

#[derive(Debug, Serialize)]
pub struct RespuestaAula{
    //mensaje que se enviara como respuesta
    pub mensaje: String,
}