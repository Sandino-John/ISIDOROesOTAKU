require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');

const SALT_ROUNDS = 10;
const JWT_EXPIRY  = '24h';

function getSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-in-prod';
}

// ─── MIDDLEWARES ──────────────────────────────────────────────────────────────

/** Para rutas API (JSON). Devuelve 401 JSON si no hay sesión. */
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const payload = jwt.verify(token, getSecret());
    req.motel_id = payload.motel_id;
    req.user_id  = payload.user_id;
    req.rol      = payload.rol;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

/** Para rutas HTML (vistas EJS). Redirige a / si no hay sesión. */
function requireAuthHtml(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/');
  try {
    const payload = jwt.verify(token, getSecret());
    req.motel_id = payload.motel_id;
    req.user_id  = payload.user_id;
    req.rol      = payload.rol;
    next();
  } catch {
    return res.redirect('/');
  }
}

/** Solo superadmin — para rutas API (JSON) */
function requireSuperadmin(req, res, next) {
  if (req.rol !== 'superadmin') return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

/** Solo superadmin — para rutas HTML (redirige a /) */
function requireSuperadminHtml(req, res, next) {
  if (req.rol !== 'superadmin') return res.redirect('/');
  next();
}

// ─── RUTAS ────────────────────────────────────────────────────────────────────

function registerAuthRoutes({ app, db }) {

  // POST /api/login
  app.post('/api/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password)
        return res.status(400).json({ error: 'Email y contraseña requeridos' });

      const user = await db.get(
        `SELECT u.*, m.nombre AS motel_nombre
         FROM users u
         LEFT JOIN motels m ON m.id = u.motel_id
         WHERE u.email = $1 AND u.activo = true`,
        [email.toLowerCase().trim()]
      );
      if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

      const token = jwt.sign(
        { user_id: user.id, motel_id: user.motel_id, rol: user.rol, nombre: user.nombre },
        getSecret(),
        { expiresIn: JWT_EXPIRY }
      );

      res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      });

      res.json({ ok: true, nombre: user.nombre, rol: user.rol, motel: user.motel_nombre });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/logout
  app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ ok: true });
  });

  // GET /api/me — verifica sesión y devuelve datos del usuario
  app.get('/api/me', requireAuth, async (req, res) => {
    try {
      const user = await db.get(
        `SELECT u.id, u.nombre, u.email, u.rol, m.nombre AS motel_nombre
         FROM users u
         LEFT JOIN motels m ON m.id = u.motel_id
         WHERE u.id = $1`,
        [req.user_id]
      );
      res.json(user || { id: req.user_id, rol: req.rol, motel_nombre: null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── SUPERADMIN: panel de moteles ─────────────────────────────────────────
  app.get('/api/superadmin/moteles', requireAuth, requireSuperadmin, async (req, res) => {
    try {
      const motels = await db.all(`
        SELECT m.*,
          (SELECT COUNT(*) FROM users WHERE motel_id = m.id AND activo = true) AS usuarios,
          ROUND(CAST(
            (SELECT COALESCE(SUM(monto), 0)
             FROM asientos_contables
             WHERE motel_id = m.id
               AND cuenta_haber IN ('4001','4002','4003')
               AND fecha >= TO_CHAR(DATE_TRUNC('month', CURRENT_DATE), 'YYYY-MM-DD'))
          AS NUMERIC), 2) AS ingresos_mes
        FROM motels m ORDER BY m.id`
      );
      res.json(motels);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/superadmin/motel — crear nuevo motel + usuario admin
  app.post('/api/superadmin/motel', requireAuth, requireSuperadmin, async (req, res) => {
    try {
      const { nombre, direccion, email_admin, password_admin, nombre_admin } = req.body || {};
      if (!nombre || !email_admin || !password_admin || !nombre_admin)
        return res.status(400).json({ error: 'Faltan campos requeridos' });

      const existingEmail = await db.get('SELECT id FROM users WHERE email = $1', [email_admin.toLowerCase().trim()]);
      if (existingEmail) return res.status(400).json({ error: 'Ese email ya está en uso' });

      const hash = await bcrypt.hash(password_admin, SALT_ROUNDS);

      let motelId;
      await db.transaction(async (client) => {
        const { rows: [motel] } = await client.query(
          `INSERT INTO motels (nombre, direccion) VALUES ($1, $2) RETURNING id`,
          [nombre, direccion || null]
        );
        motelId = motel.id;

        await client.query(
          `INSERT INTO users (motel_id, email, password_hash, nombre, rol) VALUES ($1, $2, $3, $4, 'admin')`,
          [motelId, email_admin.toLowerCase().trim(), hash, nombre_admin]
        );

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
        for (const [codigo, nom, tipo] of cuentas) {
          await client.query(
            `INSERT INTO cuentas_contables (motel_id, codigo, nombre, tipo)
             VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [motelId, codigo, nom, tipo]
          );
        }

        // Seed categorías de inventario
        const cats = [
          '🍺 Bebidas Alcohólicas', '🥤 Refrescos', '⚡ Energizantes',
          '🍟 Snacks', '💊 Farmacia / Adultos', '🧴 Higiene',
          '🛏️ Lencería', '🧹 Limpieza', '🔧 Mantenimiento', '📦 Otros'
        ];
        for (const cat of cats) {
          await client.query(
            `INSERT INTO inv_categorias (motel_id, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [motelId, cat]
          );
        }
      });

      res.json({ ok: true, motel_id: motelId });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/superadmin/recepcionista — crear recepcionista en un motel existente
  app.post('/api/superadmin/recepcionista', requireAuth, requireSuperadmin, async (req, res) => {
    try {
      const { motel_id, email, password, nombre } = req.body || {};
      if (!motel_id || !email || !password || !nombre)
        return res.status(400).json({ error: 'Faltan campos requeridos' });

      const existing = await db.get('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
      if (existing) return res.status(400).json({ error: 'Ese email ya está en uso' });

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await db.run(
        `INSERT INTO users (motel_id, email, password_hash, nombre, rol) VALUES ($1, $2, $3, $4, 'recepcionista')`,
        [motel_id, email.toLowerCase().trim(), hash, nombre]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── COBROS: estado de pagos por mes ─────────────────────────────────────
  app.get('/api/superadmin/cobros', requireAuth, requireSuperadmin, async (req, res) => {
    try {
      const mes = req.query.mes || new Date().toISOString().slice(0, 7);
      // Calcular ingresos del mes para cada motel
      const motels = await db.all('SELECT id FROM motels WHERE activo = true');
      const resultado = [];

      for (const m of motels) {
        const { rows: [{ total: ingresos }] } = await db.query(
          `SELECT COALESCE(SUM(monto), 0) AS total
           FROM asientos_contables
           WHERE motel_id = $1
             AND cuenta_haber IN ('4001','4002','4003')
             AND fecha >= $2 AND fecha < $3`,
          [m.id, mes + '-01', nextMonth(mes) + '-01']
        );
        const ing      = Number(ingresos);
        const comision = Math.max(5, ing * 0.005);

        // Buscar o crear registro de cobro
        const cobro = await db.get(
          'SELECT * FROM cobros WHERE motel_id = $1 AND mes = $2',
          [m.id, mes]
        );
        if (!cobro) {
          await db.run(
            `INSERT INTO cobros (motel_id, mes, ingresos, comision) VALUES ($1, $2, $3, $4)
             ON CONFLICT (motel_id, mes) DO UPDATE SET ingresos = $3, comision = $4`,
            [m.id, mes, ing, comision]
          );
        } else {
          // Actualizar ingresos/comisión con datos frescos
          await db.run(
            'UPDATE cobros SET ingresos = $1, comision = $2 WHERE motel_id = $3 AND mes = $4',
            [ing, comision, m.id, mes]
          );
        }
        resultado.push({ motel_id: m.id, mes, ingresos: ing, comision, pagado: cobro?.pagado || false, fecha_pago: cobro?.fecha_pago || null });
      }
      res.json(resultado);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/superadmin/cobros/marcar', requireAuth, requireSuperadmin, async (req, res) => {
    try {
      const { motel_id, mes, pagado, notas } = req.body || {};
      if (!motel_id || !mes) return res.status(400).json({ error: 'Faltan datos' });
      const fecha_pago = pagado ? new Date().toISOString().slice(0, 10) : null;
      await db.run(
        `INSERT INTO cobros (motel_id, mes, pagado, fecha_pago, notas)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (motel_id, mes) DO UPDATE
           SET pagado = $3, fecha_pago = $4, notas = $5`,
        [motel_id, mes, !!pagado, fecha_pago, notas || null]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/superadmin/motel/toggle', requireAuth, requireSuperadmin, async (req, res) => {
    try {
      const { motel_id, activo } = req.body || {};
      await db.run('UPDATE motels SET activo = $1 WHERE id = $2', [!!activo, motel_id]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return { requireAuth, requireAuthHtml, requireSuperadmin, requireSuperadminHtml };
}

function nextMonth(mes) {
  const [y, m] = mes.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

module.exports = { requireAuth, requireAuthHtml, requireSuperadmin, registerAuthRoutes };
