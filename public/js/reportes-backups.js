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
  const fmt = ts => ts ? NOCTA_TIME.formatDateTime(ts) : '—';
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
  <div class="stamp">Generado: ${NOCTA_TIME.formatDateTime(Date.now())} · Motel 23</div>
  <script>window.print();<\/script>
  </body></html>`;

  // Datos JSON del reporte
  const dateKey = operativeDateKey(dayShift.start);
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
        ? NOCTA_TIME.formatDateTime(data._meta.exportDate)
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

function escapeReportHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function reportEntryStart(entry) {
  return entry?.checkin || entry?.checkinTs || entry?.ts || 0;
}

function reportEntryEnd(entry) {
  return entry?.checkout || entry?.checkoutTs || null;
}

function formatReportTime(ts) {
  return ts ? NOCTA_TIME.formatTime(ts) : '—';
}

function formatCashValue(amount) {
  return `Bs ${Number(amount) || 0}`;
}

function formatQrValue(amount) {
  return `QR ${Number(amount) || 0}`;
}

function formatPaymentValue(cash, qr) {
  const cashAmount = Number(cash) || 0;
  const qrAmount = Number(qr) || 0;
  if (cashAmount > 0 && qrAmount > 0) return `Bs ${cashAmount} + QR ${qrAmount}`;
  if (qrAmount > 0) return `QR ${qrAmount}`;
  if (cashAmount > 0) return `Bs ${cashAmount}`;
  return '—';
}

function buildDailyReportFileNames(opDateKey) {
  const rdDate = new Date(`${opDateKey}T12:00:00Z`);
  const now = new Date();
  const rdDias = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
  const rdMeses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const primaryBase = `${rdDias[rdDate.getUTCDay()]} ${rdDate.getUTCDate()} ${rdMeses[rdDate.getUTCMonth()]} ${rdDate.getUTCFullYear()} RD`;
  const versionStamp = new Intl.DateTimeFormat('es-BO', {
    timeZone: NOCTA_TIME.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now).replace(/:/g, '-') + '-' + String(now.getMilliseconds()).padStart(3, '0');
  const versionedBase = `${primaryBase} ${versionStamp}`;
  const folderUrl = '/Reportes%20Diarios/';
  return {
    opDateKey,
    primaryBase,
    versionedBase,
    primaryHtml: `${primaryBase}.html`,
    primaryJson: `${primaryBase}.json`,
    primaryPdf: `${primaryBase}.pdf`,
    versionedHtml: `${versionedBase}.html`,
    versionedJson: `${versionedBase}.json`,
    versionedPdf: `${versionedBase}.pdf`,
    primaryPdfUrl: `${folderUrl}${encodeURIComponent(`${primaryBase}.pdf`)}`,
    versionedPdfUrl: `${folderUrl}${encodeURIComponent(`${versionedBase}.pdf`)}`
  };
}

function deriveCajaSnapshotFromEntries(entries) {
  const snapshot = {
    inicio: 0,
    gastos: 0,
    totalCambios: 0,
    hab: { cash: 0, qr: 0, com: 0 },
    minibar: { cash: 0, qr: 0, com: 0 },
    vitrina: { cash: 0, qr: 0, com: 0 },
    efectivo: 0,
    digital: 0,
    comisiones: 0,
    total: 0,
    egresos: []
  };

  (entries || []).forEach(e => {
    const p = e.pago || {};
    snapshot.hab.cash += (p.hab?.cash || 0) + (p.hab?.prepaidCash || 0);
    snapshot.hab.qr += (p.hab?.qr || 0) + (p.hab?.prepaidQr || 0);
    snapshot.hab.com += p.hab?.comision || 0;
    snapshot.minibar.cash += p.minibar?.cash || 0;
    snapshot.minibar.qr += p.minibar?.qr || 0;
    snapshot.vitrina.cash += p.vitrina?.cash || 0;
    snapshot.vitrina.qr += p.vitrina?.qr || 0;
    snapshot.totalCambios += (p.hab?.cambio || 0) + (p.minibar?.cambio || 0) + (p.vitrina?.cambio || 0);
  });

  snapshot.digital = snapshot.hab.qr + snapshot.minibar.qr + snapshot.vitrina.qr;
  snapshot.efectivo = snapshot.hab.cash + snapshot.minibar.cash + snapshot.vitrina.cash - snapshot.totalCambios;
  snapshot.comisiones = snapshot.hab.com + snapshot.minibar.com + snapshot.vitrina.com;
  snapshot.total = snapshot.efectivo + snapshot.digital;
  return snapshot;
}

function getShiftCajaSnapshot(shift) {
  if (shift?.caja) return shift.caja;
  if (shift === currentShift) return calcCajaTotals();
  return deriveCajaSnapshotFromEntries(shift?.entries || []);
}

function sumEntrySection(entries, sectionKey) {
  return (entries || []).reduce((acc, entry) => {
    const section = entry?.pago?.[sectionKey] || {};
    acc.cash += section.cash || 0;
    acc.qr += section.qr || 0;
    return acc;
  }, { cash: 0, qr: 0 });
}

function buildDailyReportContext(explicitShifts) {
  const reportShifts = explicitShifts || buildCurrentDayShifts();
  const baseReportTs = reportShifts.length
    ? Math.min(...reportShifts.map(shift => shift.start || Date.now()))
    : Date.now();
  const opDateKey = operativeDateKey(baseReportTs);

  function deduplicateRoomEntries(allShifts) {
    const rawEntries = [];
    allShifts.forEach(sh => {
      (sh.entries || []).forEach(entry => {
        if (entry.roomNum == null && !entry.shiftPrepay) return;
        const cloned = { ...entry };
        if (cloned.checkin && sh.start && cloned.checkin < sh.start) cloned._fromPrevShift = true;
        rawEntries.push(cloned);
      });
    });

    const checkouts = rawEntries.filter(entry => entry.checkout && !entry.shiftPrepay);
    const prepays = rawEntries.filter(entry => entry.shiftPrepay);
    const latestPrepayByRoom = {};
    prepays.forEach(entry => { latestPrepayByRoom[entry.roomNum] = entry; });

    const filteredPrepays = Object.values(latestPrepayByRoom).filter(prepay => {
      const roomCheckouts = checkouts.filter(checkout => checkout.roomNum === prepay.roomNum);
      if (!roomCheckouts.length) return true;
      return roomCheckouts.every(checkout => prepay.checkin >= (checkout.checkout || 0));
    });

    return [...checkouts, ...filteredPrepays].sort((a, b) => reportEntryStart(a) - reportEntryStart(b));
  }

  function deduplicatePendingRooms(allShifts, roomEntries) {
    const pendingByRoom = {};
    allShifts.forEach(sh => {
      (sh.pendingRooms || []).forEach(room => {
        pendingByRoom[room.roomNum] = room;
      });
    });

    const checkoutEntries = roomEntries.filter(entry => entry.checkout);
    const prepayKeys = new Set(
      roomEntries
        .filter(entry => entry.shiftPrepay && !entry.checkout)
        .map(entry => `${entry.roomNum}|${entry.checkin || 0}`)
    );

    return Object.values(pendingByRoom)
      .filter(pending => !prepayKeys.has(`${pending.roomNum}|${pending.checkin || 0}`))
      .filter(pending => {
        const roomCheckouts = checkoutEntries.filter(checkout => checkout.roomNum === pending.roomNum);
        if (!roomCheckouts.length) return true;
        return roomCheckouts.every(checkout => pending.checkin >= (checkout.checkout || 0));
      })
      .sort((a, b) => a.roomNum - b.roomNum);
  }

  function buildDirectVitrinaEntries(allShifts) {
    return allShifts
      .flatMap(sh => (sh.entries || []).filter(entry => entry.type === 'vitrina-directa').map(entry => ({ ...entry })))
      .sort((a, b) => reportEntryStart(a) - reportEntryStart(b));
  }

  function buildSpecialEntries(allShifts) {
    return allShifts
      .flatMap(sh => (sh.entries || []).filter(entry => entry.type === 'consumo-personal' || entry.type === 'consumo-vip').map(entry => ({ ...entry })))
      .sort((a, b) => reportEntryStart(a) - reportEntryStart(b));
  }

  function buildShiftGroup(allShifts, type) {
    const nowTs = Date.now();
    const roomEntries = deduplicateRoomEntries(allShifts);
    const pendingRooms = deduplicatePendingRooms(allShifts, roomEntries);
    const directVitrinaEntries = buildDirectVitrinaEntries(allShifts);
    const specialEntries = buildSpecialEntries(allShifts);

    const cajaSummary = allShifts.map(getShiftCajaSnapshot).reduce((acc, caja) => {
      acc.hab.cash += caja?.hab?.cash || 0;
      acc.hab.qr += caja?.hab?.qr || 0;
      acc.hab.com += caja?.hab?.com || 0;
      acc.minibar.cash += caja?.minibar?.cash || 0;
      acc.minibar.qr += caja?.minibar?.qr || 0;
      acc.vitrina.cash += caja?.vitrina?.cash || 0;
      acc.vitrina.qr += caja?.vitrina?.qr || 0;
      acc.gastos += caja?.gastos || 0;
      acc.cambios += caja?.totalCambios || 0;
      return acc;
    }, {
      hab: { cash: 0, qr: 0, com: 0 },
      minibar: { cash: 0, qr: 0 },
      vitrina: { cash: 0, qr: 0 },
      gastos: 0,
      cambios: 0
    });

    const directVitrina = sumEntrySection(directVitrinaEntries, 'vitrina');
    const roomVitrina = {
      cash: Math.max(0, cajaSummary.vitrina.cash - directVitrina.cash),
      qr: Math.max(0, cajaSummary.vitrina.qr - directVitrina.qr)
    };
    const specialSummary = {
      personal: specialEntries
        .filter(entry => entry.type === 'consumo-personal')
        .reduce((acc, entry) => {
          acc.count += 1;
          acc.total += Number(entry.total) || 0;
          return acc;
        }, { count: 0, total: 0 }),
      vip: specialEntries
        .filter(entry => entry.type === 'consumo-vip')
        .reduce((acc, entry) => {
          acc.count += 1;
          acc.total += Number(entry.total) || 0;
          return acc;
        }, { count: 0, total: 0 })
    };

    const grossTotal =
      cajaSummary.hab.cash + cajaSummary.hab.qr + cajaSummary.hab.com +
      cajaSummary.minibar.cash + cajaSummary.minibar.qr +
      cajaSummary.vitrina.cash + cajaSummary.vitrina.qr;

    return {
      type,
      shifts: allShifts,
      start: allShifts.length ? Math.min(...allShifts.map(sh => sh.start || nowTs)) : null,
      end: allShifts.length ? Math.max(...allShifts.map(sh => {
        if (sh.end) return sh.end;
        if (currentShift && sh.start === currentShift.start && sh.type === currentShift.type) return nowTs;
        return sh.start || nowTs;
      })) : null,
      roomEntries,
      pendingRooms,
      directVitrinaEntries,
      specialEntries,
      summary: {
        hab: {
          cash: cajaSummary.hab.cash,
          qr: cajaSummary.hab.qr,
          comision: cajaSummary.hab.com,
          total: cajaSummary.hab.cash + cajaSummary.hab.qr + cajaSummary.hab.com
        },
        minibar: {
          cash: cajaSummary.minibar.cash,
          qr: cajaSummary.minibar.qr,
          total: cajaSummary.minibar.cash + cajaSummary.minibar.qr
        },
        vitrinaHabitaciones: {
          cash: roomVitrina.cash,
          qr: roomVitrina.qr,
          total: roomVitrina.cash + roomVitrina.qr
        },
        vitrinaDirecta: {
          cash: directVitrina.cash,
          qr: directVitrina.qr,
          total: directVitrina.cash + directVitrina.qr
        },
        special: specialSummary,
        ajustes: {
          cambios: cajaSummary.cambios,
          gastos: cajaSummary.gastos
        },
        prepayCount: roomEntries.filter(entry => entry.shiftPrepay && !entry.checkout).length,
        pendingCount: pendingRooms.length,
        attendedCount: roomEntries.filter(entry => entry.checkout && !entry.shiftPrepay).length,
        grossTotal
      }
    };
  }

  const dayGroup = buildShiftGroup(reportShifts.filter(shift => shift.type === 'day'), 'day');
  const nightGroup = buildShiftGroup(reportShifts.filter(shift => shift.type === 'night'), 'night');
  const general = {
    hab: {
      cash: dayGroup.summary.hab.cash + nightGroup.summary.hab.cash,
      qr: dayGroup.summary.hab.qr + nightGroup.summary.hab.qr,
      comision: dayGroup.summary.hab.comision + nightGroup.summary.hab.comision
    },
    minibar: {
      cash: dayGroup.summary.minibar.cash + nightGroup.summary.minibar.cash,
      qr: dayGroup.summary.minibar.qr + nightGroup.summary.minibar.qr
    },
    vitrinaHabitaciones: {
      cash: dayGroup.summary.vitrinaHabitaciones.cash + nightGroup.summary.vitrinaHabitaciones.cash,
      qr: dayGroup.summary.vitrinaHabitaciones.qr + nightGroup.summary.vitrinaHabitaciones.qr
    },
    vitrinaDirecta: {
      cash: dayGroup.summary.vitrinaDirecta.cash + nightGroup.summary.vitrinaDirecta.cash,
      qr: dayGroup.summary.vitrinaDirecta.qr + nightGroup.summary.vitrinaDirecta.qr
    },
    special: {
      personal: {
        count: dayGroup.summary.special.personal.count + nightGroup.summary.special.personal.count,
        total: dayGroup.summary.special.personal.total + nightGroup.summary.special.personal.total
      },
      vip: {
        count: dayGroup.summary.special.vip.count + nightGroup.summary.special.vip.count,
        total: dayGroup.summary.special.vip.total + nightGroup.summary.special.vip.total
      }
    },
    ajustes: {
      cambios: dayGroup.summary.ajustes.cambios + nightGroup.summary.ajustes.cambios,
      gastos: dayGroup.summary.ajustes.gastos + nightGroup.summary.ajustes.gastos
    },
    prepayCount: dayGroup.summary.prepayCount + nightGroup.summary.prepayCount,
    pendingCount: dayGroup.summary.pendingCount + nightGroup.summary.pendingCount,
    attendedCount: dayGroup.summary.attendedCount + nightGroup.summary.attendedCount
  };
  general.grossTotal = dayGroup.summary.grossTotal + nightGroup.summary.grossTotal;

  return {
    opDateKey,
    fechaHoy: new Date(`${opDateKey}T12:00:00Z`).toLocaleDateString('es-BO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    }),
    files: buildDailyReportFileNames(opDateKey),
    dayGroup,
    nightGroup,
    general
  };
}

function renderShiftSummaryRows(summary) {
  const rows = [
    ['Alojamiento', summary.hab.cash, summary.hab.qr + summary.hab.comision, summary.hab.total],
    ['Minibar habitaciones', summary.minibar.cash, summary.minibar.qr, summary.minibar.total],
    ['Vitrina habitaciones', summary.vitrinaHabitaciones.cash, summary.vitrinaHabitaciones.qr, summary.vitrinaHabitaciones.total],
    ['Vitrina directa', summary.vitrinaDirecta.cash, summary.vitrinaDirecta.qr, summary.vitrinaDirecta.total],
    [
      'TOTAL BRUTO',
      summary.hab.cash + summary.minibar.cash + summary.vitrinaHabitaciones.cash + summary.vitrinaDirecta.cash,
      summary.hab.qr + summary.hab.comision + summary.minibar.qr + summary.vitrinaHabitaciones.qr + summary.vitrinaDirecta.qr,
      summary.grossTotal
    ]
  ];

  return rows.map(([label, cash, qr, total], index) => {
    const rowClass = index === rows.length - 1 ? 'summary-total' : '';
    return `<tr class="${rowClass}">
      <td>${escapeReportHtml(label)}</td>
      <td>${formatCashValue(cash)}</td>
      <td>${formatQrValue(qr)}</td>
      <td>${formatCashValue(total)}</td>
    </tr>`;
  }).join('');
}

function buildRoomReportRows(entries, pendingRooms) {
  const pendingRows = (pendingRooms || []).map(room => {
    const prepaidLabel = room.prepaid
      ? ` · Prepago ${formatPaymentValue(room.prepaid.cash || 0, room.prepaid.qr || 0)}`
      : '';
    return `<tr class="pending-row">
      <td>🔸 ${room.roomNum}</td>
      <td>${formatReportTime(room.checkin)}</td>
      <td>⏳ Pendiente</td>
      <td colspan="4">Pasa al siguiente turno${escapeReportHtml(prepaidLabel)}</td>
      <td>${escapeReportHtml((room.guest || '').split(' ').slice(1).join(' ') || room.guest || '—')}</td>
    </tr>`;
  }).join('');

  if (!(entries || []).length && !pendingRows) {
    return '<tr><td colspan="8" style="text-align:center;color:#777;padding:12px">Sin registros</td></tr>';
  }

  const entryRows = (entries || []).map(entry => {
    const p = entry.pago || {};
    const habCash = (p.hab?.cash || 0) + (p.hab?.prepaidCash || 0);
    const habQr = (p.hab?.qr || 0) + (p.hab?.prepaidQr || 0);
    const habComision = p.hab?.comision || 0;
    const mbCash = p.minibar?.cash || 0;
    const mbQr = p.minibar?.qr || 0;
    const vitCash = p.vitrina?.cash || 0;
    const vitQr = p.vitrina?.qr || 0;

    if (entry.shiftPrepay && !entry.checkout) {
      return `<tr class="prepay-row">
        <td>💰 ${entry.roomNum}</td>
        <td>${formatReportTime(entry.checkin)}</td>
        <td>Prepago</td>
        <td>${formatPaymentValue(p.hab?.prepaidCash || 0, p.hab?.prepaidQr || 0)}</td>
        <td colspan="3">Pago al cierre, continua en habitacion</td>
        <td>${escapeReportHtml((entry.guest || '').split(' ').slice(1).join(' ') || entry.guest || '—')}</td>
      </tr>`;
    }

    const habTotal = habCash + habQr + habComision;
    const minibarTotal = mbCash + mbQr;
    const vitrinaTotal = vitCash + vitQr;
    const detail = (entry.minibar || []).length
      ? escapeReportHtml(entry.minibar.map(item => `${item.name} x${item.qty}`).join(', '))
      : escapeReportHtml(entry.breakdown || '—');

    return `<tr${entry._fromPrevShift ? ' class="from-prev-row"' : ''}>
      <td>${entry._fromPrevShift ? '🔸 ' : ''}${entry.roomNum}</td>
      <td>${formatReportTime(entry.checkin)}</td>
      <td>${formatReportTime(entry.checkout)}</td>
      <td>${formatPaymentValue(habCash, habQr + habComision)}</td>
      <td>${formatPaymentValue(mbCash, mbQr)}</td>
      <td>${formatPaymentValue(vitCash, vitQr)}</td>
      <td>${detail}</td>
      <td>${escapeReportHtml((entry.guest || '').split(' ').slice(1).join(' ') || entry.guest || '—')}</td>
    </tr>`;
  }).join('');

  return pendingRows + entryRows;
}

function buildDirectVitrinaRows(entries) {
  if (!entries.length) return '<tr><td colspan="5" style="text-align:center;color:#777;padding:12px">Sin ventas directas</td></tr>';
  return entries.map(entry => {
    const items = (entry.vitrinaItems || []).map(item => `${item.qty}x ${item.name}`).join(', ') || '—';
    const qr = entry?.pago?.vitrina?.qr || 0;
    const cash = entry?.pago?.vitrina?.cash || 0;
    const method = qr > 0 && cash > 0 ? 'Mixto' : qr > 0 ? 'QR' : 'Efectivo';
    return `<tr>
      <td>${formatReportTime(reportEntryStart(entry))}</td>
      <td>${escapeReportHtml(items)}</td>
      <td>${method}</td>
      <td>${cash > 0 ? formatCashValue(cash) : '—'}</td>
      <td>${qr > 0 ? formatQrValue(qr) : '—'}</td>
    </tr>`;
  }).join('');
}

function buildSpecialOpsRows(entries) {
  if (!entries.length) return '<tr><td colspan="5" style="text-align:center;color:#777;padding:12px">Sin operaciones especiales</td></tr>';
  return entries.map(entry => {
    const isVip = entry.type === 'consumo-vip';
    const items = (entry.personalItems || []).map(item => `${item.qty}x ${item.name}`).join(', ') || '—';
    const owner = entry?.pago?.personal?.empleado || entry.guest || '—';
    const note = isVip ? 'Cortesia / VIP' : 'Informativo - no suma a caja';
    return `<tr>
      <td>${formatReportTime(reportEntryStart(entry))}</td>
      <td>${isVip ? 'VIP' : 'Consumo personal'}</td>
      <td>${escapeReportHtml(owner)}</td>
      <td>${escapeReportHtml(items)}</td>
      <td>${isVip ? 'Bs 0' : `Bs ${entry.total || 0}`}</td>
    </tr>
    <tr class="special-note-row">
      <td colspan="5">${escapeReportHtml(note)}</td>
    </tr>`;
  }).join('');
}

function buildDailyReportJson(report) {
  function serializeGroup(group, label) {
    return {
      turno: label,
      inicio: group.start,
      fin: group.end,
      resumen: group.summary,
      habitaciones: group.roomEntries.map(entry => ({
        roomNum: entry.roomNum,
        guest: entry.guest || '',
        checkin: entry.checkin || null,
        checkout: entry.checkout || null,
        total: entry.total || 0,
        shiftPrepay: !!entry.shiftPrepay,
        detail: entry.breakdown || '',
        minibar: entry.minibar || []
      })),
      pendientes: group.pendingRooms,
      vitrinaDirecta: group.directVitrinaEntries.map(entry => ({
        ts: reportEntryStart(entry),
        total: entry.total || 0,
        items: entry.vitrinaItems || [],
        pago: entry.pago?.vitrina || {}
      })),
      operacionesEspeciales: group.specialEntries.map(entry => ({
        ts: reportEntryStart(entry),
        type: entry.type,
        guest: entry.guest || '',
        total: entry.total || 0,
        items: entry.personalItems || []
      }))
    };
  }

  return {
    fechaOperativa: report.opDateKey,
    generadoBolivia: NOCTA_TIME.formatDateTime(Date.now()),
    motel: 'Motel 23',
    archivos: report.files,
    resumenGeneral: report.general,
    turnoDia: serializeGroup(report.dayGroup, 'day'),
    turnoNoche: serializeGroup(report.nightGroup, 'night')
  };
}

async function saveReportFileStrict(nombre, contenido) {
  const response = await fetch('/api/guardar-archivo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, contenido })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `No se pudo guardar ${nombre}`);
  }

  return payload;
}

async function persistDailyReport(report, html, jsonText) {
  const files = report.files;
  await saveReportFileStrict(files.primaryHtml, html);
  await saveReportFileStrict(files.primaryJson, jsonText);
  await saveReportFileStrict(files.versionedHtml, html);
  await saveReportFileStrict(files.versionedJson, jsonText);
  return files;
}

// ─── REPORTE DIARIO IMPRIMIBLE ────────────────────────────────────────────────
async function generateDailyPrintReport(explicitShifts, options = {}) {
  const opts = {
    persist: true,
    openPdf: true,
    showSuccess: true,
    showError: true,
    alertOnError: true,
    ...options
  };

  const report = buildDailyReportContext(explicitShifts);
  const hasData = report.dayGroup.shifts.length || report.nightGroup.shifts.length;
  if (!hasData) {
    if (opts.showError) toast('⚠ No hay turnos para generar el reporte diario');
    return null;
  }

  function renderShiftSection(title, group) {
    return `<section class="shift-section">
      <h2>${title}</h2>
      <div class="shift-meta">
        <span>Turnos archivados: ${group.shifts.length}</span>
        <span>Horario: ${group.start ? NOCTA_TIME.formatDateTime(group.start) : '—'} → ${group.end ? NOCTA_TIME.formatDateTime(group.end) : '—'}</span>
        <span>Habitaciones atendidas: ${group.summary.attendedCount}</span>
      </div>

      <div class="summary-cards">
        <div class="summary-card"><span>Pendientes</span><strong>${group.summary.pendingCount}</strong></div>
        <div class="summary-card"><span>Prepagos cierre</span><strong>${group.summary.prepayCount}</strong></div>
        <div class="summary-card"><span>Cambios</span><strong>Bs ${group.summary.ajustes.cambios}</strong></div>
        <div class="summary-card"><span>Gastos</span><strong>Bs ${group.summary.ajustes.gastos}</strong></div>
        <div class="summary-card"><span>Operaciones especiales</span><strong>${group.summary.special.personal.count} pers. · ${group.summary.special.vip.count} VIP</strong></div>
      </div>

      <h3>Detalle de habitaciones</h3>
      <table>
        <thead>
          <tr>
            <th>Pieza</th>
            <th>Entrada</th>
            <th>Salida</th>
            <th>Habitacion</th>
            <th>Minibar</th>
            <th>Vitrina Hab.</th>
            <th>Detalle</th>
            <th>Movilidad</th>
          </tr>
        </thead>
        <tbody>${buildRoomReportRows(group.roomEntries, group.pendingRooms)}</tbody>
      </table>

      <table class="summary-table">
        <thead>
          <tr>
            <th>Concepto</th>
            <th>Efectivo</th>
            <th>QR</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${renderShiftSummaryRows(group.summary)}</tbody>
      </table>

      <h3>Vitrina directa</h3>
      <table>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Detalle</th>
            <th>Metodo</th>
            <th>Efectivo</th>
            <th>QR</th>
          </tr>
        </thead>
        <tbody>${buildDirectVitrinaRows(group.directVitrinaEntries)}</tbody>
      </table>

      <h3>Operaciones especiales <small>(informativas)</small></h3>
      <table>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Tipo</th>
            <th>Responsable</th>
            <th>Detalle</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>${buildSpecialOpsRows(group.specialEntries)}</tbody>
      </table>
    </section>`;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte Diario - Motel 23 - ${report.opDateKey}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size:11px; color:#222; padding:18px; }
  h1 { text-align:center; font-size:18px; margin-bottom:4px; }
  h2 { font-size:14px; background:#1a1a2e; color:#fff; padding:7px 12px; margin:16px 0 8px; }
  h3 { font-size:12px; margin:12px 0 6px; color:#1a1a2e; }
  h3 small { font-size:10px; color:#666; font-weight:normal; }
  .fecha { text-align:center; font-size:12px; color:#555; margin-bottom:14px; text-transform:uppercase; }
  .shift-meta { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; font-size:10px; color:#555; margin-bottom:8px; }
  .summary-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:8px; margin:8px 0 12px; }
  .summary-card { background:#f4f6fb; border:1px solid #dbe1f0; border-radius:8px; padding:8px; }
  .summary-card span { display:block; font-size:9px; color:#666; text-transform:uppercase; margin-bottom:3px; }
  .summary-card strong { font-size:13px; color:#1a1a2e; }
  table { width:100%; border-collapse:collapse; margin-bottom:8px; }
  th { background:#2d2d44; color:#fff; padding:6px 8px; text-align:left; font-size:9px; text-transform:uppercase; }
  td { padding:5px 8px; border-bottom:1px solid #ddd; font-size:10px; vertical-align:top; }
  .summary-table th { background:#c2410c; }
  .summary-table td { font-weight:600; }
  .summary-total td { background:#fff3e0; font-weight:800; }
  .general-summary th { background:#0f172a; }
  .general-summary td { background:#e8eefc; font-weight:700; }
  .pending-row td { background:#fff8e1; color:#9a6700; }
  .prepay-row td { background:#e8f5e9; color:#256029; }
  .from-prev-row td:first-child { border-left:3px solid #e67e22; }
  .special-note-row td { font-size:9px; color:#666; font-style:italic; background:#fafafa; }
  .footer-note { margin-top:14px; font-size:10px; color:#666; display:flex; justify-content:space-between; gap:12px; }
  .separator { border:none; border-top:2px solid #1a1a2e; margin:18px 0; }
  .no-print { position:fixed; top:12px; right:16px; z-index:999; }
  .no-print button { padding:10px 22px; font-size:14px; background:#c2410c; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:bold; }
  @media print {
    body { padding:8px; }
    .no-print { display:none; }
    h2, th, .summary-total td, .general-summary td, .pending-row td, .prepay-row td {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">🖨 Imprimir / Guardar PDF</button></div>
  <div class="fecha">${escapeReportHtml(report.fechaHoy)}</div>
  <h1>🦋 REPORTE DIARIO MOTEL 23</h1>
  ${renderShiftSection('☀ TURNO DIA', report.dayGroup)}
  ${renderShiftSection('🌙 TURNO NOCHE', report.nightGroup)}
  <hr class="separator">
  <h2>📊 TOTAL GENERAL</h2>
  <table class="summary-table general-summary">
    <thead>
      <tr>
        <th>Concepto</th>
        <th>Efectivo</th>
        <th>QR</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${renderShiftSummaryRows({
      hab: {
        cash: report.general.hab.cash,
        qr: report.general.hab.qr,
        comision: report.general.hab.comision,
        total: report.general.hab.cash + report.general.hab.qr + report.general.hab.comision
      },
      minibar: {
        cash: report.general.minibar.cash,
        qr: report.general.minibar.qr,
        total: report.general.minibar.cash + report.general.minibar.qr
      },
      vitrinaHabitaciones: {
        cash: report.general.vitrinaHabitaciones.cash,
        qr: report.general.vitrinaHabitaciones.qr,
        total: report.general.vitrinaHabitaciones.cash + report.general.vitrinaHabitaciones.qr
      },
      vitrinaDirecta: {
        cash: report.general.vitrinaDirecta.cash,
        qr: report.general.vitrinaDirecta.qr,
        total: report.general.vitrinaDirecta.cash + report.general.vitrinaDirecta.qr
      },
      grossTotal: report.general.grossTotal
    })}</tbody>
  </table>
  <div class="summary-cards">
    <div class="summary-card"><span>Habitaciones atendidas</span><strong>${report.general.attendedCount}</strong></div>
    <div class="summary-card"><span>Pendientes</span><strong>${report.general.pendingCount}</strong></div>
    <div class="summary-card"><span>Prepagos cierre</span><strong>${report.general.prepayCount}</strong></div>
    <div class="summary-card"><span>Operaciones especiales</span><strong>${report.general.special.personal.count} pers. · ${report.general.special.vip.count} VIP</strong></div>
  </div>
  <div class="footer-note">
    <span>Operaciones especiales: consumo personal y VIP se muestran de forma informativa.</span>
    <span>Generado: ${escapeReportHtml(NOCTA_TIME.formatDateTime(Date.now()))}</span>
  </div>
</body>
</html>`;

  const jsonText = JSON.stringify(buildDailyReportJson(report), null, 2);
  let previewWindow = null;

  try {
    if (opts.openPdf) {
      previewWindow = window.open('', '_blank');
      if (previewWindow) {
        previewWindow.document.write('<html><body style="font-family:Arial,sans-serif;padding:24px;color:#444">Generando reporte diario...</body></html>');
        previewWindow.document.close();
      }
    }

    if (opts.persist) {
      toast('⏳ Generando reporte diario y PDF...');
      await persistDailyReport(report, html, jsonText);
    }

    if (opts.openPdf) {
      const pdfUrl = `${report.files.versionedPdfUrl}?ts=${Date.now()}`;
      if (previewWindow) previewWindow.location = pdfUrl;
      else window.open(pdfUrl, '_blank');
    }

    if (opts.showSuccess) {
      addLog('REPORTE', `Reporte diario generado — ${report.opDateKey} · Bs ${report.general.grossTotal}`);
      toast(`📄 Reporte diario listo — Bs ${report.general.grossTotal}`);
    }

    return { report, html, files: report.files };
  } catch (error) {
    console.error('Error generando reporte diario:', error);
    if (previewWindow) previewWindow.close();
    if (opts.showError) toast(`❌ No se pudo generar el PDF: ${error.message}`);
    if (opts.alertOnError) alert(`No se pudo generar el PDF del reporte diario.\n\n${error.message}`);
    addLog('REPORTE', `Error generando reporte diario — ${error.message}`);
    return null;
  }
}
