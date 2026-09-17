use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{info, warn};

// Estado compartido de todo el sistema de WebSocket.
// `broadcast::Sender` permite enviar un mensaje UNA vez y que TODOS los
// clientes suscritos (todas las conexiones abiertas) lo reciban.
// Es justo lo que necesitamos para "actualizaciones de mediciones en tiempo real":
// cuando llega una medición nueva, se difunde a todos los que están viendo el dashboard.
#[derive(Clone)]
pub struct WsState {
    pub tx: broadcast::Sender<String>,
}

impl WsState {
    // Crea el estado inicial. `capacity` es cuántos mensajes se guardan en el
    // buffer interno: si un cliente es muy lento leyendo, después de ese límite
    // empieza a perder mensajes viejos (no se acumulan infinitamente en memoria).
    pub fn new(capacity: usize) -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(capacity);
        // El _rx (receptor inicial) se descarta: cada cliente que se conecte
        // creará su propio receptor con tx.subscribe() más abajo.
        Arc::new(Self { tx })
    }

    // Función pública que usará el resto del sistema (por ejemplo, el servicio
    // que lee sensores) para publicar una nueva medición a todos los clientes.
    pub fn broadcast_measurement(&self, payload: String) {
        // send() devuelve Err solo si NO hay ningún cliente escuchando.
        // Eso no es un error grave para nosotros, así que lo ignoramos con `let _ =`.
        let _ = self.tx.send(payload);
    }
}

// Este es el handler HTTP normal (una ruta más de axum). Su trabajo es
// "upgradear" (elevar) la conexión HTTP inicial a una conexión WebSocket real.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<WsState>>,
) -> impl IntoResponse {
    // on_upgrade recibe una función que se ejecutará cuando el navegador/cliente
    // termine el "handshake" de WebSocket y la conexión ya esté lista para usarse.
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

// Lógica de UNA conexión WebSocket individual (se ejecuta una vez por cada cliente conectado).
async fn handle_socket(socket: WebSocket, state: Arc<WsState>) {
    // Dividimos el socket en dos mitades independientes:
    // `sender` para escribir hacia el cliente, `receiver` para leer lo que él envía.
    let (mut sender, mut receiver) = socket.split();

    // Cada cliente se suscribe de forma independiente al canal de broadcast.
    let mut rx = state.tx.subscribe();

    info!("Nuevo cliente WebSocket conectado");

    // TAREA 1: escucha el canal broadcast y reenvía cada medición nueva a ESTE cliente.
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            // Si sender.send() falla, significa que el cliente ya se desconectó.
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // TAREA 2: escucha lo que el cliente envía (mensajes de control, cierre, etc.)
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    // Aquí se podrían interpretar comandos del cliente,
                    // por ejemplo: {"accion": "suscribirse", "sensor_id": 3}
                    info!("Mensaje recibido del cliente: {}", text);
                }
                Message::Close(_) => {
                    info!("El cliente cerró la conexión");
                    break;
                }
                _ => {} // Ignoramos pings/pongs/binarios por ahora
            }
        }
    });

    // Esperamos a que UNA de las dos tareas termine (por desconexión o error)
    // y cancelamos la otra, para no dejar tareas "huérfanas" corriendo en segundo plano.
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    warn!("Cliente WebSocket desconectado");
}
