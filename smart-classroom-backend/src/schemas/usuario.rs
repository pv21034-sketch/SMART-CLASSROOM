use serde::{Deserialize, Serialize};

use crate::models::usuario::UsuarioPublico;

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub identifier: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub usuario: UsuarioPublico,
}
