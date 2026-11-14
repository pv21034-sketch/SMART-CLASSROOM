
"use strict";

// ================================================
// SMART CLASSROOM — LOGIN
// Lámpara + autenticación + animaciones físicas
// ================================================

(() => {
  const API_BASE =
    window.SMART_CLASSROOM_CONFIG?.API_URL ||
    "http://localhost:3000";

  const body = document.body;
  const card = document.getElementById("card");
  const pull = document.getElementById("pull");
  const panels = document.querySelectorAll("[data-p]");
  const tabs = document.getElementById("tabs");
  const heading = document.getElementById("heading");
  const subtitle = document.getElementById("sub");

  let busy = false;
  let tugging = false;

  // ================================================
  // 1. LÁMPARA
  // ================================================

  body.classList.remove("on", "charge", "boom");
  card.inert = true;
  pull.setAttribute("aria-pressed", "false");

  function setLamp(on) {
    if (busy) return;

    body.classList.toggle("on", on);
    card.inert = !on;
    pull.setAttribute("aria-pressed", String(on));

    if (on) {
      setTimeout(() => {
        if (body.classList.contains("on")) {
          document.getElementById("si-user")
            .focus({ preventScroll: true });
        }
      }, 550);
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
    }, 260);
  });

  // ================================================
  // 2. CAMBIAR FORMULARIOS
  // ================================================

  function showPanel(name) {
    if (!body.classList.contains("on") || busy) return;

    const titles = {
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

    if (!titles[name]) return;

    panels.forEach(panel => {
      panel.hidden = panel.dataset.p !== name;
    });

    document.querySelectorAll(".tabs [data-go]")
      .forEach(button => {
        const active = button.dataset.go === name;
        button.classList.toggle("on", active);
        button.setAttribute("aria-selected", String(active));
      });

    tabs.hidden = name === "forgot";
    heading.textContent = titles[name][0];
    subtitle.textContent = titles[name][1];

    card.querySelectorAll(".error").forEach(el => {
      el.textContent = "";
      el.classList.remove("success");
    });
  }

  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      showPanel(button.dataset.go);
    });
  });

  // ================================================
  // 3. MOSTRAR Y OCULTAR CONTRASEÑAS
  // ================================================

  document.querySelectorAll(".eye").forEach(button => {
    button.addEventListener("click", () => {
      const input = button.closest(".field")
        ?.querySelector("input");

      if (!input) return;

      const visible = input.type === "password";

      input.type = visible ? "text" : "password";
      button.classList.toggle("sh", visible);

      button.setAttribute("aria-pressed", String(visible));
      button.setAttribute(
        "aria-label",
        visible ? "Ocultar contraseña" : "Mostrar contraseña"
      );
    });
  });

  // ================================================
  // 4. MENSAJES Y CARGA
  // ================================================

  function message(form, text, success = false) {
    const el = form.querySelector(".error");
    if (!el) return;

    el.textContent = text;
    el.classList.toggle("success", success);

    if (text && !success) {
      card.classList.remove("shake");
      void card.offsetWidth;
      card.classList.add("shake");
    }
  }

  function loading(form, active) {
    const button = form.querySelector(
      'button[type="submit"]'
    );

    if (!button) return;

    button.disabled = active;
    button.classList.toggle("loading", active);
  }

  // ================================================
  // 5. COMUNICACIÓN CON EL BACKEND RUST
  // ================================================

  async function request(path, payload) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 12000);

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
          "El servidor tardó demasiado en responder."
        );
      }

      if (error instanceof TypeError) {
        throw new Error(
          "No se pudo conectar con el backend Rust."
        );
      }

      throw error;

    } finally {
      clearTimeout(timeout);
    }
  }

  // ================================================
  // 6. INICIO DE SESIÓN
  // ================================================

  const signin = document.querySelector(
    '[data-p="signin"]'
  );

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
      // Los nombres deben coincidir con el schema Rust.
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

      // Sesión de la pestaña actual.
      sessionStorage.setItem("sc_token", data.token);

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

      // Animación de acceso.
      body.classList.add("charge");

      setTimeout(() => {
        body.classList.remove("charge");
        body.classList.add("boom");

        setTimeout(() => {
          window.location.assign("dashboard.html");
        }, 900);
      }, 550);

    } catch (error) {
      sessionStorage.removeItem("sc_token");
      sessionStorage.removeItem("sc_user");

      message(
        signin,
        error.message || "No se pudo iniciar sesión."
      );

      busy = false;
      loading(signin, false);
    }
  });

  // ================================================
  // 7. REGISTRO
  // ================================================

  const signup = document.querySelector(
    '[data-p="signup"]'
  );

  signup.addEventListener("submit", event => {
    event.preventDefault();

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

    message(
      signup,
      "El registro aún no está habilitado. Contacta al administrador."
    );
  });

  // ================================================
  // 8. ESTADO INICIAL
  // ================================================

  panels.forEach(panel => {
    panel.hidden = panel.dataset.p !== "signin";
  });

  // ================================================
  // 9. ANIMACIONES CIENTÍFICAS
  // Fórmulas, átomos y ondas del login original
  // ================================================

  (function physics() {
    const canvas = document.getElementById("physics");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const formulas = [
      "E=mc²", "F=ma", "V=IR", "p=mv",
      "v=d/t", "ΔE", "∇·E=ρ/ε₀",
      "λ", "ψ", "π", "ħ", "Ω",
      "Σ", "∞", "θ", "μ", "Φ",
      "∂", "c", "e⁻", "g=9.8",
      "Ek=½mv²", "Q=mcΔT"
    ];

    let width = 0;
    let height = 0;
    let objects = [];

    const random = (min, max) =>
      min + Math.random() * (max - min);

    function resize() {
      const dpr = Math.min(
        window.devicePixelRatio || 1, 2
      );

      width = canvas.clientWidth;
      height = canvas.clientHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

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

    function spawn() {
      const area = width * height;

      const textCount = Math.round(
        Math.min(26, Math.max(10, area / 52000))
      );

      const atomCount = Math.round(
        Math.min(8, Math.max(3, area / 190000))
      );

      const waveCount = Math.round(
        Math.min(7, Math.max(3, area / 220000))
      );

      objects = [];

      // Fórmulas físicas
      for (let i = 0; i < textCount; i++) {
        const obj = createBase("text");

        obj.text = formulas[
          Math.floor(Math.random() * formulas.length)
        ];

        obj.size = random(14, 26);
        objects.push(obj);
      }

      // Átomos con electrones
      for (let i = 0; i < atomCount; i++) {
        const obj = createBase("atom");

        obj.radius = random(15, 26);
        obj.orbits = Array.from(
          { length: Math.random() < 0.5 ? 2 : 3 },
          (_, index) => ({
            tilt: (Math.PI / 3) * index + random(0, 0.4),
            angle: random(0, Math.PI * 2),
            speed: random(0.012, 0.026) *
              (Math.random() < 0.5 ? 1 : -1)
          })
        );

        objects.push(obj);
      }

      // Ondas
      for (let i = 0; i < waveCount; i++) {
        const obj = createBase("wave");

        obj.length = random(46, 84);
        obj.amplitude = random(5, 11);
        obj.cycles = random(1.5, 3);

        objects.push(obj);
      }
    }

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

    function drawAtom(obj, alpha) {
      ctx.shadowColor =
        `rgba(255,214,120,${alpha})`;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1;

      ctx.fillStyle =
        `rgba(255,236,170,${alpha})`;

      // Núcleo
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();

      // Órbitas
      for (const orbit of obj.orbits) {
        orbit.angle += orbit.speed;

        ctx.save();
        ctx.rotate(orbit.tilt);

        ctx.strokeStyle =
          `rgba(255,224,140,${alpha * .75})`;

        ctx.beginPath();
        ctx.ellipse(
          0, 0,
          obj.radius,
          obj.radius * .38,
          0, 0,
          Math.PI * 2
        );
        ctx.stroke();

        // Electrón
        const ex = Math.cos(orbit.angle) * obj.radius;
        const ey = Math.sin(orbit.angle) *
          obj.radius * .38;

        ctx.fillStyle =
          `rgba(255,244,200,${Math.min(1,alpha+.25)})`;

        ctx.beginPath();
        ctx.arc(ex, ey, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

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
        const k = (x + obj.length / 2) /
          obj.length;

        const envelope = Math.sin(k * Math.PI);

        const y = Math.sin(
          k * Math.PI * 2 * obj.cycles - phase
        ) * obj.amplitude * envelope;

        if (x === -obj.length / 2) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }

    function frame(time) {
      ctx.clearRect(0, 0, width, height);

      if (body.classList.contains("on")) {
        for (const obj of objects) {
          obj.x += obj.vx +
            Math.sin(time / 2400 + obj.phase) * .1;

          obj.y += obj.vy +
            Math.cos(time / 2800 + obj.phase) * .1;

          obj.rotation += obj.rotationSpeed;

          const margin = 60;

          if (obj.x < -margin) obj.x = width + margin;
          if (obj.x > width + margin) obj.x = -margin;
          if (obj.y < -margin) obj.y = height + margin;
          if (obj.y > height + margin) obj.y = -margin;

          const alpha = .18 + .32 * (
            .5 + .5 * Math.sin(
              time / 1400 * obj.speed + obj.phase
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

      if (!reduceMotion) {
        requestAnimationFrame(frame);
      }
    }

    resize();
    spawn();

    window.addEventListener("resize", () => {
      resize();
      spawn();
    });

    if (!reduceMotion) {
      requestAnimationFrame(frame);
    }
  })();

})();
