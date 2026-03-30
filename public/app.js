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

function backupToLocalStorage() {
  try {
    localStorage.setItem('motel23_backup', JSON.stringify({
      currentShift, occupancy, cajaData, history, shifts, ts: Date.now()
    }));
  } catch(e) { /* localStorage lleno, ignorar */ }
}

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
    const nightTiers = config.tiers[room.type];
    const nightMax = Math.max(...Object.keys(nightTiers).map(Number));
    const nightPrice = nightTiers[nightMax];
    return { total: nightPrice, breakdown: 'Noche completa (12hs)', extraLabel:'', extraCharge:0, base: nightPrice, chargedHours:12 };
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
