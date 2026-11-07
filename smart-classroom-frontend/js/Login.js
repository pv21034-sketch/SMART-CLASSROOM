
"use strict";

// ============================================================
// SMART CLASSROOM — LOGIN
// ============================================================

const API_BASE = "http://localhost:3000";
const LOGIN_ENDPOINT = "/api/auth/login";
const DASHBOARD_URL = "dashboard.html";

const body = document.body;
const pull = document.getElementById("pull");
const form = document.getElementById("loginForm");
const errorEl = document.getElementById("error");
const submit = document.getElementById("submitBtn");
const passInp = document.getElementById("password");
const idInp = document.getElementById("identifier");
const toggleBt = document.getElementById("togglePass");

// ============================================================
// 1. LÁMPARA INTERACTIVA
// ============================================================

function setLamp(on) {
  body.classList.toggle("on", on);

  pull.setAttribute("aria-pressed", String(on));

  // El formulario solo se habilita al encender la lámpara.
  form.inert = !on;

  if (on) {
    setTimeout(() => {
      if (body.classList.contains("on")) {
        idInp.focus({ preventScroll: true });
      }
    }, 700);
  }
}

pull.addEventListener("click", () => {
  pull.classList.add("tug");

  setTimeout(() => {
    pull.classList.remove("tug");
  }, 180);

  setLamp(!body.classList.contains("on"));
});

// ============================================================
// 2. MOSTRAR / OCULTAR CONTRASEÑA
// ============================================================

toggleBt.addEventListener("click", () => {
  const mostrar = passInp.type === "password";

  passInp.type = mostrar ? "text" : "password";

  toggleBt.setAttribute(
    "aria-label",
    mostrar ? "Ocultar contraseña" : "Mostrar contraseña"
  );
});

// ============================================================
// 3. MENSAJES DE ERROR
// ============================================================

function showError(mensaje) {
  errorEl.textContent = mensaje;

  form.classList.remove("shake");

  // Reiniciar la animación.
  void form.offsetWidth;

  form.classList.add("shake");
}

function clearError() {
  errorEl.textContent = "";
  form.classList.remove("shake");
}

function setLoading(loading) {
  submit.disabled = loading;
  submit.classList.toggle("loading", loading);
}

// ============================================================
// 4. PETICIÓN DE AUTENTICACIÓN
// ============================================================

async function iniciarSesion(identifier, password) {
  const respuesta = await fetch(
    API_BASE + LOGIN_ENDPOINT,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        identifier,
        password
      })
    }
  );

  if (respuesta.status === 401) {
    throw new Error("Usuario o contraseña incorrectos.");
  }

  if (respuesta.status === 403) {
    throw new Error("Tu cuenta no tiene permiso para acceder.");
  }

  if (respuesta.status === 429) {
    throw new Error(
      "Demasiados intentos. Intenta nuevamente más tarde."
    );
  }

  if (!respuesta.ok) {
    throw new Error(
      "No se pudo iniciar sesión. Error HTTP " +
      respuesta.status
    );
  }

  let data;

  try {
    data = await respuesta.json();
  } catch {
    throw new Error(
      "El servidor devolvió una respuesta no válida."
    );
  }

  // El backend debe devolver un JWT válido.
  if (
    typeof data.token !== "string" ||
    data.token.trim() === ""
  ) {
    throw new Error(
      "El servidor no devolvió un token de autenticación."
    );
  }

  return data;
}

// ============================================================
// 5. FORMULARIO DE LOGIN
// ============================================================

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearError();

  const identifier = idInp.value.trim();
  const password = passInp.value;

  if (!identifier || !password) {
    showError("Completa tu usuario y contraseña.");
    return;
  }

  setLoading(true);

  try {
    const data = await iniciarSesion(
      identifier,
      password
    );

    // Guardar el token solo durante esta sesión.
    sessionStorage.setItem("sc_token", data.token);

    // Guardar información pública del usuario.
    const usuario = data.usuario || data.user;

    if (usuario) {
      sessionStorage.setItem(
        "sc_user",
        JSON.stringify(usuario)
      );
    } else {
      sessionStorage.removeItem("sc_user");
    }

    // Acceso al dashboard.
    window.location.assign(DASHBOARD_URL);

  } catch (error) {
    const mensaje =
      error instanceof TypeError
        ? "No se pudo conectar con el servidor."
        : error.message || "Error inesperado al iniciar sesión.";

    showError(mensaje);

    // Limpiar credenciales anteriores.
    sessionStorage.removeItem("sc_token");
    sessionStorage.removeItem("sc_user");

  } finally {
    setLoading(false);
  }
});

// ============================================================
// 6. ANIMACIONES DE FÍSICA
// ============================================================

(function physics() {
  const canvas = document.getElementById("physics");

  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  const reduce = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const GLYPHS = [
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

  let w = 0;
  let h = 0;
  let items = [];

  const rand = (a, b) =>
    a + Math.random() * (b - a);

  function resize() {
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      2
    );

    w = canvas.clientWidth;
    h = canvas.clientHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;

    ctx.setTransform(
      dpr, 0, 0, dpr, 0, 0
    );
  }

  function base(type) {
    return {
      type,
      x: rand(0, w),
      y: rand(0, h),
      vx: rand(-0.22, 0.22),
      vy: rand(-0.22, 0.22),
      ph: rand(0, Math.PI * 2),
      sp: rand(0.5, 1.2),
      rot: rand(-0.5, 0.5),
      vr: rand(-0.0006, 0.0006)
    };
  }

  function spawn() {
    const area = w * h;

    const nText = Math.round(
      Math.min(26, Math.max(10, area / 52000))
    );

    const nAtom = Math.round(
      Math.min(8, Math.max(3, area / 190000))
    );

    const nWave = Math.round(
      Math.min(7, Math.max(3, area / 220000))
    );

    items = [];

    for (let i = 0; i < nText; i++) {
      const it = base("text");

      it.txt = GLYPHS[
        Math.floor(Math.random() * GLYPHS.length)
      ];

      it.size = rand(14, 26);

      items.push(it);
    }

    for (let i = 0; i < nAtom; i++) {
      const it = base("atom");

      it.r = rand(15, 26);

      it.orbits = Array.from(
        {
          length: Math.random() < 0.5 ? 2 : 3
        },
        (_, k) => ({
          tilt: (Math.PI / 3) * k + rand(0, 0.4),
          ang: rand(0, Math.PI * 2),
          spd:
            rand(0.012, 0.026) *
            (Math.random() < 0.5 ? 1 : -1)
        })
      );

      items.push(it);
    }

    for (let i = 0; i < nWave; i++) {
      const it = base("wave");

      it.len = rand(46, 84);
      it.amp = rand(5, 11);
      it.cycles = rand(1.5, 3);

      items.push(it);
    }
  }

  function drawText(it, a) {
    ctx.font =
      `600 ${it.size}px 'Outfit', system-ui, sans-serif`;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.shadowColor =
      `rgba(255, 214, 120, ${a})`;

    ctx.shadowBlur = 10;

    ctx.fillStyle =
      `rgba(255, 230, 160, ${a})`;

    ctx.fillText(it.txt, 0, 0);
  }

  function drawAtom(it, a) {
    ctx.shadowColor =
      `rgba(255, 214, 120, ${a})`;

    ctx.shadowBlur = 8;

    ctx.strokeStyle =
      `rgba(255, 224, 140, ${a * 0.75})`;

    ctx.lineWidth = 1;

    ctx.fillStyle =
      `rgba(255, 236, 170, ${a})`;

    ctx.beginPath();

    ctx.arc(
      0, 0, 2.6, 0, Math.PI * 2
    );

    ctx.fill();

    for (const o of it.orbits) {
      o.ang += o.spd;

      ctx.save();
      ctx.rotate(o.tilt);

      ctx.beginPath();

      ctx.ellipse(
        0,
        0,
        it.r,
        it.r * 0.38,
        0,
        0,
        Math.PI * 2
      );

      ctx.stroke();

      const ex =
        Math.cos(o.ang) * it.r;

      const ey =
        Math.sin(o.ang) * it.r * 0.38;

      ctx.fillStyle =
        `rgba(255, 244, 200, ${Math.min(1, a + 0.25)})`;

      ctx.beginPath();

      ctx.arc(
        ex, ey, 2, 0, Math.PI * 2
      );

      ctx.fill();

      ctx.restore();
    }
  }

  function drawWave(it, a, t) {
    ctx.shadowColor =
      `rgba(255, 214, 120, ${a})`;

    ctx.shadowBlur = 8;

    ctx.strokeStyle =
      `rgba(255, 224, 140, ${a})`;

    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";

    ctx.beginPath();

    const phase = t / 600 * it.sp;

    for (
      let x = -it.len / 2;
      x <= it.len / 2;
      x += 2
    ) {
      const k =
        (x + it.len / 2) / it.len;

      const env =
        Math.sin(k * Math.PI);

      const y =
        Math.sin(
          k * Math.PI * 2 * it.cycles -
          phase
        ) *
        it.amp *
        env;

      if (x === -it.len / 2) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  function frame(t) {
    ctx.clearRect(0, 0, w, h);

    if (body.classList.contains("on")) {
      for (const it of items) {
        it.x +=
          it.vx +
          Math.sin(t / 2400 + it.ph) * 0.1;

        it.y +=
          it.vy +
          Math.cos(t / 2800 + it.ph) * 0.1;

        it.rot += it.vr;

        const m = 60;

        if (it.x < -m) {
          it.x = w + m;
        } else if (it.x > w + m) {
          it.x = -m;
        }

        if (it.y < -m) {
          it.y = h + m;
        } else if (it.y > h + m) {
          it.y = -m;
        }

        const a =
          0.18 +
          0.32 *
          (
            0.5 +
            0.5 *
            Math.sin(
              t / 1400 * it.sp + it.ph
            )
          );

        ctx.save();

        ctx.translate(it.x, it.y);

        ctx.rotate(
          it.type === "atom"
            ? it.rot * 2
            : it.rot
        );

        if (it.type === "text") {
          drawText(it, a);
        } else if (it.type === "atom") {
          drawAtom(it, a);
        } else {
          drawWave(it, a, t);
        }

        ctx.restore();
      }
    }

    if (!reduce) {
      requestAnimationFrame(frame);
    }
  }

  resize();
  spawn();

  window.addEventListener(
    "resize",
    () => {
      resize();
      spawn();
    }
  );

  requestAnimationFrame(frame);
})();
