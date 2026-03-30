const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const registerContabilidadRoutes = require('./server/contabilidad');
const registerEstadoRoutes = require('./server/estado');
const registerInventarioApiRoutes = require('./server/inventario-api');
const registerReportesRoutes = require('./server/reportes');

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

  CREATE TABLE IF NOT EXISTS cuentas_contables (
    codigo TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    tipo   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS asientos_contables (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha        TEXT NOT NULL,
    ts           INTEGER NOT NULL,
    concepto     TEXT NOT NULL,
    cuenta_debe  TEXT NOT NULL,
    cuenta_haber TEXT NOT NULL,
    monto        REAL NOT NULL,
    referencia   TEXT,
    ref_id       TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_asientos_fecha ON asientos_contables(fecha);
  CREATE INDEX IF NOT EXISTS idx_asientos_debe  ON asientos_contables(cuenta_debe);
  CREATE INDEX IF NOT EXISTS idx_asientos_haber ON asientos_contables(cuenta_haber);
`);

// Seed cuentas contables
db.exec(`
  INSERT OR IGNORE INTO cuentas_contables VALUES ('1001','Caja Efectivo','activo');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('1002','Caja Digital (QR)','activo');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('4001','Habitaciones','ingreso');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('4002','Minibar','ingreso');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('4003','Vitrina','ingreso');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('4004','Recargo QR','ingreso');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('5001','Gastos Operativos','gasto');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('5002','Consumo Personal','gasto');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('5003','Consumo VIP','gasto');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('3001','Caja Inicial','capital');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('1003','Caja Bebidas','activo');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('1004','Caja Vitrina','activo');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('6001','Retiros Bebidas','gasto');
  INSERT OR IGNORE INTO cuentas_contables VALUES ('6002','Retiros Vitrina','gasto');
`);

// Migración: agregar columna vitrina si no existe (DBs creadas antes de este cambio)
try { db.prepare('SELECT vitrina FROM inventario LIMIT 1').get(); }
catch(e) { db.exec('ALTER TABLE inventario ADD COLUMN vitrina INTEGER NOT NULL DEFAULT 0'); }

// Migración: agregar columnas monto y metodo_pago a mov_inventario
try { db.prepare('SELECT monto FROM mov_inventario LIMIT 1').get(); }
catch(e) { db.exec('ALTER TABLE mov_inventario ADD COLUMN monto REAL DEFAULT 0'); }
try { db.prepare('SELECT metodo_pago FROM mov_inventario LIMIT 1').get(); }
catch(e) { db.exec('ALTER TABLE mov_inventario ADD COLUMN metodo_pago TEXT'); }

// ─── ESTADO Y PERSISTENCIA OPERATIVA ───────────────────────────────────────
registerEstadoRoutes({ app, db });

// ─── API DE INVENTARIO Y CONSUMOS ───────────────────────────────────────────
registerInventarioApiRoutes({ app, db, invDb });

// ─── REPORTES Y EXPORTACIONES ───────────────────────────────────────────────
registerReportesRoutes({ app, fs, path, puppeteer, baseDir: __dirname });

// ─── CONTABILIDAD (libros contables) ─────────────────────────────────────────
registerContabilidadRoutes({ app, db });

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
const PORT = parseInt(process.env.PORT, 10) || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🦋 Motel 23 corriendo en:');
  console.log(`   http://localhost:${PORT}  (esta PC)`);
  console.log('');
  console.log('   Para acceder desde celular u otra PC,');
  console.log(`   usa la IP de esta computadora + :${PORT}`);
  console.log('');
});

