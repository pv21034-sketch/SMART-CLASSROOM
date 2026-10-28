// ================== CONFIGURACIÓN (ajusta a tu backend) ==================
const API_BASE       = 'http://localhost:3000';   // URL de tu backend Axum
const LOGIN_ENDPOINT = '/api/auth/login';         // ruta de login
const DASHBOARD_URL  = 'dashboard.html';          // a dónde ir tras iniciar sesión (misma carpeta pages/)
// Cuerpo que se envía: { identifier, password }. Cámbialo aquí si tu schema usa otros nombres.
const buildPayload = (identifier, password) => ({ identifier, password });
// =========================================================================

const body     = document.body;
const pull     = document.getElementById('pull');
const form     = document.getElementById('loginForm');
const errorEl  = document.getElementById('error');
const submit   = document.getElementById('submitBtn');
const passInp  = document.getElementById('password');
const idInp    = document.getElementById('identifier');
const toggleBt = document.getElementById('togglePass');

// ---------- Lámpara ----------
function setLamp(on) {
  body.classList.toggle('on', on);
  pull.setAttribute('aria-pressed', String(on));
  form.inert = !on;
  if (on) setTimeout(() => idInp.focus({ preventScroll: true }), 700);
}

pull.addEventListener('click', () => {
  pull.classList.add('tug');
  setTimeout(() => pull.classList.remove('tug'), 180);
  setLamp(!body.classList.contains('on'));
});

// ---------- Mostrar / ocultar contraseña ----------
toggleBt.addEventListener('click', () => {
  const show = passInp.type === 'password';
  passInp.type = show ? 'text' : 'password';
  toggleBt.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
});

// ---------- Login ----------
function showError(msg) {
  errorEl.textContent = msg;
  form.classList.remove('shake');
  void form.offsetWidth;            // reinicia la animación
  form.classList.add('shake');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';

  const identifier = idInp.value.trim();
  const password   = passInp.value;

  if (!identifier || !password) {
    showError('Completa tu usuario y contraseña.');
    return;
  }

  submit.disabled = true;
  submit.classList.add('loading');

  try {
    const res = await fetch(API_BASE + LOGIN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(identifier, password))
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error('Usuario o contraseña incorrectos.');
    }
    if (!res.ok) {
      throw new Error('No se pudo iniciar sesión (error ' + res.status + ').');
    }

    const data = await res.json().catch(() => ({}));
    if (data.token) sessionStorage.setItem('sc_token', data.token);
    if (data.usuario || data.user) {
      sessionStorage.setItem('sc_user', JSON.stringify(data.usuario || data.user));
    }

    window.location.href = DASHBOARD_URL;
  } catch (err) {
    const offline = err instanceof TypeError;  // fallo de red / CORS
    showError(offline ? 'No se pudo conectar con el servidor.' : err.message);
    submit.disabled = false;
    submit.classList.remove('loading');
  }
});

// ---------- Física flotante (átomos, fórmulas y ondas) ----------
(function physics() {
  const canvas = document.getElementById('physics');
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GLYPHS = [
    'E=mc²', 'F=ma', 'V=IR', 'p=mv', 'v=d/t', 'ΔE', '∇·E=ρ/ε₀', 'λ', 'ψ', 'π', 'ħ',
    'Ω', 'Σ', '∞', 'θ', 'μ', 'Φ', '∂', 'c', 'e⁻', 'g=9.8', 'Ek=½mv²', 'Q=mcΔT'
  ];
  let w, h, items = [];

  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function base(type) {
    return {
      type,
      x: rand(0, w), y: rand(0, h),
      vx: rand(-.22, .22), vy: rand(-.22, .22),
      ph: rand(0, Math.PI * 2), sp: rand(.5, 1.2),
      rot: rand(-.5, .5), vr: rand(-.0006, .0006)
    };
  }

  function spawn() {
    const area = w * h;
    const nText  = Math.round(Math.min(26, Math.max(10, area / 52000)));
    const nAtom  = Math.round(Math.min(8,  Math.max(3,  area / 190000)));
    const nWave  = Math.round(Math.min(7,  Math.max(3,  area / 220000)));
    items = [];

    for (let i = 0; i < nText; i++) {
      const it = base('text');
      it.txt = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      it.size = rand(14, 26);
      items.push(it);
    }
    for (let i = 0; i < nAtom; i++) {
      const it = base('atom');
      it.r = rand(15, 26);
      it.orbits = Array.from({ length: Math.random() < .5 ? 2 : 3 }, (_, k) => ({
        tilt: (Math.PI / 3) * k + rand(0, .4),
        ang: rand(0, Math.PI * 2),
        spd: rand(.012, .026) * (Math.random() < .5 ? 1 : -1)
      }));
      items.push(it);
    }
    for (let i = 0; i < nWave; i++) {
      const it = base('wave');
      it.len = rand(46, 84);
      it.amp = rand(5, 11);
      it.cycles = rand(1.5, 3);
      items.push(it);
    }
  }

  function drawText(it, a) {
    ctx.font = `600 ${it.size}px 'Outfit', system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = `rgba(255, 214, 120, ${a})`;
    ctx.shadowBlur = 10;
    ctx.fillStyle = `rgba(255, 230, 160, ${a})`;
    ctx.fillText(it.txt, 0, 0);
  }

  function drawAtom(it, a) {
    ctx.shadowColor = `rgba(255, 214, 120, ${a})`;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = `rgba(255, 224, 140, ${a * .75})`;
    ctx.lineWidth = 1;
    // núcleo
    ctx.fillStyle = `rgba(255, 236, 170, ${a})`;
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    for (const o of it.orbits) {
      o.ang += o.spd;
      ctx.save();
      ctx.rotate(o.tilt);
      ctx.beginPath();
      ctx.ellipse(0, 0, it.r, it.r * .38, 0, 0, Math.PI * 2);
      ctx.stroke();
      // electrón
      const ex = Math.cos(o.ang) * it.r, ey = Math.sin(o.ang) * it.r * .38;
      ctx.fillStyle = `rgba(255, 244, 200, ${Math.min(1, a + .25)})`;
      ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawWave(it, a, t) {
    ctx.shadowColor = `rgba(255, 214, 120, ${a})`;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = `rgba(255, 224, 140, ${a})`;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const phase = t / 600 * it.sp;
    for (let x = -it.len / 2; x <= it.len / 2; x += 2) {
      const k = (x + it.len / 2) / it.len;
      const env = Math.sin(k * Math.PI);               // se desvanece en los extremos
      const y = Math.sin(k * Math.PI * 2 * it.cycles - phase) * it.amp * env;
      x === -it.len / 2 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function frame(t) {
    ctx.clearRect(0, 0, w, h);
    if (body.classList.contains('on')) {
      for (const it of items) {
        it.x += it.vx + Math.sin(t / 2400 + it.ph) * .1;
        it.y += it.vy + Math.cos(t / 2800 + it.ph) * .1;
        it.rot += it.vr;
        const m = 60;
        if (it.x < -m) it.x = w + m; else if (it.x > w + m) it.x = -m;
        if (it.y < -m) it.y = h + m; else if (it.y > h + m) it.y = -m;

        const a = .18 + .32 * (.5 + .5 * Math.sin(t / 1400 * it.sp + it.ph));
        ctx.save();
        ctx.translate(it.x, it.y);
        if (it.type !== 'atom') ctx.rotate(it.rot);
        else ctx.rotate(it.rot * 2);
        if (it.type === 'text') drawText(it, a);
        else if (it.type === 'atom') drawAtom(it, a);
        else drawWave(it, a, t);
        ctx.restore();
      }
    }
    if (!reduce) requestAnimationFrame(frame);
  }

  resize(); spawn();
  window.addEventListener('resize', () => { resize(); spawn(); });
  requestAnimationFrame(frame);
})();