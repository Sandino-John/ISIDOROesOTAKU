const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const db = new Database('motel23.db');

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
`);

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

// ─── ARCHIVOS ESTÁTICOS ──────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

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