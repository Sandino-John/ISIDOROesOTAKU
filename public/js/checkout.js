// ─── CHECKOUT Y PAGOS ───────────────────────────────────────────────────────

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
  const vehicleEmoji = [...(occ.guest||'')][0] || '';
  document.getElementById('confirm-subtitle').textContent = vehicleEmoji;
  document.getElementById('confirm-amount').innerHTML = `<span class="confirm-amount-currency">Bs</span><span class="confirm-amount-number">${grandTotal}</span>`;
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
      hab:     { monto: habMontoReal, cash: habPago.cash || 0, qr: habPago.qr || 0, comision: habPago.comision || 0, cambio: habPago.cambio || 0, prepaid: prepaidAmount, prepaidCash: occ.prepaid ? (occ.prepaid.cash||0) : 0, prepaidQr: occ.prepaid ? (occ.prepaid.qr||0) : 0 },
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
  registrarAsientoCheckout(entry);
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
    <div class="row"><span>Entrada:</span><span>${NOCTA_TIME.formatDateTime(occ.checkin)}</span></div>
    <div class="row"><span>Salida:</span><span>${NOCTA_TIME.formatDateTime(Date.now())}</span></div>
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
