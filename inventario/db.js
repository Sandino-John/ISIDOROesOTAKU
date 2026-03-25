const Database = require('better-sqlite3');
const path = require('path');

// Base de datos SEPARADA del motel — solo para inventario de almacén
const db = new Database(path.join(__dirname, 'inventario.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS proveedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    contacto TEXT,
    telefono TEXT,
    email TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    categoria_id INTEGER,
    precio_compra REAL DEFAULT 0,
    precio_venta REAL DEFAULT 0,
    stock_actual INTEGER DEFAULT 0,
    stock_almacen INTEGER DEFAULT 0,
    stock_nevera INTEGER DEFAULT 0,
    stock_minimo INTEGER DEFAULT 5,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
  );

  CREATE TABLE IF NOT EXISTS entradas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    proveedor_id INTEGER,
    cantidad INTEGER NOT NULL,
    precio_unitario REAL DEFAULT 0,
    fecha TEXT DEFAULT (date('now','localtime')),
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
  );

  CREATE TABLE IF NOT EXISTS salidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario REAL DEFAULT 0,
    tipo TEXT DEFAULT 'venta',
    cliente TEXT,
    fecha TEXT DEFAULT (date('now','localtime')),
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  );
`);

// Seed categorías base si está vacío
const countCat = db.prepare('SELECT COUNT(*) as c FROM categorias').get();
if (countCat.c === 0) {
  const insertCat = db.prepare('INSERT INTO categorias (nombre) VALUES (?)');
  [
    '🍺 Bebidas Alcohólicas',
    '🥤 Refrescos',
    '⚡ Energizantes',
    '🍟 Snacks',
    '💊 Farmacia / Adultos',
    '🧴 Higiene',
    '🛏️ Lencería',
    '🧹 Limpieza',
    '🔧 Mantenimiento',
    '📦 Otros'
  ].forEach(c => insertCat.run(c));
}

// Migration: agregar stock_vitrina para ventas desde vitrina
try { db.prepare('SELECT stock_vitrina FROM productos LIMIT 1').get(); }
catch(e) { db.exec('ALTER TABLE productos ADD COLUMN stock_vitrina INTEGER DEFAULT 0'); }

// Migration: agregar pms_legacy_id para compatibilidad con minibar del PMS
try { db.prepare('SELECT pms_legacy_id FROM productos LIMIT 1').get(); }
catch(e) { db.exec('ALTER TABLE productos ADD COLUMN pms_legacy_id INTEGER'); }

// Poblar pms_legacy_id mapeando por nombre al DEFAULT_PRODUCTS del PMS
const legacyMap = {
  'Paceña Macanuda': 1, 'Paceña Lata': 2, 'Vino': 3,
  'Coca Cola Popular': 4, 'Coca Cola Personal': 5, 'Coca 2lt': 6,
  'Agua': 7, 'Agua 2 lts.': 8, 'Ades': 9,
  'Black': 10, 'Ciclon': 11, 'Powerade': 12,
  'Papa Frita': 13, 'Chipilo': 14, 'Maní': 15, 'Nachos': 16,
  'Pantera Suelto': 17, 'Maxmen Suelto': 18, 'Pantera Caja': 19,
  'Maxmen Caja': 20, 'Día D': 21, 'Viagra': 22,
  'Alikal': 23, 'Encendedor': 24, 'Jaboncillo': 25, 'Rasurador': 26, 'Sedal': 27
};
const updateLegacy = db.prepare('UPDATE productos SET pms_legacy_id = ? WHERE nombre = ? AND pms_legacy_id IS NULL');
Object.entries(legacyMap).forEach(([nombre, legacyId]) => updateLegacy.run(legacyId, nombre));

module.exports = db;
