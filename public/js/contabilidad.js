// ─── CONTABILIDAD (Libros Contables) ──────────────────────────────────────────

let contabTab = 'diario';

function contabHoy() {
  const hoy = operativeDateKey();
  document.getElementById('contab-desde').value = hoy;
  document.getElementById('contab-hasta').value = hoy;
  renderContabilidad();
}

function setContabTab(tab) {
  contabTab = tab;
  ['diario','mayor','resultados','bebidas','vitrina'].forEach(t => {
    document.getElementById('contab-tab-'+t).classList.toggle('active', t === tab);
    document.getElementById('contab-content-'+t).style.display = t === tab ? '' : 'none';
  });
  renderContabilidad();
}

async function renderContabilidad() {
  const desde = document.getElementById('contab-desde').value || operativeDateKey();
  const hasta = document.getElementById('contab-hasta').value || desde;
  if (!document.getElementById('contab-desde').value) document.getElementById('contab-desde').value = desde;
  if (!document.getElementById('contab-hasta').value) document.getElementById('contab-hasta').value = hasta;

  if (contabTab === 'diario') await renderLibroDiario(desde, hasta);
  else if (contabTab === 'mayor') await renderLibroMayor(desde, hasta);
  else if (contabTab === 'bebidas') await renderLibroCaja('bebidas', desde, hasta);
  else if (contabTab === 'vitrina') await renderLibroCaja('vitrina', desde, hasta);
  else await renderResultados(desde, hasta);
}

async function renderLibroDiario(desde, hasta) {
  const el = document.getElementById('contab-content-diario');
  const rows = await api(`contabilidad/diario?desde=${desde}&hasta=${hasta}`);
  if (!rows || !rows.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:0.75rem;text-align:center;padding:20px">Sin asientos en este periodo</div>';
    return;
  }
  let html = `<table class="contab-table"><thead><tr>
    <th>Hora</th><th>Concepto</th><th>Debe</th><th>Haber</th><th style="text-align:right">Bs</th>
  </tr></thead><tbody>`;
  for (const r of rows) {
    const hora = NOCTA_TIME.formatTime(r.ts);
    html += `<tr>
      <td style="color:var(--text3)">${hora}</td>
      <td style="font-family:Outfit,sans-serif;font-size:0.72rem">${r.concepto}</td>
      <td style="font-size:0.65rem;color:var(--text2)">${r.nombre_debe || r.cuenta_debe}</td>
      <td style="font-size:0.65rem;color:var(--text2)">${r.nombre_haber || r.cuenta_haber}</td>
      <td style="text-align:right;color:var(--green)">${r.monto.toFixed(0)}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  el.innerHTML = html;
}

async function renderLibroMayor(desde, hasta) {
  const el = document.getElementById('contab-content-mayor');
  const cuentas = await api(`contabilidad/mayor?desde=${desde}&hasta=${hasta}`);
  if (!cuentas || !cuentas.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:0.75rem;text-align:center;padding:20px">Sin movimientos en este periodo</div>';
    return;
  }
  let html = '';
  for (const c of cuentas) {
    const clase = c.saldo > 0 ? 'positivo' : c.saldo < 0 ? 'negativo' : 'cero';
    const signo = c.saldo > 0 ? '+' : '';
    html += `<div class="cuenta-card">
      <div>
        <div class="cuenta-nombre">${c.nombre}</div>
        <div style="font-size:0.62rem;color:var(--text3)">${c.codigo} · ${c.tipo}</div>
      </div>
      <div class="cuenta-saldo ${clase}">${signo}Bs ${c.saldo.toFixed(0)}</div>
    </div>`;
  }
  el.innerHTML = html;
}

async function renderResultados(desde, hasta) {
  const el = document.getElementById('contab-content-resultados');
  const data = await api(`contabilidad/resultados?desde=${desde}&hasta=${hasta}`);
  if (!data) { el.innerHTML = ''; return; }

  let html = '<div style="font-size:0.7rem;color:var(--text3);margin-bottom:6px;font-weight:600">INGRESOS</div>';
  for (const i of data.ingresos) {
    if (i.saldo === 0) continue;
    html += `<div class="cuenta-card"><div class="cuenta-nombre">${i.nombre}</div><div class="cuenta-saldo positivo">Bs ${i.saldo.toFixed(0)}</div></div>`;
  }
  html += `<div class="resultado-card"><div class="resultado-label">Total Ingresos</div><div class="resultado-valor" style="color:var(--green)">Bs ${data.totalIngresos.toFixed(0)}</div></div>`;

  html += '<div style="font-size:0.7rem;color:var(--text3);margin-bottom:6px;margin-top:10px;font-weight:600">GASTOS</div>';
  for (const g of data.gastos) {
    if (g.saldo === 0) continue;
    html += `<div class="cuenta-card"><div class="cuenta-nombre">${g.nombre}</div><div class="cuenta-saldo negativo">Bs ${g.saldo.toFixed(0)}</div></div>`;
  }
  html += `<div class="resultado-card"><div class="resultado-label">Total Gastos</div><div class="resultado-valor" style="color:var(--red)">Bs ${data.totalGastos.toFixed(0)}</div></div>`;

  const utilColor = data.utilidad >= 0 ? 'var(--green)' : 'var(--red)';
  html += `<div class="resultado-utilidad">
    <div class="resultado-label">Utilidad Neta</div>
    <div class="resultado-valor" style="color:${utilColor}">Bs ${data.utilidad.toFixed(0)}</div>
  </div>`;

  el.innerHTML = html;
}

// ─── Registro automático de asientos ──────────────────────────────────────────

async function registrarAsientoCheckout(entry) {
  try {
    const asientos = [];
    const hab = entry.roomNum || '?';
    const pago = entry.pago;
    if (!pago) return;

    // Habitación - efectivo
    if (pago.hab && pago.hab.cash > 0) {
      asientos.push({ concepto: `Hab ${hab} alojamiento (efectivo)`, cuenta_debe: '1001', cuenta_haber: '4001', monto: pago.hab.cash, referencia: 'checkout', ref_id: String(hab) });
    }
    // Habitación - QR
    if (pago.hab && pago.hab.qr > 0) {
      asientos.push({ concepto: `Hab ${hab} alojamiento (QR)`, cuenta_debe: '1002', cuenta_haber: '4001', monto: pago.hab.qr, referencia: 'checkout', ref_id: String(hab) });
    }
    // Recargo QR cobrado al cliente
    if (pago.hab && pago.hab.comision > 0) {
      asientos.push({ concepto: `Hab ${hab} recargo QR`, cuenta_debe: '1002', cuenta_haber: '4004', monto: pago.hab.comision, referencia: 'checkout', ref_id: String(hab) });
    }
    // Minibar - efectivo (va a Caja Bebidas, no Caja Efectivo)
    if (pago.minibar && pago.minibar.cash > 0) {
      asientos.push({ concepto: `Hab ${hab} minibar (efectivo)`, cuenta_debe: '1003', cuenta_haber: '4002', monto: pago.minibar.cash, referencia: 'checkout', ref_id: String(hab) });
    }
    // Minibar - QR
    if (pago.minibar && pago.minibar.qr > 0) {
      asientos.push({ concepto: `Hab ${hab} minibar (QR)`, cuenta_debe: '1002', cuenta_haber: '4002', monto: pago.minibar.qr, referencia: 'checkout', ref_id: String(hab) });
    }
    // Vitrina - efectivo (va a Caja Vitrina, no Caja Efectivo)
    if (pago.vitrina && pago.vitrina.cash > 0) {
      asientos.push({ concepto: `Hab ${hab} vitrina (efectivo)`, cuenta_debe: '1004', cuenta_haber: '4003', monto: pago.vitrina.cash, referencia: 'checkout', ref_id: String(hab) });
    }
    // Vitrina - QR
    if (pago.vitrina && pago.vitrina.qr > 0) {
      asientos.push({ concepto: `Hab ${hab} vitrina (QR)`, cuenta_debe: '1002', cuenta_haber: '4003', monto: pago.vitrina.qr, referencia: 'checkout', ref_id: String(hab) });
    }

    if (asientos.length > 0) await api('contabilidad/asiento', 'POST', { asientos });
  } catch(e) { console.warn('Contabilidad: error registrando checkout', e); }
}

async function registrarAsientoGasto(motivo, monto) {
  try {
    await api('contabilidad/asiento', 'POST', { asientos: [
      { concepto: `Gasto: ${motivo}`, cuenta_debe: '5001', cuenta_haber: '1001', monto, referencia: 'gasto' }
    ]});
  } catch(e) { console.warn('Contabilidad: error registrando gasto', e); }
}

async function registrarAsientoCajaInicial(monto) {
  try {
    await api('contabilidad/asiento', 'POST', { asientos: [
      { concepto: 'Caja inicial del turno', cuenta_debe: '1001', cuenta_haber: '3001', monto, referencia: 'caja_inicial' }
    ]});
  } catch(e) { console.warn('Contabilidad: error registrando caja inicial', e); }
}

async function registrarAsientoConsumo(tipo, monto) {
  try {
    const esVip = tipo === 'vip';
    const cuenta = esVip ? '5003' : '5002';
    const label = esVip ? 'Consumo VIP' : 'Consumo personal';
    await api('contabilidad/asiento', 'POST', { asientos: [
      { concepto: label, cuenta_debe: cuenta, cuenta_haber: '4002', monto, referencia: esVip ? 'consumo_vip' : 'consumo_personal' }
    ]});
  } catch(e) { console.warn('Contabilidad: error registrando consumo', e); }
}

async function registrarAsientoVitrinaDirecta(entry) {
  try {
    const pago = entry?.pago?.vitrina;
    if (!pago) return;

    const detalle = (entry.vitrinaItems || [])
      .map(item => `${item.qty}x ${item.name}`)
      .join(', ') || 'Venta directa vitrina';
    const refId = String(entry.checkinTs || Date.now());
    const asientos = [];

    if (pago.cash > 0) {
      asientos.push({
        concepto: `Vitrina directa (${detalle})`,
        cuenta_debe: '1004',
        cuenta_haber: '4003',
        monto: pago.cash,
        referencia: 'vitrina_directa',
        ref_id: refId
      });
    }
    if (pago.qr > 0) {
      asientos.push({
        concepto: `Vitrina directa (${detalle}) (QR)`,
        cuenta_debe: '1002',
        cuenta_haber: '4003',
        monto: pago.qr,
        referencia: 'vitrina_directa',
        ref_id: refId
      });
    }

    if (asientos.length > 0) await api('contabilidad/asiento', 'POST', { asientos });
  } catch(e) { console.warn('Contabilidad: error registrando vitrina directa', e); }
}

async function renderLibroCaja(type, desde, hasta) {
  const el = document.getElementById('contab-content-' + type);
  const esBebida = type === 'bebidas';
  const cuentaCaja = esBebida ? '1003' : '1004';
  const cuentaIngreso = esBebida ? '4002' : '4003';
  const cuentaRetiro = esBebida ? '6001' : '6002';
  const emoji = esBebida ? '🍺' : '🏪';

  const mayor = await api(`contabilidad/mayor?desde=${desde}&hasta=${hasta}`);
  const diario = await api(`contabilidad/diario?desde=${desde}&hasta=${hasta}`);

  if (!mayor || !diario) { el.innerHTML = ''; return; }

  // Saldo de la caja
  const cuentaData = mayor.find(c => c.codigo === cuentaCaja);
  const saldo = cuentaData ? cuentaData.saldo : 0;
  const saldoColor = saldo >= 0 ? 'var(--green)' : 'var(--red)';

  // Solo mostrar movimientos que realmente tocaron esa caja fisica
  const asientosCaja = diario.filter(a =>
    a.cuenta_debe === cuentaCaja || a.cuenta_haber === cuentaCaja
  );

  // Totales
  const ventas = diario
    .filter(a => a.cuenta_debe === cuentaCaja && a.cuenta_haber === cuentaIngreso)
    .reduce((s, a) => s + a.monto, 0);
  const retiros = diario
    .filter(a => a.cuenta_debe === cuentaRetiro && a.cuenta_haber === cuentaCaja)
    .reduce((s, a) => s + a.monto, 0);
  const stockInicial = diario.filter(a => a.cuenta_debe === cuentaCaja && a.referencia === 'stock_inicial').reduce((s, a) => s + a.monto, 0);

  let html = `
    <div class="resultado-utilidad" style="margin-bottom:10px">
      <div class="resultado-label">${emoji} Saldo Caja ${esBebida ? 'Bebidas' : 'Vitrina'}</div>
      <div class="resultado-valor" style="color:${saldoColor}">Bs ${saldo.toFixed(0)}</div>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:10px">
      <div class="resultado-card" style="flex:1">
        <div class="resultado-label">Stock inicial</div>
        <div class="resultado-valor" style="color:var(--text);font-size:0.85rem">Bs ${stockInicial.toFixed(0)}</div>
      </div>
      <div class="resultado-card" style="flex:1">
        <div class="resultado-label">Ventas</div>
        <div class="resultado-valor" style="color:var(--green);font-size:0.85rem">Bs ${ventas.toFixed(0)}</div>
      </div>
      <div class="resultado-card" style="flex:1">
        <div class="resultado-label">Retiros</div>
        <div class="resultado-valor" style="color:var(--red);font-size:0.85rem">Bs ${retiros.toFixed(0)}</div>
      </div>
    </div>`;

  if (!asientosCaja.length) {
    html += '<div style="color:var(--text3);font-size:0.75rem;text-align:center;padding:12px">Sin movimientos en este periodo</div>';
  } else {
    html += `<div class="caja-section-label" style="margin-bottom:6px">Movimientos</div>
      <table class="contab-table"><thead><tr>
        <th>Hora</th><th>Concepto</th><th style="text-align:right">Bs</th>
      </tr></thead><tbody>`;
    for (const r of asientosCaja) {
      const hora = NOCTA_TIME.formatTime(r.ts);
      const esEntrada = r.cuenta_debe === cuentaCaja;
      const color = esEntrada ? 'var(--green)' : 'var(--red)';
      const signo = esEntrada ? '+' : '−';
      html += `<tr>
        <td style="color:var(--text3)">${hora}</td>
        <td style="font-family:Outfit,sans-serif;font-size:0.72rem">${r.concepto}</td>
        <td style="text-align:right;color:${color}">${signo}${r.monto.toFixed(0)}</td>
      </tr>`;
    }
    html += '</tbody></table>';
  }

  el.innerHTML = html;
}

async function registrarAsientoStockInicial(cuenta, monto, type) {
  try {
    await api('contabilidad/asiento', 'POST', { asientos: [
      { concepto: `Stock inicial ${type}`, cuenta_debe: cuenta, cuenta_haber: '3001', monto, referencia: 'stock_inicial' }
    ]});
  } catch(e) { console.warn('Contabilidad: error stock inicial', e); }
}

async function registrarAsientoRetiro(cuentaGasto, cajaOrigen, motivo, monto) {
  try {
    await api('contabilidad/asiento', 'POST', { asientos: [
      { concepto: `Retiro: ${motivo}`, cuenta_debe: cuentaGasto, cuenta_haber: cajaOrigen, monto, referencia: 'retiro' }
    ]});
  } catch(e) { console.warn('Contabilidad: error retiro', e); }
}
