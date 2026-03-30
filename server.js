const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const puppeteer = require('puppeteer');
const pool     = require('./db/pool');
const registerContabilidadRoutes  = require('./server/contabilidad');
const registerEstadoRoutes        = require('./server/estado');
const registerInventarioApiRoutes = require('./server/inventario-api');
const registerReportesRoutes      = require('./server/reportes');

const app = express();
app.use(express.json());

// ─── INICIALIZAR BASE DE DATOS ─────────────────────────────────────────────────
async function initDb() {
  // Tablas principales del PMS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ocupacion (
      num   INTEGER PRIMARY KEY,
      datos TEXT
    );

    CREATE TABLE IF NOT EXISTS historial (
      id    SERIAL PRIMARY KEY,
      datos TEXT,
      fecha TEXT DEFAULT (CURRENT_DATE::TEXT)
    );

    CREATE TABLE IF NOT EXISTS turno_actual (
      id    SMALLINT PRIMARY KEY CHECK (id = 1),
      datos TEXT
    );

    CREATE TABLE IF NOT EXISTS turnos (
      id    SERIAL PRIMARY KEY,
      datos TEXT,
      fecha TEXT DEFAULT (CURRENT_DATE::TEXT)
    );

    CREATE TABLE IF NOT EXISTS pms_productos (
      id    SMALLINT PRIMARY KEY CHECK (id = 1),
      datos TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS caja (
      id    SMALLINT PRIMARY KEY CHECK (id = 1),
      datos TEXT
    );

    CREATE TABLE IF NOT EXISTS dias (
      fecha TEXT PRIMARY KEY,
      datos TEXT
    );

    CREATE TABLE IF NOT EXISTS log (
      id    SMALLINT PRIMARY KEY CHECK (id = 1),
      datos TEXT
    );

    CREATE TABLE IF NOT EXISTS inventario (
      producto_id INTEGER PRIMARY KEY,
      nombre      TEXT    NOT NULL,
      precio      REAL    NOT NULL,
      almacen     INTEGER NOT NULL DEFAULT 0,
      nevera      INTEGER NOT NULL DEFAULT 0,
      vitrina     INTEGER NOT NULL DEFAULT 0,
      vendido     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS mov_inventario (
      id          SERIAL  PRIMARY KEY,
      ts          BIGINT  NOT NULL,
      producto_id INTEGER NOT NULL,
      tipo        TEXT    NOT NULL,
      cantidad    INTEGER NOT NULL,
      nota        TEXT,
      monto       REAL    DEFAULT 0,
      metodo_pago TEXT
    );

    CREATE TABLE IF NOT EXISTS cuentas_contables (
      codigo TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      tipo   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asientos_contables (
      id           SERIAL  PRIMARY KEY,
      fecha        TEXT    NOT NULL,
      ts           BIGINT  NOT NULL,
      concepto     TEXT    NOT NULL,
      cuenta_debe  TEXT    NOT NULL,
      cuenta_haber TEXT    NOT NULL,
      monto        REAL    NOT NULL,
      referencia   TEXT,
      ref_id       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_asientos_fecha  ON asientos_contables(fecha);
    CREATE INDEX IF NOT EXISTS idx_asientos_debe   ON asientos_contables(cuenta_debe);
    CREATE INDEX IF NOT EXISTS idx_asientos_haber  ON asientos_contables(cuenta_haber);

    CREATE TABLE IF NOT EXISTS inv_categorias (
      id     SERIAL PRIMARY KEY,
      nombre TEXT   NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS inv_proveedores (
      id         SERIAL PRIMARY KEY,
      nombre     TEXT NOT NULL,
      contacto   TEXT,
      telefono   TEXT,
      email      TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inv_productos (
      id              SERIAL  PRIMARY KEY,
      nombre          TEXT    NOT NULL,
      descripcion     TEXT,
      categoria_id    INTEGER REFERENCES inv_categorias(id),
      precio_compra   REAL    DEFAULT 0,
      precio_venta    REAL    DEFAULT 0,
      stock_actual    INTEGER DEFAULT 0,
      stock_almacen   INTEGER DEFAULT 0,
      stock_nevera    INTEGER DEFAULT 0,
      stock_vitrina   INTEGER DEFAULT 0,
      stock_minimo    INTEGER DEFAULT 5,
      pms_legacy_id   INTEGER,
      created_at      TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inv_entradas (
      id              SERIAL  PRIMARY KEY,
      producto_id     INTEGER NOT NULL REFERENCES inv_productos(id),
      proveedor_id    INTEGER REFERENCES inv_proveedores(id),
      cantidad        INTEGER NOT NULL,
      precio_unitario REAL    DEFAULT 0,
      fecha           TEXT    DEFAULT (CURRENT_DATE::TEXT),
      notas           TEXT,
      created_at      TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inv_salidas (
      id              SERIAL  PRIMARY KEY,
      producto_id     INTEGER NOT NULL REFERENCES inv_productos(id),
      cantidad        INTEGER NOT NULL,
      precio_unitario REAL    DEFAULT 0,
      tipo            TEXT    DEFAULT 'venta',
      cliente         TEXT,
      fecha           TEXT    DEFAULT (CURRENT_DATE::TEXT),
      notas           TEXT,
      created_at      TIMESTAMP DEFAULT NOW()
    );
  `);

  // Seed cuentas contables
  const cuentas = [
    ['1001','Caja Efectivo','activo'],    ['1002','Caja Digital (QR)','activo'],
    ['4001','Habitaciones','ingreso'],    ['4002','Minibar','ingreso'],
    ['4003','Vitrina','ingreso'],         ['4004','Recargo QR','ingreso'],
    ['5001','Gastos Operativos','gasto'], ['5002','Consumo Personal','gasto'],
    ['5003','Consumo VIP','gasto'],       ['3001','Caja Inicial','capital'],
    ['1003','Caja Bebidas','activo'],     ['1004','Caja Vitrina','activo'],
    ['6001','Retiros Bebidas','gasto'],   ['6002','Retiros Vitrina','gasto'],
  ];
  for (const [codigo, nombre, tipo] of cuentas) {
    await pool.query(
      'INSERT INTO cuentas_contables VALUES ($1,$2,$3) ON CONFLICT (codigo) DO NOTHING',
      [codigo, nombre, tipo]
    );
  }

  // Seed categorías de inventario
  const { rows: [{ c }] } = await pool.query('SELECT COUNT(*) as c FROM inv_categorias');
  if (parseInt(c) === 0) {
    const cats = [
      '🍺 Bebidas Alcohólicas', '🥤 Refrescos', '⚡ Energizantes',
      '🍟 Snacks', '💊 Farmacia / Adultos', '🧴 Higiene',
      '🛏️ Lencería', '🧹 Limpieza', '🔧 Mantenimiento', '📦 Otros'
    ];
    for (const nombre of cats) {
      await pool.query(
        'INSERT INTO inv_categorias (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING',
        [nombre]
      );
    }
  }

  // Seed pms_legacy_id en inv_productos
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
  for (const [nombre, legacyId] of Object.entries(legacyMap)) {
    await pool.query(
      'UPDATE inv_productos SET pms_legacy_id = $1 WHERE nombre = $2 AND pms_legacy_id IS NULL',
      [legacyId, nombre]
    );
  }

  console.log('✅ Base de datos inicializada');
}

// ─── RUTAS ────────────────────────────────────────────────────────────────────
registerEstadoRoutes({ app, db: pool });
registerInventarioApiRoutes({ app, db: pool });
registerReportesRoutes({ app, fs, path, puppeteer, baseDir: __dirname });
registerContabilidadRoutes({ app, db: pool });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use('/almacen',           require('./inventario/routes/dashboard'));
app.use('/almacen/productos', require('./inventario/routes/productos'));
app.use('/almacen/entradas',  require('./inventario/routes/entradas'));
app.use('/almacen/salidas',   require('./inventario/routes/salidas'));
app.use('/almacen/reportes',  require('./inventario/routes/reportes'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));

// ─── ARRANCAR ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3001;

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('🦋 Motel 23 corriendo en:');
      console.log(`   http://localhost:${PORT}  (esta PC)`);
      console.log('');
      console.log('   Para acceder desde celular u otra PC,');
      console.log(`   usa la IP de esta computadora + :${PORT}`);
      console.log('');
    });
  })
  .catch(err => {
    console.error('❌ Error iniciando base de datos:', err.message);
    process.exit(1);
  });
