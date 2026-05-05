// ─── MODULO RRHH — Cuaderno de cuenta por empleado (Homebase-inspired) ─────
let empleados = [];
let selectedEmpleadoId = null;
let personalTab = 'lista';
let rrhhView = 'team'; // 'team' | 'profile'

// ─── TABS SIDEBAR (mantener compatibilidad) ────────────────────────────────
const PERSONAL_TABS = ['lista', 'consumo', 'movimiento', 'cuenta'];

function setPersonalTab(tab) {
  personalTab = tab;
  PERSONAL_TABS.forEach(t => {
    const btn = document.getElementById('ptab-' + t);
    const content = document.getElementById('ptab-' + t + '-content');
    if (btn) {
      if (t === tab) {
        btn.style.background = 'var(--accent)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--accent)';
      } else {
        btn.style.background = 'var(--surface2)'; btn.style.color = 'var(--text2)'; btn.style.borderColor = 'var(--border)';
      }
    }
    if (content) content.style.display = t === tab ? '' : 'none';
  });

  if (tab === 'lista') renderEmpleadosList();
  if (tab === 'consumo') { fillEmpleadoSelect('consumo-empleado-select'); renderPersonalPanel(); }
  if (tab === 'movimiento') fillEmpleadoSelect('mov-empleado-select');
  if (tab === 'cuenta') { fillEmpleadoSelect('cuenta-empleado-select'); renderCuenta(); }
}

// ─── CARGAR EMPLEADOS ──────────────────────────────────────────────────────
async function loadEmpleados() {
  try {
    empleados = await api('personal');
  } catch (e) {
    empleados = [];
  }
}

function pushRrhhCajaEgreso(egreso) {
  if (!egreso) return;
  const caja = getCajaData();
  caja.egresos.push({
    motivo: egreso.motivo,
    monto: egreso.monto,
    ts: Date.now(),
    source: 'rrhh',
    movimientoId: egreso.movimientoId || null
  });
  saveCajaData(caja);
  if (typeof renderCaja === 'function') renderCaja();
}

function revertRrhhCajaEgreso(reversion) {
  if (!reversion) return;
  const caja = getCajaData();
  let idx = caja.egresos.findIndex(e => e.source === 'rrhh' && e.movimientoId === reversion.movimientoId);

  // Compatibilidad conservadora con egresos viejos sin metadata:
  // solo borrar si existe una sola coincidencia exacta.
  if (idx < 0) {
    const matches = caja.egresos
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.motivo === reversion.motivo && Number(e.monto) === Number(reversion.monto));
    if (matches.length === 1) idx = matches[0].i;
  }

  if (idx >= 0) {
    caja.egresos.splice(idx, 1);
    saveCajaData(caja);
    if (typeof renderCaja === 'function') renderCaja();
  }
}

// ─── FILL DROPDOWN ─────────────────────────────────────────────────────────
function fillEmpleadoSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">-- Seleccionar empleado --</option>';
  empleados.forEach(e => {
    const saldo = Number(e.saldo) || 0;
    const tag = saldo > 0 ? ` (debe Bs ${saldo.toFixed(0)})` : saldo < 0 ? ` (a favor Bs ${Math.abs(saldo).toFixed(0)})` : '';
    sel.innerHTML += `<option value="${e.id}">${e.nombre}${tag}</option>`;
  });
  if (currentVal && sel.querySelector(`option[value="${currentVal}"]`)) {
    sel.value = currentVal;
  }
}

// ─── SIDEBAR: LISTA DE EMPLEADOS ───────────────────────────────────────────
function renderEmpleadosList() {
  const container = document.getElementById('empleados-list');
  if (!container) return;

  if (!empleados.length) {
    container.innerHTML = '<div style="font-size:0.72rem;color:var(--text3);text-align:center;padding:12px">No hay empleados registrados</div>';
    return;
  }

  let html = '';
  empleados.forEach(e => {
    const saldo = Number(e.saldo) || 0;
    const saldoColor = saldo > 0 ? 'var(--red)' : saldo < 0 ? 'var(--green)' : 'var(--text3)';
    const saldoText = saldo > 0 ? `Debe Bs ${saldo.toFixed(1)}` : saldo < 0 ? `A favor Bs ${Math.abs(saldo).toFixed(1)}` : 'Sin saldo';
    const cargo = e.cargo ? `<span style="font-size:0.65rem;color:var(--text3)"> — ${e.cargo}</span>` : '';

    html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid var(--border);cursor:pointer" onclick="selectEmpleadoAndShowCuenta(${e.id})">
      <div>
        <div style="font-size:0.82rem;font-weight:600">${e.nombre}${cargo}</div>
        ${e.telefono ? `<div style="font-size:0.62rem;color:var(--text3)">${e.telefono}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div style="font-size:0.8rem;font-weight:700;color:${saldoColor}">${saldoText}</div>
        <button onclick="event.stopPropagation();deleteEmpleado(${e.id},'${e.nombre.replace(/'/g, "\\'")}')" style="font-size:0.6rem;color:var(--red);background:none;border:none;cursor:pointer;padding:2px 4px">eliminar</button>
      </div>
    </div>`;
  });

  container.innerHTML = html;
}

// ─── AGREGAR EMPLEADO ──────────────────────────────────────────────────────
async function addEmpleado() {
  const nombre = document.getElementById('emp-nombre')?.value?.trim();
  const cargo = document.getElementById('emp-cargo')?.value?.trim();
  const telefono = document.getElementById('emp-telefono')?.value?.trim();

  if (!nombre) { toast('Ingrese el nombre del empleado'); return; }

  try {
    await api('personal', 'POST', { nombre, cargo: cargo || null, telefono: telefono || null });
    document.getElementById('emp-nombre').value = '';
    document.getElementById('emp-cargo').value = '';
    document.getElementById('emp-telefono').value = '';
    await loadEmpleados();
    renderEmpleadosList();
    rrhhRenderTeam();
    toast('Empleado agregado');
  } catch (e) {
    toast('Error: ' + (e.message || 'No se pudo agregar'));
  }
}

// ─── ELIMINAR EMPLEADO ─────────────────────────────────────────────────────
async function deleteEmpleado(id, nombre) {
  if (!confirm(`Desactivar a "${nombre}"? Sus movimientos se conservan.`)) return;
  try {
    await api('personal/' + id, 'DELETE');
    await loadEmpleados();
    renderEmpleadosList();
    rrhhRenderTeam();
    toast('Empleado desactivado');
  } catch (e) {
    toast('Error: ' + (e.message || 'No se pudo eliminar'));
  }
}

// ─── SIDEBAR: SELECCIONAR EMPLEADO Y VER CUENTA ────────────────────────────
function selectEmpleadoAndShowCuenta(id) {
  selectedEmpleadoId = id;
  setPersonalTab('cuenta');
  const sel = document.getElementById('cuenta-empleado-select');
  if (sel) sel.value = id;
  renderCuenta();
}

// ─── REGISTRAR MOVIMIENTO (con integración caja) ──────────────────────────
async function submitMovimiento() {
  const empleadoId = document.getElementById('mov-empleado-select')?.value;
  const tipo = document.getElementById('mov-tipo')?.value;
  const monto = document.getElementById('mov-monto')?.value;
  const concepto = document.getElementById('mov-concepto')?.value?.trim();

  if (!empleadoId) { toast('Seleccione un empleado'); return; }
  if (!monto || Number(monto) <= 0) { toast('Ingrese un monto valido'); return; }

  const TIPO_LABELS = { adelanto: 'Adelanto', pago: 'Pago', multa: 'Multa', bonificacion: 'Bonificacion', consumo: 'Consumo', nota: 'Nota' };

  try {
    const result = await api('personal/' + empleadoId + '/movimientos', 'POST', {
      tipo,
      monto: Number(monto),
      concepto: concepto || TIPO_LABELS[tipo] || tipo
    });

    // Si requiere egreso en caja, registrarlo localmente
    if (result.requiereEgreso && result.egreso) pushRrhhCajaEgreso(result.egreso);

    document.getElementById('mov-monto').value = '';
    document.getElementById('mov-concepto').value = '';
    await loadEmpleados();
    fillEmpleadoSelect('mov-empleado-select');
    document.getElementById('mov-empleado-select').value = empleadoId;
    toast('Movimiento registrado');
  } catch (e) {
    toast('Error: ' + (e.message || 'No se pudo registrar'));
  }
}

// ─── SIDEBAR: RENDER CUENTA (ESTADO DE CUENTA) ────────────────────────────
async function renderCuenta() {
  const sel = document.getElementById('cuenta-empleado-select');
  const resumen = document.getElementById('cuenta-resumen');
  const lista = document.getElementById('cuenta-movimientos');
  if (!sel || !resumen || !lista) return;

  const empId = sel.value;
  if (!empId) {
    resumen.innerHTML = '';
    lista.innerHTML = '<div style="font-size:0.72rem;color:var(--text3);text-align:center;padding:8px">Seleccione un empleado</div>';
    return;
  }

  const emp = empleados.find(e => e.id == empId);
  const saldo = emp ? Number(emp.saldo) || 0 : 0;
  const saldoColor = saldo > 0 ? 'var(--red)' : saldo < 0 ? 'var(--green)' : 'var(--text3)';
  const saldoText = saldo > 0 ? `Debe Bs ${saldo.toFixed(1)}` : saldo < 0 ? `A favor Bs ${Math.abs(saldo).toFixed(1)}` : 'Sin saldo';

  resumen.innerHTML = `<div style="font-size:1.1rem;font-weight:700;color:${saldoColor}">${saldoText}</div>
    <div style="font-size:0.65rem;color:var(--text3)">${emp ? emp.nombre : ''} ${emp && emp.cargo ? '— ' + emp.cargo : ''}</div>`;

  try {
    const movs = await api('personal/' + empId + '/movimientos');
    if (!movs.length) {
      lista.innerHTML = '<div style="font-size:0.72rem;color:var(--text3);text-align:center;padding:12px">Sin movimientos</div>';
      return;
    }
    lista.innerHTML = renderMovimientosTable(movs, empId);
  } catch (e) {
    lista.innerHTML = '<div style="font-size:0.72rem;color:var(--red);text-align:center;padding:8px">Error cargando movimientos</div>';
  }
}

// ─── RENDER MOVIMIENTOS TABLE (shared) ─────────────────────────────────────
function renderMovimientosTable(movs, empId, showDelete = true) {
  const TIPO_ICONS = { consumo: '🛒', adelanto: '💵', pago: '💰', multa: '⚠️', bonificacion: '🎁', nota: '📝' };
  const TIPO_LABELS = { consumo: 'Consumo', adelanto: 'Adelanto', pago: 'Pago', multa: 'Multa', bonificacion: 'Bonificacion', nota: 'Nota' };

  const sorted = [...movs].reverse();
  let acum = 0;
  const withAcum = sorted.map(m => {
    acum += Number(m.monto);
    return { ...m, saldoAcum: acum };
  });
  withAcum.reverse();

  let html = '<div style="font-size:0.62rem;color:var(--text3);display:flex;justify-content:space-between;padding:4px 2px;border-bottom:1px solid var(--border);font-weight:600"><span>Fecha / Tipo</span><span>Monto / Saldo</span></div>';

  withAcum.forEach(m => {
    const monto = Number(m.monto);
    const montoColor = monto > 0 ? 'var(--red)' : 'var(--green)';
    const montoSign = monto > 0 ? '+' : '';
    const acumColor = m.saldoAcum > 0 ? 'var(--red)' : m.saldoAcum < 0 ? 'var(--green)' : 'var(--text3)';
    const icon = TIPO_ICONS[m.tipo] || '📝';
    const label = TIPO_LABELS[m.tipo] || m.tipo;

    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 2px;border-bottom:1px solid var(--border);font-size:0.72rem">
      <div style="flex:1">
        <div>${icon} <b>${label}</b></div>
        <div style="font-size:0.6rem;color:var(--text3)">${m.fecha}${m.concepto ? ' — ' + m.concepto : ''}</div>
      </div>
      <div style="text-align:right;min-width:80px">
        <div style="color:${montoColor};font-weight:700">${montoSign}Bs ${Math.abs(monto).toFixed(1)}</div>
        <div style="font-size:0.6rem;color:${acumColor}">Saldo: Bs ${m.saldoAcum.toFixed(1)}</div>
      </div>
      ${showDelete ? `<button onclick="deleteMovimiento(${m.id}, ${empId})" style="margin-left:4px;background:none;border:none;cursor:pointer;font-size:0.65rem;color:var(--text3)" title="Eliminar">✕</button>` : ''}
    </div>`;
  });

  return html;
}

// ─── ELIMINAR MOVIMIENTO ───────────────────────────────────────────────────
async function deleteMovimiento(movId, empId) {
  if (!confirm('Eliminar este movimiento?')) return;
  try {
    const result = await api('personal/movimientos/' + movId, 'DELETE');
    if (result?.cajaReversion) revertRrhhCajaEgreso(result.cajaReversion);
    await loadEmpleados();
    // Refresh sidebar cuenta
    fillEmpleadoSelect('cuenta-empleado-select');
    const sel = document.getElementById('cuenta-empleado-select');
    if (sel) sel.value = empId;
    renderCuenta();
    // Refresh RRHH overlay si esta abierto
    if (document.getElementById('admin-hub-overlay')) rrhhRenderProfile(empId);
    toast('Movimiento eliminado');
  } catch (e) {
    toast('Error: ' + (e.message || 'No se pudo eliminar'));
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// ADMIN HUB + RRHH OVERLAY (Homebase-inspired)
// ═══════════════════════════════════════════════════════════════════════════

let adminHubTab = 'rrhh'; // 'almacen' | 'rrhh'

function openAdminHub() {
  let overlay = document.getElementById('admin-hub-overlay');
  if (overlay) { overlay.style.display = 'flex'; addAdminHubEsc(); loadEmpleados().then(() => rrhhRenderTeam()); return; }

  overlay = document.createElement('div');
  overlay.id = 'admin-hub-overlay';
  overlay.className = 'rrhh-overlay';
  overlay.innerHTML = `
    <div class="rrhh-container">
      <!-- Header con tabs -->
      <div class="rrhh-header">
        <div class="rrhh-header-tabs">
          <button id="ahub-tab-almacen" class="rrhh-header-tab" onclick="setAdminHubTab('almacen')">📦 Almacen</button>
          <button id="ahub-tab-rrhh" class="rrhh-header-tab active" onclick="setAdminHubTab('rrhh')">👥 Recursos Humanos</button>
        </div>
        <button onclick="closeAdminHub()" class="rrhh-close-btn">✕ Cerrar <span style="font-size:0.65rem;opacity:0.7;margin-left:4px">ESC</span></button>
      </div>

      <!-- Contenido Almacen (iframe lazy-loaded) -->
      <div id="ahub-content-almacen" style="display:none;flex:1;overflow:hidden">
        <iframe id="almacen-iframe" style="width:100%;height:100%;border:none;background:#f5f6fa"></iframe>
      </div>

      <!-- Contenido RRHH -->
      <div id="ahub-content-rrhh" class="rrhh-content">
        <!-- Sidebar equipo -->
        <div class="rrhh-sidebar" id="rrhh-sidebar">
          <div class="rrhh-sidebar-header">
            <h3>Equipo</h3>
            <button onclick="rrhhShowAddForm()" class="rrhh-add-btn">+ Nuevo</button>
          </div>
          <div id="rrhh-team-list"></div>
          <div id="rrhh-add-form" style="display:none" class="rrhh-add-form">
            <input id="rrhh-add-nombre" placeholder="Nombre completo" class="rrhh-input" />
            <input id="rrhh-add-cargo" placeholder="Cargo" class="rrhh-input" />
            <input id="rrhh-add-telefono" placeholder="Telefono" class="rrhh-input" />
            <div style="display:flex;gap:6px">
              <button onclick="rrhhAddEmpleado()" class="rrhh-btn rrhh-btn-primary" style="flex:1">Agregar</button>
              <button onclick="rrhhHideAddForm()" class="rrhh-btn rrhh-btn-ghost">Cancelar</button>
            </div>
          </div>
        </div>

        <!-- Main area -->
        <div class="rrhh-main" id="rrhh-main">
          <div id="rrhh-welcome" class="rrhh-welcome">
            <div style="font-size:3rem;margin-bottom:12px">👥</div>
            <h2>Recursos Humanos</h2>
            <p>Selecciona un empleado para ver su cuenta, registrar adelantos, consumos y pagos.</p>
          </div>
          <div id="rrhh-profile" style="display:none"></div>
        </div>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAdminHub(); });
  document.body.appendChild(overlay);
  addAdminHubEsc();

  loadEmpleados().then(() => rrhhRenderTeam());
}

function setAdminHubTab(tab) {
  adminHubTab = tab;
  const tabAlmacen = document.getElementById('ahub-tab-almacen');
  const tabRrhh = document.getElementById('ahub-tab-rrhh');
  const contentAlmacen = document.getElementById('ahub-content-almacen');
  const contentRrhh = document.getElementById('ahub-content-rrhh');

  if (tab === 'almacen') {
    tabAlmacen.classList.add('active'); tabRrhh.classList.remove('active');
    contentAlmacen.style.display = 'flex'; contentRrhh.style.display = 'none';
    // Lazy-load iframe
    const iframe = document.getElementById('almacen-iframe');
    if (iframe && !iframe.src.includes('/almacen')) iframe.src = '/almacen';
  } else {
    tabRrhh.classList.add('active'); tabAlmacen.classList.remove('active');
    contentRrhh.style.display = ''; contentAlmacen.style.display = 'none';
    loadEmpleados().then(() => rrhhRenderTeam());
  }
}

function closeAdminHub() {
  const overlay = document.getElementById('admin-hub-overlay');
  if (overlay) overlay.style.display = 'none';
  removeAdminHubEsc();
}

function adminHubEscHandler(e) { if (e.key === 'Escape') closeAdminHub(); }
function addAdminHubEsc() { document.addEventListener('keydown', adminHubEscHandler); }
function removeAdminHubEsc() { document.removeEventListener('keydown', adminHubEscHandler); }


// ─── RRHH: TEAM LIST (sidebar izquierdo) ───────────────────────────────────
function rrhhRenderTeam() {
  const container = document.getElementById('rrhh-team-list');
  if (!container) return;

  if (!empleados.length) {
    container.innerHTML = '<div class="rrhh-empty">No hay empleados. Agrega el primero.</div>';
    return;
  }

  container.innerHTML = empleados.map(e => {
    const saldo = Number(e.saldo) || 0;
    const initials = e.nombre.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const colors = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4'];
    const color = colors[e.id % colors.length];
    const isSelected = selectedEmpleadoId === e.id;
    const saldoColor = saldo > 0 ? '#f87171' : saldo < 0 ? '#4ade80' : '#64748b';
    const saldoText = saldo > 0 ? `Debe Bs ${saldo.toFixed(0)}` : saldo < 0 ? `+Bs ${Math.abs(saldo).toFixed(0)}` : 'Bs 0';

    return `<div class="rrhh-team-card ${isSelected ? 'active' : ''}" onclick="rrhhSelectEmployee(${e.id})">
      <div class="rrhh-avatar" style="background:${color}">${initials}</div>
      <div class="rrhh-team-info">
        <div class="rrhh-team-name">${e.nombre}</div>
        <div class="rrhh-team-role">${e.cargo || 'Sin cargo'}</div>
      </div>
      <div class="rrhh-team-balance" style="color:${saldoColor}">${saldoText}</div>
    </div>`;
  }).join('');
}

function rrhhSelectEmployee(id) {
  selectedEmpleadoId = id;
  rrhhRenderTeam();
  rrhhRenderProfile(id);
}

// ─── RRHH: ADD EMPLOYEE FORM ───────────────────────────────────────────────
function rrhhShowAddForm() {
  document.getElementById('rrhh-add-form').style.display = '';
}
function rrhhHideAddForm() {
  document.getElementById('rrhh-add-form').style.display = 'none';
  document.getElementById('rrhh-add-nombre').value = '';
  document.getElementById('rrhh-add-cargo').value = '';
  document.getElementById('rrhh-add-telefono').value = '';
}
async function rrhhAddEmpleado() {
  const nombre = document.getElementById('rrhh-add-nombre')?.value?.trim();
  const cargo = document.getElementById('rrhh-add-cargo')?.value?.trim();
  const telefono = document.getElementById('rrhh-add-telefono')?.value?.trim();
  if (!nombre) { toast('Ingrese el nombre'); return; }
  try {
    const result = await api('personal', 'POST', { nombre, cargo: cargo || null, telefono: telefono || null });
    rrhhHideAddForm();
    await loadEmpleados();
    rrhhRenderTeam();
    renderEmpleadosList();
    toast('Empleado agregado');
    rrhhSelectEmployee(result.id);
  } catch (e) { toast('Error: ' + (e.message || 'No se pudo agregar')); }
}

// ─── RRHH: EMPLOYEE PROFILE ───────────────────────────────────────────────
async function rrhhRenderProfile(empId) {
  const welcome = document.getElementById('rrhh-welcome');
  const profile = document.getElementById('rrhh-profile');
  if (!welcome || !profile) return;

  welcome.style.display = 'none';
  profile.style.display = '';

  const emp = empleados.find(e => e.id === empId);
  if (!emp) { profile.innerHTML = '<div class="rrhh-empty">Empleado no encontrado</div>'; return; }

  const saldo = Number(emp.saldo) || 0;
  const initials = emp.nombre.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const colors = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4'];
  const color = colors[emp.id % colors.length];
  const saldoColor = saldo > 0 ? '#f87171' : saldo < 0 ? '#4ade80' : '#94a3b8';
  const saldoText = saldo > 0 ? `Debe Bs ${saldo.toFixed(1)}` : saldo < 0 ? `A favor Bs ${Math.abs(saldo).toFixed(1)}` : 'Sin saldo';
  const saldoBg = saldo > 0 ? 'rgba(248,113,113,0.1)' : saldo < 0 ? 'rgba(74,222,128,0.1)' : 'rgba(148,163,184,0.1)';

  // Cargar movimientos y resumen
  let movs = [];
  let resumen = {};
  try {
    [movs, resumen] = await Promise.all([
      api('personal/' + empId + '/movimientos'),
      api('personal/' + empId + '/resumen')
    ]);
  } catch (e) {}

  profile.innerHTML = `
    <!-- Header del perfil -->
    <div class="rrhh-profile-header">
      <div class="rrhh-profile-info">
        <div class="rrhh-avatar-lg" style="background:${color}">${initials}</div>
        <div>
          <h2 class="rrhh-profile-name">${emp.nombre}</h2>
          <div class="rrhh-profile-role">${emp.cargo || 'Sin cargo'}${emp.telefono ? ' · ' + emp.telefono : ''}</div>
        </div>
      </div>
      <div class="rrhh-profile-balance" style="background:${saldoBg};border-color:${saldoColor}40">
        <div class="rrhh-balance-amount" style="color:${saldoColor}">${saldoText}</div>
        <div class="rrhh-balance-label">Estado de cuenta</div>
      </div>
    </div>

    <!-- Resumen tarjetas -->
    <div class="rrhh-stats-grid">
      ${rrhhStatCard('💵', 'Adelantos', resumen.adelanto)}
      ${rrhhStatCard('🛒', 'Consumos', resumen.consumo)}
      ${rrhhStatCard('💰', 'Pagos', resumen.pago)}
      ${rrhhStatCard('⚠️', 'Multas', resumen.multa)}
      ${rrhhStatCard('🎁', 'Bonificaciones', resumen.bonificacion)}
      ${rrhhStatCard('📝', 'Notas', resumen.nota)}
    </div>

    <!-- Acciones rapidas -->
    <div class="rrhh-actions">
      <div class="rrhh-actions-title">Registrar movimiento</div>
      <div class="rrhh-actions-grid">
        <button onclick="rrhhQuickAction(${empId},'adelanto')" class="rrhh-action-btn rrhh-action-adelanto">
          <span>💵</span><span>Adelanto</span>
        </button>
        <button onclick="rrhhQuickAction(${empId},'pago')" class="rrhh-action-btn rrhh-action-pago">
          <span>💰</span><span>Pago</span>
        </button>
        <button onclick="rrhhQuickAction(${empId},'consumo')" class="rrhh-action-btn rrhh-action-consumo">
          <span>🛒</span><span>Consumo fiado</span>
        </button>
        <button onclick="rrhhQuickAction(${empId},'multa')" class="rrhh-action-btn rrhh-action-multa">
          <span>⚠️</span><span>Multa</span>
        </button>
        <button onclick="rrhhQuickAction(${empId},'bonificacion')" class="rrhh-action-btn rrhh-action-bono">
          <span>🎁</span><span>Bonificacion</span>
        </button>
        <button onclick="rrhhQuickAction(${empId},'nota')" class="rrhh-action-btn rrhh-action-nota">
          <span>📝</span><span>Nota</span>
        </button>
      </div>
    </div>

    <!-- Formulario oculto -->
    <div id="rrhh-quick-form" style="display:none" class="rrhh-quick-form">
      <div class="rrhh-quick-form-header">
        <span id="rrhh-quick-form-title">Registrar</span>
        <button onclick="document.getElementById('rrhh-quick-form').style.display='none'" class="rrhh-btn rrhh-btn-ghost" style="padding:4px 8px">✕</button>
      </div>
      <div style="display:flex;gap:8px">
        <input id="rrhh-quick-monto" type="number" placeholder="Monto (Bs)" class="rrhh-input" style="flex:1" min="0" step="0.5" />
        <input id="rrhh-quick-concepto" placeholder="Concepto / Detalle" class="rrhh-input" style="flex:2" />
      </div>
      <button id="rrhh-quick-submit" class="rrhh-btn rrhh-btn-primary" style="width:100%;margin-top:6px">Confirmar</button>
    </div>

    <!-- Historial de movimientos -->
    <div class="rrhh-history">
      <div class="rrhh-history-title">Historial de movimientos</div>
      <div id="rrhh-history-list" class="rrhh-history-list">
        ${movs.length ? renderMovimientosTable(movs, empId, true) : '<div class="rrhh-empty">Sin movimientos registrados</div>'}
      </div>
    </div>

    <!-- Acciones del empleado -->
    <div style="display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)">
      <button onclick="rrhhDeleteEmpleado(${empId},'${emp.nombre.replace(/'/g, "\\'")}')" class="rrhh-btn rrhh-btn-danger" style="font-size:0.7rem">Desactivar empleado</button>
    </div>
  `;
}

function rrhhStatCard(icon, label, data) {
  const cant = data ? data.cantidad : 0;
  const total = data ? data.total : 0;
  if (!cant) return `<div class="rrhh-stat-card rrhh-stat-empty"><span>${icon}</span><span class="rrhh-stat-label">${label}</span><span class="rrhh-stat-value">—</span></div>`;
  return `<div class="rrhh-stat-card"><span>${icon}</span><span class="rrhh-stat-label">${label}</span><span class="rrhh-stat-value">Bs ${total.toFixed(0)}</span><span class="rrhh-stat-count">${cant}x</span></div>`;
}

// ─── RRHH: QUICK ACTIONS ───────────────────────────────────────────────────
function rrhhQuickAction(empId, tipo) {
  const TIPO_LABELS = { adelanto: '💵 Registrar Adelanto', pago: '💰 Registrar Pago', consumo: '🛒 Registrar Consumo fiado', multa: '⚠️ Registrar Multa', bonificacion: '🎁 Registrar Bonificacion', nota: '📝 Agregar Nota' };

  const form = document.getElementById('rrhh-quick-form');
  form.style.display = '';
  document.getElementById('rrhh-quick-form-title').textContent = TIPO_LABELS[tipo] || tipo;
  document.getElementById('rrhh-quick-monto').value = '';
  document.getElementById('rrhh-quick-concepto').value = '';
  document.getElementById('rrhh-quick-monto').focus();

  const submitBtn = document.getElementById('rrhh-quick-submit');
  submitBtn.onclick = async () => {
    const monto = Number(document.getElementById('rrhh-quick-monto').value);
    const concepto = document.getElementById('rrhh-quick-concepto').value.trim();
    if (!monto || monto <= 0) { toast('Ingrese un monto valido'); return; }

    try {
      const result = await api('personal/' + empId + '/movimientos', 'POST', {
        tipo, monto, concepto: concepto || TIPO_LABELS[tipo]?.replace(/^[^\s]+\s/, '') || tipo
      });

      // Registrar egreso en caja si corresponde
      if (result.requiereEgreso && result.egreso) pushRrhhCajaEgreso(result.egreso);

      form.style.display = 'none';
      await loadEmpleados();
      rrhhRenderTeam();
      rrhhRenderProfile(empId);
      renderEmpleadosList();
      toast('Movimiento registrado');
    } catch (e) {
      toast('Error: ' + (e.message || 'No se pudo registrar'));
    }
  };
}

async function rrhhDeleteEmpleado(id, nombre) {
  if (!confirm(`Desactivar a "${nombre}"? Sus movimientos se conservan.`)) return;
  try {
    await api('personal/' + id, 'DELETE');
    await loadEmpleados();
    rrhhRenderTeam();
    renderEmpleadosList();
    selectedEmpleadoId = null;
    document.getElementById('rrhh-profile').style.display = 'none';
    document.getElementById('rrhh-welcome').style.display = '';
    toast('Empleado desactivado');
  } catch (e) { toast('Error al desactivar'); }
}
