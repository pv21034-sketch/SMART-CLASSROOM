use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::Utc;

use crate::schemas::alerta::{Alerta, NivelAlerta, NuevaAlerta, RespuestaAlerta};

pub fn alertas_routes() -> Router {
    Router::new()
        .route("/alertas", get(listar_alertas).post(crear_alerta))
        .route("/alertas/:id", get(obtener_alerta).delete(eliminar_alerta))
}

fn mock_alertas() -> Vec<Alerta> {
    vec![
        Alerta {
            id: 1,
            sensor_id: 1,
            aula_id: 101,
            mensaje: "Temperatura por encima del limite".to_string(),
            nivel: NivelAlerta::Alta,
            atendida: false,
            fecha: Utc::now(),
        },
        Alerta {
            id: 2,
            sensor_id: 3,
            aula_id: 102,
            mensaje: "Nivel de CO2 elevado".to_string(),
            nivel: NivelAlerta::Media,
            atendida: false,
            fecha: Utc::now(),
        },
        Alerta {
            id: 3,
            sensor_id: 2,
            aula_id: 101,
            mensaje: "Humedad fuera de rango normal".to_string(),
            nivel: NivelAlerta::Baja,
            atendida: true,
            fecha: Utc::now(),
        },
    ]
}

async fn listar_alertas() -> impl IntoResponse {
    let alertas = mock_alertas();
    (StatusCode::OK, Json(alertas))
}

async fn obtener_alerta(Path(id): Path<u32>) -> impl IntoResponse {
    let alertas = mock_alertas();

    match alertas.into_iter().find(|a| a.id == id) {
        Some(alerta) => (StatusCode::OK, Json(alerta)).into_response(),
        None => {
            let error = RespuestaAlerta {
                mensaje: format!("No se encontro una alerta con id {}", id),
            };
            (StatusCode::NOT_FOUND, Json(error)).into_response()
        }
    }
}

async fn crear_alerta(Json(payload): Json<NuevaAlerta>) -> impl IntoResponse {
    if payload.mensaje.trim().is_empty() {
        let error = RespuestaAlerta {
            mensaje: "El campo 'mensaje' no puede estar vacio".to_string(),
        };
        return (StatusCode::BAD_REQUEST, Json(error)).into_response();
    }

    let nueva_alerta = Alerta {
        id: 99,
        sensor_id: payload.sensor_id,
        aula_id: payload.aula_id,
        mensaje: payload.mensaje,
        nivel: payload.nivel,
        atendida: false,
        fecha: Utc::now(),
    };

    (StatusCode::CREATED, Json(nueva_alerta)).into_response()
}

async fn eliminar_alerta(Path(id): Path<u32>) -> impl IntoResponse {
    let alertas = mock_alertas();

    match alertas.into_iter().find(|a| a.id == id) {
        Some(_) => {
            let respuesta = RespuestaAlerta {
                mensaje: format!("Alerta con id {} eliminada correctamente", id),
            };
            (StatusCode::OK, Json(respuesta)).into_response()
        }
        None => {
            let error = RespuestaAlerta {
                mensaje: format!("No se encontro una alerta con id {}", id),
            };
            (StatusCode::NOT_FOUND, Json(error)).into_response()
        }
    }
}