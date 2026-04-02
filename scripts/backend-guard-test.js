const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(endpoint, method, body) {
  const res = await fetch(`${BASE_URL}/api/${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function main() {
  const results = [];

  const invalidReportPath = await request('guardar-archivo', 'POST', {
    nombre: '../evil.html',
    contenido: '<h1>x</h1>',
  });
  assert(invalidReportPath.status === 400, 'guardar-archivo aceptó path traversal');
  results.push({ step: 'report_path_traversal', ok: true });

  const invalidReportExt = await request('guardar-archivo', 'POST', {
    nombre: 'evil.pdf',
    contenido: 'x',
  });
  assert(invalidReportExt.status === 400, 'guardar-archivo aceptó extensión no permitida');
  results.push({ step: 'report_extension_guard', ok: true });

  const invalidInventoryLoad = await request('inventario/cargar', 'POST', {
    producto_id: 99,
    nombre: 'test',
    precio: 10,
    cantidad: 0,
  });
  assert(invalidInventoryLoad.status === 400, 'inventario/cargar aceptó cantidad inválida');
  results.push({ step: 'inventory_load_guard', ok: true });

  const invalidInventorySale = await request('inventario/vender', 'POST', {
    producto_id: 4,
    cantidad: 0,
  });
  assert(invalidInventorySale.status === 400, 'inventario/vender aceptó cantidad inválida');
  results.push({ step: 'inventory_sale_guard', ok: true });

  const invalidSeatPayload = await request('contabilidad/asiento', 'POST', {
    asientos: {},
  });
  assert(invalidSeatPayload.status === 400, 'contabilidad/asiento aceptó payload inválido');
  results.push({ step: 'accounting_payload_guard', ok: true });

  console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, results }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({
    ok: false,
    baseUrl: BASE_URL,
    error: error.message,
    stack: error.stack,
  }, null, 2));
  process.exitCode = 1;
});
