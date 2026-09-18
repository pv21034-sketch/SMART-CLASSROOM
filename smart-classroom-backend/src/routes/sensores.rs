use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};

use crate::schemas::sensor::{NuevoSensor, RespuestaSensor, Sensor, TipoSensor};

pub fn sensores_routes() -> Router {
    Router::new()
        .route("/sensores", get(listar_sensores).post(crear_sensor))
        .route("/sensores/:id", get(obtener_sensor).delete(eliminar_sensor))
}

fn mock_sensores() -> Vec<Sensor> {
    vec![
        Sensor {
            id: 1,
            nombre: "Sensor Temperatura Aula 101".to_string(),
            tipo: TipoSensor::Temperatura,
            aula_id: 101,
            activo: true,
        },
        Sensor {
            id: 2,
            nombre: "Sensor Humedad Aula 101".to_string(),
            tipo: TipoSensor::Humedad,
            aula_id: 101,
            activo: true,
        },
        Sensor {
            id: 3,
            nombre: "Sensor Co2 Laboratorio".to_string(),
            tipo: TipoSensor::Co2,
            aula_id: 102,
            activo: false,
        },
    ]
}

async fn listar_sensores() -> impl IntoResponse {
    let sensores = mock_sensores();
    (StatusCode::OK, Json(sensores))
}

async fn obtener_sensor(Path(id): Path<u32>) -> impl IntoResponse {
    let sensores = mock_sensores();

    match sensores.into_iter().find(|s| s.id == id) {
        Some(sensor) => (StatusCode::OK, Json(sensor)).into_response(),
        None => {
            let error = RespuestaSensor {
                mensaje: format!("No se encontro un sensor con id {}", id),
            };
            (StatusCode::NOT_FOUND, Json(error)).into_response()
        }
    }
}

async fn crear_sensor(Json(payload): Json<NuevoSensor>) -> impl IntoResponse {
    if payload.nombre.trim().is_empty() {
        let error = RespuestaSensor {
            mensaje: "El campo 'nombre' no puede estar vacio".to_string(),
        };
        return (StatusCode::BAD_REQUEST, Json(error)).into_response();
    }

    let nuevo_sensor = Sensor {
        id: 99,
        nombre: payload.nombre,
        tipo: payload.tipo,
        aula_id: payload.aula_id,
        activo: true,
    };

    (StatusCode::CREATED, Json(nuevo_sensor)).into_response()
}

async fn eliminar_sensor(Path(id): Path<u32>) -> impl IntoResponse {
    let sensores = mock_sensores();

    match sensores.into_iter().find(|s| s.id == id) {
        Some(_) => {
            let respuesta = RespuestaSensor {
                mensaje: format!("Sensor con id {} eliminado correctamente", id),
            };
            (StatusCode::OK, Json(respuesta)).into_response()
        }
        None => {
            let error = RespuestaSensor {
                mensaje: format!("No se encontro un sensor con id {}", id),
            };
            (StatusCode::NOT_FOUND, Json(error)).into_response()
        }
    }
}