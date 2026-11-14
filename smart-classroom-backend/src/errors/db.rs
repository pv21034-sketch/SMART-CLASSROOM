
use axum::http::StatusCode;

// Convierte errores de PostgreSQL en respuestas HTTP.
pub fn mapear(error: sqlx::Error) -> (StatusCode, String) {
    tracing::error!("Error PostgreSQL: {}", error);

    match &error {
        sqlx::Error::Database(db_error) => {
            match db_error.code().as_deref() {
                // Registro duplicado
                Some("23505") => (
                    StatusCode::CONFLICT,
                    "Ya existe un registro con esos datos únicos".into(),
                ),

                // Referencia inexistente
                Some("23503") => (
                    StatusCode::BAD_REQUEST,
                    "El registro hace referencia a un elemento inexistente".into(),
                ),

                // Restricciones de PostgreSQL
                Some("23514") | Some("23502") => (
                    StatusCode::BAD_REQUEST,
                    "Los datos no cumplen las restricciones de la base de datos".into(),
                ),

                // Otros errores SQL
                _ => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Error al consultar la base de datos".into(),
                ),
            }
        }

        sqlx::Error::RowNotFound => (
            StatusCode::NOT_FOUND,
            "Registro no encontrado".into(),
        ),

        _ => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Error interno de base de datos".into(),
        ),
    }
}

