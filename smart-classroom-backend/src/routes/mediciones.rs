//Importaciones necesarias
use chrono::Utc;
use Axum::{extract::Path, http::StatusCode, response::IntoResponse, routing::get, Json, Router};

// Importaciones lo de que se creo en schemas/medicion.rs
use crate::schemas::medicion::{Medicion, MensajeRespuesta, NuevaMedicion, TipoMedicion};
pub fn mediciones_routes() -> Router {
    Router::new()
        .route("/mediciones", get(listar_mediciones).post(crear_medicion))
        .route("/mediciones/:id", get(obtener_medicion))
}

fn mock_mediciones() -> Vec<Medicion> {
    vec![
        Medicion {
            id: 1,
            aula_id: 101,
            sensor_id: 1,
            tipo: TipoMedicion::Temperatura,
            valor: 23.5,
            fecha: Utc::now(),
        },
        Medicion {
            id: 2,
            aula_id: 101,
            sensor_id: 2,
            tipo: TipoMedicion::Humedad,
            valor: 55.0,
            fecha: Utc::now(),
        },
        Medicion {
            id: 3,
            aula_id: 102,
            sensor_id: 3,
            tipo: TipoMedicion::Co2,
            valor: 800.0,
            fecha: Utc::now(),
        },
    ]
}

async fn listar_mediciones() -> impl IntoResponse {
    let mediciones = mock_mediciones();
    (StatusCode::OK, Json(mediciones))
}

async fn obtener_medicion(Path(id): Path<u32>) -> impl IntoResponse {
    let mediciones = mock_mediciones();

    match mediciones.into_iter().find(|m| m.id == id) {
        Some(medicion) => (StatusCode::OK, Json(medicion)).into_response(),
        None => {
            let error = MensajeRespuesta {
                mensaje: format!("No se encontro una medicion con id {}", id),
            };
            (StatusCode::NOT_FOUND, Json(error)).into_response()
        }
    }
}

async fn crear_medicion(Json(payload): Json<NuevaMedicion>) -> impl IntoResponse {
    if !payload.valor.is_finite() {
        let error = MensajeRespuesta {
            mensaje: "El campo 'valor' debe ser un numero valido".to_string(),
        };
        return (StatusCode::BAD_REQUEST, Json(error)).into_response();
    }

    let nueva_medicion = Medicion {
        id: 99,
        aula_id: payload.aula_id,
        sensor_id: payload.sensor_id,
        tipo: payload.tipo,
        valor: payload.valor,
        fecha: Utc::now(),
    };

    (StatusCode::CREATED, Json(nueva_medicion)).into_response()
}
