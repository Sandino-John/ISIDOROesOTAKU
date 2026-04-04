// ─── CAJA Y TURNOS ──────────────────────────────────────────────────────────

// ─── CAJA ─────────────────────────────────────────────────────────────────────
const MINIBAR_CATS = ['🍺 Bebidas Alcohólicas','🥤 Refrescos','⚡ Energizantes'];

let cajaData = { inicio: null, egresos: [], bebida: { stock: null, movimientos: [] }, vitrina: { stock: null, movimientos: [] } };
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
    try {
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
    if (p.hab) {
      if (p.hab.cash !== undefined) {
        hab_cash += p.hab.cash; hab_qr += p.hab.qr || 0; hab_com += p.hab.comision || 0;
      } else {
        if (p.hab.method === 'cash') hab_cash += p.hab.monto; else { hab_qr += p.hab.monto; hab_com += p.hab.comision || 0; }
      }
      if (p.hab.cambio > 0) totalCambios += p.hab.cambio;
    }
    // Prepago — sumar al efectivo/qr de hab
    if (e.prepaid) {
      hab_cash += e.prepaid.cash || 0;
      hab_qr   += e.prepaid.qr || 0;
    }
    // Minibar
    if (p.minibar && p.minibar.monto > 0) {
      if (p.minibar.cash !== undefined) {
        mb_cash += p.minibar.cash; mb_qr += p.minibar.qr || 0;
      } else {
        if (p.minibar.method === 'cash') mb_cash += p.minibar.monto; else mb_qr += p.minibar.monto;
      }
      if (p.minibar.cambio > 0) totalCambios += p.minibar.cambio;
    }
    // Vitrina
    if (p.vitrina && p.vitrina.monto > 0) {
      if (p.vitrina.cash !== undefined) {
        vit_cash += p.vitrina.cash; vit_qr += p.vitrina.qr || 0;
      } else {
        if (p.vitrina.method === 'cash') vit_cash += p.vitrina.monto; else vit_qr += p.vitrina.monto;
      }
      if (p.vitrina.cambio > 0) totalCambios += p.vitrina.cambio;
    }
    } catch(err) { console.warn('calcCajaTotals: entrada con datos incompletos, saltando:', err, e); }
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
  registrarAsientoCajaInicial(val);
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
  registrarAsientoGasto(motivo, monto);
}

function deleteEgreso(idx) {
  const caja = getCajaData();
  caja.egresos.splice(idx, 1);
  saveCajaData(caja);
  renderCaja();
}

function resetCajaForNewShift() {
  const caja = getCajaData();
  caja.inicio = null;
  caja.egresos = [];
  // NO tocar bebida ni vitrina — son acumulativos (chanchitos)
  saveCajaData(caja);
}

// ─── CAJA TABS (Tiempo / Bebida / Vitrina) ──────────────────────────────────
let cajaTab = 'tiempo';

function setCajaTab(tab) {
  cajaTab = tab;
  const tabs = ['tiempo','bebida','vitrina'];
  const colors = { tiempo: 'var(--accent)', bebida: '#d97706', vitrina: '#0891b2' };
  tabs.forEach(t => {
    const btn = document.getElementById('caja-tab-' + t);
    const content = document.getElementById('caja-tab-' + t + '-content');
    if (t === tab) {
      btn.style.background = colors[t]; btn.style.color = '#fff'; btn.style.borderColor = colors[t];
      content.style.display = '';
    } else {
      btn.style.background = 'var(--surface2)'; btn.style.color = 'var(--text2)'; btn.style.borderColor = 'var(--border)';
      content.style.display = 'none';
    }
  });
  if (tab === 'tiempo') renderCaja();
  else renderStockTab(tab);
}

function calcStockTotals(type) {
  const entries = currentShift.entries || [];
  const isBebida = type === 'bebida';
  let cash = 0, qr = 0;
  const items = [];

  entries.forEach(e => {
    const p = e.pago;
    if (!p) {
      // legacy sin pago detallado
      (e.minibar || []).forEach(item => {
        const prod = minibarProducts.find(x => x.id === item.id);
        const match = isBebida ? MINIBAR_CATS.includes(prod?.cat) : !MINIBAR_CATS.includes(prod?.cat);
        if (match) {
          cash += item.price * item.qty;
          items.push({ name: prod?.name || item.id, qty: item.qty, total: item.price * item.qty, method: 'cash' });
        }
      });
      return;
    }
    const key = isBebida ? 'minibar' : 'vitrina';
    const pSection = p[key];
    if (pSection && pSection.monto > 0) {
      if (pSection.cash !== undefined) {
        cash += pSection.cash; qr += pSection.qr || 0;
      } else {
        if (pSection.method === 'cash') cash += pSection.monto; else qr += pSection.monto;
      }
    }
    // Collect individual items for the list
    (e.minibar || []).forEach(item => {
      const prod = minibarProducts.find(x => x.id === item.id);
      const match = isBebida ? MINIBAR_CATS.includes(prod?.cat) : !MINIBAR_CATS.includes(prod?.cat);
      if (match) {
        items.push({ name: prod?.name || item.id, qty: item.qty, total: item.price * item.qty, room: e.room });
      }
    });
  });

  const caja = getCajaData();
  const stockData = caja[type] || { stock: null, movimientos: [] };
  const movimientos = stockData.movimientos || [];
  const stock = stockData.stock || 0;
  const totalVentasTurno = cash + qr;

  // Acumulado histórico de movimientos
  const totalVentasHist = movimientos.filter(m => m.tipo === 'venta').reduce((s, m) => s + (m.cash || 0) + (m.qr || 0), 0);
  const totalRetirosHist = movimientos.filter(m => m.tipo === 'retiro').reduce((s, m) => s + m.monto, 0);
  const saldo = stock + totalVentasHist + totalVentasTurno - totalRetirosHist;

  return { stock, cash, qr, totalVentas: totalVentasTurno, totalVentasHist, totalRetirosHist, saldo, movimientos, items };
}

function renderStockTab(type) {
  const t = calcStockTotals(type);
  const caja = getCajaData();
  const stockData = caja[type] || { stock: null, movimientos: [] };
  const label_type = type === 'bebida' ? 'BEBIDAS' : 'VITRINA';

  // Saldo actual (acumulado)
  document.getElementById(type + '-stock-final').textContent = `Bs ${t.saldo}`;
  document.getElementById(type + '-stock-sub').textContent = `Stock: Bs ${t.stock} + Ventas: Bs ${t.totalVentasHist + t.totalVentas} − Retiros: Bs ${t.totalRetirosHist}`;

  // Stock inicial
  const label = document.getElementById(type + '-stock-label');
  if (stockData.stock !== null) {
    document.getElementById(type + '-stock-val').value = stockData.stock;
    label.textContent = `✓ Fijado en Bs ${stockData.stock}`;
    label.style.color = 'var(--green)';
  } else {
    label.textContent = 'No fijado — ingresá el monto al contar el chanchito';
    label.style.color = 'var(--text3)';
  }

  // Ventas del turno actual
  document.getElementById(type + '-ventas-total').textContent = `Bs ${t.totalVentas}`;
  document.getElementById(type + '-ventas-cash').textContent = `Bs ${t.cash}`;
  document.getElementById(type + '-ventas-qr').textContent = `Bs ${t.qr}`;
  const ventasList = document.getElementById(type + '-ventas-list');
  if (!t.items.length) {
    ventasList.innerHTML = '<div style="font-size:0.72rem;color:var(--text3);text-align:center;padding:8px">Sin ventas aún</div>';
  } else {
    ventasList.innerHTML = t.items.map(i => `
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.72rem;border-bottom:1px solid var(--border)">
        <span style="color:var(--text2)">${i.qty}× ${i.name}${i.room ? ' <span style="color:var(--text3)">(Hab.${i.room})</span>' : ''}</span>
        <span style="font-family:'JetBrains Mono',monospace;color:var(--green)">Bs ${i.total}</span>
      </div>`).join('');
  }

  // Historial de movimientos (ventas depositadas + retiros)
  const histList = document.getElementById(type + '-hist-list');
  const movs = t.movimientos.slice().reverse(); // más reciente primero
  if (!movs.length) {
    histList.innerHTML = '<div style="font-size:0.72rem;color:var(--text3);text-align:center;padding:8px">Sin movimientos registrados</div>';
  } else {
    histList.innerHTML = movs.map((m, i) => {
      const realIdx = t.movimientos.length - 1 - i;
      if (m.tipo === 'venta') {
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:0.72rem;border-bottom:1px solid var(--border)">
          <div style="display:flex;flex-direction:column">
            <span style="color:var(--green)">＋ Depósito turno ${m.turno}</span>
            <span style="font-size:0.6rem;color:var(--text3)">${m.fecha} · 💵 Bs ${m.cash || 0} · 📱 Bs ${m.qr || 0}</span>
          </div>
          <span style="font-family:'JetBrains Mono',monospace;color:var(--green)">+Bs ${(m.cash||0)+(m.qr||0)}</span>
        </div>`;
      } else {
        return `<div class="egreso-item">
          <div style="display:flex;flex-direction:column;flex:1;min-width:0">
            <span style="color:var(--red)">− ${m.motivo}</span>
            <span style="font-size:0.6rem;color:var(--text3)">${NOCTA_TIME.formatDateTime(m.ts)}</span>
          </div>
          <span class="egreso-item-monto">−Bs ${m.monto}</span>
          <button class="egreso-item-del" onclick="deleteMovimiento('${type}',${realIdx})" title="Eliminar">✕</button>
        </div>`;
      }
    }).join('');
  }

  // Formulario retiro
  document.getElementById(type + '-retiro-total').textContent = `Bs ${t.totalRetirosHist}`;
}

function setStockInicial(type) {
  const val = parseInt(document.getElementById(type + '-stock-val').value) || 0;
  const caja = getCajaData();
  if (!caja[type]) caja[type] = { stock: null, movimientos: [] };
  caja[type].stock = val;
  saveCajaData(caja);
  renderStockTab(type);
  toast(`✓ Stock ${type}: Bs ${val}`);
  if (val > 0) registrarAsientoStockInicial(type === 'bebida' ? '1003' : '1004', val, type);
}

function addRetiro(type) {
  const motivo = document.getElementById(type + '-retiro-motivo').value.trim();
  const monto = parseInt(document.getElementById(type + '-retiro-monto').value) || 0;
  if (!motivo) { toast('⚠ Escribí el motivo del retiro'); return; }
  if (!monto) { toast('⚠ Ingresá un monto válido'); return; }
  const caja = getCajaData();
  if (!caja[type]) caja[type] = { stock: null, movimientos: [] };
  if (!caja[type].movimientos) caja[type].movimientos = [];
  caja[type].movimientos.push({ tipo: 'retiro', motivo, monto, ts: Date.now() });
  saveCajaData(caja);
  document.getElementById(type + '-retiro-motivo').value = '';
  document.getElementById(type + '-retiro-monto').value = '';
  renderStockTab(type);
  toast(`− Bs ${monto} retiro ${type}: ${motivo}`);
  registrarAsientoRetiro(type === 'bebida' ? '6001' : '6002', type === 'bebida' ? '1003' : '1004', motivo, monto);
}

function deleteMovimiento(type, idx) {
  const caja = getCajaData();
  if (!caja[type] || !caja[type].movimientos) return;
  caja[type].movimientos.splice(idx, 1);
  saveCajaData(caja);
  renderStockTab(type);
}

// ─── DEPOSIT POPUP (al cerrar turno) ─────────────────────────────────────────
function showDepositPopup(bebida, vitrina, shiftType) {
  const turnoLabel = shiftType === 'day' ? 'Día' : 'Noche';
  const fecha = NOCTA_TIME.operativeDateKey();

  let html = '<div style="padding:20px;max-width:400px">';
  html += '<h3 style="margin:0 0 16px;font-size:1.1rem;color:var(--gold)">💰 Depósito a cajas</h3>';

  if (bebida.totalVentas > 0) {
    html += `<div style="background:var(--surface2);border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-weight:700;font-size:0.9rem;color:var(--text)">🍺 Caja Bebidas: <span style="color:var(--green)">Bs ${bebida.totalVentas}</span></div>
      <div style="font-size:0.72rem;color:var(--text3);margin:4px 0 8px">💵 Efectivo Bs ${bebida.cash} · 📱 QR Bs ${bebida.qr}</div>
      <button id="dep-bebida-btn" onclick="doDeposit('bebida',${bebida.cash},${bebida.qr},'${turnoLabel}','${fecha}')"
        style="width:100%;padding:10px;background:#d97706;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:0.82rem;cursor:pointer">
        Depositar a Caja Bebidas
      </button>
    </div>`;
  }

  if (vitrina.totalVentas > 0) {
    html += `<div style="background:var(--surface2);border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-weight:700;font-size:0.9rem;color:var(--text)">🏪 Caja Vitrina: <span style="color:var(--green)">Bs ${vitrina.totalVentas}</span></div>
      <div style="font-size:0.72rem;color:var(--text3);margin:4px 0 8px">💵 Efectivo Bs ${vitrina.cash} · 📱 QR Bs ${vitrina.qr}</div>
      <button id="dep-vitrina-btn" onclick="doDeposit('vitrina',${vitrina.cash},${vitrina.qr},'${turnoLabel}','${fecha}')"
        style="width:100%;padding:10px;background:#0891b2;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:0.82rem;cursor:pointer">
        Depositar a Caja Vitrina
      </button>
    </div>`;
  }

  html += `<button onclick="closeModal('depositOverlay')" style="width:100%;padding:10px;background:var(--surface2);color:var(--text2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;cursor:pointer;margin-top:4px">Cerrar sin depositar</button>`;
  html += '</div>';

  // Create overlay
  let overlay = document.getElementById('depositOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'depositOverlay';
    overlay.className = 'overlay';
    overlay.innerHTML = '<div class="modal" style="width:auto;max-width:440px"><div id="depositContent"></div></div>';
    document.body.appendChild(overlay);
  }
  document.getElementById('depositContent').innerHTML = html;
  overlay.classList.add('active');
}

function doDeposit(type, cash, qr, turnoLabel, fecha) {
  const caja = getCajaData();
  if (!caja[type]) caja[type] = { stock: null, movimientos: [] };
  if (!caja[type].movimientos) caja[type].movimientos = [];
  caja[type].movimientos.push({ tipo: 'venta', turno: turnoLabel, fecha, cash, qr, ts: Date.now() });
  saveCajaData(caja);

  const btn = document.getElementById('dep-' + type + '-btn');
  if (btn) {
    btn.textContent = '✓ Depositado';
    btn.disabled = true;
    btn.style.background = 'var(--green)';
    btn.style.opacity = '0.7';
  }
  toast(`✓ Bs ${cash + qr} depositado a caja ${type}`);
}

// ─── RECORDS SYSTEM ───────────────────────────────────────────────────────────
// hm_days: { "2026-03-13": [ ...shifts ] }
let allDays = {};

function todayKey() {
  return NOCTA_TIME.boliviaDateKey();
}

function operativeDateKey(timestamp) {
  return NOCTA_TIME.operativeDateKey(timestamp);
}

function saveDays() {
  // Guardar cada día individualmente
  Object.entries(allDays).forEach(([fecha, datos]) => {
    api('dias', 'POST', { fecha, datos });
  });
}

// Llamar al cerrar turno para guardar en el registro diario
function archiveShiftToDay(shift) {
  const key = operativeDateKey(shift.start);
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
      inicio: NOCTA_TIME.formatDateTime(sh.start),
      fin: sh.end ? NOCTA_TIME.formatDateTime(sh.end) : '—',
      total: sh.total || 0,
      habitaciones: (sh.entries||[]).map(e => ({
        habitacion: e.roomNum,
        tipo: e.type,
        transporte: e.guest,
        entrada: NOCTA_TIME.formatDateTime(e.checkin),
        salida: NOCTA_TIME.formatDateTime(e.checkout),
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
          <div class="rec-entry-row"><span>Entrada: ${formatTime(e.checkin)}</span><span>${e.checkout ? 'Salida: '+formatTime(e.checkout) : e.shiftPrepay ? '💰 Prepago cierre' : 'En curso'}</span></div>
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
  try {
  const entries = currentShift.entries || [];
  const occupiedRooms = Object.keys(occupancy);

  const typeNames = { ac:'Aire Acond.', fan:'Ventilador', fan2:'Ventilador', simple:'Simple' };
  const activeRooms = occupiedRooms.filter(n => !occupancy[n].cleaning);

  const warnEl = document.getElementById('shiftWarn');
  const occStep = document.getElementById('shiftOccupiedStep');
  if (activeRooms.length > 0) {
    warnEl.style.display = 'block';
    document.getElementById('shiftWarnCount').textContent = activeRooms.length;

    // Generar tarjetas de habitaciones ocupadas
    window._shiftPrepayments = {};
    const listEl = document.getElementById('shiftOccupiedList');
    listEl.innerHTML = activeRooms.map(num => {
      const occ = occupancy[num];
      const roomDef = ROOM_DEFS.find(r => r.num == num);
      const bill = roomDef ? calcBill(roomDef, occ.checkin, Date.now()) : { total: 0 };
      const elapsed = Date.now() - occ.checkin;
      const alreadyPrepaid = !!occ.prepaid;
      window._shiftPrepayments[num] = { paid: alreadyPrepaid, amount: bill.total, cash: bill.total, qr: 0 };

      return `
        <div class="shift-occ-card" id="soc-${num}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div style="display:flex;align-items:center;gap:10px;flex:1">
              <div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;font-weight:800;color:var(--gold);min-width:32px">${num}</div>
              <div>
                <div style="font-size:0.75rem;font-weight:600;color:var(--text1)">${occ.guest || 'Sin nombre'}</div>
                <div style="font-size:0.6rem;color:var(--text3)">${roomDef ? typeNames[roomDef.type] : ''} · ${formatDuration(elapsed)} · Bs ${bill.total}</div>
              </div>
            </div>
            ${alreadyPrepaid ? `
              <div style="font-size:0.65rem;color:var(--green);font-weight:700;padding:4px 10px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:6px">💰 Prepago Bs ${occ.prepaid.amount}</div>
            ` : `
              <div style="display:flex;gap:4px">
                <button class="soc-toggle" id="soc-btn-no-${num}" onclick="toggleShiftPrepay(${num},false)" style="padding:4px 10px;font-size:0.65rem;border-radius:6px;cursor:pointer;font-weight:700;border:1px solid rgba(239,68,68,0.4);background:rgba(239,68,68,0.15);color:#f87171;transition:all 0.2s">No pagó</button>
                <button class="soc-toggle" id="soc-btn-yes-${num}" onclick="toggleShiftPrepay(${num},true)" style="padding:4px 10px;font-size:0.65rem;border-radius:6px;cursor:pointer;font-weight:700;border:1px solid rgba(34,197,94,0.3);background:transparent;color:var(--text3);transition:all 0.2s">Pagó</button>
              </div>
            `}
          </div>
          ${alreadyPrepaid ? '' : `
            <div id="soc-pay-${num}" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06)">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <div style="font-size:0.6rem;color:var(--text3);font-weight:600">Monto:</div>
                <input type="number" id="soc-amount-${num}" value="${bill.total}" min="0" style="width:70px;padding:3px 6px;font-size:0.72rem;font-family:'JetBrains Mono',monospace;background:var(--bg2);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:var(--text1);text-align:center" onchange="updateShiftPrepayAmount(${num})">
                <div style="display:flex;gap:3px;margin-left:auto">
                  <label style="font-size:0.6rem;color:var(--text2);cursor:pointer;display:flex;align-items:center;gap:2px">
                    <input type="radio" name="soc-method-${num}" value="cash" checked onchange="updateShiftPrepayMethod(${num},'cash')"> 💵 Efectivo
                  </label>
                  <label style="font-size:0.6rem;color:var(--text2);cursor:pointer;display:flex;align-items:center;gap:2px">
                    <input type="radio" name="soc-method-${num}" value="qr" onchange="updateShiftPrepayMethod(${num},'qr')"> 📱 QR
                  </label>
                  <label style="font-size:0.6rem;color:var(--text2);cursor:pointer;display:flex;align-items:center;gap:2px">
                    <input type="radio" name="soc-method-${num}" value="mix" onchange="updateShiftPrepayMethod(${num},'mix')"> Mixto
                  </label>
                </div>
              </div>
              <div id="soc-mix-${num}" style="display:none;margin-top:6px;gap:6px;align-items:center">
                <label style="font-size:0.6rem;color:var(--green)">💵 <input type="number" id="soc-cash-${num}" value="${bill.total}" min="0" style="width:60px;padding:2px 4px;font-size:0.7rem;font-family:'JetBrains Mono',monospace;background:var(--bg2);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:var(--green);text-align:center" onchange="updateShiftPrepayMix(${num})"></label>
                <label style="font-size:0.6rem;color:var(--ac-color)">📱 <input type="number" id="soc-qr-${num}" value="0" min="0" style="width:60px;padding:2px 4px;font-size:0.7rem;font-family:'JetBrains Mono',monospace;background:var(--bg2);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:var(--ac-color);text-align:center" onchange="updateShiftPrepayMix(${num})"></label>
              </div>
            </div>
          `}
        </div>`;
    }).join('');
    occStep.style.display = 'block';
  } else {
    warnEl.style.display = 'none';
    occStep.style.display = 'none';
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
        <td>${e.checkout ? formatTime(e.checkout) : e.shiftPrepay ? '💰 Prepago' : '—'}</td>
        <td style="font-family:\'JetBrains Mono\',monospace">${e.checkout ? formatDuration(e.checkout-e.checkin) : '—'}</td>
        <td style="font-family:\'JetBrains Mono\',monospace;color:var(--gold);font-weight:600">Bs ${e.total}</td>
      </tr>
    `).join('');
  }

  document.getElementById('shiftOverlay').classList.add('open');
  } catch(err) { console.error('Error al abrir cierre de turno:', err); alert('Error al abrir cierre de turno: ' + err.message); }
}

function toggleShiftPrepay(num, paid) {
  const sp = window._shiftPrepayments;
  if (!sp || !sp[num]) return;
  sp[num].paid = paid;
  const payDiv = document.getElementById('soc-pay-' + num);
  const btnYes = document.getElementById('soc-btn-yes-' + num);
  const btnNo = document.getElementById('soc-btn-no-' + num);
  if (paid) {
    payDiv.style.display = 'block';
    btnYes.style.background = 'rgba(34,197,94,0.2)';
    btnYes.style.color = '#22c55e';
    btnYes.style.borderColor = 'rgba(34,197,94,0.5)';
    btnNo.style.background = 'transparent';
    btnNo.style.color = 'var(--text3)';
    btnNo.style.borderColor = 'rgba(255,255,255,0.1)';
  } else {
    payDiv.style.display = 'none';
    btnNo.style.background = 'rgba(239,68,68,0.15)';
    btnNo.style.color = '#f87171';
    btnNo.style.borderColor = 'rgba(239,68,68,0.4)';
    btnYes.style.background = 'transparent';
    btnYes.style.color = 'var(--text3)';
    btnYes.style.borderColor = 'rgba(34,197,94,0.3)';
  }
}

function updateShiftPrepayAmount(num) {
  const sp = window._shiftPrepayments;
  if (!sp || !sp[num]) return;
  const amount = parseInt(document.getElementById('soc-amount-' + num).value) || 0;
  sp[num].amount = amount;
  sp[num].cash = amount;
  sp[num].qr = 0;
  // Reset to cash
  const cashRadio = document.querySelector('input[name="soc-method-' + num + '"][value="cash"]');
  if (cashRadio) cashRadio.checked = true;
  const mixDiv = document.getElementById('soc-mix-' + num);
  if (mixDiv) mixDiv.style.display = 'none';
}

function updateShiftPrepayMethod(num, method) {
  const sp = window._shiftPrepayments;
  if (!sp || !sp[num]) return;
  const amount = parseInt(document.getElementById('soc-amount-' + num).value) || 0;
  const mixDiv = document.getElementById('soc-mix-' + num);
  if (method === 'cash') {
    sp[num].cash = amount; sp[num].qr = 0;
    mixDiv.style.display = 'none';
  } else if (method === 'qr') {
    sp[num].cash = 0; sp[num].qr = amount;
    mixDiv.style.display = 'none';
  } else {
    mixDiv.style.display = 'flex';
    document.getElementById('soc-cash-' + num).value = amount;
    document.getElementById('soc-qr-' + num).value = 0;
    sp[num].cash = amount; sp[num].qr = 0;
  }
}

function updateShiftPrepayMix(num) {
  const sp = window._shiftPrepayments;
  if (!sp || !sp[num]) return;
  sp[num].cash = parseInt(document.getElementById('soc-cash-' + num).value) || 0;
  sp[num].qr = parseInt(document.getElementById('soc-qr-' + num).value) || 0;
  sp[num].amount = sp[num].cash + sp[num].qr;
}

function confirmShiftClose() {
  // Contar habitaciones que pasan al siguiente turno (NO se les fuerza checkout)
  const occupiedCount = Object.keys(occupancy).filter(n => !occupancy[n].cleaning).length;
  const closingNight  = currentShift.type === 'night';
  const typeNames = { ac:'Aire Acond.', fan:'Ventilador', fan2:'Ventilador', simple:'Simple' };

  // Procesar prepagos de habitaciones ocupadas
  const sp = window._shiftPrepayments || {};
  Object.keys(sp).forEach(num => {
    const p = sp[num];
    if (!p.paid || p.amount <= 0) return;
    const occ = occupancy[num];
    if (!occ || occ.cleaning) return;

    // Calcular horas transcurridas para registrar en prepaid
    const elapsed = Date.now() - occ.checkin;
    const hours = Math.max(1, Math.ceil(elapsed / 3600000));
    const roomDef = ROOM_DEFS.find(r => r.num == num);

    // Registrar prepago en occupancy para que el checkout lo descuente
    occ.prepaid = { hours, amount: p.amount, cash: p.cash, qr: p.qr };

    // Crear entry en el turno actual
    currentShift.entries = currentShift.entries || [];
    currentShift.entries.push({
      roomNum: parseInt(num),
      type: roomDef ? typeNames[roomDef.type] : 'Hab.',
      guest: occ.guest || '',
      checkin: occ.checkin,
      checkout: null,
      mode: occ.mode || 'hour',
      total: p.amount,
      prepaid: { hours, amount: p.amount, cash: p.cash, qr: p.qr },
      pago: {
        hab: { monto: p.amount, cash: p.cash, qr: p.qr, comision: 0, cambio: 0, prepaid: p.amount },
        minibar: { monto: 0, cash: 0, qr: 0, comision: 0, cambio: 0 },
        vitrina: { monto: 0, cash: 0, qr: 0, comision: 0, cambio: 0 },
      },
      shiftPrepay: true  // marca especial para identificar estos registros
    });
  });
  window._shiftPrepayments = null;

  currentShift.end = Date.now();
  currentShift.total = (currentShift.entries||[]).reduce((s,e)=>s+e.total,0);
  if (occupiedCount > 0) {
    currentShift.carriedOver = occupiedCount;
  }
  const closedNightShift = {...currentShift};
  const closedOpDate = operativeDateKey(currentShift.start);

  shifts.push(currentShift);
  // Purgar shifts con más de 3 días de antigüedad
  const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
  shifts = shifts.filter(sh => (sh.start || 0) >= threeDaysAgo);
  api('turnos', 'PUT', shifts);

  const cajaTotals = calcCajaTotals();
  archiveShiftToDay({...currentShift, caja: cajaTotals});

  // Calcular ventas de bebida/vitrina ANTES de resetear
  const bebidaTotals = calcStockTotals('bebida');
  const vitrinaTotals = calcStockTotals('vitrina');
  const closedShiftType = currentShift.type;

  saveOcc(); saveHist();
  resetCajaForNewShift();

  // Purgar movimientos > 7 días
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const caja = getCajaData();
  ['bebida', 'vitrina'].forEach(tipo => {
    if (caja[tipo] && caja[tipo].movimientos) {
      caja[tipo].movimientos = caja[tipo].movimientos.filter(m => m.ts >= sevenDaysAgo);
    }
  });
  saveCajaData(caja);

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

  // Mostrar popup de depósito si hubo ventas
  if (bebidaTotals.totalVentas > 0 || vitrinaTotals.totalVentas > 0) {
    setTimeout(() => showDepositPopup(bebidaTotals, vitrinaTotals, closedShiftType), 500);
  }

  // Si cerramos turno noche → generar reporte detallado como PDF
  if (closingNight) {
    setTimeout(() => {
      if (confirm('🌅 Turno noche cerrado.\n\n¿Generar el reporte PDF del día completo?')) {
        // Obtener HTML del reporte con datos archivados del día operativo
        const reportShifts = allDays[closedOpDate] || [];
        const html = generateDailyPrintReport(reportShifts, true);

        // Guardar en servidor (genera PDF automáticamente)
        const rdDate = new Date(closedOpDate + 'T12:00:00');
        const rdDias = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
        const rdMeses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        const rdName = `${rdDias[rdDate.getDay()]} ${rdDate.getDate()} ${rdMeses[rdDate.getMonth()]} ${rdDate.getFullYear()} RD`;
        api('guardar-archivo', 'POST', { nombre: `${rdName}.html`, contenido: html });

        // Abrir vista previa
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }

        addLog('REPORTE', `Reporte diario PDF generado`);
        toast('📄 Reporte PDF del día guardado en Reportes Diarios');
      }
    }, 600);
  }
}
