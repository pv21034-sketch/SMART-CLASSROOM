
"use strict";

// SMART CLASSROOM
// Control de sesión del frontend

(() => {
    const LOGIN_URL = "Login.html";
    const TOKEN_KEY = "sc_token";
    const USER_KEY = "sc_user";

    function cerrarSesion() {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        window.location.replace(LOGIN_URL);
    }

    function obtenerToken() {
        return sessionStorage.getItem(TOKEN_KEY);
    }

    function tokenVigente(token) {
        if (!token) return false;

        try {
            const partes = token.split(".");
            if (partes.length !== 3) return false;

            const base64 = partes[1]
                .replace(/-/g, "+")
                .replace(/_/g, "/");

            const payload = JSON.parse(
                atob(base64.padEnd(
                    Math.ceil(base64.length / 4) * 4,
                    "="
                ))
            );

            return (
                typeof payload.exp === "number" &&
                payload.exp * 1000 > Date.now()
            );
        } catch {
            return false;
        }
    }

    const token = obtenerToken();

    if (!tokenVigente(token)) {
        cerrarSesion();
        return;
    }

    // Funciones disponibles para las páginas internas.
    window.SmartClassroomAuth = {
        obtenerToken,
        cerrarSesion
    };

    // Agregar botón de cierre de sesión.
    function agregarBotonCerrarSesion() {
        const contenedor = document.querySelector(
            ".topbar .user-avatar"
        );

        if (!contenedor) return;

        // Evitar duplicar el botón.
        if (document.getElementById("logout-button")) {
            return;
        }

        const boton = document.createElement("button");

        boton.type = "button";
        boton.textContent = "Cerrar sesión";
        boton.id = "logout-button";
        boton.setAttribute(
            "aria-label",
            "Cerrar sesión de SMART CLASSROOM"
        );

        boton.style.cssText = `
            margin-left: 8px;
            padding: 9px 12px;
            border: 1px solid rgba(255,255,255,.15);
            border-radius: 10px;
            background: #252630;
            color: #f1ede4;
            font: inherit;
            font-size: 13px;
            cursor: pointer;
            max-width: 100%;
            white-space: normal;
            flex-shrink: 0;
        `;

        boton.addEventListener("click", cerrarSesion);
        contenedor.insertAdjacentElement("afterend", boton);
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            agregarBotonCerrarSesion
        );
    } else {
        agregarBotonCerrarSesion();
    }
})();
