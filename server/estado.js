module.exports = function registerEstadoRoutes({ app, db }) {
  // ─── OCUPACION ────────────────────────────────────────────────────────────────
  app.get('/api/ocupacion', async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM ocupacion');
      const result = {};
      rows.forEach(r => { result[r.num] = JSON.parse(r.datos); });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/ocupacion', async (req, res) => {
    try {
      const ocupacion = req.body;
      await db.transaction(async (client) => {
        await client.query('DELETE FROM ocupacion');
        for (const [num, datos] of Object.entries(ocupacion)) {
          await client.query(
            'INSERT INTO ocupacion (num, datos) VALUES ($1, $2) ON CONFLICT (num) DO UPDATE SET datos = EXCLUDED.datos',
            [parseInt(num), JSON.stringify(datos)]
          );
        }
      });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── HISTORIAL ────────────────────────────────────────────────────────────────
  app.get('/api/historial', async (req, res) => {
    try {
      const rows = await db.all('SELECT datos FROM historial ORDER BY id DESC LIMIT 200');
      res.json(rows.map(r => JSON.parse(r.datos)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/historial', async (req, res) => {
    try {
      await db.run('INSERT INTO historial (datos) VALUES ($1)', [JSON.stringify(req.body)]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/historial', async (req, res) => {
    try {
      const entries = req.body;
      await db.transaction(async (client) => {
        await client.query('DELETE FROM historial');
        for (const e of entries) {
          await client.query('INSERT INTO historial (datos) VALUES ($1)', [JSON.stringify(e)]);
        }
      });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── TURNO ACTUAL ─────────────────────────────────────────────────────────────
  app.get('/api/turno', async (req, res) => {
    try {
      const row = await db.get('SELECT datos FROM turno_actual WHERE id = 1');
      res.json(row ? JSON.parse(row.datos) : null);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/turno', async (req, res) => {
    try {
      await db.run(
        'INSERT INTO turno_actual (id, datos) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos',
        [JSON.stringify(req.body)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── TURNOS CERRADOS ──────────────────────────────────────────────────────────
  app.get('/api/turnos', async (req, res) => {
    try {
      const rows = await db.all('SELECT datos FROM turnos ORDER BY id DESC');
      res.json(rows.map(r => JSON.parse(r.datos)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/turnos', async (req, res) => {
    try {
      await db.run('INSERT INTO turnos (datos) VALUES ($1)', [JSON.stringify(req.body)]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/turnos', async (req, res) => {
    try {
      const entries = req.body;
      await db.transaction(async (client) => {
        await client.query('DELETE FROM turnos');
        for (const e of entries) {
          await client.query('INSERT INTO turnos (datos) VALUES ($1)', [JSON.stringify(e)]);
        }
      });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── PRODUCTOS (blob PMS) ──────────────────────────────────────────────────────
  app.get('/api/productos', async (req, res) => {
    try {
      const row = await db.get('SELECT datos FROM pms_productos WHERE id = 1');
      res.json(row ? JSON.parse(row.datos) : null);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/productos', async (req, res) => {
    try {
      await db.run(
        'INSERT INTO pms_productos (id, datos) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos',
        [JSON.stringify(req.body)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── CONFIG ───────────────────────────────────────────────────────────────────
  app.get('/api/config', async (req, res) => {
    try {
      const row = await db.get("SELECT valor FROM config WHERE clave = 'main'");
      res.json(row ? JSON.parse(row.valor) : null);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/config', async (req, res) => {
    try {
      await db.run(
        "INSERT INTO config (clave, valor) VALUES ('main', $1) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor",
        [JSON.stringify(req.body)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── CAJA ─────────────────────────────────────────────────────────────────────
  app.get('/api/caja', async (req, res) => {
    try {
      const row = await db.get('SELECT datos FROM caja WHERE id = 1');
      res.json(row ? JSON.parse(row.datos) : null);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/caja', async (req, res) => {
    try {
      await db.run(
        'INSERT INTO caja (id, datos) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos',
        [JSON.stringify(req.body)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── DIAS ─────────────────────────────────────────────────────────────────────
  app.get('/api/dias', async (req, res) => {
    try {
      const rows = await db.all('SELECT fecha, datos FROM dias ORDER BY fecha DESC LIMIT 30');
      const result = {};
      rows.forEach(r => { result[r.fecha] = JSON.parse(r.datos); });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/dias', async (req, res) => {
    try {
      const { fecha, datos } = req.body;
      await db.run(
        'INSERT INTO dias (fecha, datos) VALUES ($1, $2) ON CONFLICT (fecha) DO UPDATE SET datos = EXCLUDED.datos',
        [fecha, JSON.stringify(datos)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── LOG DE ACTIVIDAD ─────────────────────────────────────────────────────────
  app.get('/api/activitylog', async (req, res) => {
    try {
      const row = await db.get('SELECT datos FROM log WHERE id = 1');
      res.json(row ? JSON.parse(row.datos) : []);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/activitylog', async (req, res) => {
    try {
      await db.run(
        'INSERT INTO log (id, datos) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos',
        [JSON.stringify(req.body)]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
