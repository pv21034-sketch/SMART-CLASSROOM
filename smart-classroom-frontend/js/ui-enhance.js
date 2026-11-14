/* ==========================================================
   SMART CLASSROOM
   Mejoras visuales del dashboard (no toca tu lógica de datos)

   1. Estilo global de Chart.js (debe cargarse ANTES de dashboard.js)
   2. Farol de la barra lateral
   3. Selector de período en pastillas
   ========================================================== */

(() => {
    "use strict";

    const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    /* ======================================
       1. CHART.JS — ESTILO GLOBAL
       Los colores salen de las variables CSS,
       así que respetan el tema claro/oscuro.
    ====================================== */

    const cssVar = (name, fallback) => {
        const value = getComputedStyle(document.body)
            .getPropertyValue(name)
            .trim();

        return value || fallback;
    };

    const applyChartDefaults = () => {
        if (!window.Chart) return;

        const defaults = Chart.defaults;

        defaults.font.family = cssVar(
            "--font",
            "Outfit, system-ui, sans-serif"
        );
        defaults.font.size = 12;
        defaults.color = cssVar("--chart-text", "#8b909c");
        defaults.borderColor = cssVar(
            "--chart-grid",
            "rgba(255,255,255,0.07)"
        );

        defaults.interaction.mode = "index";
        defaults.interaction.intersect = false;

        defaults.elements.line.tension = 0.38;
        defaults.elements.line.borderWidth = 2.5;
        defaults.elements.point.radius = 0;
        defaults.elements.point.hoverRadius = 5;
        defaults.elements.point.hitRadius = 14;

        defaults.plugins.legend.labels.usePointStyle = true;
        defaults.plugins.legend.labels.boxWidth = 8;

        const tooltip = defaults.plugins.tooltip;
        tooltip.backgroundColor = cssVar(
            "--tooltip-bg",
            "rgba(20,22,27,0.94)"
        );
        tooltip.titleColor = cssVar("--tooltip-text", "#f4f1ea");
        tooltip.bodyColor = cssVar("--tooltip-text", "#f4f1ea");
        tooltip.borderColor = cssVar(
            "--tooltip-border",
            "rgba(255,255,255,0.12)"
        );
        tooltip.borderWidth = 1;
        tooltip.padding = 12;
        tooltip.cornerRadius = 10;
        tooltip.boxPadding = 4;
    };

    const refreshCharts = () => {
        try {
            applyChartDefaults();

            Object.values(Chart.instances || {}).forEach((chart) => {
                chart.update("none");
            });
        } catch (error) {
            console.warn("No se pudo actualizar el tema de las gráficas", error);
        }
    };

    try {
        applyChartDefaults();
    } catch (error) {
        console.warn("No se pudo aplicar el estilo de Chart.js", error);
    }

    // Si layout.js cambia el tema, las gráficas se repintan solas
    const themeObserver = new MutationObserver(refreshCharts);

    [document.documentElement, document.body].forEach((element) => {
        themeObserver.observe(element, {
            attributes: true,
            attributeFilter: ["class", "data-theme"]
        });
    });

    /* ======================================
       2. FAROL DE LA BARRA LATERAL
       - Sigue al enlace sobre el que pasas el mouse o el foco.
       - Al salir, vuelve al enlace de la página actual.
       - Al cambiar de página, parte desde donde estaba
         en la página anterior y se desliza hasta su sitio.
    ====================================== */

    const LANTERN_HEIGHT = 46;
    const STORAGE_KEY = "smart-classroom:lantern-index";

    const initLantern = () => {
        const nav = document.querySelector(".sidebar-nav");
        if (!nav) return;

        const links = Array.from(nav.querySelectorAll(".nav-link"));
        if (!links.length) return;

        const active =
            nav.querySelector(".nav-link.active") ||
            nav.querySelector('.nav-link[aria-current="page"]') ||
            links[0];

        const lantern = document.createElement("div");
        lantern.className = "lantern";
        lantern.setAttribute("aria-hidden", "true");
        lantern.innerHTML = `
            <span class="lantern-halo"></span>
            <span class="lantern-swing">
                <span class="lantern-cap"></span>
                <span class="lantern-glass"></span>
                <span class="lantern-base"></span>
            </span>
        `;

        nav.prepend(lantern);
        nav.classList.add("lantern-on");

        const swing = lantern.querySelector(".lantern-swing");

        let current = null;
        let lastY = 0;

        const targetY = (link) =>
            link.offsetTop + link.offsetHeight / 2 - LANTERN_HEIGHT / 2;

        const light = (link) => {
            links.forEach((item) => {
                item.classList.toggle("is-lit", item === link);
            });
        };

        const startSwing = (direction) => {
            if (prefersReducedMotion) return;

            swing.classList.remove("swing");
            void swing.offsetWidth; // reinicia la animación
            swing.style.setProperty("--dir", direction);
            swing.classList.add("swing");
        };

        const moveTo = (link, animate = true) => {
            if (!link || (animate && link === current)) return;

            const y = targetY(link);
            const direction = y >= lastY ? 1 : -1;

            lantern.classList.toggle("no-anim", !animate);
            lantern.style.setProperty("--lantern-y", `${y}px`);

            if (animate) startSwing(direction);

            lastY = y;
            current = link;
            light(link);

            if (!animate) {
                void lantern.offsetWidth;
                lantern.classList.remove("no-anim");
            }
        };

        swing.addEventListener("animationend", () => {
            swing.classList.remove("swing");
        });

        /* --- Posición inicial: continuidad entre páginas --- */

        let startLink = active;

        try {
            const stored = Number(sessionStorage.getItem(STORAGE_KEY));

            if (Number.isInteger(stored) && links[stored]) {
                startLink = links[stored];
            }
        } catch (error) {
            /* sessionStorage no disponible: se usa el enlace activo */
        }

        moveTo(startLink, false);

        if (startLink !== active) {
            window.setTimeout(() => moveTo(active, true), 160);
        }

        try {
            sessionStorage.setItem(STORAGE_KEY, String(links.indexOf(active)));
        } catch (error) {
            /* nada que hacer */
        }

        /* --- Interacción --- */

        links.forEach((link) => {
            link.addEventListener("pointerenter", (event) => {
                if (event.pointerType === "mouse") moveTo(link);
            });

            link.addEventListener("focus", () => moveTo(link));
        });

        nav.addEventListener("pointerleave", () => moveTo(active));

        nav.addEventListener("focusout", (event) => {
            if (!nav.contains(event.relatedTarget)) moveTo(active);
        });

        /* --- Reajuste si cambia el layout --- */

        const reposition = () => moveTo(current || active, false);

        window.addEventListener("resize", reposition);
        window.addEventListener("load", reposition);

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(reposition);
        }
    };

    /* ======================================
       3. SELECTOR DE PERÍODO EN PASTILLAS
       El <select id="periodo-select"> se conserva (oculto):
       al pulsar una pastilla se cambia su valor y se dispara
       el evento "change", así tu dashboard.js sigue igual.
    ====================================== */

    const initPeriodSwitch = () => {
        const select = document.getElementById("periodo-select");
        if (!select) return;

        const group = document.createElement("div");
        group.className = "segmented";
        group.setAttribute("role", "radiogroup");
        group.setAttribute(
            "aria-label",
            select.getAttribute("aria-label") || "Seleccionar período"
        );

        const thumb = document.createElement("span");
        thumb.className = "segmented-thumb";
        group.append(thumb);

        const buttons = Array.from(select.options).map((option) => {
            const button = document.createElement("button");

            button.type = "button";
            button.setAttribute("role", "radio");
            button.dataset.value = option.value;
            button.textContent = option.textContent.trim();

            button.addEventListener("click", () => choose(option.value));

            group.append(button);
            return button;
        });

        function choose(value) {
            if (select.value === value) return;

            select.value = value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            sync();
        }

        function sync() {
            const selected =
                buttons.find((button) => button.dataset.value === select.value) ||
                buttons[0];

            buttons.forEach((button) => {
                const isSelected = button === selected;

                button.setAttribute("aria-checked", String(isSelected));
                button.tabIndex = isSelected ? 0 : -1;
            });

            thumb.style.width = `${selected.offsetWidth}px`;
            thumb.style.transform = `translateX(${selected.offsetLeft}px)`;
        }

        group.addEventListener("keydown", (event) => {
            const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
            if (!keys.includes(event.key)) return;

            event.preventDefault();

            const step =
                event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
            const index = buttons.findIndex(
                (button) => button.dataset.value === select.value
            );
            const next = buttons[(index + step + buttons.length) % buttons.length];

            choose(next.dataset.value);
            next.focus();
        });

        select.classList.add("is-visually-hidden");
        select.setAttribute("aria-hidden", "true");
        select.tabIndex = -1;
        select.after(group);

        select.addEventListener("change", sync);
        window.addEventListener("resize", sync);

        requestAnimationFrame(sync);

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(sync);
        }
    };

    /* ======================================
       INICIO
    ====================================== */

    const start = () => {
        initLantern();
        initPeriodSwitch();
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();