// ─── AUTENTICACIÓN ────────────────────────────────────────────────────────────
// Se ejecuta último (después de todos los otros scripts).
// Verifica la sesión y muestra el login si es necesario.

(async function () {
  const overlay = document.getElementById('loginOverlay');
  const spinner = document.getElementById('loginSpinner');

  async function checkSession() {
    try {
      const r = await fetch('/api/me');
      if (r.ok) {
        const me = await r.json();
        // Mostrar nombre del motel en header
        const el = document.getElementById('motelNombre');
        if (el) el.textContent = me.motel_nombre || 'Motel 23';
        // Guardar rol para control de acceso
        window._rol = me.rol;
        return true;
      }
    } catch { /* sin conexión */ }
    return false;
  }

  const ok = await checkSession();
  if (ok) {
    overlay.style.display = 'none';
    // La app ya arrancó (initApp() está al final de core-operativo.js)
  } else {
    overlay.style.display = 'flex';
    if (spinner) spinner.style.display = 'none';
    document.getElementById('loginForm').style.display = 'flex';
  }
})();

async function handleLogin(e) {
  e.preventDefault();
  const btn   = document.getElementById('loginBtn');
  const err   = document.getElementById('loginError');
  const email = document.getElementById('loginEmail').value;
  const pass  = document.getElementById('loginPassword').value;

  btn.disabled    = true;
  btn.textContent = 'Entrando...';
  err.style.display = 'none';

  try {
    const r    = await fetch('/api/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password: pass })
    });
    const data = await r.json();

    if (r.ok) {
      // Recargar para que initApp() corra con sesión activa
      location.reload();
    } else {
      err.textContent   = data.error || 'Error al iniciar sesión';
      err.style.display = 'block';
      btn.disabled      = false;
      btn.textContent   = 'Entrar';
    }
  } catch {
    err.textContent   = 'Sin conexión con el servidor';
    err.style.display = 'block';
    btn.disabled      = false;
    btn.textContent   = 'Entrar';
  }
}

async function handleLogout() {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
}
