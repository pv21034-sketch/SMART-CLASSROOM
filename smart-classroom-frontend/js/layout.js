
"use strict";

// ============================================================
// SMART CLASSROOM - LAYOUT GENERAL
// Universidad de El Salvador
//
// FUNCIONALIDADES:
// - Iconos Lucide.
// - Tema claro y oscuro.
// - Navegación lateral.
// - Contador global de alertas reales.
// - Sincronización periódica con PostgreSQL.
//
// IMPORTANTE:
// - No modifica datos de Supabase.
// - No modifica las mediciones.
// - No modifica el farol animado.
// - No interfiere con las gráficas.
// ============================================================

(() => {

    // ========================================================
    // 1. CONFIGURACIÓN GENERAL
    // ========================================================

    const THEME_KEY = "smart-classroom:theme";

    // Actualizar alertas cada 30 segundos.
    const INTERVALO_ALERTAS = 30000;

    let intervaloAlertas = null;
    let consultaAlertasEnCurso = false;

    // ========================================================
    // 2. ICONOS LUCIDE
    // ========================================================

    function iniciarIconos() {

        if (
            window.lucide &&
            typeof window.lucide.createIcons === "function"
        ) {

            window.lucide.createIcons({
                attrs: {
                    "stroke-width": 2,
                    "aria-hidden": "true"
                }
            });

            console.info(
                "SMART CLASSROOM: iconos inicializados."
            );

        } else {

            console.error(
                "SMART CLASSROOM: no se pudo cargar Lucide."
            );
        }
    }

    // ========================================================
    // 3. OBTENER TEMA ACTUAL
    // ========================================================

    function temaActual() {

        return document.documentElement.getAttribute(
            "data-theme"
        ) || "dark";
    }

    // ========================================================
    // 4. APLICAR TEMA
    // ========================================================

    function aplicarTema(tema) {

        const temaSeguro =
            tema === "light" ? "light" : "dark";

        document.documentElement.setAttribute(
            "data-theme",
            temaSeguro
        );

        document.body.setAttribute(
            "data-theme",
            temaSeguro
        );

        localStorage.setItem(
            THEME_KEY,
            temaSeguro
        );

        const boton =
            document.getElementById("theme-toggle");

        if (boton) {

            boton.setAttribute(
                "aria-label",
                temaSeguro === "dark"
                    ? "Activar tema claro"
                    : "Activar tema oscuro"
            );

            boton.setAttribute(
                "aria-pressed",
                String(temaSeguro === "light")
            );

            const icono = boton.querySelector(
                "[data-lucide], svg"
            );

            if (icono) {

                const nombre =
                    temaSeguro === "dark"
                        ? "moon"
                        : "sun";

                const nuevo =
                    document.createElement("i");

                nuevo.setAttribute(
                    "data-lucide",
                    nombre
                );

                icono.replaceWith(nuevo);

                iniciarIconos();
            }
        }
    }

    // ========================================================
    // 5. INICIAR TEMA
    // ========================================================

    function iniciarTema() {

        const temaGuardado =
            localStorage.getItem(THEME_KEY);

        aplicarTema(
            temaGuardado || "dark"
        );

        const boton =
            document.getElementById("theme-toggle");

        if (!boton) {
            return;
        }

        boton.addEventListener(
            "click",
            () => {

                const siguiente =
                    temaActual() === "dark"
                        ? "light"
                        : "dark";

                aplicarTema(siguiente);
            }
        );
    }

    // ========================================================
    // 6. MENÚ LATERAL
    // ========================================================

    function iniciarMenu() {

        const boton =
            document.getElementById("menu-toggle");

        const sidebar =
            document.getElementById("sidebar");

        if (!boton || !sidebar) {
            return;
        }

        boton.addEventListener(
            "click",
            () => {

                const abierto =
                    sidebar.classList.toggle("is-open");

                document.body.classList.toggle(
                    "sidebar-open",
                    abierto
                );

                boton.setAttribute(
                    "aria-expanded",
                    String(abierto)
                );
            }
        );

        document.addEventListener(
            "keydown",
            (evento) => {

                if (evento.key !== "Escape") {
                    return;
                }

                sidebar.classList.remove(
                    "is-open"
                );

                document.body.classList.remove(
                    "sidebar-open"
                );

                boton.setAttribute(
                    "aria-expanded",
                    "false"
                );
            }
        );
    }

    // ========================================================
    // 7. NORMALIZAR ESTADO DE ALERTAS
    // ========================================================

    function normalizarEstado(estado) {

        const texto = String(
            estado ?? ""
        ).trim().toLowerCase();

        if (
            texto === "activa" ||
            texto === "activo" ||
            texto === "pendiente"
        ) {
            return "activa";
        }

        if (
            texto === "atendida" ||
            texto === "atendido" ||
            texto === "resuelta" ||
            texto === "resuelto"
        ) {
            return "atendida";
        }

        return texto;
    }

    // ========================================================
    // 8. ACTUALIZAR CAMPANITA
    // ========================================================

    function actualizarCampanita(totalActivas) {

        const contador =
            document.getElementById(
                "notification-count"
            );

        if (!contador) {
            return;
        }

        const cantidad = Math.max(
            0,
            Number(totalActivas) || 0
        );

        // Mostrar máximo 99+.
        contador.textContent =
            cantidad > 99
                ? "99+"
                : String(cantidad);

        // Accesibilidad.
        contador.setAttribute(
            "aria-label",
            `${cantidad} alertas activas`
        );

        // Guardar cantidad como atributo.
        contador.dataset.count =
            String(cantidad);

        console.info(
            `SMART CLASSROOM: ${cantidad} alertas activas.`
        );
    }

    // ========================================================
    // 9. OBTENER ALERTAS DESDE EL BACKEND
    // ========================================================

    async function consultarAlertas() {

        // Evitar solicitudes simultáneas.
        if (consultaAlertasEnCurso) {
            return;
        }

        // No consultar mientras la pestaña esté oculta.
        if (document.hidden) {
            return;
        }

        const contador =
            document.getElementById(
                "notification-count"
            );

        // Si la página no tiene campanita,
        // no es necesario consultar.
        if (!contador) {
            return;
        }

        const API =
            window.SmartClassroomAPI;

        if (
            !API ||
            typeof API.get !== "function"
        ) {

            console.warn(
                "SMART CLASSROOM: cliente API no disponible."
            );

            return;
        }

        consultaAlertasEnCurso = true;

        try {

            // Consultar alertas reales.
            const respuesta = await API.get(
                "/api/alertas"
            );

            // Admitir los formatos de respuesta
            // utilizados en el frontend.
            const registros =
                Array.isArray(respuesta)
                    ? respuesta
                    : Array.isArray(respuesta?.alertas)
                        ? respuesta.alertas
                        : Array.isArray(respuesta?.datos)
                            ? respuesta.datos
                            : Array.isArray(respuesta?.data)
                                ? respuesta.data
                                : null;

            if (!registros) {

                throw new Error(
                    "La API no devolvió una lista de alertas."
                );
            }

            // Contar únicamente las activas.
            const totalActivas =
                registros.filter(
                    alerta =>
                        normalizarEstado(
                            alerta.estado
                        ) === "activa"
                ).length;

            actualizarCampanita(
                totalActivas
            );

        } catch (error) {

            console.error(
                "SMART CLASSROOM: error al consultar alertas:",
                error
            );

            // No colocar 0 cuando falla la conexión:
            // podría ocultar alertas reales.
            contador.setAttribute(
                "title",
                "No se pudo actualizar el contador de alertas."
            );

        } finally {

            consultaAlertasEnCurso = false;
        }
    }

    // ========================================================
    // 10. INICIAR SINCRONIZACIÓN DE ALERTAS
    // ========================================================

    function iniciarAlertas() {

        const contador =
            document.getElementById(
                "notification-count"
            );

        if (!contador) {
            return;
        }

        // Primera consulta al abrir la página.
        consultarAlertas();

        // Evitar duplicar temporizadores.
        if (intervaloAlertas !== null) {

            clearInterval(
                intervaloAlertas
            );
        }

        intervaloAlertas = setInterval(
            () => {

                consultarAlertas();

            },
            INTERVALO_ALERTAS
        );

        // Actualizar al regresar a la pestaña.
        document.addEventListener(
            "visibilitychange",
            () => {

                if (!document.hidden) {
                    consultarAlertas();
                }
            }
        );

        // Actualizar al volver a enfocar la ventana.
        window.addEventListener(
            "focus",
            () => {

                consultarAlertas();
            }
        );

        console.info(
            "SMART CLASSROOM: sincronización de alertas iniciada."
        );
    }

    // ========================================================
    // 11. INICIALIZACIÓN GENERAL
    // ========================================================

    function iniciar() {

        iniciarIconos();

        iniciarTema();

        iniciarMenu();

        iniciarAlertas();

        console.info(
            "SMART CLASSROOM: layout inicializado correctamente."
        );
    }

    // ========================================================
    // 12. INICIAR AL CARGAR EL DOCUMENTO
    // ========================================================

    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            iniciar,
            {
                once: true
            }
        );

    } else {

        iniciar();
    }

})();
