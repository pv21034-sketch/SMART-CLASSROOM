
"use strict";

// ============================================================
// SMART CLASSROOM - CLIENTE API
// Backend Rust + Axum desplegado en Render
// ============================================================

(function () {
    const API_URL = (
        window.SMART_CLASSROOM_CONFIG?.API_URL ||
        "https://smart-classroom-hitb.onrender.com"
    ).replace(/\/+$/, "");

    function obtenerToken() {
        return sessionStorage.getItem("sc_token");
    }

    async function solicitar(ruta, opciones = {}) {
        const token = obtenerToken();

        const headers = new Headers(opciones.headers || {});

        headers.set("Accept", "application/json");

        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }

        if (
            opciones.body != null &&
            !(opciones.body instanceof FormData) &&
            !headers.has("Content-Type")
        ) {
            headers.set("Content-Type", "application/json");
        }

        let respuesta;

        try {
            respuesta = await fetch(`${API_URL}${ruta}`, {
                ...opciones,
                headers
            });
        } catch (error) {
            console.error(
                "SMART CLASSROOM - Error de conexión:",
                error
            );

            throw new Error(
                "No se pudo conectar con el backend de SMART CLASSROOM."
            );
        }

        if (respuesta.status === 401) {
            throw new Error("Sesión no autorizada o vencida.");
        }

        if (!respuesta.ok) {
            let detalle = `Error HTTP ${respuesta.status}`;

            try {
                const error = await respuesta.json();

                detalle =
                    error.mensaje ||
                    error.message ||
                    error.error ||
                    detalle;
            } catch (_) {
                // La respuesta no contiene JSON válido.
            }

            throw new Error(detalle);
        }

        if (respuesta.status === 204) {
            return null;
        }

        return respuesta.json();
    }

    // ========================================================
    // MÉTODOS HTTP Y CONSULTAS
    // ========================================================

    const API = {
        get(ruta) {
            return solicitar(ruta, { method: "GET" });
        },

        post(ruta, datos) {
            return solicitar(ruta, {
                method: "POST",
                body: JSON.stringify(datos)
            });
        },

        put(ruta, datos) {
            return solicitar(ruta, {
                method: "PUT",
                body: JSON.stringify(datos)
            });
        },

        mediciones() {
            return solicitar("/api/mediciones");
        },

        alertas() {
            return solicitar("/api/alertas");
        },

        ultimaMedicion(aulaId) {
            return solicitar(
                `/api/aulas/${encodeURIComponent(aulaId)}/ultima`
            );
        }
    };

    window.SmartClassroomAPI = API;

    console.log(
        "SMART CLASSROOM - Cliente API configurado:",
        API_URL
    );
})();
