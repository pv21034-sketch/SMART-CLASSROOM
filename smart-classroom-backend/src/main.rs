
// Agregamos los modulos de las nuevas carpetas 
mod routes;
mod schemas;

// ============================================================
// IMPORTACIONES
// ============================================================

// Json permite recibir y devolver información en formato JSON.
use axum::extract::Json;

// Importamos las funciones necesarias para crear rutas HTTP.
// get  -> solicitudes GET
// post -> solicitudes POST
use axum::routing::{get, post};

// Router permite definir las diferentes rutas de nuestra API.
use axum::Router;

// Serde permite convertir estructuras de Rust desde/hacia JSON.
//
// Deserialize -> permite convertir un JSON recibido en una
//                estructura de Rust.
//
// Serialize   -> permite convertir una estructura de Rust
//                en JSON para enviarla como respuesta.
use serde::{Deserialize, Serialize};

// SocketAddr representa una dirección IP y un puerto.
use std::net::SocketAddr;

// ============================================================
// MODELO DE DATOS: NUEVA MEDICIÓN
// ============================================================

// Esta estructura representa los datos que recibiremos
// desde el ESP32.
//
// El ESP32 eventualmente enviará algo como:
//
// {
//     "dispositivo_id": 1,
//     "temperatura": 28.6,
//     "humedad": 64.2,
//     "iluminacion": 380.0,
//     "ruido": 48.0
// }
//
// #[derive(Deserialize)] permite que Serde convierta
// automáticamente ese JSON en una estructura NuevaMedicion.
#[derive(Debug, Deserialize, Serialize)]
struct NuevaMedicion {
    // Identificador del dispositivo ESP32.
    dispositivo_id: i32,

    // Temperatura medida en grados Celsius.
    temperatura: f64,

    // Humedad relativa expresada en porcentaje.
    humedad: f64,

    // Iluminación medida en lux.
    iluminacion: f64,

    // Nivel de ruido medido en decibelios.
    ruido: f64,
}

// ============================================================
// MODELO DE RESPUESTA
// ============================================================

// Esta estructura representa la respuesta que nuestro
// servidor devolverá al dispositivo.
//
// #[derive(Serialize)] permite convertir esta estructura
// automáticamente a formato JSON.
#[derive(Debug, Serialize)]
struct Respuesta {
    // Mensaje que indica si la medición fue recibida.
    mensaje: String,

    // Devolvemos también los datos recibidos.
    medicion: NuevaMedicion,
}

// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================

// #[tokio::main] permite ejecutar nuestra aplicación
// utilizando el entorno asíncrono de Tokio.
//
// Esto es necesario porque nuestro servidor debe poder
// atender solicitudes sin bloquearse.
#[tokio::main]
async fn main() {
    // --------------------------------------------------------
    // CREACIÓN DEL ROUTER
    // --------------------------------------------------------

    // Creamos nuestro Router de Axum.
    //
    // Aquí vamos registrando las diferentes rutas
    // que tendrá nuestra API.
    let app = Router::new()
        // ----------------------------------------------------
        // Ruta principal
        // ----------------------------------------------------
        //
        // GET /
        //
        // Sirve para comprobar que el backend está funcionando.
        .route("/", get(inicio))
        // ----------------------------------------------------
        // Ruta de salud
        // ----------------------------------------------------
        //
        // GET /api/salud
        //
        // Permite comprobar que nuestra API está disponible.
        .route("/api/salud", get(salud))
        // ----------------------------------------------------
        // Ruta para recibir mediciones
        // ----------------------------------------------------
        //
        // POST /api/mediciones
        //
        // Esta será una de las rutas más importantes
        // de nuestro proyecto.
        //
        // El ESP32 enviará las mediciones mediante esta ruta.
        .route("/api/mediciones", post(crear_medicion)) // SIN punto y coma aquí

               // unimos las nuevas rutas...
            .merge(routes::create_router()); 

    // ========================================================
    // CONFIGURACIÓN DE LA DIRECCIÓN DEL SERVIDOR
    // ========================================================

    // Nuestro servidor funcionará inicialmente en:
    //
    // 127.0.0.1 -> nuestra propia computadora
    // 3000      -> puerto utilizado por el backend
    //
    // Más adelante podremos configurarlo para que otros
    // dispositivos de la red puedan comunicarse con él.
    let direccion = SocketAddr::from(([127, 0, 0, 1], 3000));

    // Mostramos en la terminal dónde está funcionando
    // nuestro servidor.
    println!("Servidor iniciado en http://{}", direccion);

    // ========================================================
    // CREACIÓN DEL LISTENER
    // ========================================================

    // TcpListener se encarga de escuchar las conexiones
    // que lleguen al puerto 3000.
    //
    // .await significa que esperamos de manera asíncrona
    // hasta que el puerto esté disponible.
    let listener = tokio::net::TcpListener::bind(direccion)
        .await
        .expect("No se pudo iniciar el servidor");

    // ========================================================
    // INICIAR SERVIDOR AXUM
    // ========================================================

    // axum::serve inicia nuestro servidor HTTP.
    //
    // El servidor permanecerá ejecutándose y esperando
    // solicitudes HTTP.
    axum::serve(listener, app)
        .await
        .expect("Error en el servidor");
}

// ============================================================
// FUNCIÓN: INICIO
// ============================================================

// Esta función responde cuando alguien visita:
//
// GET /
//
// Por ejemplo:
//
// http://127.0.0.1:3000/
async fn inicio() -> &'static str {
    // Devolvemos un mensaje simple.
    "Smart Classroom Backend"
}

// ============================================================
// FUNCIÓN: SALUD
// ============================================================

// Esta función responde cuando alguien visita:
//
// GET /api/salud
//
// Sirve para comprobar que el backend está funcionando.
async fn salud() -> &'static str {
    // Si recibimos "OK", significa que el servidor
    // respondió correctamente.
    "OK"
}

// ============================================================
// FUNCIÓN: CREAR MEDICIÓN
// ============================================================

// Esta función recibe:
//
// POST /api/mediciones
//
// El ESP32 enviará un JSON con las mediciones.
//
// Ejemplo:
//
// {
//     "dispositivo_id": 1,
//     "temperatura": 28.6,
//     "humedad": 64.2,
//     "iluminacion": 380.0,
//     "ruido": 48.0
// }

async fn crear_medicion(
    // Axum toma automáticamente el JSON enviado
    // en el cuerpo de la solicitud HTTP.
    //
    // Después Serde lo convierte en nuestra estructura
    // NuevaMedicion.
    Json(medicion): Json<NuevaMedicion>,
) -> Json<Respuesta> {
    // --------------------------------------------------------
    // MOSTRAR LA MEDICIÓN EN LA TERMINAL
    // --------------------------------------------------------

    // Por ahora NO guardamos los datos en PostgreSQL.
    //
    // Simplemente mostramos la medición recibida
    // en la terminal.
    println!("Medición recibida: {:?}", medicion);

    // --------------------------------------------------------
    // CREAR RESPUESTA
    // --------------------------------------------------------

    // Construimos una respuesta para quien envió
    // la medición.
    //
    // Json convierte automáticamente nuestra estructura
    // Respuesta en formato JSON.
    Json(Respuesta {
        // Mensaje que enviaremos al cliente.
        mensaje: "Medición recibida correctamente".to_string(),

        // Devolvemos la medición que acabamos de recibir.
        medicion,
    })
} 
