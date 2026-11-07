use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Extension,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::broadcast::{self, error::RecvError};
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

    // Función pública que usa el resto del sistema (la ruta POST /api/mediciones)
    // para publicar una nueva medición a todos los clientes.
    pub fn broadcast_measurement(&self, payload: String) {
        // send() devuelve Err solo si NO hay ningún cliente escuchando.
        // Eso no es un error grave para nosotros, así que lo ignoramos con `let _ =`.
        let _ = self.tx.send(payload);
    }
}

// Handler HTTP normal que "upgradea" la conexión a WebSocket.
// Usa `Extension` (igual que el pool y la config) porque el router no usa `with_state`.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Extension(state): Extension<Arc<WsState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

// Lógica de UNA conexión WebSocket individual (se ejecuta una vez por cada cliente conectado).
async fn handle_socket(socket: WebSocket, state: Arc<WsState>) {
    let (mut sender, mut receiver) = socket.split();

    // Cada cliente se suscribe de forma independiente al canal de broadcast.
    let mut rx = state.tx.subscribe();

    info!("Nuevo cliente WebSocket conectado");

    // TAREA 1: reenvía cada medición nueva a ESTE cliente.
    let mut send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    // Si falla el envío, el cliente ya se desconectó.
                    if sender.send(Message::Text(msg)).await.is_err() {
                        break;
                    }
                }
                // Cliente lento: se perdieron mensajes viejos, pero la conexión sigue.
                Err(RecvError::Lagged(omitidos)) => {
                    warn!("Cliente WebSocket lento: se omitieron {omitidos} mensajes");
                }
                Err(RecvError::Closed) => break,
            }
        }
    });

    // TAREA 2: escucha lo que el cliente envía (cierre, mensajes de control).
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
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

    // Cuando una de las dos tareas termina, se cancela la otra.
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    warn!("Cliente WebSocket desconectado");
}
