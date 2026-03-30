// ─── REPORTES Y BACKUPS ─────────────────────────────────────────────────────

// Busca el turno día más reciente en shifts (para emparejarlo con el noche)
function findMatchingDayShift(nightShiftStart) {
  const ts = nightShiftStart || (currentShift && currentShift.start) || Date.now();
  const opDate = operativeDateKey(ts);

  // Buscar en allDays (ya archivado)
  const archived = allDays[opDate] || [];
  for (let i = archived.length - 1; i >= 0; i--) {
    if (archived[i].type === 'day') return archived[i];
  }

  // Fallback: shifts[] en RAM
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

  // Datos JSON del reporte
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

  // Guardar al disco del servidor (HTML → se genera PDF automáticamente)
  const rdDate = new Date(dayShift.start);
  const rdDias = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
  const rdMeses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const rdName = `${rdDias[rdDate.getDay()]} ${rdDate.getDate()} ${rdMeses[rdDate.getMonth()]} ${rdDate.getFullYear()} RD`;

  // Guardar HTML (el servidor genera el PDF automáticamente)
  api('guardar-archivo', 'POST', { nombre: `${rdName}.html`, contenido: html });
  // Guardar JSON con datos en crudo
  api('guardar-archivo', 'POST', { nombre: `${rdName}.json`, contenido: JSON.stringify(jsonData, null, 2) });

  // También abrir ventana para vista previa / impresión manual
  const w = window.open('', '_blank', 'width=600,height=800');
  if (w) {
    w.document.write(html);
    w.document.close();
  }

  toast(`📄 Reporte PDF del día generado — Bs ${grandTotal} total`);
}

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
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const timeStr = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const turno = currentShift?.type === 'day' ? 'dia' : 'noche';
    const nombre = `backup_${turno}_${dateStr}_${timeStr}.json`;
    api('guardar-archivo', 'POST', { nombre, contenido: JSON.stringify(backup, null, 2) });
    toast('💾 Backup guardado en Reportes Diarios');
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
    const tk = operativeDateKey(currentShift.start);
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
function generateDailyPrintReport(explicitShifts, returnOnly) {
  // Recopilar turnos del día actual (o usar los proporcionados explícitamente)
  const dayShifts = explicitShifts || buildCurrentDayShifts();
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
      // Efectivo = hab cash + prepago efectivo
      efect += (p.hab?.cash || 0) + (p.hab?.prepaidCash || p.hab?.prepaid || 0);
      // QR = hab qr + prepago QR
      qr += (p.hab?.qr || 0) + (p.hab?.prepaidQr || 0);
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
    if (!entries.length) return '<tr><td colspan="9" style="text-align:center;color:#999;padding:12px">Sin registros</td></tr>';
    return entries.map(e => {
      const p = e.pago || {};
      const habCash = (p.hab?.cash || 0) + (p.hab?.prepaidCash || p.hab?.prepaid || 0);
      const habQr = (p.hab?.qr || 0) + (p.hab?.prepaidQr || 0);
      const mbCash = p.minibar?.cash || 0;
      const mbQr = p.minibar?.qr || 0;
      const vitCash = p.vitrina?.cash || 0;
      const vitQr = p.vitrina?.qr || 0;
      const mbItems = e.minibar || [];
      return `<tr>
        <td>${e.roomNum}</td>
        <td>${formatTimeReport(e.checkin)}</td>
        <td>${formatTimeReport(e.checkout)}</td>
        <td>Bs ${habCash}${habQr > 0 ? ' <small style="color:#888">(QR '+habQr+')</small>':''}
        </td>
        <td>${(mbCash+mbQr) > 0 ? 'Bs '+(mbCash+mbQr)+(mbQr>0?' <small style="color:#888">(QR '+mbQr+')</small>':'') : '—'}</td>
        <td>${(vitCash+vitQr) > 0 ? 'Bs '+(vitCash+vitQr)+(vitQr>0?' <small style="color:#888">(QR '+vitQr+')</small>':'') : '—'}</td>
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

  const fechaHoy = (() => {
    if (explicitShifts && explicitShifts.length) {
      const d = new Date(operativeDateKey(explicitShifts[0].start) + 'T12:00:00');
      return d.toLocaleDateString('es-BO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    return new Date().toLocaleDateString('es-BO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  })();

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte Diario - Motel 23 - ${explicitShifts && explicitShifts.length ? operativeDateKey(explicitShifts[0].start) : operativeDateKey(Date.now())}</title>
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
<div class="no-print" style="position:fixed;top:12px;right:16px;z-index:999">
  <button onclick="window.print()" style="padding:10px 30px;font-size:14px;background:#c2410c;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:bold">🖨 Imprimir / Guardar PDF</button>
</div>

<div style="font-size:26px;color:#555;margin-bottom:4px;font-weight:bold;text-transform:uppercase">${fechaHoy}</div>
<h1>🦋 REPORTE DIARIO MOTEL 23</h1>

<h2>☀ TURNO MAÑANA</h2>
<table>
  <thead>
    <tr>
      <th>Nº PIEZA</th>
      <th>HORA ENTRADA</th>
      <th>HORA SALIDA</th>
      <th>HABITACIÓN</th>
      <th>MINIBAR</th>
      <th>VITRINA</th>
      <th>DETALLE CONSUMO</th>
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
      <th>HABITACIÓN</th>
      <th>MINIBAR</th>
      <th>VITRINA</th>
      <th>DETALLE CONSUMO</th>
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

  // Si se pide solo el HTML (para guardar como PDF), retornarlo sin abrir ventana
  if (returnOnly) return html;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
  addLog('REPORTE', `Reporte diario imprimible generado — ${morningEntries.length + nightEntries.length} checkouts`);
  toast(`📋 Reporte diario generado — ${morningEntries.length + nightEntries.length} checkouts`);
}
