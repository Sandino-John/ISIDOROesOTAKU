const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const db = new Database('motel23.db');
const invDb = require('./inventario/db'); // BD del almacén/inventario

app.use(express.json());

// ─── INICIALIZAR BASE DE DATOS ────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS ocupacion (
    num INTEGER PRIMARY KEY,
    datos TEXT
  );

  CREATE TABLE IF NOT EXISTS historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datos TEXT,
    fecha TEXT DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS turno_actual (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    datos TEXT
  );

  CREATE TABLE IF NOT EXISTS turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datos TEXT,
    fecha TEXT DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datos TEXT
  );

  CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE TABLE IF NOT EXISTS caja (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    datos TEXT
  );

  CREATE TABLE IF NOT EXISTS dias (
    fecha TEXT PRIMARY KEY,
    datos TEXT
  );

  CREATE TABLE IF NOT EXISTS log (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    datos TEXT
  );

  CREATE TABLE IF NOT EXISTS inventario (
    producto_id INTEGER PRIMARY KEY,
    nombre      TEXT NOT NULL,
    precio      REAL NOT NULL,
    almacen     INTEGER NOT NULL DEFAULT 0,
    nevera      INTEGER NOT NULL DEFAULT 0,
    vitrina     INTEGER NOT NULL DEFAULT 0,
    vendido     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS mov_inventario (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    tipo       TEXT NOT NULL,
    cantidad   INTEGER NOT NULL,
    nota       TEXT
  );
`);

// Migración: agregar columna vitrina si no existe (DBs creadas antes de este cambio)
try { db.prepare('SELECT vitrina FROM inventario LIMIT 1').get(); }
catch(e) { db.exec('ALTER TABLE inventario ADD COLUMN vitrina INTEGER NOT NULL DEFAULT 0'); }

// Migración: agregar columnas monto y metodo_pago a mov_inventario
try { db.prepare('SELECT monto FROM mov_inventario LIMIT 1').get(); }
catch(e) { db.exec('ALTER TABLE mov_inventario ADD COLUMN monto REAL DEFAULT 0'); }
try { db.prepare('SELECT metodo_pago FROM mov_inventario LIMIT 1').get(); }
catch(e) { db.exec('ALTER TABLE mov_inventario ADD COLUMN metodo_pago TEXT'); }

// ─── OCUPACION ────────────────────────────────────────────────────────────────
app.get('/api/ocupacion', (req, res) => {
  const rows = db.prepare('SELECT * FROM ocupacion').all();
  const result = {};
  rows.forEach(r => { result[r.num] = JSON.parse(r.datos); });
  res.json(result);
});

app.post('/api/ocupacion', (req, res) => {
  const ocupacion = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO ocupacion (num, datos) VALUES (?, ?)');
  const del = db.prepare('DELETE FROM ocupacion WHERE num = ?');
  const transaction = db.transaction((occ) => {
    // Primero borramos todas
    db.prepare('DELETE FROM ocupacion').run();
    // Insertamos las que vienen
    Object.entries(occ).forEach(([num, datos]) => {
      upsert.run(parseInt(num), JSON.stringify(datos));
    });
  });
  transaction(ocupacion);
  res.json({ ok: true });
});

// ─── HISTORIAL ────────────────────────────────────────────────────────────────
app.get('/api/historial', (req, res) => {
  const rows = db.prepare('SELECT datos FROM historial ORDER BY id DESC LIMIT 200').all();
  res.json(rows.map(r => JSON.parse(r.datos)));
});

app.post('/api/historial', (req, res) => {
  db.prepare('INSERT INTO historial (datos) VALUES (?)').run(JSON.stringify(req.body));
  res.json({ ok: true });
});

app.put('/api/historial', (req, res) => {
  const entries = req.body;
  const transaction = db.transaction((arr) => {
    db.prepare('DELETE FROM historial').run();
    const ins = db.prepare('INSERT INTO historial (datos) VALUES (?)');
    arr.forEach(e => ins.run(JSON.stringify(e)));
  });
  transaction(entries);
  res.json({ ok: true });
});

// ─── TURNO ACTUAL ─────────────────────────────────────────────────────────────
app.get('/api/turno', (req, res) => {
  const row = db.prepare('SELECT datos FROM turno_actual WHERE id = 1').get();
  res.json(row ? JSON.parse(row.datos) : null);
});

app.post('/api/turno', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO turno_actual (id, datos) VALUES (1, ?)').run(JSON.stringify(req.body));
  res.json({ ok: true });
});

// ─── TURNOS CERRADOS ──────────────────────────────────────────────────────────
app.get('/api/turnos', (req, res) => {
  const rows = db.prepare('SELECT datos FROM turnos ORDER BY id DESC').all();
  res.json(rows.map(r => JSON.parse(r.datos)));
});

app.post('/api/turnos', (req, res) => {
  db.prepare('INSERT INTO turnos (datos) VALUES (?)').run(JSON.stringify(req.body));
  res.json({ ok: true });
});

app.put('/api/turnos', (req, res) => {
  const entries = req.body;
  const transaction = db.transaction((arr) => {
    db.prepare('DELETE FROM turnos').run();
    const ins = db.prepare('INSERT INTO turnos (datos) VALUES (?)');
    arr.forEach(e => ins.run(JSON.stringify(e)));
  });
  transaction(entries);
  res.json({ ok: true });
});

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────
app.get('/api/productos', (req, res) => {
  const row = db.prepare('SELECT datos FROM productos WHERE id = 1').get();
  res.json(row ? JSON.parse(row.datos) : null);
});

app.post('/api/productos', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO productos (id, datos) VALUES (1, ?)').run(JSON.stringify(req.body));
  res.json({ ok: true });
});

// ─── CONFIG ───────────────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const row = db.prepare("SELECT valor FROM config WHERE clave = 'main'").get();
  res.json(row ? JSON.parse(row.valor) : null);
});

app.post('/api/config', (req, res) => {
  db.prepare("INSERT OR REPLACE INTO config (clave, valor) VALUES ('main', ?)").run(JSON.stringify(req.body));
  res.json({ ok: true });
});

// ─── CAJA ─────────────────────────────────────────────────────────────────────
app.get('/api/caja', (req, res) => {
  const row = db.prepare('SELECT datos FROM caja WHERE id = 1').get();
  res.json(row ? JSON.parse(row.datos) : null);
});

app.post('/api/caja', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO caja (id, datos) VALUES (1, ?)').run(JSON.stringify(req.body));
  res.json({ ok: true });
});

// ─── DIAS ─────────────────────────────────────────────────────────────────────
app.get('/api/dias', (req, res) => {
  const rows = db.prepare('SELECT fecha, datos FROM dias ORDER BY fecha DESC LIMIT 30').all();
  const result = {};
  rows.forEach(r => { result[r.fecha] = JSON.parse(r.datos); });
  res.json(result);
});

app.post('/api/dias', (req, res) => {
  const { fecha, datos } = req.body;
  db.prepare('INSERT OR REPLACE INTO dias (fecha, datos) VALUES (?, ?)').run(fecha, JSON.stringify(datos));
  res.json({ ok: true });
});

// ─── LOG DE ACTIVIDAD ────────────────────────────────────────────────────────
app.get('/api/activitylog', (req, res) => {
  const row = db.prepare('SELECT datos FROM log WHERE id = 1').get();
  res.json(row ? JSON.parse(row.datos) : []);
});

app.post('/api/activitylog', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO log (id, datos) VALUES (1, ?)').run(JSON.stringify(req.body));
  res.json({ ok: true });
});

// ─── GUARDAR ARCHIVO EN REPORTES DIARIOS ──────────────────────────────────────
app.post('/api/guardar-archivo', (req, res) => {
  try {
    const { nombre, contenido } = req.body;
    const dir = path.join(__dirname, 'public', 'reportes diarios');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, nombre), contenido, 'utf8');
    res.json({ ok: true });
  } catch(e) {
    console.error('Error guardando archivo:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── INVENTARIO ──────────────────────────────────────────────────────────────

// GET: estado actual de todo el inventario
app.get('/api/inventario', (req, res) => {
  const rows = db.prepare('SELECT * FROM inventario ORDER BY nombre').all();
  res.json(rows);
});

// POST: admin carga stock al almacén
// body: { producto_id, nombre, precio, cantidad }
app.post('/api/inventario/cargar', (req, res) => {
  const { producto_id, nombre, precio, cantidad } = req.body;
  if (!producto_id || !cantidad || cantidad <= 0)
    return res.status(400).json({ error: 'Datos inválidos' });

  db.prepare(`
    INSERT INTO inventario (producto_id, nombre, precio, almacen, nevera, vitrina, vendido)
    VALUES (?, ?, ?, ?, 0, 0, 0)
    ON CONFLICT(producto_id) DO UPDATE SET
      nombre  = excluded.nombre,
      precio  = excluded.precio,
      almacen = almacen + excluded.almacen
  `).run(producto_id, nombre, precio, cantidad);

  db.prepare(`
    INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad, nota)
    VALUES (?, ?, 'carga_almacen', ?, ?)
  `).run(Date.now(), producto_id, cantidad, req.body.nota || null);

  res.json({ ok: true });
});

// POST: recepcionista mueve almacén → nevera
// body: { producto_id, cantidad }
app.post('/api/inventario/mover', (req, res) => {
  const { producto_id, cantidad } = req.body;
  if (!producto_id || !cantidad || cantidad <= 0)
    return res.status(400).json({ error: 'Datos inválidos' });

  const row = db.prepare('SELECT * FROM inventario WHERE producto_id = ?').get(producto_id);
  if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
  if (row.almacen < cantidad)
    return res.status(400).json({ error: `Stock insuficiente en almacén (hay ${row.almacen})` });

  db.prepare(`
    UPDATE inventario SET almacen = almacen - ?, nevera = nevera + ?
    WHERE producto_id = ?
  `).run(cantidad, cantidad, producto_id);

  db.prepare(`
    INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
    VALUES (?, ?, 'almacen_a_nevera', ?)
  `).run(Date.now(), producto_id, cantidad);

  res.json({ ok: true });
});

// GET: productos del inventario para el minibar (fuente única de verdad)
app.get('/api/inventario/productos-minibar', (req, res) => {
  try {
    const rows = invDb.prepare(`
      SELECT p.id, p.pms_legacy_id, c.nombre as cat, p.nombre as name,
             p.precio_venta as price,
             (p.stock_nevera + COALESCE(p.stock_vitrina, 0)) as stock,
             p.stock_almacen, p.stock_nevera, COALESCE(p.stock_vitrina, 0) as stock_vitrina
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      ORDER BY c.id, p.nombre
    `).all();
    // Usar pms_legacy_id como id si existe, para compatibilidad con ocupaciones guardadas
    const result = rows.map(r => ({
      id: r.pms_legacy_id || r.id,
      inv_id: r.id,
      cat: r.cat,
      name: r.name,
      price: r.price,
      stock: r.stock,
      stock_almacen: r.stock_almacen,
      stock_nevera: r.stock_nevera,
      stock_vitrina: r.stock_vitrina
    }));
    res.json(result);
  } catch(e) {
    console.error('Error cargando productos del inventario:', e);
    res.status(500).json({ error: 'Error cargando inventario' });
  }
});

// POST: registrar venta (llamado automáticamente al vender desde minibar)
// body: { producto_id, cantidad }
app.post('/api/inventario/vender', (req, res) => {
  const { producto_id, cantidad, inv_id, tipo_consumo, monto, metodo_pago } = req.body;
  if (!cantidad || cantidad <= 0)
    return res.status(400).json({ error: 'Datos inválidos' });

  // Buscar en inventario.db por inv_id (id real) o por pms_legacy_id
  const realId = inv_id || null;
  let row;
  if (realId) {
    row = invDb.prepare('SELECT * FROM productos WHERE id = ?').get(realId);
  }
  if (!row && producto_id) {
    row = invDb.prepare('SELECT * FROM productos WHERE pms_legacy_id = ?').get(producto_id);
  }
  if (!row) return res.json({ ok: true, tracked: false });

  if (row.stock_nevera < cantidad)
    return res.status(400).json({ error: `Stock insuficiente en nevera (hay ${row.stock_nevera})` });

  invDb.prepare(`
    UPDATE productos SET stock_nevera = stock_nevera - ?,
      stock_actual = stock_almacen + (stock_nevera - ?) + COALESCE(stock_vitrina, 0)
    WHERE id = ?
  `).run(cantidad, cantidad, row.id);

  // Mantener mov_inventario en motel23.db para el balance de turno
  const tipoMov = tipo_consumo === 'consumo-vip' ? 'consumo_vip'
    : tipo_consumo === 'consumo-personal' ? 'consumo_personal'
    : 'venta';
  db.prepare(`
    INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad, monto, metodo_pago)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(Date.now(), producto_id || row.pms_legacy_id, tipoMov, cantidad, monto || 0, metodo_pago || null);

  res.json({ ok: true, tracked: true });
});

// POST: devolver unidades a nevera (cuando se edita carrito y se reduce qty)
// body: { producto_id, cantidad }
app.post('/api/inventario/devolver', (req, res) => {
  const { producto_id, cantidad, inv_id } = req.body;
  if (!cantidad || cantidad <= 0)
    return res.status(400).json({ error: 'Datos inválidos' });

  const realId = inv_id || null;
  let row;
  if (realId) {
    row = invDb.prepare('SELECT * FROM productos WHERE id = ?').get(realId);
  }
  if (!row && producto_id) {
    row = invDb.prepare('SELECT * FROM productos WHERE pms_legacy_id = ?').get(producto_id);
  }
  if (!row) return res.json({ ok: true, tracked: false });

  invDb.prepare(`
    UPDATE productos SET stock_nevera = stock_nevera + ?,
      stock_actual = stock_almacen + (stock_nevera + ?) + COALESCE(stock_vitrina, 0)
    WHERE id = ?
  `).run(cantidad, cantidad, row.id);

  db.prepare(`
    INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
    VALUES (?, ?, 'devolucion', ?)
  `).run(Date.now(), producto_id || row.pms_legacy_id, cantidad);

  res.json({ ok: true, tracked: true });
});

// GET: historial de movimientos (últimos 200)
app.get('/api/inventario/movimientos', (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, i.nombre, i.precio
    FROM mov_inventario m
    LEFT JOIN inventario i ON i.producto_id = m.producto_id
    ORDER BY m.id DESC LIMIT 200
  `).all();
  res.json(rows);
});

// GET: reporte de reconciliación (solo admin)
app.get('/api/inventario/reconciliacion', (req, res) => {
  const rows = db.prepare('SELECT * FROM inventario ORDER BY nombre').all();
  const reporte = rows.map(r => ({
    ...r,
    ingresoEsperado: r.vendido * r.precio,
  }));
  res.json(reporte);
});

// POST: mover almacén → nevera
app.post('/api/inventario/mover-nevera', (req, res) => {
  const { producto_id, cantidad, inv_id } = req.body;
  if (!cantidad || cantidad <= 0)
    return res.status(400).json({ error: 'Datos inválidos' });

  const realId = inv_id || null;
  let row;
  if (realId) {
    row = invDb.prepare('SELECT * FROM productos WHERE id = ?').get(realId);
  }
  if (!row && producto_id) {
    row = invDb.prepare('SELECT * FROM productos WHERE pms_legacy_id = ?').get(producto_id);
  }
  if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
  if (row.stock_almacen < cantidad)
    return res.status(400).json({ error: `Stock insuficiente en almacén (hay ${row.stock_almacen})` });

  invDb.prepare(`
    UPDATE productos SET stock_almacen = stock_almacen - ?,
      stock_nevera = stock_nevera + ?
    WHERE id = ?
  `).run(cantidad, cantidad, row.id);

  db.prepare(`
    INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
    VALUES (?, ?, 'almacen_a_nevera', ?)
  `).run(Date.now(), producto_id || row.pms_legacy_id, cantidad);

  res.json({ ok: true });
});

// POST: mover almacén → vitrina
app.post('/api/inventario/mover-vitrina', (req, res) => {
  const { producto_id, cantidad, inv_id } = req.body;
  if (!cantidad || cantidad <= 0)
    return res.status(400).json({ error: 'Datos inválidos' });

  const realId = inv_id || null;
  let row;
  if (realId) {
    row = invDb.prepare('SELECT * FROM productos WHERE id = ?').get(realId);
  }
  if (!row && producto_id) {
    row = invDb.prepare('SELECT * FROM productos WHERE pms_legacy_id = ?').get(producto_id);
  }
  if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
  if (row.stock_almacen < cantidad)
    return res.status(400).json({ error: `Stock insuficiente en almacén (hay ${row.stock_almacen})` });

  invDb.prepare(`
    UPDATE productos SET stock_almacen = stock_almacen - ?,
      stock_vitrina = COALESCE(stock_vitrina, 0) + ?
    WHERE id = ?
  `).run(cantidad, cantidad, row.id);

  db.prepare(`
    INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
    VALUES (?, ?, 'almacen_a_vitrina', ?)
  `).run(Date.now(), producto_id || row.pms_legacy_id, cantidad);

  res.json({ ok: true });
});

// POST: venta directa desde vitrina (sin habitación)
app.post('/api/inventario/vender-vitrina', (req, res) => {
  const { producto_id, cantidad, inv_id, tipo_consumo, monto, metodo_pago } = req.body;
  if (!cantidad || cantidad <= 0)
    return res.status(400).json({ error: 'Datos inválidos' });

  const realId = inv_id || null;
  let row;
  if (realId) {
    row = invDb.prepare('SELECT * FROM productos WHERE id = ?').get(realId);
  }
  if (!row && producto_id) {
    row = invDb.prepare('SELECT * FROM productos WHERE pms_legacy_id = ?').get(producto_id);
  }
  if (!row) return res.json({ ok: true, tracked: false });

  const vitrina = row.stock_vitrina || 0;
  if (vitrina < cantidad)
    return res.status(400).json({ error: `Stock insuficiente en vitrina (hay ${vitrina})` });

  invDb.prepare(`
    UPDATE productos SET stock_vitrina = COALESCE(stock_vitrina, 0) - ?,
      stock_actual = stock_almacen + stock_nevera + (COALESCE(stock_vitrina, 0) - ?)
    WHERE id = ?
  `).run(cantidad, cantidad, row.id);

  const tipoMov = tipo_consumo === 'consumo-vip' ? 'consumo_vip'
    : tipo_consumo === 'consumo-personal' ? 'consumo_personal'
    : 'venta_vitrina';
  db.prepare(`
    INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad, monto, metodo_pago)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(Date.now(), producto_id || row.pms_legacy_id, tipoMov, cantidad, monto || 0, metodo_pago || null);

  res.json({ ok: true, tracked: true });
});

// POST: devolver unidades a vitrina
app.post('/api/inventario/devolver-vitrina', (req, res) => {
  const { producto_id, cantidad, inv_id } = req.body;
  if (!cantidad || cantidad <= 0)
    return res.status(400).json({ error: 'Datos inválidos' });

  const realId = inv_id || null;
  let row;
  if (realId) {
    row = invDb.prepare('SELECT * FROM productos WHERE id = ?').get(realId);
  }
  if (!row && producto_id) {
    row = invDb.prepare('SELECT * FROM productos WHERE pms_legacy_id = ?').get(producto_id);
  }
  if (!row) return res.json({ ok: true, tracked: false });

  invDb.prepare(`
    UPDATE productos SET stock_vitrina = COALESCE(stock_vitrina, 0) + ?,
      stock_actual = stock_almacen + stock_nevera + (COALESCE(stock_vitrina, 0) + ?)
    WHERE id = ?
  `).run(cantidad, cantidad, row.id);

  db.prepare(`
    INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
    VALUES (?, ?, 'devolucion_vitrina', ?)
  `).run(Date.now(), producto_id || row.pms_legacy_id, cantidad);

  res.json({ ok: true, tracked: true });
});

// GET: balance minibar + vitrina desde un timestamp
app.get('/api/inventario/balance', (req, res) => {
  const desde = parseInt(req.query.desde) || 0;
  const rows = db.prepare(`
    SELECT m.tipo, m.cantidad, m.producto_id
    FROM mov_inventario m
    WHERE m.ts >= ? AND m.tipo IN ('venta', 'venta_vitrina')
    ORDER BY m.ts
  `).all(desde);

  // Buscar nombres y precios en inventario.db
  const getProduct = invDb.prepare('SELECT nombre, precio_venta FROM productos WHERE pms_legacy_id = ?');

  let minibar = { total: 0, items: [] };
  let vitrina = { total: 0, items: [] };

  rows.forEach(r => {
    const prod = getProduct.get(r.producto_id);
    const precio = prod ? prod.precio_venta : 0;
    const nombre = prod ? prod.nombre : `Producto ${r.producto_id}`;
    const monto = r.cantidad * precio;
    const item = { nombre, cantidad: r.cantidad, monto };
    if (r.tipo === 'venta') {
      minibar.total += monto;
      minibar.items.push(item);
    } else {
      vitrina.total += monto;
      vitrina.items.push(item);
    }
  });

  res.json({ minibar, vitrina });
});

// ─── ALMACÉN / INVENTARIO (módulo admin, BD separada) ───────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use('/almacen', require('./inventario/routes/dashboard'));
app.use('/almacen/productos', require('./inventario/routes/productos'));
app.use('/almacen/entradas', require('./inventario/routes/entradas'));
app.use('/almacen/salidas', require('./inventario/routes/salidas'));
app.use('/almacen/reportes', require('./inventario/routes/reportes'));

// ─── ARCHIVOS ESTÁTICOS ──────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));

// ─── ARRANCAR SERVIDOR ────────────────────────────────────────────────────────
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🦋 Motel 23 corriendo en:');
  console.log('   http://localhost:3000  (esta PC)');
  console.log('');
  console.log('   Para acceder desde celular u otra PC,');
  console.log('   usa la IP de esta computadora + :3000');
  console.log('');
});