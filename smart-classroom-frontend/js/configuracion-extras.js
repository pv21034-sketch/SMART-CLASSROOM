
/*
 * SMART CLASSROOM
 * Complementos de Configuración
 *
 * 1. Contador real de alertas.
 * 2. Botón Cerrar sesión al final de la página.
 *
 * No modifica las funciones de configuracion.js.
 */

(() => {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const API_URL = (
            window.SMART_CLASSROOM_CONFIG?.API_URL ||
            "http://localhost:3000"
        ).replace(/\/$/, "");

        // ==========================================
        // 1. CAMPANA DE ALERTAS
        // ==========================================

        const campana = document.querySelector(
            ".notification-button"
        );

        const contador = document.getElementById(
            "notification-count"
        );

        if (campana) {
            campana.href = "alertas.html";
            campana.setAttribute(
                "aria-label",
                "Abrir página de alertas"
            );
        }

        async function actualizarAlertas() {
            if (!contador) return;

            try {
                const token = sessionStorage.getItem(
                    "sc_token"
                );

                const headers = {
                    Accept: "application/json"
                };

                if (token) {
                    headers.Authorization = `Bearer ${token}`;
                }

                const respuesta = await fetch(
                    `${API_URL}/api/alertas`,
                    { headers }
                );

                if (!respuesta.ok) {
                    throw new Error(
                        `Error HTTP ${respuesta.status}`
                    );
                }

                const datos = await respuesta.json();

                // Solo se contabilizan listas reales.
                const alertas = Array.isArray(datos)
                    ? datos
                    : Array.isArray(datos?.alertas)
                        ? datos.alertas
                        : null;

                if (!alertas) {
                    throw new Error(
                        "Formato de alertas no reconocido"
                    );
                }

                const cantidad = alertas.length;

                contador.textContent = cantidad > 99
                    ? "99+"
                    : String(cantidad);

                contador.hidden = cantidad === 0;

                if (campana) {
                    campana.title =
                        `${cantidad} alertas registradas`;
                }

            } catch (error) {
                console.error(
                    "No se pudo consultar el contador de alertas:",
                    error
                );

                // No mostrar un número ficticio.
                contador.hidden = true;
            }
        }

        // ==========================================
        // 2. BOTÓN CERRAR SESIÓN
        // ==========================================

        const contenido = document.getElementById(
            "main-content"
        );

        if (
            contenido &&
            !document.getElementById("cerrar-sesion")
        ) {
            const seccion = document.createElement(
                "section"
            );

            seccion.id = "seccion-cerrar-sesion";
            seccion.className = "settings-panel";

            seccion.innerHTML = `
                <div class="settings-panel-heading">
                    <div class="settings-heading-left">
                        <div class="settings-section-icon">
                            <i data-lucide="log-out"></i>
                        </div>

                        <div>
                            <h2>Sesión de usuario</h2>
                            <p>
                                Finaliza tu sesión de forma
                                segura en SMART CLASSROOM.
                            </p>
                        </div>
                    </div>
                </div>

                <div style="
                    display: flex;
                    justify-content: flex-end;
                    padding-top: 18px;
                ">
                    <button
                        type="button"
                        id="cerrar-sesion"
                        class="settings-button
                               settings-button-primary"
                        style="
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            gap: 10px;
                            min-width: 190px;
                            cursor: pointer;
                        "
                    >
                        <i data-lucide="log-out"></i>
                        <span>Cerrar sesión</span>
                    </button>
                </div>
            `;

            // Se añade después de la sección Sistema.
            contenido.appendChild(seccion);

            const boton = document.getElementById(
                "cerrar-sesion"
            );

            boton.addEventListener("click", () => {
                const confirmar = window.confirm(
                    "¿Deseas cerrar tu sesión en SMART CLASSROOM?"
                );

                if (!confirmar) return;

                // Eliminar credenciales de esta sesión.
                sessionStorage.removeItem("sc_token");

                // Volver a la pantalla de inicio.
                window.location.replace("../index.html");
            });
        }

        // ==========================================
        // 3. INICIALIZACIÓN
        // ==========================================

        actualizarAlertas();

        // Refrescar el contador cada 30 segundos.
        setInterval(actualizarAlertas, 30000);

        if (window.lucide) {
            window.lucide.createIcons();
        }
    });
})();
