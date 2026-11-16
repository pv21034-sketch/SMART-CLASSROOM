
"use strict";

// ============================================================
// SMART CLASSROOM — LOGIN
// Lámpara + autenticación + animaciones científicas
// Compatible con PC, tablet y celular
// Backend Rust desplegado en Render
// ============================================================

(() => {
    // ========================================================
    // 1. CONFIGURACIÓN
    // ========================================================

    const API_BASE = (
        window.SMART_CLASSROOM_CONFIG?.API_URL ||
        "https://smart-classroom-hitb.onrender.com"
    ).replace(/\/+$/, "");

    const TIMEOUT_MS = 90000;

    const body = document.body;
    const card = document.getElementById("card");
    const pull = document.getElementById("pull");
    const panels = document.querySelectorAll("[data-p]");
    const tabs = document.getElementById("tabs");
    const heading = document.getElementById("heading");
    const subtitle = document.getElementById("sub");

    const signin = document.querySelector('[data-p="signin"]');
    const signup = document.querySelector('[data-p="signup"]');

    if (!card || !pull || !signin || !signup) {
        console.error(
            "[SMART CLASSROOM] Faltan elementos del login."
        );
        return;
    }

    let busy = false;
    let tugging = false;

    const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    // ========================================================
    // 2. LÁMPARA INTERACTIVA
    // ========================================================

    body.classList.remove("on", "charge", "boom");

    card.inert = true;

    pull.setAttribute("aria-pressed", "false");

    function setLamp(on) {
        if (busy) return;

        body.classList.toggle("on", on);
        card.inert = !on;

        pull.setAttribute("aria-pressed", String(on));

        if (on) {
            const focusDelay = reduceMotion ? 0 : 550;

            setTimeout(() => {
                if (!body.classList.contains("on")) return;

                const input = document.getElementById("si-user");

                // Evitar que se abra automáticamente el
                // teclado virtual al encender la lámpara.
                const isTouchDevice = window.matchMedia(
                    "(pointer: coarse)"
                ).matches;

                if (!isTouchDevice) {
                    input?.focus({ preventScroll: true });
                }
            }, focusDelay);

        } else {
            // Retirar el foco antes de ocultar el formulario.
            if (card.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        }
    }

    pull.addEventListener("click", () => {
        if (busy || tugging) return;

        tugging = true;
        pull.classList.add("tug");

        setLamp(!body.classList.contains("on"));

        setTimeout(() => {
            pull.classList.remove("tug");
            tugging = false;
        }, reduceMotion ? 0 : 260);
    });

    // ========================================================
    // 3. CAMBIAR FORMULARIOS
    // ========================================================

    const panelTitles = {
        signin: [
            "Bienvenido",
            "Inicia sesión para continuar"
        ],
        signup: [
            "Crear cuenta",
            "Solicita tu acceso a SMART CLASSROOM"
        ],
        forgot: [
            "Recuperar acceso",
            "Información para recuperar tu cuenta"
        ]
    };

    function showPanel(name) {
        if (!body.classList.contains("on") || busy) return;
        if (!panelTitles[name]) return;

        panels.forEach(panel => {
            panel.hidden = panel.dataset.p !== name;
        });

        document.querySelectorAll(".tabs [data-go]")
            .forEach(button => {
                const active = button.dataset.go === name;

                button.classList.toggle("on", active);

                button.setAttribute(
                    "aria-selected",
                    String(active)
                );
            });

        if (tabs) {
            tabs.hidden = name === "forgot";
        }

        if (heading) {
            heading.textContent = panelTitles[name][0];
        }

        if (subtitle) {
            subtitle.textContent = panelTitles[name][1];
        }

        card.querySelectorAll(".error").forEach(element => {
            element.textContent = "";
            element.classList.remove("success");
        });

        // No abrir el teclado automáticamente en celulares.
        const isTouchDevice = window.matchMedia(
            "(pointer: coarse)"
        ).matches;

        if (!isTouchDevice) {
            const firstInput = card.querySelector(
                `[data-p="${name}"] input`
            );

            firstInput?.focus({ preventScroll: true });
        }
    }

    document.querySelectorAll("[data-go]").forEach(button => {
        button.addEventListener("click", event => {
            event.preventDefault();
            showPanel(button.dataset.go);
        });
    });

    // ========================================================
    // 4. MOSTRAR Y OCULTAR CONTRASEÑAS
    // ========================================================

    document.querySelectorAll(".eye").forEach(button => {
        button.addEventListener("click", () => {
            const input = button.closest(".field")
                ?.querySelector("input");

            if (!input) return;

            const visible = input.type === "password";

            input.type = visible ? "text" : "password";

            button.classList.toggle("sh", visible);

            button.setAttribute(
                "aria-pressed",
                String(visible)
            );

            button.setAttribute(
                "aria-label",
                visible
                    ? "Ocultar contraseña"
                    : "Mostrar contraseña"
            );
        });
    });

    // ========================================================
    // 5. MENSAJES DE ERROR Y ÉXITO
    // ========================================================

    function message(form, text, success = false) {
        const element = form.querySelector(".error");

        if (!element) return;

        element.textContent = text;
        element.classList.toggle("success", success);

        if (text && !success && !reduceMotion) {
            card.classList.remove("shake");

            void card.offsetWidth;

            card.classList.add("shake");
        }
    }

    // ========================================================
    // 6. ESTADO DE CARGA
    // ========================================================

    function loading(form, active) {
        const button = form.querySelector(
            'button[type="submit"]'
        );

        if (!button) return;

        button.disabled = active;
        button.classList.toggle("loading", active);
        button.setAttribute("aria-busy", String(active));
    }

    // ========================================================
    // 7. COMUNICACIÓN CON EL BACKEND RUST
    // ========================================================

    async function request(path, payload) {
        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, TIMEOUT_MS);

        try {
            const response = await fetch(API_BASE + path, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            const data = await response.json()
                .catch(() => ({}));

            if (!response.ok) {
                if (response.status === 400) {
                    throw new Error(
                        data.mensaje ||
                        data.message ||
                        data.error ||
                        "Los datos enviados no son válidos."
                    );
                }

                if (response.status === 401) {
                    throw new Error(
                        "Usuario o contraseña incorrectos."
                    );
                }

                if (response.status === 403) {
                    throw new Error(
                        "Tu cuenta no tiene permiso para acceder."
                    );
                }

                if (response.status === 429) {
                    throw new Error(
                        "Demasiados intentos. Intenta más tarde."
                    );
                }

                if (response.status >= 500) {
                    throw new Error(
                        "El servidor no pudo procesar la solicitud. " +
                        "Intenta nuevamente."
                    );
                }

                throw new Error(
                    data.mensaje ||
                    data.message ||
                    data.error ||
                    `Error HTTP ${response.status}`
                );
            }

            return data;

        } catch (error) {
            if (error.name === "AbortError") {
                throw new Error(
                    "El servidor tardó demasiado en responder. " +
                    "Intenta nuevamente."
                );
            }

            if (error instanceof TypeError) {
                throw new Error(
                    "No se pudo conectar con el backend Rust. " +
                    "Comprueba tu conexión e intenta nuevamente."
                );
            }

            throw error;

        } finally {
            clearTimeout(timeout);
        }
    }

    // ========================================================
    // 8. INICIO DE SESIÓN
    // ========================================================

    signin.addEventListener("submit", async event => {
        event.preventDefault();

        if (busy) return;

        const identifier = document.getElementById(
            "si-user"
        ).value.trim();

        const password = document.getElementById(
            "si-pass"
        ).value;

        if (!identifier || !password) {
            message(
                signin,
                "Completa tu usuario y contraseña."
            );
            return;
        }

        busy = true;

        loading(signin, true);
        message(signin, "");

        try {
            const data = await request(
                "/api/auth/login",
                { identifier, password }
            );

            if (
                typeof data.token !== "string" ||
                !data.token.trim()
            ) {
                throw new Error(
                    "El backend no devolvió un token válido."
                );
            }

            // Claves utilizadas por el resto del frontend.
            sessionStorage.setItem(
                "sc_token",
                data.token
            );

            const user = data.usuario || data.user;

            if (user) {
                sessionStorage.setItem(
                    "sc_user",
                    JSON.stringify(user)
                );
            } else {
                sessionStorage.removeItem("sc_user");
            }

            message(
                signin,
                "Acceso autorizado. Abriendo panel...",
                true
            );

            // Cerrar el teclado virtual antes de la transición.
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }

            if (reduceMotion) {
                window.location.assign("dashboard.html");
                return;
            }

            // Primera fase: carga de energía.
            body.classList.add("charge");

            setTimeout(() => {
                body.classList.remove("charge");

                // Segunda fase: destello.
                body.classList.add("boom");

                setTimeout(() => {
                    window.location.assign("dashboard.html");
                }, 900);

            }, 550);

        } catch (error) {
            message(
                signin,
                error.message || "No se pudo iniciar sesión."
            );

            busy = false;
            loading(signin, false);
        }
    });

    // ========================================================
    // 9. REGISTRO
    // ========================================================

    signup.addEventListener("submit", event => {
        event.preventDefault();

        if (busy) return;

        const username = document.getElementById(
            "su-user"
        ).value.trim();

        const password = document.getElementById(
            "su-pass"
        ).value;

        const confirmation = document.getElementById(
            "su-pass2"
        ).value;

        if (username.length < 3) {
            message(
                signup,
                "El usuario debe tener al menos 3 caracteres."
            );
            return;
        }

        if (password.length < 8) {
            message(
                signup,
                "La contraseña debe tener al menos 8 caracteres."
            );
            return;
        }

        if (password !== confirmation) {
            message(
                signup,
                "Las contraseñas no coinciden."
            );
            return;
        }

        // El registro no está implementado en el backend.
        // No enviamos solicitudes a endpoints inexistentes.
        message(
            signup,
            "El registro aún no está habilitado. " +
            "Contacta al administrador."
        );
    });

    // ========================================================
    // 10. ESTADO INICIAL DE LOS FORMULARIOS
    // ========================================================

    panels.forEach(panel => {
        panel.hidden = panel.dataset.p !== "signin";
    });

    // ========================================================
    // 11. ANIMACIONES CIENTÍFICAS
    // Fórmulas, átomos y ondas
    // ========================================================

    (function physics() {
        const canvas = document.getElementById("physics");

        if (!canvas) return;

        const ctx = canvas.getContext("2d");

        if (!ctx) return;

        const formulas = [
            "E=mc²",
            "F=ma",
            "V=IR",
            "p=mv",
            "v=d/t",
            "ΔE",
            "∇·E=ρ/ε₀",
            "λ",
            "ψ",
            "π",
            "ħ",
            "Ω",
            "Σ",
            "∞",
            "θ",
            "μ",
            "Φ",
            "∂",
            "c",
            "e⁻",
            "g=9.8",
            "Ek=½mv²",
            "Q=mcΔT"
        ];

        let width = 0;
        let height = 0;
        let objects = [];
        let animationId = null;
        let lastFrame = 0;

        const random = (min, max) =>
            min + Math.random() * (max - min);

        // ====================================================
        // 11.1. ADAPTAR CANVAS A LA PANTALLA
        // ====================================================

        function resize() {
            const dpr = Math.min(
                window.devicePixelRatio || 1,
                2
            );

            width = canvas.clientWidth;
            height = canvas.clientHeight;

            if (!width || !height) return;

            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        // ====================================================
        // 11.2. CREAR OBJETOS
        // ====================================================

        function createBase(type) {
            return {
                type,
                x: random(0, width),
                y: random(0, height),
                vx: random(-0.22, 0.22),
                vy: random(-0.22, 0.22),
                phase: random(0, Math.PI * 2),
                speed: random(0.5, 1.2),
                rotation: random(-0.5, 0.5),
                rotationSpeed: random(-0.0006, 0.0006)
            };
        }

        // ====================================================
        // 11.3. DISTRIBUCIÓN RESPONSIVE
        // ====================================================

        function spawn() {
            if (!width || !height) return;

            const area = width * height;

            // Menos objetos en celulares para reducir
            // consumo de recursos y mantener fluidez.
            const isMobile = width <= 600;

            const textCount = Math.round(
                Math.min(
                    isMobile ? 10 : 26,
                    Math.max(
                        isMobile ? 4 : 10,
                        area / 52000
                    )
                )
            );

            const atomCount = Math.round(
                Math.min(
                    isMobile ? 3 : 8,
                    Math.max(
                        isMobile ? 1 : 3,
                        area / 190000
                    )
                )
            );

            const waveCount = Math.round(
                Math.min(
                    isMobile ? 3 : 7,
                    Math.max(
                        isMobile ? 1 : 3,
                        area / 220000
                    )
                )
            );

            objects = [];

            // Fórmulas matemáticas y físicas.
            for (let i = 0; i < textCount; i++) {
                const obj = createBase("text");

                obj.text = formulas[
                    Math.floor(
                        Math.random() * formulas.length
                    )
                ];

                obj.size = random(
                    isMobile ? 12 : 14,
                    isMobile ? 19 : 26
                );

                objects.push(obj);
            }

            // Átomos.
            for (let i = 0; i < atomCount; i++) {
                const obj = createBase("atom");

                obj.radius = random(15, 26);

                obj.orbits = Array.from(
                    {
                        length: Math.random() < 0.5 ? 2 : 3
                    },
                    (_, index) => ({
                        tilt:
                            (Math.PI / 3) * index +
                            random(0, 0.4),
                        angle: random(0, Math.PI * 2),
                        speed:
                            random(0.012, 0.026) *
                            (Math.random() < 0.5 ? 1 : -1)
                    })
                );

                objects.push(obj);
            }

            // Ondas.
            for (let i = 0; i < waveCount; i++) {
                const obj = createBase("wave");

                obj.length = random(46, 84);
                obj.amplitude = random(5, 11);
                obj.cycles = random(1.5, 3);

                objects.push(obj);
            }
        }

        // ====================================================
        // 11.4. DIBUJAR FÓRMULAS
        // ====================================================

        function drawText(obj, alpha) {
            ctx.font =
                `600 ${obj.size}px 'Outfit', sans-serif`;

            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            ctx.shadowColor =
                `rgba(255,214,120,${alpha})`;

            ctx.shadowBlur = 10;

            ctx.fillStyle =
                `rgba(255,230,160,${alpha})`;

            ctx.fillText(obj.text, 0, 0);
        }

        // ====================================================
        // 11.5. DIBUJAR ÁTOMOS
        // ====================================================

        function drawAtom(obj, alpha) {
            ctx.shadowColor =
                `rgba(255,214,120,${alpha})`;

            ctx.shadowBlur = 8;
            ctx.lineWidth = 1;

            ctx.fillStyle =
                `rgba(255,236,170,${alpha})`;

            ctx.beginPath();
            ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
            ctx.fill();

            for (const orbit of obj.orbits) {
                orbit.angle += orbit.speed;

                ctx.save();
                ctx.rotate(orbit.tilt);

                ctx.strokeStyle =
                    `rgba(255,224,140,${alpha * 0.75})`;

                ctx.beginPath();

                ctx.ellipse(
                    0,
                    0,
                    obj.radius,
                    obj.radius * 0.38,
                    0,
                    0,
                    Math.PI * 2
                );

                ctx.stroke();

                const ex =
                    Math.cos(orbit.angle) * obj.radius;

                const ey =
                    Math.sin(orbit.angle) *
                    obj.radius * 0.38;

                ctx.fillStyle =
                    `rgba(255,244,200,${Math.min(
                        1,
                        alpha + 0.25
                    )})`;

                ctx.beginPath();
                ctx.arc(ex, ey, 2, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }
        }

        // ====================================================
        // 11.6. DIBUJAR ONDAS
        // ====================================================

        function drawWave(obj, alpha, time) {
            ctx.shadowColor =
                `rgba(255,214,120,${alpha})`;

            ctx.shadowBlur = 8;

            ctx.strokeStyle =
                `rgba(255,224,140,${alpha})`;

            ctx.lineWidth = 1.6;
            ctx.lineCap = "round";

            ctx.beginPath();

            const phase = time / 600 * obj.speed;

            for (
                let x = -obj.length / 2;
                x <= obj.length / 2;
                x += 2
            ) {
                const k =
                    (x + obj.length / 2) / obj.length;

                const envelope = Math.sin(k * Math.PI);

                const y =
                    Math.sin(
                        k * Math.PI * 2 *
                        obj.cycles - phase
                    ) *
                    obj.amplitude *
                    envelope;

                if (x === -obj.length / 2) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.stroke();
        }

        // ====================================================
        // 11.7. BUCLE DE ANIMACIÓN
        // ====================================================

        function frame(time) {
            animationId = requestAnimationFrame(frame);

            if (!width || !height) return;

            // Aproximadamente 30 FPS en celulares.
            const isMobile = width <= 600;

            const interval = isMobile
                ? 1000 / 30
                : 1000 / 60;

            if (time - lastFrame < interval) return;

            lastFrame = time;

            ctx.clearRect(0, 0, width, height);

            if (!body.classList.contains("on")) return;

            for (const obj of objects) {
                obj.x += obj.vx +
                    Math.sin(
                        time / 2400 + obj.phase
                    ) * 0.1;

                obj.y += obj.vy +
                    Math.cos(
                        time / 2800 + obj.phase
                    ) * 0.1;

                obj.rotation += obj.rotationSpeed;

                const margin = 60;

                if (obj.x < -margin) {
                    obj.x = width + margin;
                }

                if (obj.x > width + margin) {
                    obj.x = -margin;
                }

                if (obj.y < -margin) {
                    obj.y = height + margin;
                }

                if (obj.y > height + margin) {
                    obj.y = -margin;
                }

                const alpha =
                    0.18 +
                    0.32 * (
                        0.5 +
                        0.5 * Math.sin(
                            time / 1400 * obj.speed +
                            obj.phase
                        )
                    );

                ctx.save();

                ctx.translate(obj.x, obj.y);

                ctx.rotate(
                    obj.type === "atom"
                        ? obj.rotation * 2
                        : obj.rotation
                );

                if (obj.type === "text") {
                    drawText(obj, alpha);
                } else if (obj.type === "atom") {
                    drawAtom(obj, alpha);
                } else {
                    drawWave(obj, alpha, time);
                }

                ctx.restore();
            }
        }

        // ====================================================
        // 11.8. REDIMENSIONAR SIN ROMPER EL CANVAS
        // ====================================================

        let resizeTimer;

        window.addEventListener("resize", () => {
            clearTimeout(resizeTimer);

            resizeTimer = setTimeout(() => {
                resize();
                spawn();
            }, 150);
        });

        // Detener la animación cuando la pestaña
        // no está visible para ahorrar recursos.
        document.addEventListener(
            "visibilitychange",
            () => {
                if (document.hidden) {
                    if (animationId !== null) {
                        cancelAnimationFrame(animationId);
                        animationId = null;
                    }
                } else if (
                    !reduceMotion &&
                    animationId === null
                ) {
                    lastFrame = 0;
                    animationId = requestAnimationFrame(frame);
                }
            }
        );

        // ====================================================
        // 11.9. INICIALIZACIÓN
        // ====================================================

        resize();
        spawn();

        if (!reduceMotion) {
            animationId = requestAnimationFrame(frame);
        }
    })();

})();
