require('dotenv').config();
const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const puppeteer  = require('puppeteer');
const cookieParser = require('cookie-parser');
const pool       = require('./db/pool');
const { registerAuthRoutes }          = require('./server/auth');
const registerContabilidadRoutes      = require('./server/contabilidad');
const registerEstadoRoutes            = require('./server/estado');
const registerInventarioApiRoutes     = require('./server/inventario-api');
const registerReportesRoutes          = require('./server/reportes');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── INICIALIZAR BASE DE DATOS ─────────────────────────────────────────────────
async function initDb() {

  // ── Detectar si venimos de un esquema Phase 1 (sin tabla motels) y migrar ──
  const { rows: [{ exists: motelsExists }] } = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'motels'
    ) AS exists
  `);

  if (!motelsExists) {
    console.log('⚙️  Migrando esquema a Phase 2 (multi-tenant)...');
    await pool.query(`
      DROP TABLE IF EXISTS
        inv_salidas, inv_entradas, inv_productos, inv_proveedores, inv_categorias,
        asientos_contables, cuentas_contables, mov_inventario, inventario,
        historial, turnos, turno_actual, caja, log, pms_productos,
        ocupacion, dias, config
      CASCADE;
    `);
  }

  // ── Tablas de identidad / multi-tenant ────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS motels (
      id             SERIAL  PRIMARY KEY,
      nombre         TEXT    NOT NULL,
      direccion      TEXT,
      plan           TEXT    DEFAULT 'promo',
      activo         BOOLEAN DEFAULT true,
      fecha_registro TEXT    DEFAULT (CURRENT_DATE::TEXT)
    );

    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL  PRIMARY KEY,
      motel_id      INTEGER REFERENCES motels(id),
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      nombre        TEXT    NOT NULL,
      rol           TEXT    NOT NULL DEFAULT 'recepcionista',
      activo        BOOLEAN DEFAULT true,
      created_at    TIMESTAMP DEFAULT NOW()
    );
  `);

  // ── Tablas singleton (una fila por motel) ─────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS turno_actual (
      motel_id  INTEGER PRIMARY KEY REFERENCES motels(id),
      datos     TEXT
    );

    CREATE TABLE IF NOT EXISTS pms_productos (
      motel_id  INTEGER PRIMARY KEY REFERENCES motels(id),
      datos     TEXT
    );

    CREATE TABLE IF NOT EXISTS caja (
      motel_id  INTEGER PRIMARY KEY REFERENCES motels(id),
      datos     TEXT
    );

    CREATE TABLE IF NOT EXISTS log (
      motel_id  INTEGER PRIMARY KEY REFERENCES motels(id),
      datos     TEXT
    );
  `);

  // ── Tablas con PK compuesta ───────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ocupacion (
      motel_id  INTEGER NOT NULL REFERENCES motels(id),
      num       INTEGER NOT NULL,
      datos     TEXT,
      PRIMARY KEY (motel_id, num)
    );

    CREATE TABLE IF NOT EXISTS config (
      motel_id  INTEGER NOT NULL REFERENCES motels(id),
      clave     TEXT    NOT NULL,
      valor     TEXT,
      PRIMARY KEY (motel_id, clave)
    );

    CREATE TABLE IF NOT EXISTS dias (
      motel_id  INTEGER NOT NULL REFERENCES motels(id),
      fecha     TEXT    NOT NULL,
      datos     TEXT,
      PRIMARY KEY (motel_id, fecha)
    );
  `);

  // ── Tablas de historial / operaciones ────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS historial (
      id        SERIAL  PRIMARY KEY,
      motel_id  INTEGER NOT NULL REFERENCES motels(id),
      datos     TEXT,
      fecha     TEXT DEFAULT (CURRENT_DATE::TEXT)
    );

    CREATE TABLE IF NOT EXISTS turnos (
      id        SERIAL  PRIMARY KEY,
      motel_id  INTEGER NOT NULL REFERENCES motels(id),
      datos     TEXT,
      fecha     TEXT DEFAULT (CURRENT_DATE::TEXT)
    );
  `);

  // ── Contabilidad ──────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cuentas_contables (
      motel_id  INTEGER NOT NULL REFERENCES motels(id),
      codigo    TEXT    NOT NULL,
      nombre    TEXT    NOT NULL,
      tipo      TEXT    NOT NULL,
      PRIMARY KEY (motel_id, codigo)
    );

    CREATE TABLE IF NOT EXISTS asientos_contables (
      id           SERIAL  PRIMARY KEY,
      motel_id     INTEGER NOT NULL REFERENCES motels(id),
      fecha        TEXT    NOT NULL,
      ts           BIGINT  NOT NULL,
      concepto     TEXT    NOT NULL,
      cuenta_debe  TEXT    NOT NULL,
      cuenta_haber TEXT    NOT NULL,
      monto        REAL    NOT NULL,
      referencia   TEXT,
      ref_id       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_asientos_motel_fecha
      ON asientos_contables(motel_id, fecha);
  `);

  // ── Inventario legacy PMS ─────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventario (
      motel_id    INTEGER NOT NULL REFERENCES motels(id),
      producto_id INTEGER NOT NULL,
      nombre      TEXT    NOT NULL,
      precio      REAL    NOT NULL,
      almacen     INTEGER NOT NULL DEFAULT 0,
      nevera      INTEGER NOT NULL DEFAULT 0,
      vitrina     INTEGER NOT NULL DEFAULT 0,
      vendido     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (motel_id, producto_id)
    );

    CREATE TABLE IF NOT EXISTS mov_inventario (
      id          SERIAL  PRIMARY KEY,
      motel_id    INTEGER NOT NULL REFERENCES motels(id),
      ts          BIGINT  NOT NULL,
      producto_id INTEGER NOT NULL,
      tipo        TEXT    NOT NULL,
      cantidad    INTEGER NOT NULL,
      nota        TEXT,
      monto       REAL    DEFAULT 0,
      metodo_pago TEXT
    );
  `);

  // ── Módulo almacén (inv_) ─────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inv_categorias (
      id        SERIAL  PRIMARY KEY,
      motel_id  INTEGER NOT NULL REFERENCES motels(id),
      nombre    TEXT    NOT NULL,
      UNIQUE (motel_id, nombre)
    );

    CREATE TABLE IF NOT EXISTS inv_proveedores (
      id         SERIAL  PRIMARY KEY,
      motel_id   INTEGER NOT NULL REFERENCES motels(id),
      nombre     TEXT    NOT NULL,
      contacto   TEXT,
      telefono   TEXT,
      email      TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inv_productos (
      id              SERIAL  PRIMARY KEY,
      motel_id        INTEGER NOT NULL REFERENCES motels(id),
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
      motel_id        INTEGER NOT NULL REFERENCES motels(id),
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
      motel_id        INTEGER NOT NULL REFERENCES motels(id),
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

  // ── Cobros mensuales (comisión 0.5%) ─────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cobros (
      id         SERIAL  PRIMARY KEY,
      motel_id   INTEGER NOT NULL REFERENCES motels(id),
      mes        TEXT    NOT NULL,
      ingresos   REAL    DEFAULT 0,
      comision   REAL    DEFAULT 0,
      pagado     BOOLEAN DEFAULT false,
      fecha_pago TEXT,
      notas      TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (motel_id, mes)
    );
  `);

  console.log('✅ Esquema multi-tenant listo');

  // ── Seed: crear Motel 23 + superadmin si no existen ──────────────────────
  const { rows: [{ c }] } = await pool.query('SELECT COUNT(*) AS c FROM motels');
  if (parseInt(c) === 0) {
    const bcrypt = require('bcrypt');
    const hash   = await bcrypt.hash('motel23', 10);

    const { rows: [motel] } = await pool.query(
      `INSERT INTO motels (nombre, direccion) VALUES ('Motel 23', 'Mi dirección') RETURNING id`
    );
    const motelId = motel.id;

    await pool.query(
      `INSERT INTO users (motel_id, email, password_hash, nombre, rol)
       VALUES ($1, 'admin@motel23.com', $2, 'Administrador', 'superadmin')`,
      [motelId, hash]
    );

    // Seed cuentas contables para Motel 23
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
        `INSERT INTO cuentas_contables (motel_id, codigo, nombre, tipo) VALUES ($1, $2, $3, $4)`,
        [motelId, codigo, nombre, tipo]
      );
    }

    // Seed categorías de inventario para Motel 23
    const cats = [
      '🍺 Bebidas Alcohólicas', '🥤 Refrescos', '⚡ Energizantes',
      '🍟 Snacks', '💊 Farmacia / Adultos', '🧴 Higiene',
      '🛏️ Lencería', '🧹 Limpieza', '🔧 Mantenimiento', '📦 Otros'
    ];
    for (const cat of cats) {
      await pool.query(
        `INSERT INTO inv_categorias (motel_id, nombre) VALUES ($1, $2)`,
        [motelId, cat]
      );
    }

    console.log('');
    console.log('🔑 Usuario inicial creado:');
    console.log('   Email:      admin@motel23.com');
    console.log('   Contraseña: motel23');
    console.log('   ⚠️  Cambia la contraseña después del primer login.');
    console.log('');
  }

  console.log('✅ Base de datos inicializada');
}

// ─── RUTAS ────────────────────────────────────────────────────────────────────
const { requireAuth, requireAuthHtml, requireSuperadminHtml } = registerAuthRoutes({ app, db: pool });

registerEstadoRoutes({ app, db: pool, requireAuth });
registerInventarioApiRoutes({ app, db: pool, requireAuth });
registerReportesRoutes({ app, fs, path, puppeteer, baseDir: __dirname, requireAuth });
registerContabilidadRoutes({ app, db: pool, requireAuth });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/almacen',           require('./inventario/routes/dashboard'));
app.use('/almacen/productos', require('./inventario/routes/productos'));
app.use('/almacen/entradas',  require('./inventario/routes/entradas'));
app.use('/almacen/salidas',   require('./inventario/routes/salidas'));
app.use('/almacen/reportes',  require('./inventario/routes/reportes'));

app.get('/superadmin', requireAuthHtml, requireSuperadminHtml, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'superadmin.html'));
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));

// ─── ARRANCAR ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3001;

// Capturar errores no controlados para que sean visibles
process.on('uncaughtException',  err => { console.error('❌ UNCAUGHT:', err); });
process.on('unhandledRejection', err => { console.error('❌ REJECTION:', err); });

initDb()
  .then(() => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('🦋 Motel 23 SaaS corriendo en:');
      console.log(`   http://localhost:${PORT}  (esta PC)`);
      console.log('');
      console.log('   Para acceder desde celular u otra PC,');
      console.log(`   usa la IP de esta computadora + :${PORT}`);
      console.log('');
    });
    server.on('error', err => {
      console.error('❌ Error del servidor HTTP:', err.code, err.message);
      if (err.code === 'EADDRINUSE') {
        console.error(`   El puerto ${PORT} está ocupado por otro proceso.`);
        console.error('   Cerrá todos los procesos Node y volvé a intentar.');
      }
      process.exit(1);
    });
  })
  .catch(err => {
    console.error('❌ Error iniciando base de datos:', err.message);
    process.exit(1);
  });
