
"use strict";

// ============================================================
// SMART CLASSROOM - LAYOUT GENERAL
// Compatible con PC, tablet y celular
// ============================================================

(() => {
    const THEME_KEY = "smart-classroom:theme";
    const INTERVALO_ALERTAS = 30000;

    let intervaloAlertas = null;
    let consultaAlertasEnCurso = false;

    // ========================================================
    // 1. ICONOS
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
        } else {
            console.warn(
                "SMART CLASSROOM: Lucide no disponible."
            );
        }
    }

    // ========================================================
    // 2. TEMA CLARO / OSCURO
    // ========================================================

    function temaActual() {
        return document.documentElement.getAttribute(
            "data-theme"
        ) || "dark";
    }

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

        try {
            localStorage.setItem(
                THEME_KEY,
                temaSeguro
            );
        } catch (error) {
            console.warn(
                "No se pudo guardar el tema.",
                error
            );
        }

        const boton =
            document.getElementById("theme-toggle");

        if (!boton) return;

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
            const nuevo = document.createElement("i");

            nuevo.setAttribute(
                "data-lucide",
                temaSeguro === "dark" ? "moon" : "sun"
            );

            icono.replaceWith(nuevo);
            iniciarIconos();
        }
    }

    function iniciarTema() {
        let temaGuardado = "dark";

        try {
            temaGuardado =
                localStorage.getItem(THEME_KEY) || "dark";
        } catch (error) {
            console.warn(
                "No se pudo leer el tema guardado.",
                error
            );
        }

        aplicarTema(temaGuardado);

        const boton =
            document.getElementById("theme-toggle");

        if (!boton) return;

        boton.addEventListener("click", () => {
            const siguiente =
                temaActual() === "dark"
                    ? "light"
                    : "dark";

            aplicarTema(siguiente);
        });
    }

    // ========================================================
    // 3. MENÚ RESPONSIVE
    // ========================================================

    function iniciarMenu() {
        const boton =
            document.getElementById("menu-toggle");

        const sidebar =
            document.getElementById("sidebar");

        if (!boton || !sidebar) return;

        const mediaMovil =
            window.matchMedia("(max-width: 900px)");

        // Fondo oscuro para tablet y celular.
        const fondo = document.createElement("button");

        fondo.type = "button";
        fondo.className = "mobile-sidebar-backdrop";
        fondo.hidden = true;
        fondo.tabIndex = -1;

        fondo.setAttribute(
            "aria-label",
            "Cerrar menú"
        );

        // Los estilos se incorporan aquí para mantener
        // compatibilidad con el dashboard.css existente.
        Object.assign(fondo.style, {
            position: "fixed",
            inset: "0",
            width: "100%",
            height: "100%",
            padding: "0",
            margin: "0",
            border: "0",
            borderRadius: "0",
            background: "rgba(0, 0, 0, 0.58)",
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            zIndex: "90",
            cursor: "pointer"
        });

        document.body.appendChild(fondo);

        boton.setAttribute(
            "aria-controls",
            "sidebar"
        );

        let menuAbierto = false;
        let overflowAnterior = "";

        function establecerMenu(abierto) {
            const mostrar =
                Boolean(abierto && mediaMovil.matches);

            if (mostrar && !menuAbierto) {
                overflowAnterior =
                    document.body.style.overflow;
            }

            // Mantener compatibilidad con ambas clases.
            sidebar.classList.toggle(
                "open",
                mostrar
            );

            sidebar.classList.toggle(
                "is-open",
                mostrar
            );

            document.body.classList.toggle(
                "sidebar-open",
                mostrar
            );

            boton.setAttribute(
                "aria-expanded",
                String(mostrar)
            );

            fondo.hidden = !mostrar;

            // Evitar desplazamiento del contenido
            // mientras el menú móvil está abierto.
            if (mostrar) {
                document.body.style.overflow = "hidden";
            } else if (menuAbierto) {
                document.body.style.overflow =
                    overflowAnterior;
            }

            menuAbierto = mostrar;

            // Impedir que los elementos del menú oculto
            // reciban el foco del teclado.
            if (mostrar) {
                sidebar.removeAttribute("inert");
            } else if (mediaMovil.matches) {
                sidebar.setAttribute("inert", "");
            } else {
                sidebar.removeAttribute("inert");
            }
        }

        // Abrir y cerrar desde el botón hamburguesa.
        boton.addEventListener("click", () => {
            establecerMenu(!menuAbierto);
        });

        // Cerrar al tocar el fondo oscuro.
        fondo.addEventListener("click", () => {
            establecerMenu(false);
            boton.focus();
        });

        // Cerrar con Escape.
        document.addEventListener(
            "keydown",
            (evento) => {
                if (
                    evento.key === "Escape" &&
                    menuAbierto
                ) {
                    establecerMenu(false);
                    boton.focus();
                }
            }
        );

        // Cerrar después de seleccionar una sección.
        sidebar.querySelectorAll(
            "a[href]"
        ).forEach((enlace) => {
            enlace.addEventListener(
                "click",
                () => establecerMenu(false)
            );
        });

        // Al cambiar entre móvil y escritorio,
        // restaurar el estado correcto del menú.
        function sincronizarPantalla() {
            establecerMenu(false);
        }

        if (
            typeof mediaMovil.addEventListener ===
            "function"
        ) {
            mediaMovil.addEventListener(
                "change",
                sincronizarPantalla
            );
        } else {
            mediaMovil.addListener(
                sincronizarPantalla
            );
        }

        establecerMenu(false);
    }

    // ========================================================
    // 4. ALERTAS
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

    function actualizarCampanita(totalActivas) {
        const contador =
            document.getElementById(
                "notification-count"
            );

        if (!contador) return;

        const cantidad = Math.max(
            0,
            Number(totalActivas) || 0
        );

        contador.textContent =
            cantidad > 99
                ? "99+"
                : String(cantidad);

        contador.setAttribute(
            "aria-label",
            `${cantidad} alertas activas`
        );

        contador.dataset.count =
            String(cantidad);

        contador.removeAttribute("title");
    }

    async function consultarAlertas() {
        if (consultaAlertasEnCurso) return;
        if (document.hidden) return;

        const contador =
            document.getElementById(
                "notification-count"
            );

        if (!contador) return;

        const API = window.SmartClassroomAPI;

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
            const respuesta = await API.get(
                "/api/alertas"
            );

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

            const totalActivas =
                registros.filter(
                    alerta =>
                        normalizarEstado(
                            alerta.estado
                        ) === "activa"
                ).length;

            actualizarCampanita(totalActivas);

        } catch (error) {
            console.error(
                "Error al consultar alertas:",
                error
            );

            contador.setAttribute(
                "title",
                "No se pudo actualizar el contador."
            );

        } finally {
            consultaAlertasEnCurso = false;
        }
    }

    function iniciarAlertas() {
        const contador =
            document.getElementById(
                "notification-count"
            );

        if (!contador) return;

        consultarAlertas();

        if (intervaloAlertas !== null) {
            clearInterval(intervaloAlertas);
        }

        intervaloAlertas = setInterval(
            consultarAlertas,
            INTERVALO_ALERTAS
        );

        document.addEventListener(
            "visibilitychange",
            () => {
                if (!document.hidden) {
                    consultarAlertas();
                }
            }
        );

        window.addEventListener(
            "focus",
            consultarAlertas
        );
    }

    // ========================================================
    // 5. INICIALIZACIÓN
    // ========================================================

    function iniciar() {
        iniciarIconos();
        iniciarTema();
        iniciarMenu();
        iniciarAlertas();

        console.info(
            "SMART CLASSROOM: layout inicializado."
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            iniciar,
            { once: true }
        );
    } else {
        iniciar();
    }
})();
