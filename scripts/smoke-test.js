const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const ROOM_NUMS = Array.from({ length: 19 }, (_, i) => i + 1);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}/api/${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API ${endpoint} failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function waitFor(checkFn, label, timeoutMs = 10000, intervalMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await checkFn();
    if (result) return result;
    await sleep(intervalMs);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function waitForRoomState(roomNum, predicate, label) {
  return waitFor(async () => {
    const occ = await api('ocupacion');
    const state = occ?.[roomNum];
    return predicate(state) ? { ok: true, state } : null;
  }, label);
}

async function waitForHistoryEntry(roomNum, previousCount) {
  return waitFor(async () => {
    const hist = await api('historial');
    if (!Array.isArray(hist)) return null;
    const matches = hist.filter(entry => entry.roomNum === roomNum);
    return matches.length > previousCount ? matches[0] : null;
  }, `history entry for room ${roomNum}`);
}

async function waitForActivityLogMatch(pattern) {
  return waitFor(async () => {
    const log = await api('activitylog');
    if (!Array.isArray(log)) return null;
    const hit = [...log].reverse().find(item => pattern.test(item.details || item.action || ''));
    return hit || null;
  }, `activity log match ${pattern}`);
}

async function waitForFile(filePath) {
  return waitFor(async () => fs.existsSync(filePath) ? filePath : null, `file ${filePath}`, 15000, 250);
}

async function getFreeRooms() {
  const occ = await api('ocupacion');
  return ROOM_NUMS.filter(num => !occ?.[num]);
}

async function waitForUiReady(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => {
    const cards = document.querySelectorAll('.room-card').length;
    return cards >= 19 && typeof clickRoom === 'function' && typeof doCheckout === 'function';
  }, { timeout: 20000 });
}

async function checkinRoom(page, roomNum, vehicle = '🚗 Vehículo') {
  await page.evaluate(({ roomNum, vehicle }) => {
    if (adminMode) toggleAdmin();
    clickRoom(ROOM_DEFS.find(r => r.num === roomNum));
    window._selectedVehicle = vehicle;
    doCheckin();
  }, { roomNum, vehicle });

  await page.waitForFunction(num => {
    const card = document.getElementById(`card-${num}`);
    return !!card && card.classList.contains('occupied');
  }, {}, roomNum);
  await waitForRoomState(roomNum, state => !!state && !state.cleaning, `room ${roomNum} occupied`);
}

async function ageRoomStay(page, roomNum, ms = 361000) {
  await page.evaluate(({ roomNum, ms }) => {
    occupancy[roomNum].checkin = Date.now() - ms;
    saveOcc();
    render();
  }, { roomNum, ms });

  await waitForRoomState(roomNum, state => !!state && (Date.now() - state.checkin) >= (ms - 5000), `room ${roomNum} aged stay`);
}

async function openCheckout(page, roomNum) {
  await page.evaluate(roomNum => {
    if (adminMode) toggleAdmin();
    clickRoom(ROOM_DEFS.find(r => r.num === roomNum));
  }, roomNum);

  await page.waitForFunction(() => document.getElementById('checkoutOverlay').classList.contains('open'));
}

async function completeCheckout(page, roomNum, setupFn) {
  await openCheckout(page, roomNum);
  await page.evaluate(() => slideToPago());
  await page.waitForFunction(() => !!document.getElementById('pagoSections').innerText.trim());

  if (setupFn) {
    await setupFn();
  }

  const historyBefore = await api('historial');
  const roomHistoryBefore = Array.isArray(historyBefore)
    ? historyBefore.filter(entry => entry.roomNum === roomNum).length
    : 0;

  await page.evaluate(() => {
    slideToConfirm();
    doCheckout();
  });

  await page.waitForFunction(() => !document.getElementById('checkoutOverlay').classList.contains('open'));
  const historyEntry = await waitForHistoryEntry(roomNum, roomHistoryBefore);
  await waitForRoomState(roomNum, state => !!state && !!state.cleaning, `room ${roomNum} cleaning`);
  await page.waitForFunction(num => {
    const card = document.getElementById(`card-${num}`);
    return !!card && card.classList.contains('cleaning');
  }, {}, roomNum);

  return historyEntry;
}

async function setHabitacionQr(page) {
  await page.evaluate(() => {
    document.getElementById('qr-hab').value = pagoState.hab.monto;
    updatePagoQR('hab', pagoState.hab.monto, true);
  });
}

async function setSectionQr(page, key) {
  await page.evaluate(key => {
    if (!pagoState[key] || !pagoState[key].monto) return;
    document.getElementById(`qr-${key}`).value = pagoState[key].monto;
    updatePagoQR(key, pagoState[key].monto, false);
  }, key);
}

async function markRoomClean(page, roomNum) {
  await page.evaluate(roomNum => {
    confirmCleaning(roomNum, { stopPropagation() {} });
  }, roomNum);
  await waitForRoomState(roomNum, state => !state, `room ${roomNum} available after cleaning`);
  await page.waitForFunction(num => {
    const card = document.getElementById(`card-${num}`);
    return !!card && !card.classList.contains('occupied') && !card.classList.contains('cleaning');
  }, {}, roomNum);
}

async function attachProductDirectly(page, roomNum, productId, qty) {
  await page.evaluate(({ roomNum, productId, qty }) => {
    const product = minibarProducts.find(p => p.id === productId);
    if (!product) throw new Error(`Producto ${productId} no encontrado`);
    occupancy[roomNum].minibar = [{
      id: product.id,
      inv_id: product.inv_id,
      name: product.name,
      price: product.price,
      qty,
      cat: product.cat,
    }];
    saveOcc();
    render();
  }, { roomNum, productId, qty });

  await waitForRoomState(roomNum, state => Array.isArray(state?.minibar) && state.minibar.length > 0, `room ${roomNum} minibar attached`);
}

async function toggleAdminAndOpenBooks(page, tab) {
  await page.evaluate(tab => {
    if (!adminMode) toggleAdmin();
    openDrawer('contabilidad', document.getElementById('rail-contabilidad'));
    document.getElementById('contab-desde').value = operativeDateKey();
    document.getElementById('contab-hasta').value = operativeDateKey();
    setContabTab(tab);
  }, tab);

  await page.waitForFunction(tab => {
    const el = document.getElementById(`contab-content-${tab}`);
    return el && el.innerText.trim().length > 0;
  }, {}, tab);
}

async function main() {
  const reportBase = `smoke-test-${Date.now()}`;
  const reportDir = path.join(process.cwd(), 'public', 'Reportes Diarios');
  const reportHtml = path.join(reportDir, `${reportBase}.html`);
  const reportPdf = path.join(reportDir, `${reportBase}.pdf`);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  const results = [];
  let currentStep = 'boot';

  try {
    console.log('[smoke] boot');
    await waitForUiReady(page);
    results.push({ step: 'boot', ok: true });

    const freeRooms = await getFreeRooms();
    assert(freeRooms.length >= 1, 'Se necesita al menos 1 habitacion libre y solo hay ' + freeRooms.length);
    const [cashRoom] = freeRooms;
    const qrRoom = cashRoom;
    const minibarRoom = cashRoom;
    const vitrinaRoom = cashRoom;

    currentStep = 'checkout_cash';
    console.log(`[smoke] ${currentStep} room=${cashRoom}`);
    await checkinRoom(page, cashRoom);
    await ageRoomStay(page, cashRoom);
    const cashEntry = await completeCheckout(page, cashRoom);
    assert((cashEntry.pago?.hab?.qr || 0) === 0, 'El checkout cash dejó QR en habitación');
    assert((cashEntry.pago?.hab?.comision || 0) === 0, 'El checkout cash dejó comisión QR');
    results.push({ step: 'checkout_cash', ok: true, room: cashRoom, total: cashEntry.total });

    await markRoomClean(page, cashRoom);

    currentStep = 'checkout_qr';
    console.log(`[smoke] ${currentStep} room=${qrRoom}`);
    const operativeDate = await page.evaluate(() => operativeDateKey());
    const diarioBeforeQr = await api(`contabilidad/diario?desde=${operativeDate}&hasta=${operativeDate}`);
    const qrChargeBefore = diarioBeforeQr.filter(row => row.concepto === `Hab ${qrRoom} recargo QR`).length;

    await checkinRoom(page, qrRoom);
    await ageRoomStay(page, qrRoom);
    const qrEntry = await completeCheckout(page, qrRoom, async () => {
      await setHabitacionQr(page);
    });
    assert((qrEntry.pago?.hab?.qr || 0) > 0, 'El checkout QR no registró pago digital');
    assert((qrEntry.pago?.hab?.comision || 0) > 0, 'El checkout QR no calculó comisión');

    const qrChargeSeat = await waitFor(async () => {
      const diarioQr = await api(`contabilidad/diario?desde=${operativeDate}&hasta=${operativeDate}`);
      const qrChargeSeats = diarioQr.filter(row => row.concepto === `Hab ${qrRoom} recargo QR`);
      return qrChargeSeats.length > qrChargeBefore ? qrChargeSeats[qrChargeSeats.length - 1] : null;
    }, `qr surcharge accounting seat for room ${qrRoom}`);
    assert(Number(qrChargeSeat.monto) === Number(qrEntry.pago.hab.comision), 'El monto del recargo QR no coincide con la comisión cobrada');
    results.push({ step: 'checkout_qr', ok: true, room: qrRoom, total: qrEntry.total, comision: qrEntry.pago.hab.comision });

    await markRoomClean(page, qrRoom);

    currentStep = 'minibar_qr_books';
    console.log(`[smoke] ${currentStep} room=${minibarRoom}`);
    await checkinRoom(page, minibarRoom);
    await attachProductDirectly(page, minibarRoom, 4, 1);
    await ageRoomStay(page, minibarRoom);
    const minibarEntry = await completeCheckout(page, minibarRoom, async () => {
      await setSectionQr(page, 'minibar');
    });
    assert((minibarEntry.pago?.minibar?.qr || 0) > 0, 'La venta de minibar no quedó en QR');
    await toggleAdminAndOpenBooks(page, 'bebidas');
    const bebidasText = await page.$eval('#contab-content-bebidas', el => el.innerText);
    assert(!bebidasText.includes(`Hab ${minibarRoom} minibar (QR)`), 'Libros de bebidas todavía muestran una venta QR como movimiento de caja física');
    results.push({ step: 'minibar_qr_books', ok: true, room: minibarRoom, total: minibarEntry.pago.minibar.qr });

    await markRoomClean(page, minibarRoom);

    currentStep = 'vitrina_qr_books';
    console.log(`[smoke] ${currentStep} room=${vitrinaRoom}`);
    await checkinRoom(page, vitrinaRoom);
    await attachProductDirectly(page, vitrinaRoom, 13, 1);
    await ageRoomStay(page, vitrinaRoom);
    const vitrinaEntry = await completeCheckout(page, vitrinaRoom, async () => {
      await setSectionQr(page, 'vitrina');
    });
    assert((vitrinaEntry.pago?.vitrina?.qr || 0) > 0, 'La venta de vitrina no quedó en QR');
    await toggleAdminAndOpenBooks(page, 'vitrina');
    const vitrinaText = await page.$eval('#contab-content-vitrina', el => el.innerText);
    assert(!vitrinaText.includes(`Hab ${vitrinaRoom} vitrina (QR)`), 'Libros de vitrina todavía muestran una venta QR como movimiento de caja física');
    results.push({ step: 'vitrina_qr_books', ok: true, room: vitrinaRoom, total: vitrinaEntry.pago.vitrina.qr });

    await markRoomClean(page, vitrinaRoom);

    currentStep = 'daily_report';
    console.log(`[smoke] ${currentStep}`);
    const saveResult = await page.evaluate(async reportBase => {
      const html = generateDailyPrintReport(null, true);
      return api('guardar-archivo', 'POST', {
        nombre: `${reportBase}.html`,
        contenido: html,
      });
    }, reportBase);
    assert(saveResult && !saveResult.error, 'El endpoint de guardado de reportes devolvió error');
    await waitForFile(reportHtml);
    await waitForFile(reportPdf);
    await waitForActivityLogMatch(/Reporte diario/i);
    results.push({ step: 'daily_report', ok: true, html: path.basename(reportHtml), pdf: path.basename(reportPdf) });

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, results }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      baseUrl: BASE_URL,
      currentStep,
      error: error.message,
      stack: error.stack,
      results,
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();








