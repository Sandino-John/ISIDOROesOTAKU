// ─── API HELPER ──────────────────────────────────────────────────────────────
async function api(endpoint, method = 'GET', body = null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== null) opts.body = JSON.stringify(body);
    const res = await fetch('/api/' + endpoint, opts);
    if (!res.ok) return null;
    return res.json();
  } catch(e) {
    console.warn('API error:', endpoint, e);
    return null;
  }
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  simple: 40, night: 100,
  tiers: {
    ac:   { 1:45,  2:80,  3:110, 4:140, 5:160, 6:180 },
    fan:  { 1:35,  2:65,  3:90,  4:110, 5:130 },
    fan2: { 1:35,  2:65,  3:90,  4:100 }
  }
};
let config = DEFAULT_CONFIG;

// ─── ROOMS ────────────────────────────────────────────────────────────────────
const ROOM_DEFS = [
  {num:1,type:'ac'},{num:2,type:'ac'},{num:3,type:'ac'},{num:4,type:'ac'},
  {num:5,type:'fan'},{num:6,type:'fan'},{num:7,type:'fan'},{num:8,type:'fan'},{num:9,type:'fan'},{num:10,type:'fan'},
  {num:11,type:'ac'},
  {num:12,type:'fan2'},{num:13,type:'fan2'},{num:14,type:'fan2'},{num:15,type:'fan2'},
  {num:16,type:'fan2'},{num:17,type:'fan2'},{num:18,type:'fan2'},{num:19,type:'fan2'},{num:20,type:'fan2'},
];

// State
let occupancy = {};
let history = [];
let shifts = [];
let currentShift = null;
let selectedRoom = null;

function startNewShift() {
  const hour = new Date().getHours();
  const type = (hour >= 6 && hour < 18) ? 'day' : 'night';
  currentShift = { id: Date.now(), type, start: Date.now(), entries: [] };
  api('turno', 'POST', currentShift);
}

function saveShift() { api('turno', 'POST', currentShift); }

// ─── ACTIVITY LOG ─────────────────────────────────────────────────────────────
let activityLog = [];

function addLog(action, details) {
  const entry = {
    ts: Date.now(),
    time: new Date().toLocaleString('es-BO'),
    action,
    details: details || ''
  };
  activityLog.push(entry);
  // Mantener solo los últimos 500 registros
  if (activityLog.length > 500) activityLog = activityLog.slice(-500);
  api('activitylog', 'POST', activityLog);
}

// ─── BILLING LOGIC ────────────────────────────────────────────────────────────

// Tarifa escalonada: precio TOTAL por tramo de horas (no por hora)
function getTieredRate(type, chargedHours) {
  const tiers = config.tiers[type];
  // Busca el tramo exacto, si supera el máximo usa el último
  const maxHr = Math.max(...Object.keys(tiers).map(Number));
  const key = chargedHours <= maxHr ? chargedHours : maxHr;
  return tiers[key] || tiers[maxHr];
}

function calcBill(room, checkinTs, nowTs) {
  const occ = occupancy[room.num] || { mode: 'hour' };
  if (occ.mode === 'night') {
    return { total: config.night, breakdown: 'Noche completa (12hs)', extraLabel:'', extraCharge:0, base: config.night, chargedHours:12 };
  }

  const ms = nowTs - checkinTs;
  const totalMins = Math.floor(ms / 60000);

  // Menos de 5 min → Bs 0
  if (totalMins < 5) {
    return { total:0, breakdown:'Menos de 5 min', extraLabel:'', extraCharge:0, base:0, chargedHours:0 };
  }

  // Horas completas (mínimo 1)
  const fullHours = Math.max(1, Math.floor(totalMins / 60));
  const remMins = totalMins < 60 ? 0 : totalMins % 60;

  let chargedHours = fullHours;
  let extraCharge = 0;
  let extraLabel = '';

  const maxTierHr = Math.max(...Object.keys(config.tiers[room.type]).map(Number));

  // Tolerancia solo aplica si ya pasó la primera hora Y aún no se llegó al tope
  if (totalMins >= 60 && fullHours < maxTierHr) {
    if (remMins <= 10) {
      // tolerancia, sin extra
    } else if (remMins <= 20) {
      extraCharge = 10;
      extraLabel = `+${remMins}min → Bs 10 adicional`;
    } else {
      chargedHours = fullHours + 1;
      extraLabel = `+${remMins}min → se cobra hora completa`;
    }
  }

  const base = getTieredRate(room.type, chargedHours);
  const total = base + extraCharge;

  // Label descriptivo
  const breakdown = chargedHours >= maxTierHr
    ? `Tarifa ${maxTierHr}h+ (Bs ${base})`
    : `Tarifa ${chargedHours}h (Bs ${base})`;

  return { chargedHours, remMins, base, extraCharge, extraLabel, total, breakdown };
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit'});
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function render() {
  const grid = document.getElementById('roomsGrid');
  grid.innerHTML = '';

  const icons = { ac:'❄️', fan:'🌀', fan2:'🌿', simple:'🛏' };
  const typeNames = { ac:'Aire Acond.', fan:'Ventilador', fan2:'Ventilador', simple:'Simple' };

  ROOM_DEFS.forEach(room => {
    const occ = occupancy[room.num];
    const card = document.createElement('div');
    const isCleaning = occ && occ.cleaning;
    card.className = `room-card type-${room.type}${occ && !isCleaning ? ' occupied' : ''}${isCleaning ? ' cleaning' : ''}`;
    card.id = `card-${room.num}`;
    card.onclick = () => { if (!isCleaning) clickRoom(room); };

    const rateText = room.type === 'ac'
      ? `1h Bs ${config.tiers.ac[1]} · 6h+ Bs ${config.tiers.ac[6]}`
      : room.type === 'fan2'
        ? `1h Bs ${config.tiers.fan2[1]} · 4h+ Bs ${config.tiers.fan2[4]}`
        : room.type === 'fan'
          ? `1h Bs ${config.tiers.fan[1]} · 5h+ Bs ${config.tiers.fan[5]}`
          : `Bs ${config.simple}/hr · Bs ${config.night}/noche`;

    const statusChip = (label, bg, color, border) =>
      `<div style="font-size:0.6rem;font-weight:800;padding:3px 8px;border-radius:20px;letter-spacing:0.8px;text-transform:uppercase;background:${bg};color:${color};border:1px solid ${border}">${label}</div>`;

    const typeLabel = `<div style="position:absolute;top:4px;left:50%;transform:translateX(-50%);font-size:0.48rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.55);white-space:nowrap;z-index:2">${typeNames[room.type]}</div>`;

    if (!occ) {
      card.innerHTML = `
        ${typeLabel}
        <div class="card-top">
          <div class="room-number">${room.num}</div>
        </div>
        <div class="card-body">
          <div class="room-icon">${icons[room.type]}</div>
        </div>
        <div class="card-bottom">
          ${statusChip('Disponible','rgba(52,211,153,0.18)','#34d399','rgba(52,211,153,0.35)')}
        </div>
      `;
    } else if (isCleaning) {
      card.innerHTML = `
        ${typeLabel}
        <div class="card-top">
          <div class="room-number">${room.num}</div>
        </div>
        <div class="card-body">
          <div class="room-icon">🧹</div>
          <div class="room-status status-cleaning"><div class="status-dot"></div>Pendiente</div>
        </div>
        <div class="card-bottom">
          ${statusChip('Limpieza','rgba(0,0,0,0.18)','#1a1400','rgba(0,0,0,0.25)')}
          <button class="btn-clean" onclick="confirmCleaning(${room.num}, event)">✓ Lista</button>
        </div>
      `;
    } else {
      const elapsed = Date.now() - occ.checkin;
      const minibarTotal = (occ.minibar||[]).reduce((s,i)=>s+i.price*i.qty,0);
      const bill = calcBill(room, occ.checkin, Date.now());
      const totalActual = bill.total + minibarTotal;
      const hasPrepaid = !!occ.prepaid;
      let prepaidLine = '';
      if (hasPrepaid) {
        const ppEnd = occ.checkin + occ.prepaid.hours * 3600000;
        const remaining = ppEnd - Date.now();
        if (remaining > 0) {
          prepaidLine = `<div style="text-align:center;line-height:1.3;padding-left:22px" id="countdown-${room.num}"><div style="font-size:0.65rem;color:var(--green);font-weight:700">Quedan ${formatDuration(remaining)}</div><div style="font-size:0.62rem;color:var(--green);font-weight:600">💰 PAGADA</div></div>`;
        } else {
          prepaidLine = `<div style="font-size:0.68rem;color:var(--red);font-weight:700" id="countdown-${room.num}">⚠ EXCEDIDA ${formatDuration(Math.abs(remaining))}</div>`;
        }
      }
      const ocupLabel = hasPrepaid ? 'Pagada' : 'Ocupada';
      const ocupBg    = hasPrepaid ? 'rgba(52,211,153,0.18)' : 'rgba(234,88,12,0.18)';
      const ocupColor = hasPrepaid ? '#34d399' : '#fb923c';
      const ocupBorder= hasPrepaid ? 'rgba(52,211,153,0.35)' : 'rgba(234,88,12,0.35)';
      card.innerHTML = `
        ${typeLabel}
        <div class="card-top">
          <div class="room-number">${room.num}</div>
          <button style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.35);color:rgba(255,255,255,0.75);border-radius:6px;padding:3px 9px;font-size:0.85rem;cursor:pointer;align-self:flex-start" onclick="quickPrint(${room.num},event)" title="Imprimir">🖨</button>
          <div style="font-size:3.2rem;line-height:1;margin-left:-8px;filter:grayscale(1) brightness(10)">${(occ.guest||'').split(' ')[0]}</div>
        </div>
        <div class="card-body">
          <div style="font-size:0.78rem;color:rgba(255,255,255,0.75);font-family:'JetBrains Mono',monospace;font-weight:600;margin-bottom:4px;margin-top:-6px;padding-left:22px">⏰ ${formatTime(occ.checkin)}</div>
          <div class="room-timer" id="timer-${room.num}">${formatDuration(elapsed)}</div>
          ${prepaidLine}
        </div>
        <div class="card-bottom">
          ${statusChip(ocupLabel, ocupBg, ocupColor, ocupBorder)}
          <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);display:flex;gap:7px;align-items:center">
            <button style="background:${minibarTotal>0?'rgba(245,200,66,0.3)':'rgba(255,255,255,0.12)'};border:1px solid ${minibarTotal>0?'var(--gold)':'rgba(255,255,255,0.3)'};color:${minibarTotal>0?'var(--gold)':'rgba(255,255,255,0.7)'};border-radius:6px;padding:5px 22px;font-size:0.8rem;cursor:pointer;font-family:Outfit,sans-serif;font-weight:700;white-space:nowrap;min-width:90px;text-align:center" onclick="openMinibar(${room.num},event)">🛒${minibarTotal>0?' Bs '+minibarTotal:' Minibar'}</button>
          </div>
          <div style="position:absolute;bottom:6px;right:10px;line-height:1;text-align:right">
            <span style="font-family:'Outfit',sans-serif;font-size:0.72rem;font-weight:600;color:#f5c842;letter-spacing:0.5px;text-shadow:0 0 8px rgba(245,200,66,0.8)">Bs </span><span style="font-family:'JetBrains Mono',monospace;font-size:2rem;font-weight:800;color:#f5c842;text-shadow:0 0 18px rgba(245,200,66,0.9),0 0 32px rgba(245,200,66,0.5)">${totalActual}</span>
          </div>
        </div>
      `;
    }
    grid.appendChild(card);
  });

  updateStats();
  renderHistory();
}

function updateStats() {
  const allOcc = Object.values(occupancy);
  const occupied = allOcc.filter(o => !o.cleaning).length;
  const cleaning = allOcc.filter(o => o.cleaning).length;
  const free = ROOM_DEFS.length - occupied - cleaning;
  const total = ROOM_DEFS.length;

  // Header
  document.getElementById('h-occupied').textContent = occupied;
  document.getElementById('h-free').textContent = free;
  const shiftTotal = (currentShift.entries || []).reduce((s,e) => s + e.total, 0);
  document.getElementById('h-today').textContent = `Bs ${shiftTotal}`;
  const isDay = currentShift.type === 'day';
  document.getElementById('shiftDot').className = `shift-dot ${isDay ? 'shift-day' : 'shift-night'}`;
  document.getElementById('shiftLabel').textContent = isDay ? '☀ Turno Día' : '🌙 Turno Noche';

  // Sidebar status bars
  document.getElementById('sb-val-occ').textContent = occupied;
  document.getElementById('sb-val-free').textContent = free;
  document.getElementById('sb-val-clean').textContent = cleaning;
  document.getElementById('sb-bar-occ').style.width = (occupied/total*100)+'%';
  document.getElementById('sb-bar-free').style.width = (free/total*100)+'%';
  document.getElementById('sb-bar-clean').style.width = (cleaning/total*100)+'%';

  // Turno stats
  document.getElementById('sb-turno-total').textContent = 'Bs '+shiftTotal;
  document.getElementById('sb-turno-rooms').textContent = (currentShift.entries||[]).length;
  document.getElementById('sb-turno-type').textContent = isDay ? '☀ Día' : '🌙 Noche';
  const shiftDur = Date.now() - (currentShift.start||Date.now());
  const sh = Math.floor(shiftDur/3600000), sm = Math.floor((shiftDur%3600000)/60000);
  document.getElementById('sb-turno-time').textContent = `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`;

  // Alertas
  const alerts = [];
  allOcc.filter(o=>!o.cleaning).forEach(o => {
    const hrs = (Date.now()-o.checkin)/3600000;
    const roomDef = ROOM_DEFS.find(r=>r.num==o.roomNum||Object.keys(occupancy).find(k=>occupancy[k]===o));
    if (hrs >= 3) alerts.push(`⚠ Hab. con ${Math.floor(hrs)}h+ ocupada`);
  });
  allOcc.filter(o=>o.cleaning).forEach((o,i) => {
    alerts.push(`🧹 Hab. en limpieza pendiente`);
  });
  const alertsEl = document.getElementById('sb-alerts');
  if (alerts.length) {
    alertsEl.innerHTML = [...new Set(alerts)].map(a=>`<div class="sb-alert"><span class="sb-alert-icon">!</span>${a}</div>`).join('');
  } else {
    alertsEl.innerHTML = '<div style="font-size:0.75rem;color:var(--text3)">Sin alertas activas ✓</div>';
  }

  // Stats panel
  updateStatsPanel();
}

function updateStatsPanel() {
  // Recaudación total del día (historial + turno actual)
  const allEntries = history || [];
  const dayTotal = allEntries.reduce((s,e)=>s+e.total,0);
  const dayShift = allEntries.filter(e=>e.shiftType==='day').reduce((s,e)=>s+e.total,0);
  const nightShift = allEntries.filter(e=>e.shiftType==='night').reduce((s,e)=>s+e.total,0);
  const minibarDay = allEntries.reduce((s,e)=>s+(e.minibar||[]).reduce((ms,i)=>ms+i.price*i.qty,0),0);

  document.getElementById('st-day-total').textContent = 'Bs '+(dayTotal);
  document.getElementById('st-day-shift').textContent = 'Bs '+dayShift;
  document.getElementById('st-night-shift').textContent = 'Bs '+nightShift;
  document.getElementById('st-minibar').textContent = 'Bs '+minibarDay;

  // Por tipo
  const byType = {ac:0, fan:0};
  allEntries.forEach(e => {
    if (e.type==='Aire Acond.' || e.type==='Aire Acondicionado') byType.ac += e.total;
    else if (e.type==='Ventilador') byType.fan += e.total;
  });
  const maxType = Math.max(...Object.values(byType), 1);
  const typeColors = {ac:'var(--ac-color)', fan:'var(--fan-color)'};
  const typeLabels = {ac:'❄ AC', fan:'🌀 Ventilador'};
  document.getElementById('st-type-bars').innerHTML = Object.entries(byType).map(([k,v])=>`
    <div class="type-bar-row">
      <div class="type-bar-name">${typeLabels[k]}</div>
      <div class="type-bar-track"><div class="type-bar-fill" style="width:${v/maxType*100}%;background:${typeColors[k]}"></div></div>
      <div class="type-bar-val">Bs ${v}</div>
    </div>`).join('');

  // Actividad
  document.getElementById('st-checkouts').textContent = allEntries.length;
  if (allEntries.length) {
    const roomCounts = {};
    allEntries.forEach(e => { roomCounts[e.roomNum] = (roomCounts[e.roomNum]||0)+1; });
    const topRoom = Object.entries(roomCounts).sort((a,b)=>b[1]-a[1])[0];
    document.getElementById('st-top-room').textContent = topRoom ? `Hab. ${topRoom[0]}` : '—';
    const avgMs = allEntries.reduce((s,e)=>s+(e.checkout-e.checkin),0)/allEntries.length;
    const ah = Math.floor(avgMs/3600000), am = Math.floor((avgMs%3600000)/60000);
    document.getElementById('st-avg-time').textContent = `${ah}h ${am}m`;
  } else {
    document.getElementById('st-top-room').textContent = '—';
    document.getElementById('st-avg-time').textContent = '—';
  }
}

// Timestamp de inicio del día de negocio actual
// (cuando empezó el último turno 'day', o el turno actual si es de día)
function getCurrentDayStart() {
  const midnightToday = new Date(); midnightToday.setHours(0,0,0,0);
  const midnightTs = midnightToday.getTime();

  // Turno actual de día que empezó hoy
  if (currentShift && currentShift.type === 'day' && currentShift.start >= midnightTs) {
    return currentShift.start;
  }
  // Buscar en turnos cerrados el último turno día que empezó hoy
  for (let i = shifts.length - 1; i >= 0; i--) {
    if (shifts[i].type === 'day' && shifts[i].start >= midnightTs) return shifts[i].start;
  }
  // Fallback: medianoche de hoy
  return midnightTs;
}

function renderHistory() {
  const tbody = document.getElementById('historyBody');
  const dayStart = getCurrentDayStart();
  const todayEntries = [...history]
    .filter(h => h.checkin && !isNaN(h.checkin) && h.checkout && !isNaN(h.checkout) && h.checkout >= dayStart)
    .reverse();

  if (!todayEntries.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="history-empty">Sin registros hoy</td></tr>';
    return;
  }
  tbody.innerHTML = todayEntries.map(h => `
    <tr>
      <td><strong style="font-family:'JetBrains Mono',monospace">${h.roomNum}</strong></td>
      <td>${h.guest || '—'}</td>
      <td>${h.type}</td>
      <td>${formatTime(h.checkin)}</td>
      <td>${formatTime(h.checkout)}</td>
      <td style="font-family:'JetBrains Mono',monospace">${formatDuration(h.checkout - h.checkin)}</td>
      <td class="history-amount">Bs ${h.total}</td>
    </tr>
  `).join('');
}

// ─── TIMERS ───────────────────────────────────────────────────────────────────
setInterval(() => {
  Object.keys(occupancy).forEach(num => {
    const occ = occupancy[num];
    if (occ.cleaning) return;
    const el = document.getElementById('timer-' + num);
    if (el) el.textContent = formatDuration(Date.now() - occ.checkin);
    // Countdown prepago
    if (occ.prepaid) {
      const cdEl = document.getElementById('countdown-' + num);
      if (cdEl) {
        const ppEnd = occ.checkin + occ.prepaid.hours * 3600000;
        const remaining = ppEnd - Date.now();
        if (remaining > 0) {
          cdEl.innerHTML = `<div style="font-size:0.65rem;color:var(--green);font-weight:700">Quedan ${formatDuration(remaining)}</div><div style="font-size:0.62rem;color:var(--green);font-weight:600">💰 PAGADA</div>`;
          cdEl.style.color = 'var(--green)';
        } else {
          cdEl.innerHTML = `⚠ EXCEDIDA ${formatDuration(Math.abs(remaining))}`;
          cdEl.style.color = 'var(--red)';
        }
      }
    }
  });
}, 1000);

// ─── INTERACTIONS ─────────────────────────────────────────────────────────────
let adminMode = false;

function clickRoom(room) {
  selectedRoom = room;
  if (adminMode && (!occupancy[room.num] || (occupancy[room.num] && !occupancy[room.num].cleaning))) {
    openAdminEdit(room);
  } else if (!occupancy[room.num]) {
    openCheckin(room);
  } else {
    openCheckout(room);
  }
}

function openCheckin(room) {
  const icons = { ac:'❄ Aire Acondicionado', fan:'🌀 Ventilador', fan2:'🌿 Ventilador', simple:'🛏 Simple' };
  document.getElementById('ci-roomnum').textContent = `PIEZA ${room.num}`;
  document.getElementById('ci-roomtype').textContent = icons[room.type] || '🛏';
  const t = config.tiers;
  document.getElementById('ci-roomrate').textContent =
    room.type === 'ac'
      ? `1h Bs ${t.ac[1]}  ·  6h+ Bs ${t.ac[6]}`
      : room.type === 'fan2'
        ? `1h Bs ${t.fan2[1]}  ·  4h+ Bs ${t.fan2[4]}`
        : room.type === 'fan'
          ? `1h Bs ${t.fan[1]}  ·  5h+ Bs ${t.fan[5]}`
          : `Bs ${config.simple}/hora  ·  Bs ${config.night}/noche`;

  // Reset vehicle selection
  window._selectedVehicle = null;
  document.querySelectorAll('.vehicle-btn').forEach(b => b.classList.remove('selected'));

  // Generar botones de prepago según tarifas del tipo de habitación
  window._selectedPrepaid = null;
  const tiers = config.tiers[room.type];
  const maxHr = Math.max(...Object.keys(tiers).map(Number));
  let prepaidHtml = `<button class="vehicle-btn prepaid-btn selected" onclick="selectPrepaid(this,0,0)" style="padding:4px 10px;font-size:0.75rem;color:#fff">Sin prepago</button>`;
  for (let h = 1; h <= maxHr; h++) {
    const label = h >= maxHr ? `${h}h+` : `${h}h`;
    prepaidHtml += `<button class="vehicle-btn prepaid-btn" onclick="selectPrepaid(this,${h},${tiers[h]})" style="padding:4px 10px;font-size:0.75rem;color:#fff">${label} · Bs ${tiers[h]}</button>`;
  }
  prepaidHtml += `<button class="vehicle-btn prepaid-btn" onclick="selectPrepaid(this,12,${config.night})" style="padding:4px 10px;font-size:0.75rem;color:#fff">12h 🌙 · Bs ${config.night}</button>`;
  document.getElementById('ci-prepaid-grid').innerHTML = prepaidHtml;
  document.getElementById('ci-prepaid-info').style.display = 'none';

  document.getElementById('checkinOverlay').classList.add('open');
}

function selectVehicle(el, label) {
  const now = Date.now();
  const wasSelected = window._selectedVehicle === label;
  document.querySelectorAll('.vehicle-grid .vehicle-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  window._selectedVehicle = label;
  // Double-click en el mismo vehículo → registrar entrada
  if (wasSelected && window._lastVehicleClick && (now - window._lastVehicleClick) < 500) {
    window._lastVehicleClick = 0;
    doCheckin();
    return;
  }
  window._lastVehicleClick = now;
}

function selectPrepaid(el, hours, amount) {
  document.querySelectorAll('.prepaid-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  window._selectedPrepaid = hours > 0 ? { hours, amount } : null;
  const info = document.getElementById('ci-prepaid-info');
  if (hours > 0) {
    info.style.display = 'block';
    document.getElementById('ci-prepaid-amount').textContent = `${hours}h — Bs ${amount}`;
    document.querySelector('input[name="ci-prepaid-method"][value="cash"]').checked = true;
    document.getElementById('ci-prepaid-mix').style.display = 'none';
    setTimeout(() => info.scrollIntoView({ behavior:'smooth', block:'end' }), 50);
  } else {
    info.style.display = 'none';
  }
}

// Listener para radio buttons de método prepago
document.addEventListener('change', function(e) {
  if (e.target.name === 'ci-prepaid-method') {
    const mixDiv = document.getElementById('ci-prepaid-mix');
    if (e.target.value === 'mix' && window._selectedPrepaid) {
      mixDiv.style.display = 'flex';
      document.getElementById('ci-prepaid-cash').value = window._selectedPrepaid.amount;
      document.getElementById('ci-prepaid-qr').value = 0;
    } else {
      mixDiv.style.display = 'none';
    }
  }
});

function updatePrepaidMix(changed) {
  if (!window._selectedPrepaid) return;
  const total = window._selectedPrepaid.amount;
  const cashEl = document.getElementById('ci-prepaid-cash');
  const qrEl = document.getElementById('ci-prepaid-qr');
  if (changed === 'cash') {
    cashEl.value = Math.max(0, Math.min(parseInt(cashEl.value)||0, total));
    qrEl.value = total - (parseInt(cashEl.value)||0);
  } else {
    qrEl.value = Math.max(0, Math.min(parseInt(qrEl.value)||0, total));
    cashEl.value = total - (parseInt(qrEl.value)||0);
  }
}

// Scroll wheel para ajustar montos mixtos de prepago
['ci-prepaid-cash','ci-prepaid-qr'].forEach(id => {
  document.getElementById(id).addEventListener('wheel', function(e) {
    e.preventDefault();
    if (!window._selectedPrepaid) return;
    const total = window._selectedPrepaid.amount;
    const step = e.shiftKey ? 10 : 1;
    const delta = e.deltaY < 0 ? step : -step;
    const cur = parseInt(this.value) || 0;
    this.value = Math.max(0, Math.min(cur + delta, total));
    updatePrepaidMix(id === 'ci-prepaid-cash' ? 'cash' : 'qr');
  }, { passive: false });
});

function doCheckin() {
  if (!window._selectedVehicle) {
    toast('⚠ Seleccioná el tipo de transporte');
    return;
  }
  const occData = { guest: window._selectedVehicle, checkin: Date.now(), mode: 'hour' };

  // Prepago
  if (window._selectedPrepaid) {
    const pp = window._selectedPrepaid;
    const method = document.querySelector('input[name="ci-prepaid-method"]:checked').value;
    let ppCash = pp.amount, ppQr = 0;
    if (method === 'qr') { ppCash = 0; ppQr = pp.amount; }
    else if (method === 'mix') {
      ppCash = parseInt(document.getElementById('ci-prepaid-cash').value)||0;
      ppQr = parseInt(document.getElementById('ci-prepaid-qr').value)||0;
    }
    occData.prepaid = { hours: pp.hours, amount: pp.amount, cash: ppCash, qr: ppQr };
    if (pp.hours === 12) occData.mode = 'night';
  }

  occupancy[selectedRoom.num] = occData;
  saveOcc();
  closeModal('checkinOverlay');
  render();
  const ppMsg = occData.prepaid ? ` · Prepago ${occData.prepaid.hours}h Bs ${occData.prepaid.amount}` : '';
  addLog('CHECK-IN', `Hab. ${selectedRoom.num} — ${window._selectedVehicle}${ppMsg}`);
  toast(`✓ Check-in Hab. ${selectedRoom.num} — ${window._selectedVehicle}${ppMsg}`);
}

// Payment state
let pagoState = {}; // { hab: {method, monto, comision, cambio}, minibar: {...}, vitrina: {...} }

function calcComision(monto) {
  if (monto <= 0) return 0;
  return Math.floor(monto / 80) + 1;
}

function openCheckout(room) {
  const occ = occupancy[room.num];
  document.getElementById('co-roomnum').textContent = `PIEZA ${room.num}`;
  document.getElementById('co-guest').textContent = `${occ.guest}`;
  document.getElementById('co-checkin').textContent = `Entrada: ${formatTime(occ.checkin)}`;
  pagoState = {};
  document.getElementById('checkoutSteps').style.transform = 'translateX(0%)';
  document.getElementById('co-modal-title').textContent = 'Check-out';
  renderBill(room);
  document.getElementById('checkoutOverlay').classList.add('open');
  window._billInterval = setInterval(() => renderBill(room), 1000);
}

function slideToPago() {
  clearInterval(window._billInterval);
  const room = selectedRoom;
  const occ = occupancy[room.num];
  const bill = calcBill(room, occ.checkin, Date.now());

  // Separar minibar y vitrina
  const minibarItems = occ.minibar || [];
  let minibarBs = 0, vitrinaBs = 0;
  minibarItems.forEach(item => {
    const prod = minibarProducts.find(p=>p.id===item.id);
    const cat = prod ? prod.cat : '';
    if (MINIBAR_CATS.includes(cat)) minibarBs += item.price * item.qty;
    else vitrinaBs += item.price * item.qty;
  });

  // Calcular pendiente de habitación descontando prepago
  let habPendiente = bill.total;
  if (occ.prepaid) {
    habPendiente = Math.max(0, bill.total - occ.prepaid.amount);
  }

  // Init pago state — cash/qr mixto por sección; comisión solo en hab
  pagoState = {
    hab:     { monto: habPendiente, cash: habPendiente, qr: 0, comision: 0, recibido: 0, cambio: 0, prepaid: occ.prepaid || null },
    minibar: { monto: minibarBs,  cash: minibarBs,  qr: 0,              recibido: 0, cambio: 0 },
    vitrina: { monto: vitrinaBs,  cash: vitrinaBs,  qr: 0,              recibido: 0, cambio: 0 },
  };

  renderPagoSections();
  document.getElementById('co-modal-title').textContent = 'Método de pago';
  document.getElementById('checkoutSteps').style.transform = 'translateX(-100%)';
}

function renderPagoSections() {
  const sections = [
    { key:'hab',     label:'🛏 Habitación',       withComision: true  },
    { key:'minibar', label:'🍺 Minibar (bebidas)',  withComision: false },
    { key:'vitrina', label:'🏪 Vitrina',            withComision: false },
  ];
  let totalFinal = 0;
  let html = '';

  sections.forEach(s => {
    const p = pagoState[s.key];
    if (p.monto <= 0 && !(s.key === 'hab' && p.prepaid)) return;
    const qr   = p.qr   || 0;
    const cash = p.cash !== undefined ? p.cash : p.monto;
    const comision = (s.withComision && qr > 0) ? calcComision(qr) : 0;
    pagoState[s.key].comision = comision;
    const totalConComision = p.monto + comision;
    totalFinal += totalConComision;

    let prepaidNote = '';
    if (s.key === 'hab' && p.prepaid) {
      const ppMethod = p.prepaid.qr > 0 && p.prepaid.cash > 0 ? 'mixto' : p.prepaid.qr > 0 ? 'QR' : 'efectivo';
      prepaidNote = `<div style="font-size:0.75rem;color:var(--green);margin-bottom:6px">💰 Prepago: Bs ${p.prepaid.amount} (${p.prepaid.hours}h, ${ppMethod})${p.monto > 0 ? ` · <span style="color:var(--red)">Pendiente: Bs ${p.monto}</span>` : ' · ✓ Sin saldo pendiente'}</div>`;
    }

    html += `<div class="pago-section">
      <div class="pago-section-title">
        <span>${s.label}</span>
        <span class="pago-section-amount">Bs ${p.monto}${comision > 0 ? ` <small style="color:var(--ac-color);font-size:0.85em">+${comision} com.</small>` : ''}</span>
      </div>
      ${prepaidNote}
      <div class="pago-mix-row">
        <div class="pago-mix-field">
          <span class="pago-mix-label">💵 Efectivo</span>
          <input class="pago-mix-input cash" type="number" min="0" max="${p.monto}"
            id="cash-${s.key}" value="${cash}"
            oninput="updatePagoCash('${s.key}', ${p.monto}, ${s.withComision})">
        </div>
        <div class="pago-mix-field">
          <span class="pago-mix-label">📱 QR / Digital</span>
          <input class="pago-mix-input qr" type="number" min="0" max="${p.monto}"
            id="qr-${s.key}" value="${qr}"
            oninput="updatePagoQR('${s.key}', ${p.monto}, ${s.withComision})">
        </div>
      </div>`;

    if (comision > 0) {
      html += `<div class="pago-commission">
        <span>Comisión QR (Bs ${qr} digital)</span>
        <span>+Bs ${comision} → Total hab: Bs ${totalConComision}</span>
      </div>`;
    }
    if (cash > 0) {
      const cambioTxt = p.cambio > 0 ? `Cambio: Bs ${p.cambio}` : '';
      html += `<div class="pago-cambio-row">
        <span style="font-size:0.78rem;color:var(--text3);white-space:nowrap">Recibido:</span>
        <input class="pago-cambio-input" type="number" min="${cash}" placeholder="Bs recibido"
          id="recibido-${s.key}" value="${p.recibido || ''}"
          oninput="updateCambio('${s.key}')">
        <span class="pago-cambio-result" id="cambio-${s.key}">${cambioTxt}</span>
      </div>`;
    }
    html += `</div>`;
  });

  document.getElementById('pagoSections').innerHTML = html;
  document.getElementById('pagoGrandTotal').textContent = `Bs ${totalFinal}`;

  // Scroll wheel en inputs de pago
  document.querySelectorAll('#pagoSections .pago-mix-input').forEach(input => {
    input.addEventListener('wheel', function(e) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const delta = e.deltaY < 0 ? step : -step;
      const total = parseInt(this.max) || 0;
      const cur = parseInt(this.value) || 0;
      this.value = Math.max(0, Math.min(cur + delta, total));
      const isCash = this.classList.contains('cash');
      const key = this.id.replace(/^(cash|qr)-/, '');
      if (isCash) updatePagoCash(key, total, true);
      else updatePagoQR(key, total, true);
    }, { passive: false });
  });
}

function updatePagoCash(key, total, withComision) {
  let cash = Math.max(0, Math.min(parseInt(document.getElementById('cash-'+key).value) || 0, total));
  let qr   = total - cash;
  const qrEl = document.getElementById('qr-'+key);
  if (qrEl) qrEl.value = qr;
  pagoState[key].cash     = cash;
  pagoState[key].qr       = qr;
  pagoState[key].recibido = 0;
  pagoState[key].cambio   = 0;
  pagoState[key].comision = (withComision && qr > 0) ? calcComision(qr) : 0;
  renderPagoSections();
}

function updatePagoQR(key, total, withComision) {
  let qr   = Math.max(0, Math.min(parseInt(document.getElementById('qr-'+key).value) || 0, total));
  let cash = total - qr;
  const cashEl = document.getElementById('cash-'+key);
  if (cashEl) cashEl.value = cash;
  pagoState[key].qr       = qr;
  pagoState[key].cash     = cash;
  pagoState[key].recibido = 0;
  pagoState[key].cambio   = 0;
  pagoState[key].comision = (withComision && qr > 0) ? calcComision(qr) : 0;
  renderPagoSections();
}

function updateCambio(key) {
  const p = pagoState[key];
  const cashDue  = p.cash !== undefined ? p.cash : p.monto;
  const recibido = parseInt(document.getElementById('recibido-'+key).value) || 0;
  const cambio   = recibido - cashDue;
  pagoState[key].recibido = recibido;
  pagoState[key].cambio   = Math.max(0, cambio);
  const el = document.getElementById('cambio-'+key);
  if (el) {
    if (cambio > 0)        { el.textContent = `Cambio: Bs ${cambio}`; el.style.color='var(--orange)'; }
    else if (cambio === 0) { el.textContent = '✓ Exacto';             el.style.color='var(--green)'; }
    else                   { el.textContent = `Faltan Bs ${Math.abs(cambio)}`; el.style.color='var(--red)'; }
  }
}

function slideToConfirm() {
  const room = selectedRoom;
  const occ = occupancy[room.num];
  const typeNames = { ac:'Aire Acond.', fan:'Ventilador', fan2:'Ventilador', simple:'Simple' };

  let grandTotal = 0;
  let summaryParts = [];
  ['hab','minibar','vitrina'].forEach(key => {
    const p = pagoState[key];
    if (!p || p.monto <= 0) return;
    const total = p.monto + (p.comision || 0);
    grandTotal += total;
    const cash = p.cash !== undefined ? p.cash : p.monto;
    const qr   = p.qr   || 0;
    if (cash > 0) summaryParts.push(`💵 Bs ${cash}`);
    if (qr   > 0) summaryParts.push(`📱 Bs ${qr}${p.comision > 0 ? '+'+p.comision : ''}`);
    if (p.cambio > 0) summaryParts.push(`Cambio: Bs ${p.cambio}`);
  });

  document.getElementById('confirm-subtitle').textContent =
    `Hab. ${room.num} · ${typeNames[room.type]} · ${occ.guest}`;
  document.getElementById('confirm-amount').textContent = `Bs ${grandTotal}`;
  document.getElementById('confirm-pago-summary').textContent = summaryParts.join('  ·  ');
  document.getElementById('co-modal-title').textContent = 'Confirmar salida';
  document.getElementById('checkoutSteps').style.transform = 'translateX(-200%)';
}

function slideBack() {
  document.getElementById('checkoutSteps').style.transform = 'translateX(0%)';
  document.getElementById('co-modal-title').textContent = 'Check-out';
  window._billInterval = setInterval(() => renderBill(selectedRoom), 1000);
}

function slideBackToConfirm() {
  document.getElementById('checkoutSteps').style.transform = 'translateX(-100%)';
  document.getElementById('co-modal-title').textContent = 'Método de pago';
}

function renderBill(room) {
  const occ = occupancy[room.num];
  if (!occ) return;
  const bill = calcBill(room, occ.checkin, Date.now());
  const icons = { ac:'❄', fan:'🌀', fan2:'🌿', simple:'🛏' };
  const typeNames = { ac:'Aire Acondicionado', fan:'Ventilador', fan2:'Ventilador', simple:'Simple' };

  let html = `
    <div class="bill-row"><span>Entrada</span><span>${formatTime(occ.checkin)}</span></div>
    <div class="bill-row"><span>Tiempo actual</span><span style="font-family:'JetBrains Mono',monospace;color:var(--gold)">${formatDuration(Date.now()-occ.checkin)}</span></div>
    <div class="bill-divider"></div>
  `;

  if (occ.mode === 'night') {
    html += `<div class="bill-row"><span>Noche completa (12hs)</span><span>Bs ${config.night}</span></div>`;
  } else {
    html += `<div class="bill-row"><span>${bill.breakdown}</span><span>Bs ${bill.base}</span></div>`;
    if (bill.extraLabel) {
      html += `<div class="bill-row" style="color:var(--orange)"><span>${bill.extraLabel}</span><span>Bs ${bill.extraCharge}</span></div>`;
    }
  }

  if (occ.prepaid) {
    html += `<div class="bill-divider"></div>`;
    html += `<div class="bill-row" style="color:var(--green)"><span>💰 Prepago (${occ.prepaid.hours}h)</span><span>-Bs ${occ.prepaid.amount}</span></div>`;
    const pendiente = Math.max(0, bill.total - occ.prepaid.amount);
    html += `<div class="bill-total"><span>PENDIENTE</span><span>Bs ${pendiente}</span></div>`;
  } else {
    html += `
      <div class="bill-divider"></div>
      <div class="bill-total"><span>TOTAL</span><span>Bs ${bill.total}</span></div>
    `;
  }

  // Minibar items
  const minibar = occ.minibar || [];
  const minibarTotal = minibar.reduce((s,i)=>s+i.price*i.qty,0);
  if (minibar.length) {
    html += `<div class="bill-divider"></div><div style="font-size:0.7rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Minibar</div>`;
    minibar.forEach(i => {
      html += `<div class="bill-row"><span>${i.name} ×${i.qty}</span><span>Bs ${i.price*i.qty}</span></div>`;
    });
    html += `<div class="bill-divider"></div><div class="bill-total"><span>TOTAL CON MINIBAR</span><span>Bs ${bill.total + minibarTotal}</span></div>`;
  }
  document.getElementById('coBill').innerHTML = html;
}

function doCheckout() {
  clearInterval(window._billInterval);
  const room = selectedRoom;
  const occ = occupancy[room.num];
  const stayMs = Date.now() - occ.checkin;
  const stayMins = stayMs / 60000;

  // <2 min: sin registro, solo liberar habitación
  if (stayMins < 2) {
    delete occupancy[room.num];
    saveOcc();
    closeModal('checkoutOverlay');
    render();
    toast(`🚫 Hab. ${room.num} — cancelada (${Math.floor(stayMins * 60)}s). Sin registro.`);
    return;
  }

  const bill = calcBill(room, occ.checkin, Date.now());
  const typeNames = { ac:'Aire Acond.', fan:'Ventilador', fan2:'Ventilador', simple:'Simple' };

  const minibarItems = occ.minibar || [];
  let minibarBs = 0, vitrinaBs = 0;
  minibarItems.forEach(item => {
    const prod = minibarProducts.find(p=>p.id===item.id);
    const cat = prod ? prod.cat : '';
    if (MINIBAR_CATS.includes(cat)) minibarBs += item.price * item.qty;
    else vitrinaBs += item.price * item.qty;
  });

  // Build pago summary
  const pago = pagoState || {};
  const habPago    = pago.hab     || { cash: bill.total, qr: 0, comision: 0, cambio: 0 };
  const minibarPago= pago.minibar || { cash: minibarBs,  qr: 0,              cambio: 0 };
  const vitrinaPago= pago.vitrina || { cash: vitrinaBs,  qr: 0,              cambio: 0 };

  // Prepago: el monto de hab en el pago ya viene descontado desde slideToPago
  const habMontoReal = habPago.monto !== undefined ? habPago.monto : bill.total;
  const prepaidAmount = occ.prepaid ? occ.prepaid.amount : 0;

  // Comisión solo de habitación (QR de minibar/vitrina no tiene comisión)
  // Total = prepago + pendiente hab + comisión + minibar + vitrina
  const totalConComisiones = prepaidAmount + habMontoReal + (habPago.comision || 0) + minibarBs + vitrinaBs;

  const entry = {
    roomNum: room.num, type: typeNames[room.type],
    guest: occ.guest, checkin: occ.checkin, checkout: Date.now(),
    mode: occ.mode, total: totalConComisiones,
    breakdown: bill.breakdown, extraLabel: bill.extraLabel||'', extraCharge: bill.extraCharge||0,
    minibar: minibarItems,
    prepaid: occ.prepaid || null,
    // Payment detail — cash y qr por sección
    pago: {
      hab:     { monto: habMontoReal, cash: habPago.cash || 0, qr: habPago.qr || 0, comision: habPago.comision || 0, cambio: habPago.cambio || 0, prepaid: prepaidAmount },
      minibar: { monto: minibarBs,  cash: minibarPago.cash || 0,  qr: minibarPago.qr || 0,  comision: 0,                    cambio: minibarPago.cambio || 0 },
      vitrina: { monto: vitrinaBs,  cash: vitrinaPago.cash || 0,  qr: vitrinaPago.qr || 0,  comision: 0,                    cambio: vitrinaPago.cambio || 0 },
    }
  };

  history.push(entry);
  currentShift.entries = currentShift.entries || [];
  currentShift.entries.push(entry);

  occupancy[room.num] = { cleaning: true };
  saveOcc(); saveHist(); saveShift();
  closeModal('checkoutOverlay');
  render();
  addLog('CHECK-OUT', `Hab. ${room.num} — Bs ${totalConComisiones}${stayMins < 5 ? ' (express)' : ''}`);
  if (stayMins < 5) {
    toast(`⚡ Hab. ${room.num} — Bs ${totalConComisiones} · Express (${Math.floor(stayMins)}min) 🧹`);
  } else {
    toast(`✓ Checkout Hab. ${room.num} — Bs ${totalConComisiones} · Pendiente limpieza 🧹`);
  }
}

function confirmCleaning(num, event) {
  event.stopPropagation();
  delete occupancy[num];
  saveOcc();
  render();
  addLog('LIMPIEZA', `Hab. ${num} lista`);
  toast(`🧹 Hab. ${num} lista — disponible para nuevo huésped`);
}

function printReceipt() {
  const room = selectedRoom;
  const occ = occupancy[room.num];
  const bill = calcBill(room, occ.checkin, Date.now());
  const typeNames = { ac:'Aire Acondicionado', fan:'Ventilador', fan2:'Ventilador', simple:'Simple' };

  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`
    <html><head><title>Recibo Hab. ${room.num}</title>
    <style>
      body{font-family:monospace;padding:20px;max-width:320px;margin:0 auto}
      h2{text-align:center;margin-bottom:4px}
      .sub{text-align:center;color:#666;font-size:12px;margin-bottom:16px}
      hr{border:1px dashed #ccc;margin:10px 0}
      .row{display:flex;justify-content:space-between;margin:4px 0;font-size:13px}
      .total{font-size:16px;font-weight:bold}
    </style></head><body>
    <h2>🦋 Motel 23</h2>
    <div class="sub">Recibo de estadía</div>
    <hr>
    <div class="row"><span>Habitación:</span><span>${room.num} — ${typeNames[room.type]}</span></div>
    <div class="row"><span>Huésped:</span><span>${occ.guest}</span></div>
    <div class="row"><span>Entrada:</span><span>${new Date(occ.checkin).toLocaleString('es-BO')}</span></div>
    <div class="row"><span>Salida:</span><span>${new Date().toLocaleString('es-BO')}</span></div>
    <div class="row"><span>Tiempo:</span><span>${formatDuration(Date.now()-occ.checkin)}</span></div>
    <hr>
    <div class="row"><span>${bill.breakdown || 'Noche completa'}</span><span>Bs ${bill.base || bill.total}</span></div>
    ${bill.extraLabel ? `<div class="row"><span>${bill.extraLabel}</span><span>Bs ${bill.extraCharge}</span></div>` : ''}
    <hr>
    <div class="row total"><span>TOTAL:</span><span>Bs ${bill.total}</span></div>
    <hr>
    <div style="text-align:center;font-size:11px;color:#999;margin-top:10px">Gracias por su visita</div>
    <script>window.print();<\/script>
    </body></html>
  `);
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────
function openConfig() {
  const ac   = config.tiers.ac;
  const fan  = config.tiers.fan;
  const fan2 = config.tiers.fan2;
  document.getElementById('cfg-ac-1').value   = ac[1];
  document.getElementById('cfg-ac-2').value   = ac[2];
  document.getElementById('cfg-ac-3').value   = ac[3];
  document.getElementById('cfg-ac-4').value   = ac[4];
  document.getElementById('cfg-ac-5').value   = ac[5];
  document.getElementById('cfg-ac-6').value   = ac[6];
  document.getElementById('cfg-fan-1').value  = fan[1];
  document.getElementById('cfg-fan-2').value  = fan[2];
  document.getElementById('cfg-fan-3').value  = fan[3];
  document.getElementById('cfg-fan-4').value  = fan[4];
  document.getElementById('cfg-fan-5').value  = fan[5];
  document.getElementById('cfg-fan2-1').value = fan2[1];
  document.getElementById('cfg-fan2-2').value = fan2[2];
  document.getElementById('cfg-fan2-3').value = fan2[3];
  document.getElementById('cfg-fan2-4').value = fan2[4];
  document.getElementById('cfg-night').value  = config.night;
  document.getElementById('configOverlay').classList.add('open');
}

function saveConfig() {
  config.tiers.ac = {
    1: parseInt(document.getElementById('cfg-ac-1').value)||45,
    2: parseInt(document.getElementById('cfg-ac-2').value)||80,
    3: parseInt(document.getElementById('cfg-ac-3').value)||110,
    4: parseInt(document.getElementById('cfg-ac-4').value)||140,
    5: parseInt(document.getElementById('cfg-ac-5').value)||160,
    6: parseInt(document.getElementById('cfg-ac-6').value)||180,
  };
  config.tiers.fan = {
    1: parseInt(document.getElementById('cfg-fan-1').value)||35,
    2: parseInt(document.getElementById('cfg-fan-2').value)||65,
    3: parseInt(document.getElementById('cfg-fan-3').value)||90,
    4: parseInt(document.getElementById('cfg-fan-4').value)||110,
    5: parseInt(document.getElementById('cfg-fan-5').value)||130,
  };
  config.tiers.fan2 = {
    1: parseInt(document.getElementById('cfg-fan2-1').value)||35,
    2: parseInt(document.getElementById('cfg-fan2-2').value)||65,
    3: parseInt(document.getElementById('cfg-fan2-3').value)||90,
    4: parseInt(document.getElementById('cfg-fan2-4').value)||100,
  };
  config.night = parseInt(document.getElementById('cfg-night').value)||100;
  api('config', 'POST', config);
  closeModal('configOverlay');
  render();
  toast('✓ Tarifas actualizadas');
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'checkoutOverlay') clearInterval(window._billInterval);
}
function closeOverlay(id, e) { if (e.target.id === id) closeModal(id); }

function saveOcc() { api('ocupacion', 'POST', occupancy); }
function saveHist() {
  // Purgar entradas de hm_hist con más de 3 días de antigüedad
  const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
  history = history.filter(e => (e.checkout || e.checkin || 0) >= threeDaysAgo);
  api('historial', 'PUT', history);
}

// ─── SIDEBAR DRAWER ───────────────────────────────────────────────────────────
let drawerOpen = false;
let activePanel = 'status';
const drawerTitles = { status:'📊 Estado', stats:'📈 Estadísticas', minibar:'🛒 Minibar', records:'📋 Registros', caja:'💰 Caja', inventario:'📦 Inventario' };

function openDrawer(panel, btn) {
  const drawer = document.getElementById('sidebarDrawer');
  // Si ya está abierto con ese panel, lo cierra (toggle)
  if (drawerOpen && activePanel === panel) {
    closeDrawer(); return;
  }
  drawerOpen = true;
  activePanel = panel;
  drawer.classList.add('open');
  document.getElementById('drawerTitle').textContent = drawerTitles[panel];

  // Activar panel correcto
  document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-'+panel).classList.add('active');

  // Activar botón rail
  document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (panel === 'minibar') renderMbManage();
  if (panel === 'stats') updateStatsPanel();
  if (panel === 'records') renderRecords();
  if (panel === 'caja') renderCaja();
  if (panel === 'inventario') renderInventario();
}

function closeDrawer() {
  drawerOpen = false;
  document.getElementById('sidebarDrawer').classList.remove('open');
  document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('active'));
}

function toggleDrawer() {
  if (drawerOpen) { closeDrawer(); }
  else { openDrawer(activePanel, document.getElementById('rail-'+activePanel)); }
}

function renderMbManage() {
  const q = (document.getElementById('mbSearchInput')?.value||'').toLowerCase();
  const filtered = minibarProducts.filter(p =>
    p.name.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q)
  );
  document.getElementById('mbManageList').innerHTML = filtered.map(p => `
    <div class="mb-manage-item">
      <div style="flex:1;min-width:0">
        <div class="mb-manage-name">${p.name}</div>
        <div class="mb-manage-cat">${p.cat}</div>
      </div>
      <input class="mb-manage-price" id="mbp-${p.id}" value="${p.price}" title="Precio Bs" type="number" min="1" onchange="saveMbProduct(${p.id})">
      <input class="mb-manage-stock" id="mbs-${p.id}" value="${p.stock}" title="Stock" type="number" min="0" onchange="saveMbProduct(${p.id})">
      <button class="btn-save-mini" onclick="saveMbProduct(${p.id})">✓</button>
    </div>
  `).join('') || '<div style="font-size:0.75rem;color:var(--text3);padding:8px">Sin resultados</div>';
}

function saveMbProduct(id) {
  const p = minibarProducts.find(p=>p.id===id);
  if (!p) return;
  const priceEl = document.getElementById('mbp-'+id);
  const stockEl = document.getElementById('mbs-'+id);
  if (priceEl) p.price = parseInt(priceEl.value)||p.price;
  if (stockEl) p.stock = parseInt(stockEl.value)||0;
  saveProducts();
  toast(`✓ ${p.name} actualizado`);
}

function addNewProduct() {
  const name = prompt('Nombre del producto:');
  if (!name) return;
  const price = parseInt(prompt('Precio (Bs):')||'0');
  if (!price) return;
  const cats = ['🍺 Bebidas Alcohólicas','🥤 Refrescos','⚡ Energizantes','🍟 Snacks','💊 Farmacia / Adultos','🧴 Higiene'];
  const catIdx = prompt(`Categoría:\n${cats.map((c,i)=>`${i+1}. ${c}`).join('\n')}\n\nEscribí el número:`);
  const cat = cats[(parseInt(catIdx)||1)-1] || cats[0];
  const newId = Math.max(...minibarProducts.map(p=>p.id))+1;
  minibarProducts.push({ id:newId, cat, name, price, stock:20 });
  saveProducts();
  renderMbManage();
  toast(`✓ ${name} agregado`);
}

// ─── MINIBAR DATA ─────────────────────────────────────────────────────────────
const DEFAULT_PRODUCTS = [
  // BEBIDAS
  {id:1,  cat:'🍺 Bebidas Alcohólicas', name:'Paceña Macanuda',  price:20, stock:30, img:'Paceña_Macanuda.jpg'},
  {id:2,  cat:'🍺 Bebidas Alcohólicas', name:'Paceña Lata',      price:12, stock:30, img:'pacena.png'},
  {id:3,  cat:'🍺 Bebidas Alcohólicas', name:'Vino',             price:35, stock:15, img:'Vino.png'},
  {id:4,  cat:'🥤 Refrescos',           name:'Coca Cola Popular', price:8, stock:30, img:'coca_cola_popular.png'},
  {id:5,  cat:'🥤 Refrescos',           name:'Coca Mini',        price:3,  stock:50, img:'Coca_cola_mini.png'},
  {id:6,  cat:'🥤 Refrescos',           name:'Coca 2lt',         price:20, stock:20, img:'Coca_cola_2lt.jpg'},
  {id:7,  cat:'🥤 Refrescos',           name:'Agua',             price:10, stock:40, img:'agua.png'},
  {id:8,  cat:'🥤 Refrescos',           name:'Agua 2lt',         price:15, stock:20, img:'Agua_2lt.jpg'},
  {id:9,  cat:'🥤 Refrescos',           name:'Ades',             price:15, stock:20, img:'Ades.png'},
  {id:10, cat:'⚡ Energizantes',        name:'Black',            price:10, stock:20, img:'Black.png'},
  {id:11, cat:'⚡ Energizantes',        name:'Ciclón',           price:8,  stock:20, img:'Ciclon.png'},
  {id:12, cat:'⚡ Energizantes',        name:'Powerade',         price:15, stock:20, img:'powerade.png'},
  // VITRINA
  {id:13, cat:'🍟 Snacks',              name:'Papa Frita',       price:7,  stock:30, img:'Papas_fritas.jpg'},
  {id:14, cat:'🍟 Snacks',              name:'Chipilo',          price:7,  stock:30, img:'Chipilo.jpg'},
  {id:15, cat:'🍟 Snacks',              name:'Maní',             price:7,  stock:30, img:'mani.jpg'},
  {id:16, cat:'🍟 Snacks',              name:'Nachos',           price:10, stock:20, img:'nachos.jpg'},
  {id:17, cat:'💊 Farmacia / Adultos',  name:'Pantera Suelto',   price:5,  stock:50, img:'pantera_suelto.jpeg'},
  {id:18, cat:'💊 Farmacia / Adultos',  name:'Maxmen Suelto',    price:7,  stock:50, img:'maxmen suelto.jpeg'},
  {id:19, cat:'💊 Farmacia / Adultos',  name:'Pantera Caja',     price:12, stock:20, img:'pantera caja.jpg'},
  {id:20, cat:'💊 Farmacia / Adultos',  name:'Maxmen Caja',      price:17, stock:20, img:'Maxmen caja.jpg'},
  {id:21, cat:'💊 Farmacia / Adultos',  name:'Día D',            price:35, stock:15, img:'dia_d.png'},
  {id:22, cat:'💊 Farmacia / Adultos',  name:'Viagra',           price:15, stock:15, img:'Maximo_viagra.png'},
  {id:23, cat:'🧴 Higiene',             name:'Alikal',           price:8,  stock:20, img:'alikal.png'},
  {id:24, cat:'🧴 Higiene',             name:'Encendedor',       price:2,  stock:30, img:'encendedor.jpg'},
  {id:25, cat:'🧴 Higiene',             name:'Jaboncillo',       price:10, stock:20, img:'Jaboncillo.jpg'},
  {id:26, cat:'🧴 Higiene',             name:'Rasurador',        price:5,  stock:20, img:'Rasurador.jpg'},
  {id:27, cat:'🧴 Higiene',             name:'Sedal',            price:4,  stock:20, img:'Sedal.png'},
];
let minibarProducts = [...DEFAULT_PRODUCTS];

let mbCart = {}; // { productId: qty }
let mbRoomNum = null;

function saveProducts() { api('productos', 'POST', minibarProducts); }

function openMinibar(num, event) {
  event.stopPropagation();
  mbRoomNum = num;
  mbCart = {};

  // Pre-load existing minibar items into cart
  const existing = occupancy[num]?.minibar || [];
  existing.forEach(i => { mbCart[i.id] = i.qty; });

  document.getElementById('mb-roomlabel').textContent = `Hab. ${num}`;
  renderMbProducts();
  renderCart();
  document.getElementById('minibarOverlay').classList.add('open');
}

function renderMbProducts() {
  const cats = {};
  minibarProducts.forEach(p => {
    if (!cats[p.cat]) cats[p.cat] = [];
    cats[p.cat].push(p);
  });

  let html = '';
  Object.entries(cats).forEach(([cat, prods]) => {
    html += `<div class="mb-cat-title">${cat}</div><div class="mb-products-grid">`;
    prods.forEach(p => {
      const qty = mbCart[p.id] || 0;
      const oos = p.stock <= 0;
      html += `
        <div class="mb-product${oos?' out-of-stock':''}"
          onclick="mbChange(${p.id},1)"
          oncontextmenu="mbChange(${p.id},-1);return false;">
          ${p.img
            ? `<img class="mb-product-img" src="/images/${p.img}" alt="${p.name}">`
            : `<div class="mb-product-noimg">📦</div>`}
          <div class="mb-product-foot">
            <div class="mb-product-name">${p.name}</div>
            <div class="mb-foot-row">
              <span class="mb-product-price">Bs ${p.price}</span>
              <span class="mb-qty-badge${qty>0?' mb-qty-active':''}" id="mbqty-${p.id}">${qty>0?qty:''}</span>
            </div>
          </div>
        </div>`;
    });
    html += '</div>';
  });
  document.getElementById('mbProducts').innerHTML = html;
}

function mbChange(id, delta) {
  const p = minibarProducts.find(p=>p.id===id);
  if (!p) return;
  const cur = mbCart[id] || 0;
  const newQty = Math.max(0, Math.min(p.stock, cur + delta));
  if (newQty === 0) delete mbCart[id];
  else mbCart[id] = newQty;
  const el = document.getElementById('mbqty-'+id);
  if (el) {
    el.textContent = newQty > 0 ? newQty : '';
    el.classList.toggle('mb-qty-active', newQty > 0);
  }
  renderCart();
}

function renderCart() {
  const items = document.getElementById('cartItems');
  const keys = Object.keys(mbCart).filter(k=>mbCart[k]>0);
  if (!keys.length) {
    items.innerHTML = '<div class="cart-empty">Vacío</div>';
    document.getElementById('cartTotal').textContent = 'Bs 0';
    return;
  }
  let total = 0;
  items.innerHTML = keys.map(id => {
    const p = minibarProducts.find(p=>p.id==id);
    const subtotal = p.price * mbCart[id];
    total += subtotal;
    return `<div class="cart-item"><span class="cart-item-name">${p.name} ×${mbCart[id]}</span><span class="cart-item-price">Bs ${subtotal}</span></div>`;
  }).join('');
  document.getElementById('cartTotal').textContent = `Bs ${total}`;
}

function confirmMinibar() {
  if (!mbRoomNum) return;
  const items = Object.keys(mbCart).filter(k=>mbCart[k]>0).map(id => {
    const p = minibarProducts.find(p=>p.id==id);
    return { id:p.id, name:p.name, price:p.price, qty:mbCart[id] };
  });

  // Calcular diferencia respecto al estado anterior (por si se edita)
  const prev = occupancy[mbRoomNum].minibar || [];
  const prevMap = {};
  prev.forEach(i => { prevMap[i.id] = i.qty; });

  // Deduct stock local y registrar ventas en inventario
  items.forEach(i => {
    const p = minibarProducts.find(p=>p.id===i.id);
    const diff = i.qty - (prevMap[i.id] || 0);
    if (p && diff > 0) p.stock -= diff;
    if (diff > 0) {
      api('inventario/vender', 'POST', { producto_id: i.id, cantidad: diff });
    } else if (diff < 0) {
      // Devolvió unidades — revertir en inventario
      api('inventario/devolver', 'POST', { producto_id: i.id, cantidad: Math.abs(diff) });
    }
  });
  // Si quitó items que antes estaban, también revertir
  prev.forEach(i => {
    if (!items.find(x=>x.id===i.id)) {
      api('inventario/devolver', 'POST', { producto_id: i.id, cantidad: i.qty });
    }
  });

  occupancy[mbRoomNum].minibar = items;
  saveOcc();
  saveProducts();
  closeModal('minibarOverlay');
  render();
  const total = items.reduce((s,i)=>s+i.price*i.qty,0);
  toast(`🛒 Minibar Hab. ${mbRoomNum} — Bs ${total} agregado`);
}

function clearCart() {
  mbCart = {};
  renderMbProducts();
  renderCart();
}

function closeMinibarOutside(e) { if (e.target.id==='minibarOverlay') closeModal('minibarOverlay'); }

function openMinibarFromCheckout() {
  closeModal('checkoutOverlay');
  openMinibar(selectedRoom.num, { stopPropagation: ()=>{} });
}

function quickPrint(num, event) {
  event.stopPropagation();
  const room = ROOM_DEFS.find(r => r.num == num);
  const occ = occupancy[num];
  if (!room || !occ) return;
  const bill = calcBill(room, occ.checkin, Date.now());
  const minibarItems = occ.minibar || [];
  const minibarTotal = minibarItems.reduce((s,i)=>s+i.price*i.qty,0);
  const typeNames = { ac:'Aire Acondicionado', fan:'Ventilador', fan2:'Ventilador', simple:'Simple' };
  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`
    <html><head><title>Recibo Hab. ${num}</title>
    <style>
      body{font-family:monospace;padding:20px;max-width:320px;margin:0 auto}
      h2{text-align:center;margin-bottom:4px}
      .sub{text-align:center;color:#666;font-size:12px;margin-bottom:16px}
      hr{border:1px dashed #ccc;margin:10px 0}
      .row{display:flex;justify-content:space-between;margin:4px 0;font-size:13px}
      .total{font-size:16px;font-weight:bold}
    </style></head><body>
    <h2>🦋 Motel 23</h2>
    <div class="sub">Recibo de estadía</div>
    <hr>
    <div class="row"><span>Habitación:</span><span>${num} — ${typeNames[room.type]}</span></div>
    <div class="row"><span>Transporte:</span><span>${occ.guest}</span></div>
    <div class="row"><span>Entrada:</span><span>${new Date(occ.checkin).toLocaleString('es-BO')}</span></div>
    <div class="row"><span>Tiempo:</span><span>${formatDuration(Date.now()-occ.checkin)}</span></div>
    <hr>
    <div class="row"><span>${bill.breakdown||'Noche completa'}</span><span>Bs ${bill.base||bill.total}</span></div>
    ${bill.extraLabel?`<div class="row"><span>${bill.extraLabel}</span><span>Bs ${bill.extraCharge}</span></div>`:''}
    ${minibarItems.length?`<hr><div class="row"><b>Minibar</b></div>${minibarItems.map(i=>`<div class="row"><span>${i.name} ×${i.qty}</span><span>Bs ${i.price*i.qty}</span></div>`).join('')}`:''}
    <hr>
    <div class="row total"><span>TOTAL:</span><span>Bs ${bill.total+minibarTotal}</span></div>
    <hr>
    <div style="text-align:center;font-size:11px;color:#999;margin-top:10px">Gracias por su visita</div>
    <script>window.print();<\/script>
    </body></html>
  `);
}

// ─── CAJA ─────────────────────────────────────────────────────────────────────
const MINIBAR_CATS = ['🍺 Bebidas Alcohólicas','🥤 Refrescos','⚡ Energizantes'];

let cajaData = { inicio: null, egresos: [] };
function getCajaData() {
  return cajaData;
}
function saveCajaData(data) { cajaData = data; api('caja', 'POST', data); }

function calcCajaTotals() {
  const entries = currentShift.entries || [];
  let hab_cash=0, hab_qr=0, hab_com=0;
  let mb_cash=0,  mb_qr=0,  mb_com=0;
  let vit_cash=0, vit_qr=0, vit_com=0;
  let totalCambios=0;

  entries.forEach(e => {
    const p = e.pago;
    if (!p) {
      // entrada legacy sin pago detallado — todo cash
      const mbT = (e.minibar||[]).reduce((s,i)=>s+i.price*i.qty,0);
      hab_cash += e.total - mbT;
      (e.minibar||[]).forEach(item => {
        const prod = minibarProducts.find(x=>x.id===item.id);
        if (MINIBAR_CATS.includes(prod?.cat)) mb_cash += item.price*item.qty;
        else vit_cash += item.price*item.qty;
      });
      return;
    }
    // Habitación — soporta formato nuevo (cash/qr) y legado (method)
    if (p.hab.cash !== undefined) {
      hab_cash += p.hab.cash; hab_qr += p.hab.qr || 0; hab_com += p.hab.comision || 0;
    } else {
      if (p.hab.method === 'cash') hab_cash += p.hab.monto; else { hab_qr += p.hab.monto; hab_com += p.hab.comision || 0; }
    }
    if (p.hab.cambio > 0) totalCambios += p.hab.cambio;
    // Prepago — sumar al efectivo/qr de hab
    if (e.prepaid) {
      hab_cash += e.prepaid.cash || 0;
      hab_qr   += e.prepaid.qr || 0;
    }
    // Minibar
    if (p.minibar.monto > 0) {
      if (p.minibar.cash !== undefined) {
        mb_cash += p.minibar.cash; mb_qr += p.minibar.qr || 0;
      } else {
        if (p.minibar.method === 'cash') mb_cash += p.minibar.monto; else mb_qr += p.minibar.monto;
      }
      if (p.minibar.cambio > 0) totalCambios += p.minibar.cambio;
    }
    // Vitrina
    if (p.vitrina.monto > 0) {
      if (p.vitrina.cash !== undefined) {
        vit_cash += p.vitrina.cash; vit_qr += p.vitrina.qr || 0;
      } else {
        if (p.vitrina.method === 'cash') vit_cash += p.vitrina.monto; else vit_qr += p.vitrina.monto;
      }
      if (p.vitrina.cambio > 0) totalCambios += p.vitrina.cambio;
    }
  });

  const caja = getCajaData();
  const gastos = caja.egresos.reduce((s,e)=>s+e.monto,0);
  const inicio = caja.inicio || 0;
  const efectivo = inicio + hab_cash + mb_cash + vit_cash - totalCambios - gastos;
  const digital  = hab_qr + mb_qr + vit_qr;
  const comisiones = hab_com + mb_com + vit_com;

  return {
    inicio, gastos, totalCambios,
    hab:     { cash: hab_cash,  qr: hab_qr,  com: hab_com },
    minibar: { cash: mb_cash,   qr: mb_qr,   com: mb_com },
    vitrina: { cash: vit_cash,  qr: vit_qr,  com: vit_com },
    efectivo, digital, comisiones,
    total: efectivo + digital,
    entries: entries.length,
    egresos: caja.egresos
  };
}

function renderCaja() {
  const t = calcCajaTotals();
  const caja = getCajaData();

  // Totales grandes
  document.getElementById('caja-total').textContent = `Bs ${t.efectivo + t.digital}`;
  document.getElementById('caja-total-sub').textContent =
    `💵 Efectivo Bs ${t.efectivo}  ·  📱 Digital Bs ${t.digital}  ·  Comisiones Bs ${t.comisiones}`;

  // Desglose 3×2 tabla
  document.getElementById('caja-hab-val').textContent     = `Bs ${t.hab.cash + t.hab.qr}`;
  document.getElementById('caja-hab-sub').textContent     = `💵 Bs ${t.hab.cash}  📱 Bs ${t.hab.qr}${t.hab.com>0?' com.'+t.hab.com:''}`;
  document.getElementById('caja-minibar-val').textContent = `Bs ${t.minibar.cash + t.minibar.qr}`;
  document.getElementById('caja-minibar-sub').textContent = `💵 Bs ${t.minibar.cash}  📱 Bs ${t.minibar.qr}${t.minibar.com>0?' com.'+t.minibar.com:''}`;
  document.getElementById('caja-vitrina-val').textContent = `Bs ${t.vitrina.cash + t.vitrina.qr}`;
  document.getElementById('caja-vitrina-sub').textContent = `💵 Bs ${t.vitrina.cash}  📱 Bs ${t.vitrina.qr}${t.vitrina.com>0?' com.'+t.vitrina.com:''}`;
  document.getElementById('caja-gastos-total').textContent = `Bs ${t.gastos}`;
  if (document.getElementById('caja-cambios-val'))
    document.getElementById('caja-cambios-val').textContent = `Bs ${t.totalCambios}`;

  // Monto inicio
  const inicioLabel = document.getElementById('caja-inicio-label');
  if (caja.inicio !== null) {
    document.getElementById('caja-inicio-val').value = caja.inicio;
    inicioLabel.textContent = `✓ Fijado en Bs ${caja.inicio}`;
    inicioLabel.style.color = 'var(--green)';
  } else {
    inicioLabel.textContent = 'No fijado — ingresá el monto al abrir turno';
    inicioLabel.style.color = 'var(--text3)';
  }

  // Egresos
  const list = document.getElementById('egreso-list');
  if (!t.egresos.length) {
    list.innerHTML = '<div style="font-size:0.72rem;color:var(--text3);text-align:center;padding:8px">Sin gastos anotados</div>';
  } else {
    list.innerHTML = t.egresos.map((e,i) => `
      <div class="egreso-item">
        <div style="display:flex;flex-direction:column;flex:1;min-width:0">
          <span class="egreso-item-motivo">${e.motivo}</span>
          <span style="font-size:0.6rem;color:var(--text3)">${formatTime(e.ts)}</span>
        </div>
        <span class="egreso-item-monto">−Bs ${e.monto}</span>
        <button class="egreso-item-del" onclick="deleteEgreso(${i})" title="Eliminar">✕</button>
      </div>`).join('');
  }
}

function setCajaInicio() {
  const val = parseInt(document.getElementById('caja-inicio-val').value)||0;
  const caja = getCajaData();
  caja.inicio = val;
  saveCajaData(caja);
  renderCaja();
  toast(`✓ Monto inicial: Bs ${val}`);
}

function addEgreso() {
  const motivo = document.getElementById('egreso-motivo').value.trim();
  const monto  = parseInt(document.getElementById('egreso-monto').value)||0;
  if (!motivo) { toast('⚠ Escribí el motivo del gasto'); return; }
  if (!monto)  { toast('⚠ Ingresá un monto válido'); return; }
  const caja = getCajaData();
  caja.egresos.push({ motivo, monto, ts: Date.now() });
  saveCajaData(caja);
  document.getElementById('egreso-motivo').value = '';
  document.getElementById('egreso-monto').value = '';
  renderCaja();
  toast(`− Bs ${monto} anotado: ${motivo}`);
}

function deleteEgreso(idx) {
  const caja = getCajaData();
  caja.egresos.splice(idx, 1);
  saveCajaData(caja);
  renderCaja();
}

function resetCajaForNewShift() {
  saveCajaData({ inicio: null, egresos: [] });
}

// ─── RECORDS SYSTEM ───────────────────────────────────────────────────────────
// hm_days: { "2026-03-13": [ ...shifts ] }
let allDays = {};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function saveDays() {
  // Guardar cada día individualmente
  Object.entries(allDays).forEach(([fecha, datos]) => {
    api('dias', 'POST', { fecha, datos });
  });
}

// Llamar al cerrar turno para guardar en el registro diario
function archiveShiftToDay(shift) {
  const key = todayKey();
  if (!allDays[key]) allDays[key] = [];
  allDays[key].push(shift);
  purgePruneOldDays();
  saveDay(key);
}

function saveDay(fecha) {
  api('dias', 'POST', { fecha, datos: allDays[fecha] });
}

function purgePruneOldDays() {
  const keys = Object.keys(allDays).sort();
  const keep = 3;
  // Exportar días viejos automáticamente
  while (keys.length > keep) {
    const oldKey = keys.shift();
    exportDayToFile(oldKey, allDays[oldKey]);
    delete allDays[oldKey];
  }
}

function exportDayToFile(dateKey, dayShifts) {
  const totalDay = dayShifts.reduce((s,sh)=>s+(sh.total||0),0);
  const allEntries = dayShifts.flatMap(sh=>sh.entries||[]);
  const data = {
    fecha: dateKey,
    exportado: new Date().toISOString(),
    motel: 'Motel 23',
    resumen: { totalRecaudado: totalDay, turnos: dayShifts.length, checkouts: allEntries.length },
    turnos: dayShifts.map(sh => ({
      tipo: sh.type === 'day' ? 'Día' : 'Noche',
      inicio: new Date(sh.start).toLocaleString('es-BO'),
      fin: sh.end ? new Date(sh.end).toLocaleString('es-BO') : '—',
      total: sh.total || 0,
      habitaciones: (sh.entries||[]).map(e => ({
        habitacion: e.roomNum,
        tipo: e.type,
        transporte: e.guest,
        entrada: new Date(e.checkin).toLocaleString('es-BO'),
        salida: new Date(e.checkout).toLocaleString('es-BO'),
        duracion: formatDuration(e.checkout - e.checkin),
        cobro: e.breakdown || '',
        minibar: (e.minibar||[]).map(i=>`${i.name} x${i.qty} = Bs${i.price*i.qty}`).join(', ') || 'Ninguno',
        total: e.total
      }))
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `motel23_${dateKey}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`📁 Exportado: motel23_${dateKey}.json`);
}

// Retorna los turnos del día de negocio actual:
// desde el último turno día cerrado (inclusive) hasta el turno actual.
function buildCurrentDayShifts() {
  const dayStart = getCurrentDayStart();
  let result = shifts.filter(sh => sh.start >= dayStart);
  if (currentShift && (currentShift.entries||[]).length > 0) {
    result = [...result, currentShift];
  }
  return result;
}

function renderRecords() {
  const content = document.getElementById('rec-content');
  const dayShifts = buildCurrentDayShifts();

  if (!dayShifts.length) {
    content.innerHTML = '<div class="rec-empty">Sin registros hoy</div>';
    return;
  }

  const grandTotal = dayShifts.reduce((s,sh) => s + (sh.total || (sh.entries||[]).reduce((es,e)=>es+e.total,0)), 0);

  let html = `<div style="font-size:0.7rem;color:var(--text3);display:flex;justify-content:space-between;padding:2px 0 6px">
    <span>${dayShifts.length} turno(s) del día</span>
    <span style="color:var(--gold);font-family:'JetBrains Mono',monospace;font-weight:700">Total: Bs ${grandTotal}</span>
  </div>`;

  dayShifts.forEach((sh, idx) => {
    const entries = sh.entries || [];
    const shTotal = sh.total || entries.reduce((s,e)=>s+e.total,0);
    const shLabel = sh.type === 'day' ? '☀ Turno Día' : '🌙 Turno Noche';
    const shTime = sh.start ? formatTime(sh.start) : '—';
    const shEnd = sh.end ? formatTime(sh.end) : 'En curso';
    const bodyId = `recbody-${idx}`;

    html += `<div class="rec-shift">
      <div class="rec-shift-header" onclick="toggleRecShift('${bodyId}')">
        <div>
          <div class="rec-shift-title">${shLabel}</div>
          <div class="rec-shift-meta">${shTime} → ${shEnd} · ${entries.length} hab.</div>
        </div>
        <div class="rec-shift-total">Bs ${shTotal}</div>
      </div>
      <div class="rec-shift-body" id="${bodyId}">`;

    if (!entries.length) {
      html += `<div class="rec-empty" style="padding:12px">Sin checkouts en este turno</div>`;
    } else {
      entries.forEach(e => {
        const dur = formatDuration(e.checkout - e.checkin);
        const mb = (e.minibar||[]);
        const mbTotal = mb.reduce((s,i)=>s+i.price*i.qty,0);
        html += `<div class="rec-entry">
          <div class="rec-entry-top">
            <span class="rec-entry-room">Hab. ${e.roomNum}</span>
            <span class="rec-entry-total">Bs ${e.total}</span>
          </div>
          <div class="rec-entry-row"><span>${e.type} · ${e.guest}</span><span>${dur}</span></div>
          <div class="rec-entry-row"><span>Entrada: ${formatTime(e.checkin)}</span><span>Salida: ${formatTime(e.checkout)}</span></div>
          <div class="rec-entry-row"><span>${e.breakdown||'Noche completa'}</span></div>
          ${mb.length ? `<div class="rec-entry-minibar">🛒 ${mb.map(i=>`${i.name} ×${i.qty}`).join(', ')} — Bs ${mbTotal}</div>` : ''}
        </div>`;
      });
    }
    html += `</div></div>`;
  });

  content.innerHTML = html;
}

function toggleRecShift(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}
function openShiftClose() {
  const entries = currentShift.entries || [];
  const occupiedRooms = Object.keys(occupancy);

  const warnEl = document.getElementById('shiftWarn');
  if (occupiedRooms.length > 0) {
    warnEl.style.display = 'block';
    document.getElementById('shiftWarnCount').textContent = occupiedRooms.length;
  } else {
    warnEl.style.display = 'none';
  }

  const isDay = currentShift.type === 'day';
  document.getElementById('shiftModalTitle').textContent =
    `⏹ Cierre de turno ${isDay ? '☀ Día' : '🌙 Noche'}`;

  const total = entries.reduce((s,e) => s+e.total, 0);
  const shiftDuration = Date.now() - currentShift.start;
  const shiftHours = Math.floor(shiftDuration/3600000);
  const shiftMins = Math.floor((shiftDuration%3600000)/60000);

  const caja = calcCajaTotals();
  document.getElementById('shiftSummary').innerHTML = `
    <div class="shift-stat"><div class="shift-stat-val">Bs ${total}</div><div class="shift-stat-lbl">Total recaudado</div></div>
    <div class="shift-stat"><div class="shift-stat-val">${entries.length}</div><div class="shift-stat-lbl">Habitaciones atendidas</div></div>
    <div class="shift-stat"><div class="shift-stat-val">${shiftHours}h ${shiftMins}m</div><div class="shift-stat-lbl">Duración del turno</div></div>
    <div class="shift-stat"><div class="shift-stat-val">${formatTime(currentShift.start)}</div><div class="shift-stat-lbl">Inicio del turno</div></div>
    <div class="shift-stat" style="grid-column:1/-1;background:rgba(245,200,66,0.06);border:1px solid rgba(245,200,66,0.2);border-radius:8px;padding:12px">
      <div style="font-size:0.65rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">💰 Resumen de caja</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:0.7rem;margin-bottom:8px">
        <div style="text-align:center;font-size:0.6rem;font-weight:700;color:var(--text3);padding:4px 0">CATEGORÍA</div>
        <div style="text-align:center;font-size:0.6rem;font-weight:700;color:var(--green);padding:4px 0">💵 EFECTIVO</div>
        <div style="text-align:center;font-size:0.6rem;font-weight:700;color:var(--ac-color);padding:4px 0">📱 QR/TARJETA</div>
        ${[
          ['🛏 Hab.',  caja.hab],
          ['🍺 Minibar', caja.minibar],
          ['🏪 Vitrina', caja.vitrina],
        ].map(([label, c]) => `
          <div style="color:var(--text2);padding:3px 0">${label}</div>
          <div style="text-align:center;font-family:'JetBrains Mono',monospace;color:var(--green);font-weight:700">Bs ${c.cash}</div>
          <div style="text-align:center;font-family:'JetBrains Mono',monospace;color:var(--ac-color);font-weight:700">Bs ${c.qr}${c.com>0?`<span style="color:var(--text3);font-size:0.6rem"> com.${c.com}</span>`:''}
          </div>`).join('')}
      </div>
      <div style="border-top:1px solid rgba(245,200,66,0.15);padding-top:8px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:0.72rem">
        <div><div style="color:var(--text3);font-size:0.6rem">Cambios devueltos</div><div style="color:var(--orange);font-weight:700;font-family:'JetBrains Mono',monospace">−Bs ${caja.totalCambios}</div></div>
        <div><div style="color:var(--text3);font-size:0.6rem">Gastos anotados</div><div style="color:var(--red);font-weight:700;font-family:'JetBrains Mono',monospace">−Bs ${caja.gastos}</div></div>
        <div><div style="color:var(--text3);font-size:0.6rem">Comisiones</div><div style="color:var(--text3);font-weight:700;font-family:'JetBrains Mono',monospace">Bs ${caja.comisiones}</div></div>
      </div>
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(245,200,66,0.2);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:0.65rem;color:var(--text3)">💵 En cajón físico</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;font-weight:800;color:var(--green)">Bs ${caja.efectivo}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:0.65rem;color:var(--text3)">📱 En cuenta digital</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;font-weight:800;color:var(--ac-color)">Bs ${caja.digital}</div>
        </div>
      </div>
    </div>
  `;

  const tbody = document.getElementById('shiftTableBody');
  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--text3)">Sin movimientos en este turno</td></tr>';
  } else {
    tbody.innerHTML = entries.map(e => `
      <tr>
        <td><strong style="font-family:\'JetBrains Mono\',monospace">${e.roomNum}</strong></td>
        <td>${e.type}</td>
        <td>${e.guest}</td>
        <td>${formatTime(e.checkin)}</td>
        <td>${formatTime(e.checkout)}</td>
        <td style="font-family:\'JetBrains Mono\',monospace">${formatDuration(e.checkout-e.checkin)}</td>
        <td style="font-family:\'JetBrains Mono\',monospace;color:var(--gold);font-weight:600">Bs ${e.total}</td>
      </tr>
    `).join('');
  }

  document.getElementById('shiftOverlay').classList.add('open');
}

function confirmShiftClose() {
  // Contar habitaciones que pasan al siguiente turno (NO se les fuerza checkout)
  const occupiedCount = Object.keys(occupancy).filter(n => !occupancy[n].cleaning).length;
  const closingNight  = currentShift.type === 'night';

  currentShift.end = Date.now();
  currentShift.total = (currentShift.entries||[]).reduce((s,e)=>s+e.total,0);
  if (occupiedCount > 0) {
    currentShift.carriedOver = occupiedCount;
  }
  const closedNightShift = {...currentShift};

  shifts.push(currentShift);
  // Purgar shifts con más de 3 días de antigüedad
  const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
  shifts = shifts.filter(sh => (sh.start || 0) >= threeDaysAgo);
  api('turnos', 'PUT', shifts);

  const cajaTotals = calcCajaTotals();
  archiveShiftToDay({...currentShift, caja: cajaTotals});

  saveOcc(); saveHist();
  resetCajaForNewShift();

  // Backup automático al cerrar turno
  addLog('TURNO CERRADO', `${currentShift.type === 'day' ? 'Día' : 'Noche'} — Bs ${currentShift.total}`);
  autoBackup();

  startNewShift();
  closeModal('shiftOverlay');
  render();

  const msg = occupiedCount > 0
    ? `✓ Turno cerrado. ${occupiedCount} hab. pasan al nuevo turno.`
    : '✓ Turno cerrado. Nuevo turno iniciado.';
  toast(msg);

  // Si cerramos turno noche → buscar turno día y generar reporte diario
  if (closingNight) {
    const dayShift = findMatchingDayShift();
    if (dayShift) {
      setTimeout(() => {
        if (confirm('🌅 Turno noche cerrado.\n\n¿Generar el reporte del día completo (Día + Noche)?')) {
          generateFullDayReport(dayShift, closedNightShift);
        }
      }, 600);
    }
  }
}

// Busca el turno día más reciente en shifts (para emparejarlo con el noche)
function findMatchingDayShift() {
  for (let i = shifts.length - 1; i >= 0; i--) {
    if (shifts[i].type === 'day') return shifts[i];
  }
  return null;
}

// Genera reporte HTML imprimible + descarga JSON del día completo
function generateFullDayReport(dayShift, nightShift) {
  const fmt = ts => ts ? new Date(ts).toLocaleString('es-BO') : '—';
  const fmtTime = ts => ts ? formatTime(ts) : '—';
  const fmtDur  = (a,b) => formatDuration(b - a);

  const dayEntries   = dayShift.entries   || [];
  const nightEntries = nightShift.entries || [];
  const allEntries   = [...dayEntries, ...nightEntries];

  const dayTotal   = dayShift.total   || 0;
  const nightTotal = nightShift.total || 0;
  const grandTotal = dayTotal + nightTotal;

  // Desglose de pago del día (efectivo + QR por tipo)
  function sumPago(entries) {
    let cash = 0, qr = 0;
    entries.forEach(e => {
      if (e.pago) {
        Object.values(e.pago).forEach(p => {
          cash += p.cash  || 0;
          qr   += p.qr    || 0;
        });
      } else {
        cash += e.total || 0;
      }
    });
    return { cash, qr };
  }
  const dayPago   = sumPago(dayEntries);
  const nightPago = sumPago(nightEntries);
  const totalPago = { cash: dayPago.cash + nightPago.cash, qr: dayPago.qr + nightPago.qr };

  // Fecha base del reporte (la del turno día)
  const reportDate = new Date(dayShift.start).toLocaleDateString('es-BO', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  function shiftTable(entries) {
    if (!entries.length) return '<tr><td colspan="5" style="text-align:center;color:#999">Sin actividad</td></tr>';
    return entries.map(e => `
      <tr>
        <td>${e.roomNum}</td>
        <td>${e.type}</td>
        <td>${fmtTime(e.checkin)}</td>
        <td>${fmtTime(e.checkout)}</td>
        <td style="text-align:right;font-weight:600">Bs ${e.total}</td>
      </tr>`).join('');
  }

  const html = `<!DOCTYPE html><html lang="es"><head>
  <meta charset="UTF-8">
  <title>Reporte Día Completo — Motel 23</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:monospace;padding:24px;max-width:560px;margin:0 auto;color:#1a1a1a}
    h1{text-align:center;font-size:18px;margin-bottom:2px}
    .sub{text-align:center;color:#555;font-size:11px;margin-bottom:12px}
    hr{border:none;border-top:1px dashed #bbb;margin:10px 0}
    hr.solid{border-top:2px solid #333}
    .section-title{font-size:13px;font-weight:bold;margin:10px 0 4px;padding:4px 6px;background:#f0f0f0}
    .row{display:flex;justify-content:space-between;font-size:12px;margin:3px 0}
    .row.bold{font-weight:700;font-size:13px}
    .row.grand{font-size:16px;font-weight:800;margin-top:6px}
    table{width:100%;border-collapse:collapse;font-size:11px;margin:6px 0}
    th{text-align:left;border-bottom:1px solid #aaa;padding:3px 4px;background:#f8f8f8;font-size:10px}
    td{padding:3px 4px;border-bottom:1px solid #eee;vertical-align:top}
    .pago-row{display:flex;gap:16px;font-size:11px;color:#444;margin:2px 0}
    .stamp{text-align:center;font-size:9px;color:#aaa;margin-top:14px}
    @media print{body{padding:10px}}
  </style></head><body>
  <h1>🦋 Motel 23</h1>
  <div class="sub">Reporte Día Completo</div>
  <div class="sub" style="font-size:13px;font-weight:700;color:#333;margin-bottom:4px">${reportDate}</div>
  <hr class="solid">

  <!-- TURNO DÍA -->
  <div class="section-title">☀ Turno Día</div>
  <div class="row"><span>Horario:</span><span>${fmt(dayShift.start)} → ${fmt(dayShift.end)}</span></div>
  <div class="row"><span>Habitaciones atendidas:</span><span>${dayEntries.length}</span></div>
  <div class="pago-row"><span>💵 Efectivo: Bs ${dayPago.cash}</span><span>📱 QR: Bs ${dayPago.qr}</span></div>
  <div class="row bold"><span>Total turno día:</span><span>Bs ${dayTotal}</span></div>
  <table>
    <thead><tr><th>Hab.</th><th>Tipo</th><th>Entrada</th><th>Salida</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${shiftTable(dayEntries)}</tbody>
  </table>
  <hr>

  <!-- TURNO NOCHE -->
  <div class="section-title">🌙 Turno Noche</div>
  <div class="row"><span>Horario:</span><span>${fmt(nightShift.start)} → ${fmt(nightShift.end)}</span></div>
  <div class="row"><span>Habitaciones atendidas:</span><span>${nightEntries.length}</span></div>
  <div class="pago-row"><span>💵 Efectivo: Bs ${nightPago.cash}</span><span>📱 QR: Bs ${nightPago.qr}</span></div>
  <div class="row bold"><span>Total turno noche:</span><span>Bs ${nightTotal}</span></div>
  <table>
    <thead><tr><th>Hab.</th><th>Tipo</th><th>Entrada</th><th>Salida</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${shiftTable(nightEntries)}</tbody>
  </table>
  <hr class="solid">

  <!-- GRAN TOTAL -->
  <div class="row grand"><span>TOTAL DEL DÍA:</span><span>Bs ${grandTotal}</span></div>
  <div class="pago-row" style="font-size:12px;margin-top:4px">
    <span>💵 Efectivo total: Bs ${totalPago.cash}</span>
    <span>📱 QR total: Bs ${totalPago.qr}</span>
  </div>
  <div class="row" style="font-size:11px;color:#555;margin-top:4px">
    <span>Total habitaciones:</span><span>${allEntries.length}</span>
  </div>
  <hr>
  <div class="stamp">Generado: ${new Date().toLocaleString('es-BO')} · Motel 23</div>
  <script>window.print();<\/script>
  </body></html>`;

  // Abrir ventana de impresión
  const w = window.open('', '_blank', 'width=600,height=800');
  w.document.write(html);
  w.document.close();

  // También descargar JSON
  const dateKey = new Date(dayShift.start).toISOString().slice(0,10);
  const jsonData = {
    fecha: dateKey,
    exportado: new Date().toISOString(),
    motel: 'Motel 23',
    resumen: {
      totalDia: grandTotal,
      efectivoTotal: totalPago.cash,
      qrTotal: totalPago.qr,
      habitacionesTotal: allEntries.length,
    },
    turnoDia: {
      inicio: fmt(dayShift.start), fin: fmt(dayShift.end),
      total: dayTotal, efectivo: dayPago.cash, qr: dayPago.qr,
      habitaciones: dayEntries.map(e => ({
        hab: e.roomNum, tipo: e.type, transporte: e.guest,
        entrada: fmtTime(e.checkin), salida: fmtTime(e.checkout),
        detalle: e.breakdown, total: e.total
      }))
    },
    turnoNoche: {
      inicio: fmt(nightShift.start), fin: fmt(nightShift.end),
      total: nightTotal, efectivo: nightPago.cash, qr: nightPago.qr,
      habitaciones: nightEntries.map(e => ({
        hab: e.roomNum, tipo: e.type, transporte: e.guest,
        entrada: fmtTime(e.checkin), salida: fmtTime(e.checkout),
        detalle: e.breakdown, total: e.total
      }))
    }
  };
  const blob = new Blob([JSON.stringify(jsonData, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `motel23_dia-completo_${dateKey}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`📋 Reporte del día generado — Bs ${grandTotal} total`);
}

function printShift() {
  const entries = currentShift.entries || [];
  const total = entries.reduce((s,e)=>s+e.total,0);
  const isDay = currentShift.type === 'day';
  const w = window.open('', '_blank', 'width=480,height=700');
  w.document.write(`
    <html><head><title>Cierre de Turno</title>
    <style>
      body{font-family:monospace;padding:20px;max-width:400px;margin:0 auto}
      h2{text-align:center;margin-bottom:4px}
      .sub{text-align:center;color:#666;font-size:12px;margin-bottom:4px}
      hr{border:1px dashed #ccc;margin:10px 0}
      .row{display:flex;justify-content:space-between;margin:3px 0;font-size:12px}
      .total{font-size:15px;font-weight:bold}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px}
      th{text-align:left;border-bottom:1px solid #ccc;padding:3px 4px;font-size:10px}
      td{padding:3px 4px;border-bottom:1px solid #eee}
    </style></head><body>
    <h2>🦋 Motel 23</h2>
    <div class="sub">Resumen de turno ${isDay?'☀ Día':'🌙 Noche'}</div>
    <div class="sub">${new Date(currentShift.start).toLocaleString('es-BO')} → ${new Date().toLocaleString('es-BO')}</div>
    <hr>
    <div class="row"><span>Habitaciones atendidas:</span><span>${entries.length}</span></div>
    <div class="row total"><span>TOTAL RECAUDADO:</span><span>Bs ${total}</span></div>
    <hr>
    <table>
      <thead><tr><th>Hab.</th><th>Tipo</th><th>Entrada</th><th>Salida</th><th>Total</th></tr></thead>
      <tbody>${entries.map(e=>`<tr><td>${e.roomNum}</td><td>${e.type}</td><td>${formatTime(e.checkin)}</td><td>${formatTime(e.checkout)}</td><td>Bs ${e.total}</td></tr>`).join('')}</tbody>
    </table>
    <hr>
    <div style="text-align:center;font-size:10px;color:#999;margin-top:8px">Impreso: ${new Date().toLocaleString('es-BO')}</div>
    <script>window.print();<\/script>
    </body></html>
  `);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
    document.getElementById('btn-fs').textContent = '✕';
    document.getElementById('btn-fs').title = 'Salir de pantalla completa';
  } else {
    document.exitFullscreen();
    document.getElementById('btn-fs').textContent = '⛶';
    document.getElementById('btn-fs').title = 'Pantalla completa';
  }
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) document.getElementById('btn-fs').textContent = '⛶';
});

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['checkinOverlay','checkoutOverlay','configOverlay','shiftOverlay','minibarOverlay','restoreOverlay','adminOverlay'].forEach(closeModal);
  }
});

// ─── BACKUP / RESTORE ──────────────────────────────────────────────────────
function collectBackupData() {
  return {
    hm_config: JSON.stringify(config),
    hm_occ: JSON.stringify(occupancy),
    hm_hist: JSON.stringify(history),
    hm_shifts: JSON.stringify(shifts),
    hm_current_shift: JSON.stringify(currentShift),
    hm_products: JSON.stringify(minibarProducts),
    hm_caja: JSON.stringify(cajaData),
    hm_days: JSON.stringify(allDays),
    hm_log: JSON.stringify(activityLog),
  };
}

function downloadBackup(backup, prefix) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const timeStr = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  a.href = URL.createObjectURL(blob);
  a.download = `motel23_${prefix}_${dateStr}_${timeStr}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function autoBackup() {
  try {
    const backup = { _meta: { version: 1, exportDate: new Date().toISOString(), motel: 'Motel 23', auto: true }, ...collectBackupData() };
    downloadBackup(backup, 'autobackup');
    toast('💾 Backup automático guardado');
  } catch(e) {
    console.error('Error en autoBackup:', e);
  }
}

function exportBackup() {
  const backup = { _meta: { version: 1, exportDate: new Date().toISOString(), motel: 'Motel 23' }, ...collectBackupData() };
  downloadBackup(backup, 'backup');
  toast('💾 Backup descargado correctamente');
}

function triggerImportBackup() {
  document.getElementById('backupFileInput').click();
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!Object.keys(data).some(k => k.startsWith('hm_'))) {
        toast('❌ El archivo no parece un backup válido del Motel 23');
        return;
      }
      window._pendingRestore = data;
      const date = data._meta?.exportDate
        ? new Date(data._meta.exportDate).toLocaleString('es-BO')
        : 'Desconocida';
      const keyCount = Object.keys(data).filter(k => k.startsWith('hm_')).length;
      document.getElementById('restoreDate').textContent = date;
      document.getElementById('restoreKeys').textContent = keyCount + ' colecciones';
      document.getElementById('restoreOverlay').classList.add('open');
    } catch(err) {
      toast('❌ Archivo inválido o corrupto');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

async function confirmRestore() {
  const data = window._pendingRestore;
  if (!data) return;

  const keyMap = {
    hm_config: ['config', 'POST'],
    hm_occ: ['ocupacion', 'POST'],
    hm_hist: ['historial', 'PUT'],
    hm_shifts: ['turnos', 'PUT'],
    hm_current_shift: ['turno', 'POST'],
    hm_products: ['productos', 'POST'],
    hm_caja: ['caja', 'POST'],
    hm_log: ['activitylog', 'POST'],
  };

  for (const [key, [endpoint, method]] of Object.entries(keyMap)) {
    if (data[key]) {
      await api(endpoint, method, JSON.parse(data[key]));
    }
  }

  // Días se restauran individualmente
  if (data.hm_days) {
    const days = JSON.parse(data.hm_days);
    for (const [fecha, datos] of Object.entries(days)) {
      await api('dias', 'POST', { fecha, datos });
    }
  }

  window._pendingRestore = null;
  closeModal('restoreOverlay');
  addLog('RESTORE', `Backup restaurado — ${data._meta?.exportDate || 'fecha desconocida'}`);
  toast('✓ Datos restaurados correctamente. Recargando...');
  setTimeout(() => location.reload(), 1500);
}

// ─── SUPER USUARIO (ADMIN) ──────────────────────────────────────────────────
let _adminBillTotal = 0;

function toggleAdmin() {
  adminMode = !adminMode;
  const btn = document.getElementById('btnAdmin');
  btn.classList.toggle('active', adminMode);
  btn.textContent = adminMode ? '🔧 ADMIN' : '🔧';
  // Mostrar/ocultar botón inventario en el rail
  const railInv = document.getElementById('rail-inventario');
  if (railInv) railInv.style.display = adminMode ? '' : 'none';
  if (!adminMode && activePanel === 'inventario') closeDrawer();
  toast(adminMode ? '🔧 Modo admin activado — click en cualquier habitación para editar' : '🔧 Modo admin desactivado');
}

// Convierte HH:MM a timestamp de hoy (o ayer si la hora es futura)
function timeToTs(timeStr) {
  if (!timeStr) return NaN;
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (d.getTime() > Date.now() + 60000) d.setDate(d.getDate() - 1);
  return d.getTime();
}

function tsToTimeStr(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// Carrito de consumos para el admin
let adminCart = {};

function adminCartTotal() {
  return Object.entries(adminCart).reduce((sum, [id, qty]) => {
    const p = minibarProducts.find(p => p.id === parseInt(id));
    return sum + (p ? p.price * qty : 0);
  }, 0);
}

function adminCartItems() {
  return Object.entries(adminCart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const p = minibarProducts.find(p => p.id === parseInt(id));
      return { id: parseInt(id), name: p.name, price: p.price, qty, cat: p.cat };
    });
}

function adminCartChange(id, delta) {
  adminCart[id] = Math.max(0, (adminCart[id] || 0) + delta);
  renderAdminProducts();
  updateAdminPreview();
}

function renderAdminProducts() {
  const el = document.getElementById('admin-products-grid');
  if (!el) return;
  const cats = {};
  minibarProducts.forEach(p => {
    if (!cats[p.cat]) cats[p.cat] = [];
    cats[p.cat].push(p);
  });
  let html = '';
  Object.entries(cats).forEach(([cat, prods]) => {
    html += `<div style="font-size:0.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin:8px 0 4px">${cat}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">`;
    prods.forEach(p => {
      const qty = adminCart[p.id] || 0;
      html += `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border-radius:6px;padding:5px 8px;gap:6px">
        <div style="flex:1;min-width:0">
          <div style="font-size:0.75rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
          <div style="font-size:0.68rem;color:var(--gold)">Bs ${p.price}</div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <button onclick="adminCartChange(${p.id},-1)" style="width:22px;height:22px;border-radius:4px;border:1px solid var(--border2);background:var(--surface);color:var(--text2);font-size:1rem;cursor:pointer;line-height:1">−</button>
          <span style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;font-weight:700;min-width:16px;text-align:center;color:${qty>0?'var(--gold)':'var(--text3)'}">${qty}</span>
          <button onclick="adminCartChange(${p.id},+1)" style="width:22px;height:22px;border-radius:4px;border:1px solid var(--border2);background:var(--surface);color:var(--text2);font-size:1rem;cursor:pointer;line-height:1">+</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  });
  el.innerHTML = html;
  const cartTotal = adminCartTotal();
  const totalEl = document.getElementById('admin-cart-total');
  if (totalEl) {
    totalEl.style.display = cartTotal > 0 ? 'block' : 'none';
    totalEl.textContent = `Subtotal consumos: Bs ${cartTotal}`;
  }
}

function openAdminEdit(room) {
  const occ = occupancy[room.num];
  const isNew = !occ || occ.cleaning;
  adminCart = {};

  document.getElementById('admin-roomnum').textContent = room.num;
  document.getElementById('admin-title').textContent = isNew ? 'Registro manual' : 'Editar';
  document.getElementById('admin-guest').value = isNew ? '' : (occ.guest || '');
  document.getElementById('admin-checkin').value = tsToTimeStr(Date.now());
  document.getElementById('admin-checkout').value = '';

  document.getElementById('admin-pago-section').style.display = 'none';
  document.getElementById('admin-consumos-section').style.display = 'none';
  document.getElementById('admin-extras-pago').style.display = 'none';
  document.getElementById('admin-cash').value = 0;
  document.getElementById('admin-qr').value = 0;
  document.getElementById('admin-extras-cash').value = 0;
  document.getElementById('admin-extras-qr').value = 0;
  document.getElementById('admin-save-btn').textContent = isNew ? '✓ Registrar entrada' : '✓ Guardar cambios';

  renderAdminProducts();
  updateAdminPreview();
  clearInterval(window._adminPreviewInterval);
  window._adminPreviewInterval = setInterval(updateAdminPreview, 1000);
  document.getElementById('adminOverlay').classList.add('open');
}

function updateAdminPreview() {
  const room = selectedRoom;
  if (!room) return;
  const checkinVal  = document.getElementById('admin-checkin').value;
  const checkoutVal = document.getElementById('admin-checkout').value;
  if (!checkinVal) return;

  const checkinTs  = timeToTs(checkinVal);
  const checkoutTs = checkoutVal ? timeToTs(checkoutVal) : Date.now();
  const hasCheckout = !!checkoutVal;

  if (isNaN(checkinTs) || checkinTs >= checkoutTs) {
    document.getElementById('admin-preview').innerHTML = `<span style="color:var(--red)">⚠ La entrada debe ser antes de la salida</span>`;
    document.getElementById('admin-pago-section').style.display = 'none';
    document.getElementById('admin-consumos-section').style.display = 'none';
    document.getElementById('admin-extras-pago').style.display = 'none';
    return;
  }

  // Asegurar occupancy para calcBill
  if (!occupancy[room.num] || occupancy[room.num].cleaning) {
    occupancy[room.num] = { guest: '', checkin: checkinTs, mode: 'hour' };
  }

  const duration  = formatDuration(checkoutTs - checkinTs);
  const bill      = calcBill(room, checkinTs, checkoutTs);
  _adminBillTotal = bill.total;
  const cartTotal = adminCartTotal();
  const grandTotal = bill.total + cartTotal;

  document.getElementById('admin-preview').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
      <span style="color:var(--text3)">Duración:</span>
      <span style="font-family:'JetBrains Mono',monospace;font-weight:700">${duration}</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
      <span style="color:var(--text3)">Habitación:</span>
      <span>${bill.breakdown}${bill.extraLabel ? ' + ' + bill.extraLabel : ''} = <b>Bs ${bill.total}</b></span>
    </div>
    ${cartTotal > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:5px">
      <span style="color:var(--text3)">Consumos:</span>
      <span><b>Bs ${cartTotal}</b></span>
    </div>` : ''}
    <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:6px;margin-top:4px">
      <span style="color:var(--text3)">${hasCheckout ? 'Total a cobrar:' : 'Total actual:'}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:var(--gold);font-size:1.1rem">Bs ${grandTotal}</span>
    </div>`;

  if (hasCheckout) {
    document.getElementById('admin-consumos-section').style.display = 'block';
    document.getElementById('admin-pago-section').style.display = 'block';
    document.getElementById('admin-cash').value = bill.total;
    document.getElementById('admin-qr').value = 0;
    const extrasEl = document.getElementById('admin-extras-pago');
    extrasEl.style.display = cartTotal > 0 ? 'block' : 'none';
    if (cartTotal > 0) {
      document.getElementById('admin-extras-cash').value = cartTotal;
      document.getElementById('admin-extras-qr').value = 0;
    }
    document.getElementById('admin-save-btn').textContent = '✓ Procesar checkout completo';
  } else {
    document.getElementById('admin-pago-section').style.display = 'none';
    document.getElementById('admin-consumos-section').style.display = 'block';
    document.getElementById('admin-extras-pago').style.display = 'none';
    const isNew = !occupancy[room.num] || occupancy[room.num].cleaning;
    document.getElementById('admin-save-btn').textContent = isNew ? '✓ Registrar entrada' : '✓ Guardar cambios';
  }
}

function updateAdminPago(changed) {
  const total = _adminBillTotal;
  const cashEl = document.getElementById('admin-cash');
  const qrEl   = document.getElementById('admin-qr');
  if (changed === 'cash') {
    cashEl.value = Math.max(0, Math.min(parseInt(cashEl.value) || 0, total));
    qrEl.value = total - (parseInt(cashEl.value) || 0);
  } else {
    qrEl.value = Math.max(0, Math.min(parseInt(qrEl.value) || 0, total));
    cashEl.value = total - (parseInt(qrEl.value) || 0);
  }
}

function updateAdminExtrasPago(changed) {
  const total = adminCartTotal();
  const cashEl = document.getElementById('admin-extras-cash');
  const qrEl   = document.getElementById('admin-extras-qr');
  if (changed === 'cash') {
    cashEl.value = Math.max(0, Math.min(parseInt(cashEl.value) || 0, total));
    qrEl.value = total - (parseInt(cashEl.value) || 0);
  } else {
    qrEl.value = Math.max(0, Math.min(parseInt(qrEl.value) || 0, total));
    cashEl.value = total - (parseInt(qrEl.value) || 0);
  }
}

function saveAdminEdit() {
  clearInterval(window._adminPreviewInterval);
  const room = selectedRoom;
  const occ  = occupancy[room.num];
  const isNew = !occ || occ.cleaning;

  const checkinVal  = document.getElementById('admin-checkin').value;
  const checkoutVal = document.getElementById('admin-checkout').value;
  const newGuest    = document.getElementById('admin-guest').value.trim();
  const newCheckin  = timeToTs(checkinVal);

  if (isNaN(newCheckin)) { toast('❌ Hora de entrada inválida'); return; }
  if (!newGuest)          { toast('❌ Ingresa el huésped o vehículo'); return; }

  // CASO 1: Solo registrar entrada
  if (!checkoutVal) {
    if (isNew) {
      if (occ && occ.cleaning) delete occupancy[room.num];
      occupancy[room.num] = { guest: newGuest, checkin: newCheckin, mode: 'hour' };
    } else {
      occ.checkin = newCheckin;
      occ.guest   = newGuest;
    }
    saveOcc(); closeModal('adminOverlay'); render();
    addLog('ADMIN', `Hab. ${room.num} — entrada manual: ${formatTime(newCheckin)}`);
    toast(`🔧 Hab. ${room.num} — entrada: ${formatTime(newCheckin)}`);
    return;
  }

  // CASO 2: Checkout completo
  const newCheckout = timeToTs(checkoutVal);
  if (newCheckout <= newCheckin) { toast('❌ La salida debe ser después de la entrada'); return; }

  if (isNew) {
    if (occ && occ.cleaning) delete occupancy[room.num];
    occupancy[room.num] = { guest: newGuest, checkin: newCheckin, mode: 'hour' };
  }

  const bill      = calcBill(room, newCheckin, newCheckout);
  const habCash   = parseInt(document.getElementById('admin-cash').value) || 0;
  const habQr     = parseInt(document.getElementById('admin-qr').value) || 0;
  const habComision = calcComision(habQr);

  const cartItems  = adminCartItems();
  let minibarBs = 0, vitrinaBs = 0;
  cartItems.forEach(item => {
    if (MINIBAR_CATS.includes(item.cat)) minibarBs += item.price * item.qty;
    else vitrinaBs += item.price * item.qty;
  });
  const extrasTotal = minibarBs + vitrinaBs;
  const extrasCash  = parseInt(document.getElementById('admin-extras-cash').value) || 0;
  const extrasQr    = parseInt(document.getElementById('admin-extras-qr').value) || 0;

  const totalConComisiones = bill.total + habComision + extrasTotal;
  const typeNames = { ac:'Aire Acond.', fan:'Ventilador', fan2:'Ventilador' };

  const entry = {
    roomNum: room.num, type: typeNames[room.type],
    guest: newGuest, checkin: newCheckin, checkout: newCheckout,
    mode: 'hour', total: totalConComisiones,
    breakdown: bill.breakdown, extraLabel: bill.extraLabel || '', extraCharge: bill.extraCharge || 0,
    minibar: cartItems,
    pago: {
      hab:     { monto: bill.total,  cash: habCash, qr: habQr, comision: habComision, cambio: 0 },
      minibar: { monto: minibarBs,   cash: extrasTotal > 0 ? Math.round(extrasCash * minibarBs / extrasTotal) : 0, qr: extrasTotal > 0 ? Math.round(extrasQr * minibarBs / extrasTotal) : 0, comision: 0, cambio: 0 },
      vitrina: { monto: vitrinaBs,   cash: extrasTotal > 0 ? Math.round(extrasCash * vitrinaBs / extrasTotal) : 0, qr: extrasTotal > 0 ? Math.round(extrasQr * vitrinaBs / extrasTotal) : 0, comision: 0, cambio: 0 },
    },
    adminEdit: true
  };

  history.push(entry);
  currentShift.entries = currentShift.entries || [];
  currentShift.entries.push(entry);
  occupancy[room.num] = { cleaning: true };

  saveOcc(); saveHist(); saveShift();
  closeModal('adminOverlay'); render();
  addLog('ADMIN', `Hab. ${room.num} — Bs ${totalConComisiones} (${formatTime(newCheckin)} → ${formatTime(newCheckout)})`);
  toast(`🔧 Hab. ${room.num} — Bs ${totalConComisiones} (${formatTime(newCheckin)} → ${formatTime(newCheckout)})`);
}

// ─── REPORTE CONSOLIDADO ──────────────────────────────────────────────────────
function generateConsolidatedReport() {
  // Recopilar datos de todos los días disponibles en hm_days + turno actual
  const report = {
    generado: new Date().toISOString(),
    motel: 'Motel 23',
    periodo: {},
    resumen: { totalRecaudado: 0, totalCheckouts: 0, totalTurnos: 0, promedioXCheckout: 0 },
    porDia: {},
    porTipoHab: { ac: { checkouts: 0, total: 0 }, fan: { checkouts: 0, total: 0 }, fan2: { checkouts: 0, total: 0 } },
    porVehiculo: {},
    minibarResumen: { totalVentas: 0, items: {} },
    metodoPago: { efectivo: 0, qr: 0 }
  };

  // Recopilar de hm_days
  const dayKeys = Object.keys(allDays).sort();
  if (dayKeys.length) {
    report.periodo.desde = dayKeys[0];
    report.periodo.hasta = dayKeys[dayKeys.length - 1];
  }

  const allEntries = [];

  dayKeys.forEach(dateKey => {
    const dayShifts = allDays[dateKey] || [];
    const dayTotal = dayShifts.reduce((s, sh) => s + (sh.total || 0), 0);
    const dayEntries = dayShifts.flatMap(sh => sh.entries || []);
    report.porDia[dateKey] = { turnos: dayShifts.length, checkouts: dayEntries.length, total: dayTotal };
    report.resumen.totalTurnos += dayShifts.length;
    allEntries.push(...dayEntries);
  });

  // Agregar turno actual si tiene entries
  if (currentShift && (currentShift.entries || []).length > 0) {
    allEntries.push(...currentShift.entries);
    const tk = todayKey();
    if (!report.porDia[tk]) report.porDia[tk] = { turnos: 0, checkouts: 0, total: 0 };
    report.porDia[tk].checkouts += currentShift.entries.length;
    report.porDia[tk].total += currentShift.entries.reduce((s, e) => s + e.total, 0);
  }

  // Procesar todas las entries
  allEntries.forEach(e => {
    report.resumen.totalRecaudado += e.total || 0;
    report.resumen.totalCheckouts++;

    // Por tipo de habitación
    const typeKey = e.type === 'Aire Acondicionado' ? 'ac' : (e.type === 'Ventilador' ? 'fan' : 'fan2');
    if (report.porTipoHab[typeKey]) {
      report.porTipoHab[typeKey].checkouts++;
      report.porTipoHab[typeKey].total += e.total || 0;
    }

    // Por vehículo
    const v = (e.guest || 'Desconocido').split(' ')[0];
    if (!report.porVehiculo[v]) report.porVehiculo[v] = { checkouts: 0, total: 0 };
    report.porVehiculo[v].checkouts++;
    report.porVehiculo[v].total += e.total || 0;

    // Minibar
    (e.minibar || []).forEach(item => {
      const mbTotal = item.price * item.qty;
      report.minibarResumen.totalVentas += mbTotal;
      if (!report.minibarResumen.items[item.name]) report.minibarResumen.items[item.name] = { qty: 0, total: 0 };
      report.minibarResumen.items[item.name].qty += item.qty;
      report.minibarResumen.items[item.name].total += mbTotal;
    });

    // Método de pago
    if (e.pago) {
      ['hab', 'minibar', 'vitrina'].forEach(sec => {
        if (e.pago[sec]) {
          report.metodoPago.efectivo += e.pago[sec].cash || 0;
          report.metodoPago.qr += e.pago[sec].qr || 0;
        }
      });
    }
  });

  report.resumen.promedioXCheckout = report.resumen.totalCheckouts > 0
    ? Math.round(report.resumen.totalRecaudado / report.resumen.totalCheckouts)
    : 0;

  // Descargar
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  a.href = URL.createObjectURL(blob);
  a.download = `motel23_reporte_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  addLog('REPORTE', `Reporte consolidado generado — ${report.resumen.totalCheckouts} checkouts, Bs ${report.resumen.totalRecaudado}`);
  toast(`📊 Reporte generado: ${report.resumen.totalCheckouts} checkouts — Bs ${report.resumen.totalRecaudado}`);
}

function viewActivityLog() {
  const content = document.getElementById('rec-content');
  const logs = activityLog.slice().reverse().slice(0, 100);

  if (!logs.length) {
    content.innerHTML = '<div class="rec-empty">Sin actividad registrada</div>';
    return;
  }

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;padding:0 0 6px">
    <span style="font-size:0.7rem;color:var(--text3)">${logs.length} eventos recientes</span>
    <button onclick="renderRecords()" style="font-size:0.65rem;padding:4px 10px;background:var(--surface2);color:var(--text2);border:1px solid var(--border);border-radius:6px;cursor:pointer">← Volver</button>
  </div>`;

  logs.forEach(log => {
    const actionColors = {
      'CHECK-IN': '#22c55e', 'CHECK-OUT': '#ef4444', 'LIMPIEZA': '#eab308',
      'TURNO CERRADO': '#8b5cf6', 'ADMIN': '#f97316', 'RESTORE': '#06b6d4', 'REPORTE': '#3b82f6'
    };
    const color = actionColors[log.action] || 'var(--text3)';
    html += `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.72rem">
      <span style="color:var(--text3);font-family:'JetBrains Mono',monospace;white-space:nowrap;font-size:0.65rem">${log.time}</span>
      <span style="color:${color};font-weight:700;white-space:nowrap;min-width:80px">${log.action}</span>
      <span style="color:var(--text2)">${log.details}</span>
    </div>`;
  });

  content.innerHTML = html;
}

// ─── REPORTE DIARIO IMPRIMIBLE ────────────────────────────────────────────────
function generateDailyPrintReport() {
  // Recopilar turnos del día actual
  const dayShifts = buildCurrentDayShifts();
  const dayEntries = dayShifts.flatMap(sh => sh.entries || []);

  // Separar por turno
  const morningShifts = dayShifts.filter(sh => sh.type === 'day');
  const nightShifts = dayShifts.filter(sh => sh.type === 'night');
  const morningEntries = morningShifts.flatMap(sh => sh.entries || []);
  const nightEntries = nightShifts.flatMap(sh => sh.entries || []);

  function calcTotals(entries) {
    let efect = 0, qr = 0, bebidasCash = 0, bebidasQr = 0, vitrinaCash = 0, vitrinaQr = 0;
    entries.forEach(e => {
      const p = e.pago || {};
      // Efectivo = hab cash + prepago
      efect += (p.hab?.cash || 0) + (p.hab?.prepaid || 0);
      // QR = hab qr
      qr += (p.hab?.qr || 0);
      // Bebidas (minibar) separado por método
      bebidasCash += p.minibar?.cash || 0;
      bebidasQr += p.minibar?.qr || 0;
      // Vitrina separado por método
      vitrinaCash += p.vitrina?.cash || 0;
      vitrinaQr += p.vitrina?.qr || 0;
    });
    return { efect, qr, bebidasCash, bebidasQr, vitrinaCash, vitrinaQr };
  }

  function formatTimeReport(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function vehicleEmoji(guest) {
    return (guest || '').split(' ').slice(1).join(' ') || (guest || '').split(' ')[0] || '—';
  }

  function minibarText(items) {
    if (!items || !items.length) return '—';
    return items.map(i => `${i.name} x${i.qty}`).join(', ');
  }

  function buildTableRows(entries) {
    if (!entries.length) return '<tr><td colspan="7" style="text-align:center;color:#999;padding:12px">Sin registros</td></tr>';
    return entries.map(e => {
      const p = e.pago || {};
      const cashTotal = (p.hab?.cash || 0) + (p.minibar?.cash || 0) + (p.vitrina?.cash || 0) + (p.hab?.prepaid || 0);
      const qrTotal = (p.hab?.qr || 0) + (p.minibar?.qr || 0) + (p.vitrina?.qr || 0);
      const mbItems = e.minibar || [];
      return `<tr>
        <td>${e.roomNum}</td>
        <td>${formatTimeReport(e.checkin)}</td>
        <td>${formatTimeReport(e.checkout)}</td>
        <td>Bs ${cashTotal}</td>
        <td>Bs ${qrTotal}</td>
        <td style="font-size:0.7em">${minibarText(mbItems)}</td>
        <td>${vehicleEmoji(e.guest)}</td>
      </tr>`;
    }).join('');
  }

  const mTotals = calcTotals(morningEntries);
  const nTotals = calcTotals(nightEntries);
  const gTotals = {
    efect: mTotals.efect + nTotals.efect,
    qr: mTotals.qr + nTotals.qr,
    bebidasCash: mTotals.bebidasCash + nTotals.bebidasCash,
    bebidasQr: mTotals.bebidasQr + nTotals.bebidasQr,
    vitrinaCash: mTotals.vitrinaCash + nTotals.vitrinaCash,
    vitrinaQr: mTotals.vitrinaQr + nTotals.vitrinaQr
  };

  const fechaHoy = new Date().toLocaleDateString('es-BO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte Diario - Motel 23 - ${todayKey()}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size:11px; color:#222; padding:20px; }
  h1 { text-align:center; font-size:18px; margin-bottom:4px; }
  .fecha { text-align:center; font-size:12px; color:#555; margin-bottom:16px; }
  h2 { font-size:14px; background:#1a1a2e; color:#fff; padding:6px 12px; margin:14px 0 6px; }
  table { width:100%; border-collapse:collapse; margin-bottom:6px; }
  th { background:#2d2d44; color:#fff; padding:6px 8px; text-align:left; font-size:10px; text-transform:uppercase; }
  td { padding:5px 8px; border-bottom:1px solid #ddd; font-size:10.5px; }
  tr:nth-child(even) { background:#f5f5f5; }
  .totals-table { margin-top:2px; }
  .totals-table th { background:#c2410c; font-size:10px; }
  .totals-table td { font-weight:bold; font-size:11px; background:#fff3e0; }
  .general-table th { background:#1a1a2e; }
  .general-table td { background:#e8eaf6; font-weight:bold; font-size:12px; }
  .separator { border:none; border-top:2px solid #1a1a2e; margin:16px 0; }
  @media print {
    body { padding:10px; }
    h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .totals-table td, .general-table td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display:none; }
  }
</style>
</head>
<body>
<div class="no-print" style="text-align:center;margin-bottom:16px">
  <button onclick="window.print()" style="padding:10px 30px;font-size:14px;background:#c2410c;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:bold">🖨 Imprimir / Guardar PDF</button>
</div>

<h1>🦋 REPORTE DIARIO MOTEL 23</h1>
<div class="fecha">FECHA: ${fechaHoy}</div>

<h2>☀ TURNO MAÑANA</h2>
<table>
  <thead>
    <tr>
      <th>Nº PIEZA</th>
      <th>HORA ENTRADA</th>
      <th>HORA SALIDA</th>
      <th>PAGO EFECTIVO</th>
      <th>PAGO QR</th>
      <th>CONSUMO MINIBAR</th>
      <th>MOVILIDAD</th>
    </tr>
  </thead>
  <tbody>
    ${buildTableRows(morningEntries)}
  </tbody>
</table>

<table class="totals-table">
  <thead><tr><th>TOTAL TURNO MAÑANA</th><th>TOTAL EFECT</th><th>TOTAL QR</th><th>BEBIDAS EFECT</th><th>BEBIDAS QR</th><th>VITRINA EFECT</th><th>VITRINA QR</th></tr></thead>
  <tbody><tr><td>Bs ${mTotals.efect + mTotals.qr + mTotals.bebidasCash + mTotals.bebidasQr + mTotals.vitrinaCash + mTotals.vitrinaQr}</td><td>Bs ${mTotals.efect}</td><td>Bs ${mTotals.qr}</td><td>Bs ${mTotals.bebidasCash}</td><td>Bs ${mTotals.bebidasQr}</td><td>Bs ${mTotals.vitrinaCash}</td><td>Bs ${mTotals.vitrinaQr}</td></tr></tbody>
</table>

<h2>🌙 TURNO NOCHE</h2>
<table>
  <thead>
    <tr>
      <th>Nº PIEZA</th>
      <th>HORA ENTRADA</th>
      <th>HORA SALIDA</th>
      <th>PAGO EFECTIVO</th>
      <th>PAGO QR</th>
      <th>CONSUMO MINIBAR</th>
      <th>MOVILIDAD</th>
    </tr>
  </thead>
  <tbody>
    ${buildTableRows(nightEntries)}
  </tbody>
</table>

<table class="totals-table">
  <thead><tr><th>TOTAL TURNO NOCHE</th><th>TOTAL EFECT</th><th>TOTAL QR</th><th>BEBIDAS EFECT</th><th>BEBIDAS QR</th><th>VITRINA EFECT</th><th>VITRINA QR</th></tr></thead>
  <tbody><tr><td>Bs ${nTotals.efect + nTotals.qr + nTotals.bebidasCash + nTotals.bebidasQr + nTotals.vitrinaCash + nTotals.vitrinaQr}</td><td>Bs ${nTotals.efect}</td><td>Bs ${nTotals.qr}</td><td>Bs ${nTotals.bebidasCash}</td><td>Bs ${nTotals.bebidasQr}</td><td>Bs ${nTotals.vitrinaCash}</td><td>Bs ${nTotals.vitrinaQr}</td></tr></tbody>
</table>

<hr class="separator">

<table class="totals-table general-table">
  <thead><tr><th>TOTAL GENERAL</th><th>TOTAL EFECT</th><th>TOTAL QR</th><th>BEBIDAS EFECT</th><th>BEBIDAS QR</th><th>VITRINA EFECT</th><th>VITRINA QR</th></tr></thead>
  <tbody><tr><td>Bs ${gTotals.efect + gTotals.qr + gTotals.bebidasCash + gTotals.bebidasQr + gTotals.vitrinaCash + gTotals.vitrinaQr}</td><td>Bs ${gTotals.efect}</td><td>Bs ${gTotals.qr}</td><td>Bs ${gTotals.bebidasCash}</td><td>Bs ${gTotals.bebidasQr}</td><td>Bs ${gTotals.vitrinaCash}</td><td>Bs ${gTotals.vitrinaQr}</td></tr></tbody>
</table>

</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  addLog('REPORTE', `Reporte diario imprimible generado — ${dayEntries.length} checkouts`);
  toast(`📋 Reporte diario generado — ${dayEntries.length} checkouts`);
}

// ─── INICIO: purgar datos viejos al abrir la app ─────────────────────────────
// ─── INIT: CARGAR TODO DESDE SQLITE ──────────────────────────────────────────
async function initApp() {
  try {
    const [cfgData, occData, histData, turnoData, turnosData, prodData, cajaRes, diasData, logData] = await Promise.all([
      api('config'),
      api('ocupacion'),
      api('historial'),
      api('turno'),
      api('turnos'),
      api('productos'),
      api('caja'),
      api('dias'),
      api('activitylog'),
    ]);

    if (cfgData) {
      config = cfgData;
      if (!config.tiers) config.tiers = { ...DEFAULT_CONFIG.tiers };
      if (!config.tiers.fan2) config.tiers.fan2 = { 1:35, 2:65, 3:90, 4:100 };
    }
    if (occData && Object.keys(occData).length) occupancy = occData;
    if (histData && histData.length) history = histData;
    if (turnoData) currentShift = turnoData;
    if (turnosData && turnosData.length) shifts = turnosData;
    if (prodData && prodData.length) {
      // Enriquecer con imágenes del DEFAULT si faltan
      let needsSave = false;
      minibarProducts = prodData.map(p => {
        if (!p.img) {
          const def = DEFAULT_PRODUCTS.find(d => d.id === p.id);
          if (def) { p.img = def.img; needsSave = true; }
        }
        return p;
      });
      if (needsSave) saveProducts();
    }
    if (cajaRes) cajaData = cajaRes;
    if (diasData && Object.keys(diasData).length) allDays = diasData;
    if (logData && logData.length) activityLog = logData;

  } catch(e) {
    console.warn('⚠ No se pudo conectar al servidor, usando datos por defecto', e);
  }

  // Init shift if none active
  if (!currentShift) startNewShift();

  purgePruneOldDays();
  saveDays();
  saveHist();
  render();
}

// ─── INVENTARIO (ADMIN) ──────────────────────────────────────────────────────
let inventarioData = [];

async function renderInventario() {
  inventarioData = await api('inventario');
  renderInvSelectores();
  renderInvTabla();
}

function renderInvSelectores() {
  // Para cargar, mostrar todos los productos del minibar
  const optsCargar = minibarProducts.map(p =>
    `<option value="${p.id}" data-precio="${p.price}">${p.name} — Bs ${p.price}</option>`
  ).join('');

  const selCargar = document.getElementById('inv-select-prod');
  const selMover  = document.getElementById('inv-select-mover');
  if (selCargar) selCargar.innerHTML = optsCargar;
  if (selMover)  selMover.innerHTML  = inventarioData.length ? inventarioData.map(p =>
    `<option value="${p.producto_id}">${p.nombre} (almacén: ${p.almacen})</option>`
  ).join('') : '<option value="">— Sin stock en almacén —</option>';
}

function renderInvTabla() {
  const el = document.getElementById('inv-tabla');
  if (!el) return;
  if (!inventarioData.length) {
    el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:12px 0">Sin datos de inventario</div>';
    return;
  }
  const rows = inventarioData.map(p => {
    const esperado = p.vendido * p.precio;
    const alerta = p.nevera <= 2 ? ' style="color:var(--red)"' : '';
    return `<tr>
      <td style="padding:4px 6px">${p.nombre}</td>
      <td style="padding:4px 6px;text-align:center">${p.almacen}</td>
      <td style="padding:4px 6px;text-align:center"${alerta}>${p.nevera}</td>
      <td style="padding:4px 6px;text-align:center">${p.vendido}</td>
      <td style="padding:4px 6px;text-align:right">Bs ${esperado}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="color:var(--text3);font-size:0.65rem;text-transform:uppercase">
          <th style="padding:4px 6px;text-align:left">Producto</th>
          <th style="padding:4px 6px">Almacén</th>
          <th style="padding:4px 6px">Nevera</th>
          <th style="padding:4px 6px">Vendido</th>
          <th style="padding:4px 6px;text-align:right">Esperado</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function invCargar() {
  const sel = document.getElementById('inv-select-prod');
  const cantEl = document.getElementById('inv-cantidad');
  const cantidad = parseInt(cantEl.value);
  if (!sel.value || !cantidad || cantidad <= 0) { toast('⚠ Seleccioná producto y cantidad'); return; }

  const prod = minibarProducts.find(p => p.id == sel.value);
  if (!prod) return;

  const res = await api('inventario/cargar', 'POST', {
    producto_id: prod.id,
    nombre: prod.name,
    precio: prod.price,
    cantidad
  });
  if (res.ok) {
    cantEl.value = '';
    toast(`✓ ${cantidad} ${prod.name} cargados al almacén`);
    renderInventario();
  }
}

async function invMover() {
  const sel = document.getElementById('inv-select-mover');
  const cantEl = document.getElementById('inv-mover-cantidad');
  const cantidad = parseInt(cantEl.value);
  if (!sel.value || !cantidad || cantidad <= 0) { toast('⚠ Seleccioná producto y cantidad'); return; }

  const res = await api('inventario/mover', 'POST', { producto_id: parseInt(sel.value), cantidad });
  if (res.ok) {
    cantEl.value = '';
    const prod = inventarioData.find(p => p.producto_id == sel.value);
    toast(`✓ ${cantidad} ${prod?.nombre || ''} movidos a nevera`);
    renderInventario();
  } else if (res.error) {
    toast('❌ ' + res.error);
  }
}

initApp();
