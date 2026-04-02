// ─── CORE OPERATIVO DEL PMS ────────────────────────────────────────────────

// ─── RENDER ───────────────────────────────────────────────────────────────────
function render() {
  const grid = document.getElementById('roomsGrid');
  grid.innerHTML = '';

  const icons = { ac:'❄️', fan:'🌀', fan2:'🌿', simple:'🛏' };
  const typeNames = { ac:'Aire Acond.', fan:'Ventilador', fan2:'Ventilador', simple:'Simple' };

  ROOM_DEFS.forEach(room => {
    // Tarjeta especial: Almacén/Inventario en lugar de hab 20
    if (room.num === 20) {
      const card = document.createElement('div');
      card.className = 'room-card almacen-card';
      card.id = 'card-20';
      card.onclick = () => openInventario();
      card.innerHTML = `
        <div style="position:absolute;top:4px;left:50%;transform:translateX(-50%);font-size:0.48rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.55);white-space:nowrap;z-index:2">ADMIN</div>
        <div class="card-top">
          <div class="room-number" style="font-size:1.2rem">📦</div>
        </div>
        <div class="card-body">
          <div style="font-size:2.5rem">🏪</div>
        </div>
        <div class="card-bottom">
          <div style="font-size:0.6rem;font-weight:800;padding:3px 8px;border-radius:20px;letter-spacing:0.8px;text-transform:uppercase;background:rgba(139,92,246,0.18);color:#a78bfa;border:1px solid rgba(139,92,246,0.35)">Almacén</div>
        </div>
      `;
      grid.appendChild(card);
      return;
    }

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
          <div class="click-controls" style="position:absolute;top:26px;right:6px;width:48px;height:48px;z-index:3">
            <img src="/images/yang.png" class="click-ctrl" id="yang-${room.num}" onclick="toggleClickCtrl(${room.num},'yang',event)" title="Control Yang (blanco)" style="width:27px;position:absolute;top:31px;left:-4px;cursor:pointer;opacity:0.4;transition:opacity 0.2s">
            <img src="/images/yin.png" class="click-ctrl" id="ying-${room.num}" onclick="toggleClickCtrl(${room.num},'ying',event)" title="Control Yin (negro)" style="width:27px;position:absolute;bottom:-42px;right:5px;cursor:pointer;opacity:0.4;transition:opacity 0.2s">
          </div>
          <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);display:flex;gap:7px;align-items:center">
            <button style="background:${minibarTotal>0?'rgba(245,200,66,0.3)':'rgba(255,255,255,0.12)'};border:1px solid ${minibarTotal>0?'var(--gold)':'rgba(255,255,255,0.3)'};color:${minibarTotal>0?'var(--gold)':'rgba(255,255,255,0.7)'};border-radius:6px;padding:5px 22px;font-size:0.8rem;cursor:pointer;font-family:Outfit,sans-serif;font-weight:700;white-space:nowrap;min-width:90px;text-align:center" onclick="openMinibar(${room.num},event)">🛒${minibarTotal>0?' Bs '+minibarTotal:' Minibar'}</button>
          </div>
          <div style="position:absolute;bottom:6px;right:10px;line-height:1;text-align:right">
            <span style="font-family:'Outfit',sans-serif;font-size:0.72rem;font-weight:600;color:#f5c842;letter-spacing:0.5px;text-shadow:0 0 8px rgba(245,200,66,0.8)">Bs </span><span id="price-${room.num}" style="font-family:'JetBrains Mono',monospace;font-size:2rem;font-weight:800;color:#f5c842;text-shadow:0 0 18px rgba(245,200,66,0.9),0 0 32px rgba(245,200,66,0.5)">${totalActual}</span>
          </div>
        </div>
      `;
    }
    grid.appendChild(card);
  });

  // Restaurar estado de controles click
  Object.keys(occupancy).forEach(num => {
    const occ = occupancy[num];
    if (occ && !occ.cleaning && occ.clickControls) {
      if (occ.clickControls.ying) { const el = document.getElementById('ying-'+num); if(el) el.style.opacity='1'; }
      if (occ.clickControls.yang) { const el = document.getElementById('yang-'+num); if(el) el.style.opacity='1'; }
    }
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
    try {
    const occ = occupancy[num];
    if (!occ || occ.cleaning) return;
    const el = document.getElementById('timer-' + num);
    if (el) el.textContent = formatDuration(Date.now() - occ.checkin);
    // Precio en tiempo real
    const priceEl = document.getElementById('price-' + num);
    if (priceEl) {
      const room = ROOM_DEFS.find(r => r.num == num);
      if (room) {
        const bill = calcBill(room, occ.checkin, Date.now());
        const mbTotal = (occ.minibar||[]).reduce((s,i)=>s+i.price*i.qty, 0);
        priceEl.textContent = bill.total + mbTotal;
      }
    }
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
    } catch(e) { console.error('Timer error room '+num, e); }
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
  const nightPrice = tiers[maxHr];
  prepaidHtml += `<button class="vehicle-btn prepaid-btn" onclick="selectPrepaid(this,12,${nightPrice})" style="padding:4px 10px;font-size:0.75rem;color:#fff">12h 🌙 · Bs ${nightPrice}</button>`;
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
  backupToLocalStorage();
  closeModal('checkinOverlay');
  render();
  const ppMsg = occData.prepaid ? ` · Prepago ${occData.prepaid.hours}h Bs ${occData.prepaid.amount}` : '';
  addLog('CHECK-IN', `Hab. ${selectedRoom.num} — ${window._selectedVehicle}${ppMsg}`);
  toast(`✓ Check-in Hab. ${selectedRoom.num} — ${window._selectedVehicle}${ppMsg}`);
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
const drawerTitles = { status:'📊 Estado', stats:'📈 Estadísticas', minibar:'🛒 Minibar', records:'📋 Registros', caja:'💰 Caja', personal:'👤 Personal', inventario:'📦 Inventario', contabilidad:'📒 Libros Contables' };

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
  if (panel === 'caja') { if (cajaTab === 'tiempo') renderCaja(); else renderStockTab(cajaTab); }
  if (panel === 'personal') renderPersonalPanel();
  if (panel === 'inventario') inv_render();
  if (panel === 'contabilidad') renderContabilidad();
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
      <tbody>${entries.map(e=>`<tr><td>${e.roomNum}</td><td>${e.type}</td><td>${formatTime(e.checkin)}</td><td>${e.checkout ? formatTime(e.checkout) : e.shiftPrepay ? '💰 Prepago' : '—'}</td><td>Bs ${e.total}</td></tr>`).join('')}</tbody>
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

// ─── SUPER USUARIO (ADMIN) ──────────────────────────────────────────────────
let _adminBillTotal = 0;

function toggleAdmin() {
  adminMode = !adminMode;
  const btn = document.getElementById('btnAdmin');
  btn.classList.toggle('active', adminMode);
  btn.textContent = adminMode ? '🔧 ADMIN' : '🔧';
  // Mostrar/ocultar botones admin en el rail
  const railInv = document.getElementById('rail-inventario');
  const railContab = document.getElementById('rail-contabilidad');
  if (railInv) railInv.style.display = adminMode ? '' : 'none';
  if (railContab) railContab.style.display = adminMode ? '' : 'none';
  if (!adminMode && (activePanel === 'inventario' || activePanel === 'contabilidad')) closeDrawer();
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
      api('inventario/productos-minibar'),
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
      // Productos del inventario — enriquecer con imágenes del DEFAULT
      minibarProducts = prodData.map(p => {
        if (!p.img) {
          const def = DEFAULT_PRODUCTS.find(d => d.id === p.id || d.name === p.name);
          if (def) p.img = def.img;
        }
        return p;
      });
    }
    if (cajaRes) cajaData = cajaRes;
    // Migrar retiros legacy a movimientos
    ['bebida','vitrina'].forEach(t => {
      if (cajaData[t]) {
        if (!cajaData[t].movimientos) cajaData[t].movimientos = [];
        if (cajaData[t].retiros && cajaData[t].retiros.length) {
          cajaData[t].retiros.forEach(r => cajaData[t].movimientos.push({ tipo:'retiro', motivo:r.motivo, monto:r.monto, ts:r.ts }));
          delete cajaData[t].retiros;
          saveCajaData(cajaData);
        }
      }
    });
    if (diasData && Object.keys(diasData).length) allDays = diasData;
    if (logData && logData.length) activityLog = logData;

  } catch(e) {
    console.warn('⚠ No se pudo conectar al servidor, intentando localStorage...', e);
    // Restaurar desde localStorage si el servidor no responde
    try {
      const backup = JSON.parse(localStorage.getItem('motel23_backup') || '{}');
      if (backup.currentShift) currentShift = backup.currentShift;
      if (backup.occupancy && Object.keys(backup.occupancy).length) occupancy = backup.occupancy;
      if (backup.cajaData) cajaData = backup.cajaData;
      if (backup.history && backup.history.length) history = backup.history;
      if (backup.shifts && backup.shifts.length) shifts = backup.shifts;
      console.log('✓ Datos restaurados desde localStorage');
    } catch(e2) { console.warn('No se pudo restaurar desde localStorage', e2); }
  }

  // Init shift if none active
  if (!currentShift) startNewShift();

  purgePruneOldDays();
  saveDays();
  saveHist();
  render();

  console.log('✓ Respaldo localStorage activo en cada check-in y minibar');
}

// ─── INVENTARIO + VITRINA ────────────────────────────────────────────────────

// Funciones públicas de balance (llamables desde el sistema principal)
function inv_getMinbarBalance() {
  return (currentShift.entries || []).reduce((t, e) => {
    const p = e.pago;
    if (!p) {
      const mbT = (e.minibar||[]).reduce((s,i)=>{
        const prod = minibarProducts.find(x=>x.id===i.id);
        return s + (MINIBAR_CATS.includes(prod?.cat) ? i.price*i.qty : 0);
      },0);
      return t + mbT;
    }
    return t + (p.minibar?.monto || 0);
  }, 0);
}

function inv_getVitrineBalance() {
  return (currentShift.entries || []).reduce((t, e) => {
    const p = e.pago;
    if (!p) {
      const vitT = (e.minibar||[]).reduce((s,i)=>{
        const prod = minibarProducts.find(x=>x.id===i.id);
        return s + (!MINIBAR_CATS.includes(prod?.cat) ? i.price*i.qty : 0);
      },0);
      return t + vitT;
    }
    return t + (p.vitrina?.monto || 0);
  }, 0);
}

// Toggle control Click (ying/yang) en tarjeta ocupada
function toggleClickCtrl(roomNum, type, event) {
  event.stopPropagation();
  const occ = occupancy[roomNum];
  if (!occ) return;
  if (!occ.clickControls) occ.clickControls = { ying: false, yang: false };
  occ.clickControls[type] = !occ.clickControls[type];
  const el = document.getElementById(type + '-' + roomNum);
  if (!el) return;
  if (occ.clickControls[type]) {
    el.style.opacity = '1';
    // Parpadeo al activar
    el.classList.add('click-blink');
    setTimeout(() => el.classList.remove('click-blink'), 1500);
  } else {
    el.style.opacity = '0.4';
    // Parpadeo al desactivar
    el.classList.add('click-blink');
    setTimeout(() => el.classList.remove('click-blink'), 1500);
  }
}

initApp();
