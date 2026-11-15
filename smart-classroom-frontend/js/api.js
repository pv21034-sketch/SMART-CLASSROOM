
"use strict";

// ============================================================
// SMART CLASSROOM - CLIENTE API
// Backend desplegado en Render
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

        const respuesta = await fetch(
            `${API_URL}${ruta}`,
            {
                ...opciones,
                headers
            }
        );

        if (respuesta.status === 401) {
            throw new Error("Sesión no autorizada o vencida.");
        }

        if (!respuesta.ok) {
            let detalle = `Error HTTP ${respuesta.status}`;

            try {
                const error = await respuesta.json();

                detalle =
                    error.mensaje ||
                    error.error ||
                    detalle;
            } catch (_) {
                // La respuesta no contiene JSON.
            }

            throw new Error(detalle);
        }

        if (respuesta.status === 204) {
            return null;
        }

        return respuesta.json();
    }

    // ========================================================
    // CONSULTAS
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
})();
