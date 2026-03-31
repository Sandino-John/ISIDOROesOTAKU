module.exports = function registerEstadoRoutes({ app, db, requireAuth }) {
  // ─── OCUPACION ────────────────────────────────────────────────────────────────
  app.get('/api/ocupacion', requireAuth, async (req, res) => {
    try {
      const rows = await db.all('SELECT num, datos FROM ocupacion WHERE motel_id = $1', [req.motel_id]);
      const result = {};
      rows.forEach(r => { result[r.num] = JSON.parse(r.datos); });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/ocupacion', requireAuth, async (req, res) => {
    try {
      const mid = req.motel_id;
      const ocupacion = req.body;
      await db.transaction(async (client) => {
        await client.query('DELETE FROM ocupacion WHERE motel_id = $1', [mid]);
        for (const [num, datos] of Object.entries(ocupacion)) {
          await client.query(
            `INSERT INTO ocupacion (motel_id, num, datos) VALUES ($1, $2, $3)
             ON CONFLICT (motel_id, num) DO UPDATE SET datos = EXCLUDED.datos`,
            [mid, parseInt(num), JSON.stringify(datos)]
          );
        }
      });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── HISTORIAL ────────────────────────────────────────────────────────────────
  app.get('/api/historial', requireAuth, async (req, res) => {
    try {
      const rows = await db.all(
        'SELECT datos FROM historial WHERE motel_id = $1 ORDER BY id DESC LIMIT 200',
        [req.motel_id]
      );
      res.json(rows.map(r => JSON.parse(r.datos)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/historial', requireAuth, async (req, res) => {
    try {
      await db.run(
        'INSERT INTO historial (motel_id, datos) VALUES ($1, $2)',
        [req.motel_id, JSON.stringify(req.body)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/historial', requireAuth, async (req, res) => {
    try {
      const mid     = req.motel_id;
      const entries = req.body;
      await db.transaction(async (client) => {
        await client.query('DELETE FROM historial WHERE motel_id = $1', [mid]);
        for (const e of entries) {
          await client.query(
            'INSERT INTO historial (motel_id, datos) VALUES ($1, $2)',
            [mid, JSON.stringify(e)]
          );
        }
      });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── TURNO ACTUAL ─────────────────────────────────────────────────────────────
  app.get('/api/turno', requireAuth, async (req, res) => {
    try {
      const row = await db.get(
        'SELECT datos FROM turno_actual WHERE motel_id = $1',
        [req.motel_id]
      );
      res.json(row ? JSON.parse(row.datos) : null);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/turno', requireAuth, async (req, res) => {
    try {
      await db.run(
        `INSERT INTO turno_actual (motel_id, datos) VALUES ($1, $2)
         ON CONFLICT (motel_id) DO UPDATE SET datos = EXCLUDED.datos`,
        [req.motel_id, JSON.stringify(req.body)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── TURNOS CERRADOS ──────────────────────────────────────────────────────────
  app.get('/api/turnos', requireAuth, async (req, res) => {
    try {
      const rows = await db.all(
        'SELECT datos FROM turnos WHERE motel_id = $1 ORDER BY id DESC',
        [req.motel_id]
      );
      res.json(rows.map(r => JSON.parse(r.datos)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/turnos', requireAuth, async (req, res) => {
    try {
      await db.run(
        'INSERT INTO turnos (motel_id, datos) VALUES ($1, $2)',
        [req.motel_id, JSON.stringify(req.body)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/turnos', requireAuth, async (req, res) => {
    try {
      const mid     = req.motel_id;
      const entries = req.body;
      await db.transaction(async (client) => {
        await client.query('DELETE FROM turnos WHERE motel_id = $1', [mid]);
        for (const e of entries) {
          await client.query(
            'INSERT INTO turnos (motel_id, datos) VALUES ($1, $2)',
            [mid, JSON.stringify(e)]
          );
        }
      });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── PRODUCTOS (blob PMS) ──────────────────────────────────────────────────────
  app.get('/api/productos', requireAuth, async (req, res) => {
    try {
      const row = await db.get(
        'SELECT datos FROM pms_productos WHERE motel_id = $1',
        [req.motel_id]
      );
      res.json(row ? JSON.parse(row.datos) : null);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/productos', requireAuth, async (req, res) => {
    try {
      await db.run(
        `INSERT INTO pms_productos (motel_id, datos) VALUES ($1, $2)
         ON CONFLICT (motel_id) DO UPDATE SET datos = EXCLUDED.datos`,
        [req.motel_id, JSON.stringify(req.body)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── CONFIG ───────────────────────────────────────────────────────────────────
  app.get('/api/config', requireAuth, async (req, res) => {
    try {
      const row = await db.get(
        "SELECT valor FROM config WHERE motel_id = $1 AND clave = 'main'",
        [req.motel_id]
      );
      res.json(row ? JSON.parse(row.valor) : null);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/config', requireAuth, async (req, res) => {
    try {
      await db.run(
        `INSERT INTO config (motel_id, clave, valor) VALUES ($1, 'main', $2)
         ON CONFLICT (motel_id, clave) DO UPDATE SET valor = EXCLUDED.valor`,
        [req.motel_id, JSON.stringify(req.body)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── CAJA ─────────────────────────────────────────────────────────────────────
  app.get('/api/caja', requireAuth, async (req, res) => {
    try {
      const row = await db.get(
        'SELECT datos FROM caja WHERE motel_id = $1',
        [req.motel_id]
      );
      res.json(row ? JSON.parse(row.datos) : null);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/caja', requireAuth, async (req, res) => {
    try {
      await db.run(
        `INSERT INTO caja (motel_id, datos) VALUES ($1, $2)
         ON CONFLICT (motel_id) DO UPDATE SET datos = EXCLUDED.datos`,
        [req.motel_id, JSON.stringify(req.body)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── DIAS ─────────────────────────────────────────────────────────────────────
  app.get('/api/dias', requireAuth, async (req, res) => {
    try {
      const rows = await db.all(
        'SELECT fecha, datos FROM dias WHERE motel_id = $1 ORDER BY fecha DESC LIMIT 30',
        [req.motel_id]
      );
      const result = {};
      rows.forEach(r => { result[r.fecha] = JSON.parse(r.datos); });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/dias', requireAuth, async (req, res) => {
    try {
      const { fecha, datos } = req.body;
      await db.run(
        `INSERT INTO dias (motel_id, fecha, datos) VALUES ($1, $2, $3)
         ON CONFLICT (motel_id, fecha) DO UPDATE SET datos = EXCLUDED.datos`,
        [req.motel_id, fecha, JSON.stringify(datos)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── LOG DE ACTIVIDAD ─────────────────────────────────────────────────────────
  app.get('/api/activitylog', requireAuth, async (req, res) => {
    try {
      const row = await db.get(
        'SELECT datos FROM log WHERE motel_id = $1',
        [req.motel_id]
      );
      res.json(row ? JSON.parse(row.datos) : []);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/activitylog', requireAuth, async (req, res) => {
    try {
      await db.run(
        `INSERT INTO log (motel_id, datos) VALUES ($1, $2)
         ON CONFLICT (motel_id) DO UPDATE SET datos = EXCLUDED.datos`,
        [req.motel_id, JSON.stringify(req.body)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
