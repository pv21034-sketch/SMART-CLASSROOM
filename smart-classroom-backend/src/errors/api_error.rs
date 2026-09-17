use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use thiserror::Error;

// Estructura que se envía al cliente en formato JSON cuando ocurre un error.
// Así TODOS los errores de la API tienen la misma forma (consistentes).
#[derive(Serialize)]
pub struct ErrorResponse {
    pub status: u16,
    pub message: String,
}

// Enum central de errores. Cada variante representa un tipo de error distinto
// que puede ocurrir en cualquier parte de la aplicación (rutas, servicios, websocket, etc.)
// #[derive(Error)] (de la crate `thiserror`) genera automáticamente el trait `std::error::Error`
// y el mensaje de cada variante se define con el atributo #[error("...")]
#[derive(Debug, Error)]
pub enum ApiError {
    #[error("Recurso no encontrado: {0}")]
    NotFound(String),

    #[error("Solicitud inválida: {0}")]
    BadRequest(String),

    #[error("Error interno del servidor: {0}")]
    Internal(String),

    #[error("Error de WebSocket: {0}")]
    WebSocket(String),
}

// IntoResponse es el trait de axum que le dice al framework cómo convertir
// un valor en una respuesta HTTP real. Al implementarlo para ApiError,
// podemos hacer `return Err(ApiError::NotFound(...))` directamente en un handler
// y axum lo transforma solo en la respuesta correcta.
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        // Elegimos el código de estado HTTP según el tipo de error.
        // El `&self` es porque solo estamos "mirando" el valor, no consumiéndolo todavía.
        let status = match &self {
            ApiError::NotFound(_) => StatusCode::NOT_FOUND,       // 404
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,   // 400
            ApiError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR, // 500
            ApiError::WebSocket(_) => StatusCode::INTERNAL_SERVER_ERROR, // 500
        };

        // Construimos el cuerpo JSON de la respuesta.
        // self.to_string() usa el mensaje definido en #[error("...")] de arriba.
        let body = Json(ErrorResponse {
            status: status.as_u16(),
            message: self.to_string(),
        });

        // (status, body) implementa IntoResponse en axum, así que solo lo convertimos.
        (status, body).into_response()
    }
}

// Result "alias" para no escribir Result<T, ApiError> en cada función.
// Con esto en el resto del proyecto se puede escribir: fn algo() -> ApiResult<Medicion>
pub type ApiResult<T> = Result<T, ApiError>;
