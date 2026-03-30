const { handleRouteError, readArray } = require('./http-utils');

module.exports = function registerContabilidadRoutes({ app, db }) {
  // ─── CONTABILIDAD (libros contables) ─────────────────────────────────────────

  function operativeDateKey() {
    const now = new Date();
    const offset = -4;
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const local = new Date(utc + offset * 3600000);
    if (local.getHours() < 6) local.setDate(local.getDate() - 1);
    return local.toISOString().slice(0, 10);
  }

  app.get('/api/contabilidad/cuentas', (req, res) => {
    res.json(db.prepare('SELECT * FROM cuentas_contables ORDER BY codigo').all());
  });

  app.post('/api/contabilidad/asiento', (req, res) => {
    try {
      const asientos = readArray(req.body?.asientos, 'Asientos', { minLength: 1 });
      const fecha = operativeDateKey();
      const ts = Date.now();
      const insert = db.prepare(`
        INSERT INTO asientos_contables (fecha, ts, concepto, cuenta_debe, cuenta_haber, monto, referencia, ref_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((items) => {
        for (const a of items) {
          if (!a.concepto || !a.cuenta_debe || !a.cuenta_haber || !a.monto) continue;
          insert.run(fecha, ts, a.concepto, a.cuenta_debe, a.cuenta_haber, a.monto, a.referencia || null, a.ref_id || null);
        }
      });

      insertMany(asientos);
      res.json({ ok: true, fecha, count: asientos.length });
    } catch (e) {
      handleRouteError(res, e, 'Error registrando asientos:');
    }
  });

  app.get('/api/contabilidad/diario', (req, res) => {
    const desde = req.query.desde || operativeDateKey();
    const hasta = req.query.hasta || desde;
    const rows = db.prepare(`
      SELECT a.*, cd.nombre as nombre_debe, ch.nombre as nombre_haber
      FROM asientos_contables a
      LEFT JOIN cuentas_contables cd ON cd.codigo = a.cuenta_debe
      LEFT JOIN cuentas_contables ch ON ch.codigo = a.cuenta_haber
      WHERE a.fecha BETWEEN ? AND ?
      ORDER BY a.ts ASC
    `).all(desde, hasta);
    res.json(rows);
  });

  app.get('/api/contabilidad/mayor', (req, res) => {
    const desde = req.query.desde || operativeDateKey();
    const hasta = req.query.hasta || desde;
    const rows = db.prepare(`
      SELECT cuenta, tipo_mov, SUM(monto) as total FROM (
        SELECT cuenta_debe as cuenta, 'debe' as tipo_mov, monto FROM asientos_contables WHERE fecha BETWEEN ? AND ?
        UNION ALL
        SELECT cuenta_haber as cuenta, 'haber' as tipo_mov, monto FROM asientos_contables WHERE fecha BETWEEN ? AND ?
      ) GROUP BY cuenta, tipo_mov
    `).all(desde, hasta, desde, hasta);

    const cuentas = db.prepare('SELECT * FROM cuentas_contables ORDER BY codigo').all();
    const result = cuentas.map(c => {
      const debe = rows.find(r => r.cuenta === c.codigo && r.tipo_mov === 'debe');
      const haber = rows.find(r => r.cuenta === c.codigo && r.tipo_mov === 'haber');
      const totalDebe = debe ? debe.total : 0;
      const totalHaber = haber ? haber.total : 0;
      const saldo = (c.tipo === 'activo' || c.tipo === 'gasto')
        ? totalDebe - totalHaber
        : totalHaber - totalDebe;
      return { ...c, debe: totalDebe, haber: totalHaber, saldo };
    }).filter(c => c.debe > 0 || c.haber > 0);

    res.json(result);
  });

  app.get('/api/contabilidad/resultados', (req, res) => {
    const desde = req.query.desde || operativeDateKey();
    const hasta = req.query.hasta || desde;

    const ingresos = db.prepare(`
      SELECT c.codigo, c.nombre,
        COALESCE((SELECT SUM(monto) FROM asientos_contables WHERE cuenta_haber = c.codigo AND fecha BETWEEN ? AND ?), 0)
        - COALESCE((SELECT SUM(monto) FROM asientos_contables WHERE cuenta_debe = c.codigo AND fecha BETWEEN ? AND ?), 0)
        as saldo
      FROM cuentas_contables c WHERE c.tipo = 'ingreso'
    `).all(desde, hasta, desde, hasta);

    const gastos = db.prepare(`
      SELECT c.codigo, c.nombre,
        COALESCE((SELECT SUM(monto) FROM asientos_contables WHERE cuenta_debe = c.codigo AND fecha BETWEEN ? AND ?), 0)
        - COALESCE((SELECT SUM(monto) FROM asientos_contables WHERE cuenta_haber = c.codigo AND fecha BETWEEN ? AND ?), 0)
        as saldo
      FROM cuentas_contables c WHERE c.tipo = 'gasto'
    `).all(desde, hasta, desde, hasta);

    const totalIngresos = ingresos.reduce((s, r) => s + r.saldo, 0);
    const totalGastos = gastos.reduce((s, r) => s + r.saldo, 0);

    res.json({
      ingresos, gastos,
      totalIngresos, totalGastos,
      utilidad: totalIngresos - totalGastos
    });
  });
};
