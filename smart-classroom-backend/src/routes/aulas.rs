use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};

use crate::schemas::aula::{Aula, NuevaAula, RespuestaAula};

pub fn aulas_routes() -> Router {
    Router::new()
        .route("/aulas", get(listar_aulas).post(crear_aula))
        .route(
            "/aulas/:id",
            get(obtener_aula).put(actualizar_aula).delete(eliminar_aula),
        )
}

fn mock_aulas() -> Vec<Aula> {
    vec![
        Aula {
            id: 1,
            nombre: "Aula 101".to_string(),
            ubicacion: "Edificio A, Piso 1".to_string(),
            capacidad: 30,
        },
        Aula {
            id: 2,
            nombre: "Aula 102".to_string(),
            ubicacion: "Edificio A, Piso 1".to_string(),
            capacidad: 25,
        },
        Aula {
            id: 3,
            nombre: "Laboratorio de Ciencias".to_string(),
            ubicacion: "Edificio B, Piso 2".to_string(),
            capacidad: 20,
        },
    ]
}

async fn listar_aulas() -> impl IntoResponse {
    let aulas = mock_aulas();
    (StatusCode::OK, Json(aulas))
}

async fn obtener_aula(Path(id): Path<u32>) -> impl IntoResponse {
    let aulas = mock_aulas();

    match aulas.into_iter().find(|a| a.id == id) {
        Some(aula) => (StatusCode::OK, Json(aula)).into_response(),
        None => {
            let error = RespuestaAula {
                mensaje: format!("No se encontro un aula con id {}", id),
            };
            (StatusCode::NOT_FOUND, Json(error)).into_response()
        }
    }
}

async fn crear_aula(Json(payload): Json<NuevaAula>) -> impl IntoResponse {
    if payload.nombre.trim().is_empty() {
        let error = RespuestaAula {
            mensaje: "El campo 'nombre' no puede estar vacio".to_string(),
        };
        return (StatusCode::BAD_REQUEST, Json(error)).into_response();
    }

    if payload.capacidad == 0 {
        let error = RespuestaAula {
            mensaje: "El campo 'capacidad' debe ser mayor a 0".to_string(),
        };
        return (StatusCode::BAD_REQUEST, Json(error)).into_response();
    }

    let nueva_aula = Aula {
        id: 99,
        nombre: payload.nombre,
        ubicacion: payload.ubicacion,
        capacidad: payload.capacidad,
    };

    (StatusCode::CREATED, Json(nueva_aula)).into_response()
}

async fn actualizar_aula(
    Path(id): Path<u32>,
    Json(payload): Json<NuevaAula>,
) -> impl IntoResponse {
    let aulas = mock_aulas();

    match aulas.into_iter().find(|a| a.id == id) {
        Some(_) => {
            let aula_actualizada = Aula {
                id,
                nombre: payload.nombre,
                ubicacion: payload.ubicacion,
                capacidad: payload.capacidad,
            };
            (StatusCode::OK, Json(aula_actualizada)).into_response()
        }
        None => {
            let error = RespuestaAula {
                mensaje: format!("No se encontro un aula con id {}", id),
            };
            (StatusCode::NOT_FOUND, Json(error)).into_response()
        }
    }
}

async fn eliminar_aula(Path(id): Path<u32>) -> impl IntoResponse {
    let aulas = mock_aulas();

    match aulas.into_iter().find(|a| a.id == id) {
        Some(_) => {
            let respuesta = RespuestaAula {
                mensaje: format!("Aula con id {} eliminada correctamente", id),
            };
            (StatusCode::OK, Json(respuesta)).into_response()
        }
        None => {
            let error = RespuestaAula {
                mensaje: format!("No se encontro un aula con id {}", id),
            };
            (StatusCode::NOT_FOUND, Json(error)).into_response()
        }
    }
}