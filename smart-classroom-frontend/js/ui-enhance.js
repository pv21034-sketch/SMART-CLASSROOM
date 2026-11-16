
/* ==========================================================
   SMART CLASSROOM
   Mejoras visuales del dashboard

   1. Estilo global de Chart.js
   2. Farol animado de la barra lateral
   3. Selector de período en pastillas

   No modifica la lógica de datos del backend.
   Compatible con PC, tablet y celular.
   ========================================================== */

(() => {
    "use strict";

    const motionQuery = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    );

    const prefersReducedMotion = () =>
        motionQuery.matches;

    /* ======================================
       1. CHART.JS — ESTILO GLOBAL
       ====================================== */

    const cssVar = (name, fallback) => {
        const element = document.body ||
            document.documentElement;

        const value = getComputedStyle(element)
            .getPropertyValue(name)
            .trim();

        return value || fallback;
    };

    const applyChartDefaults = () => {
        const ChartJS = window.Chart;

        if (!ChartJS?.defaults) {
            return;
        }

        const defaults = ChartJS.defaults;

        defaults.font.family = cssVar(
            "--font",
            "Outfit, system-ui, sans-serif"
        );

        defaults.font.size = 12;

        defaults.color = cssVar(
            "--chart-text",
            "#8b909c"
        );

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

        tooltip.titleColor = cssVar(
            "--tooltip-text",
            "#f4f1ea"
        );

        tooltip.bodyColor = cssVar(
            "--tooltip-text",
            "#f4f1ea"
        );

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
        const ChartJS = window.Chart;

        if (!ChartJS) {
            return;
        }

        try {
            applyChartDefaults();

            Object.values(
                ChartJS.instances || {}
            ).forEach((chart) => {
                if (!chart) {
                    return;
                }

                // Las gráficas de dashboard.js pueden
                // definir sus propios colores de ejes.
                // Se respetan esas configuraciones.
                chart.update("none");
            });

        } catch (error) {
            console.warn(
                "No se pudo actualizar el tema de las gráficas:",
                error
            );
        }
    };

    const initChartStyles = () => {
        try {
            applyChartDefaults();
        } catch (error) {
            console.warn(
                "No se pudo aplicar el estilo de Chart.js:",
                error
            );
        }

        if (typeof MutationObserver !== "undefined") {
            let refreshPending = false;

            const themeObserver = new MutationObserver(() => {
                if (refreshPending) {
                    return;
                }

                refreshPending = true;

                requestAnimationFrame(() => {
                    refreshPending = false;
                    refreshCharts();
                });
            });

            [
                document.documentElement,
                document.body
            ].filter(Boolean).forEach((element) => {
                themeObserver.observe(element, {
                    attributes: true,
                    attributeFilter: [
                        "class",
                        "data-theme"
                    ]
                });
            });
        }
    };

    /* ======================================
       2. FAROL DE LA BARRA LATERAL
       ====================================== */

    const LANTERN_HEIGHT = 46;
    const STORAGE_KEY =
        "smart-classroom:lantern-index";

    const initLantern = () => {
        const nav = document.querySelector(
            ".sidebar-nav"
        );

        if (!nav) {
            return;
        }

        // Evitar crear dos faroles.
        if (nav.querySelector(".lantern")) {
            return;
        }

        const links = Array.from(
            nav.querySelectorAll(".nav-link")
        );

        if (!links.length) {
            return;
        }

        const active =
            nav.querySelector(".nav-link.active") ||
            nav.querySelector(
                '.nav-link[aria-current="page"]'
            ) ||
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

        const swing = lantern.querySelector(
            ".lantern-swing"
        );

        let current = null;
        let lastY = 0;

        const targetY = (link) =>
            link.offsetTop +
            link.offsetHeight / 2 -
            LANTERN_HEIGHT / 2;

        const light = (link) => {
            links.forEach((item) => {
                item.classList.toggle(
                    "is-lit",
                    item === link
                );
            });
        };

        const startSwing = (direction) => {
            if (prefersReducedMotion()) {
                return;
            }

            swing.classList.remove("swing");

            // Reiniciar la animación.
            void swing.offsetWidth;

            swing.style.setProperty(
                "--dir",
                direction
            );

            swing.classList.add("swing");
        };

        const moveTo = (link, animate = true) => {
            if (!link) {
                return;
            }

            if (animate && link === current) {
                return;
            }

            const y = targetY(link);
            const direction = y >= lastY ? 1 : -1;

            const shouldAnimate =
                animate && !prefersReducedMotion();

            lantern.classList.toggle(
                "no-anim",
                !shouldAnimate
            );

            lantern.style.setProperty(
                "--lantern-y",
                `${y}px`
            );

            if (shouldAnimate) {
                startSwing(direction);
            }

            lastY = y;
            current = link;

            light(link);

            if (!shouldAnimate) {
                void lantern.offsetWidth;

                lantern.classList.remove(
                    "no-anim"
                );
            }
        };

        swing.addEventListener(
            "animationend",
            () => {
                swing.classList.remove(
                    "swing"
                );
            }
        );

        /* CONTINUIDAD ENTRE PÁGINAS */

        let startLink = active;

        try {
            const storedValue =
                sessionStorage.getItem(STORAGE_KEY);

            if (storedValue !== null) {
                const stored = Number(storedValue);

                if (
                    Number.isInteger(stored) &&
                    stored >= 0 &&
                    links[stored]
                ) {
                    startLink = links[stored];
                }
            }

        } catch (error) {
            // Se utiliza el enlace activo.
        }

        moveTo(startLink, false);

        if (startLink !== active) {
            window.setTimeout(
                () => moveTo(active, true),
                160
            );
        }

        try {
            sessionStorage.setItem(
                STORAGE_KEY,
                String(links.indexOf(active))
            );
        } catch (error) {
            // El farol sigue funcionando.
        }

        /* INTERACCIÓN CON EL MENÚ */

        links.forEach((link) => {
            link.addEventListener(
                "pointerenter",
                (event) => {
                    if (
                        event.pointerType === "mouse" ||
                        event.pointerType === "pen"
                    ) {
                        moveTo(link);
                    }
                }
            );

            link.addEventListener(
                "focus",
                () => moveTo(link)
            );

            // En pantallas táctiles, iluminar
            // el enlace seleccionado.
            link.addEventListener(
                "pointerdown",
                (event) => {
                    if (event.pointerType === "touch") {
                        moveTo(link);
                    }
                }
            );
        });

        nav.addEventListener(
            "pointerleave",
            () => moveTo(active)
        );

        nav.addEventListener(
            "focusout",
            (event) => {
                if (
                    !nav.contains(
                        event.relatedTarget
                    )
                ) {
                    moveTo(active);
                }
            }
        );

        /* REAJUSTE RESPONSIVE */

        const reposition = () => {
            moveTo(
                current || active,
                false
            );
        };

        window.addEventListener(
            "resize",
            reposition
        );

        window.addEventListener(
            "load",
            reposition
        );

        if (
            document.fonts &&
            document.fonts.ready
        ) {
            document.fonts.ready.then(
                reposition
            );
        }

        if (typeof ResizeObserver !== "undefined") {
            const resizeObserver =
                new ResizeObserver(reposition);

            resizeObserver.observe(nav);
        }
    };

    /* ======================================
       3. SELECTOR DE PERÍODO EN PASTILLAS
       ====================================== */

    const initPeriodSwitch = () => {
        const select = document.getElementById(
            "periodo-select"
        );

        if (!select) {
            return;
        }

        // No duplicar el selector visual.
        if (
            select.nextElementSibling?.classList
                .contains("segmented")
        ) {
            return;
        }

        const options = Array.from(
            select.options
        );

        if (!options.length) {
            return;
        }

        const group = document.createElement("div");

        group.className = "segmented";
        group.setAttribute(
            "role",
            "radiogroup"
        );

        group.setAttribute(
            "aria-label",
            select.getAttribute("aria-label") ||
            "Seleccionar período"
        );

        const thumb = document.createElement("span");

        thumb.className = "segmented-thumb";
        thumb.setAttribute("aria-hidden", "true");

        group.append(thumb);

        const buttons = options.map((option) => {
            const button =
                document.createElement("button");

            button.type = "button";
            button.setAttribute("role", "radio");
            button.dataset.value = option.value;
            button.textContent =
                option.textContent.trim();

            button.addEventListener(
                "click",
                () => choose(option.value)
            );

            group.append(button);

            return button;
        });

        function choose(value) {
            if (select.value === value) {
                sync();
                return;
            }

            select.value = value;

            select.dispatchEvent(
                new Event("change", {
                    bubbles: true
                })
            );

            sync();
        }

        function sync() {
            const selected =
                buttons.find(
                    (button) =>
                        button.dataset.value ===
                        select.value
                ) ||
                buttons[0];

            if (!selected) {
                return;
            }

            buttons.forEach((button) => {
                const isSelected =
                    button === selected;

                button.setAttribute(
                    "aria-checked",
                    String(isSelected)
                );

                button.tabIndex =
                    isSelected ? 0 : -1;
            });

            thumb.style.width =
                `${selected.offsetWidth}px`;

            thumb.style.transform =
                `translateX(${selected.offsetLeft}px)`;
        }

        /* NAVEGACIÓN POR TECLADO */

        group.addEventListener(
            "keydown",
            (event) => {
                const keys = [
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Home",
                    "End"
                ];

                if (!keys.includes(event.key)) {
                    return;
                }

                event.preventDefault();

                const currentIndex =
                    buttons.findIndex(
                        (button) =>
                            button.dataset.value ===
                            select.value
                    );

                let nextIndex = currentIndex;

                if (event.key === "Home") {
                    nextIndex = 0;

                } else if (event.key === "End") {
                    nextIndex =
                        buttons.length - 1;

                } else {
                    const step =
                        event.key === "ArrowLeft" ||
                        event.key === "ArrowUp"
                            ? -1
                            : 1;

                    nextIndex =
                        (
                            currentIndex +
                            step +
                            buttons.length
                        ) % buttons.length;
                }

                const next = buttons[nextIndex];

                if (!next) {
                    return;
                }

                choose(next.dataset.value);
                next.focus();
            }
        );

        /* CONSERVAR SELECT ORIGINAL */

        select.classList.add(
            "is-visually-hidden"
        );

        select.setAttribute(
            "aria-hidden",
            "true"
        );

        select.tabIndex = -1;

        select.after(group);

        select.addEventListener(
            "change",
            sync
        );

        /* ADAPTACIÓN RESPONSIVE */

        let syncPending = false;

        const scheduleSync = () => {
            if (syncPending) {
                return;
            }

            syncPending = true;

            requestAnimationFrame(() => {
                syncPending = false;
                sync();
            });
        };

        window.addEventListener(
            "resize",
            scheduleSync
        );

        if (
            document.fonts &&
            document.fonts.ready
        ) {
            document.fonts.ready.then(
                scheduleSync
            );
        }

        if (typeof ResizeObserver !== "undefined") {
            const resizeObserver =
                new ResizeObserver(scheduleSync);

            resizeObserver.observe(group);
        }

        requestAnimationFrame(sync);
    };

    /* ======================================
       4. INICIALIZACIÓN
       ====================================== */

    const start = () => {
        initChartStyles();
        initLantern();
        initPeriodSwitch();
    };

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            start,
            { once: true }
        );
    } else {
        start();
    }
})();
