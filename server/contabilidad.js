const { handleRouteError, readArray } = require('./http-utils');

module.exports = function registerContabilidadRoutes({ app, db }) {
  function operativeDateKey() {
    const now = new Date();
    const offset = -4;
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const local = new Date(utc + offset * 3600000);
    if (local.getHours() < 6) local.setDate(local.getDate() - 1);
    return local.toISOString().slice(0, 10);
  }

  app.get('/api/contabilidad/cuentas', async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM cuentas_contables ORDER BY codigo');
      res.json(rows);
    } catch (e) { handleRouteError(res, e, 'Error obteniendo cuentas:'); }
  });

  app.post('/api/contabilidad/asiento', async (req, res) => {
    try {
      const asientos = readArray(req.body?.asientos, 'Asientos', { minLength: 1 });
      const fecha = operativeDateKey();
      const ts = Date.now();

      await db.transaction(async (client) => {
        for (const a of asientos) {
          if (!a.concepto || !a.cuenta_debe || !a.cuenta_haber || !a.monto) continue;
          await client.query(
            `INSERT INTO asientos_contables (fecha, ts, concepto, cuenta_debe, cuenta_haber, monto, referencia, ref_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [fecha, ts, a.concepto, a.cuenta_debe, a.cuenta_haber, a.monto, a.referencia || null, a.ref_id || null]
          );
        }
      });

      res.json({ ok: true, fecha, count: asientos.length });
    } catch (e) { handleRouteError(res, e, 'Error registrando asientos:'); }
  });

  app.get('/api/contabilidad/diario', async (req, res) => {
    try {
      const desde = req.query.desde || operativeDateKey();
      const hasta = req.query.hasta || desde;
      const rows = await db.all(
        `SELECT a.*, cd.nombre as nombre_debe, ch.nombre as nombre_haber
         FROM asientos_contables a
         LEFT JOIN cuentas_contables cd ON cd.codigo = a.cuenta_debe
         LEFT JOIN cuentas_contables ch ON ch.codigo = a.cuenta_haber
         WHERE a.fecha BETWEEN $1 AND $2
         ORDER BY a.ts ASC`,
        [desde, hasta]
      );
      res.json(rows);
    } catch (e) { handleRouteError(res, e, 'Error obteniendo diario:'); }
  });

  app.get('/api/contabilidad/mayor', async (req, res) => {
    try {
      const desde = req.query.desde || operativeDateKey();
      const hasta = req.query.hasta || desde;

      // $1 y $2 se reusan en ambas mitades del UNION
      const movRows = await db.all(
        `SELECT cuenta, tipo_mov, SUM(monto) as total FROM (
           SELECT cuenta_debe as cuenta, 'debe' as tipo_mov, monto
             FROM asientos_contables WHERE fecha BETWEEN $1 AND $2
           UNION ALL
           SELECT cuenta_haber as cuenta, 'haber' as tipo_mov, monto
             FROM asientos_contables WHERE fecha BETWEEN $1 AND $2
         ) t GROUP BY cuenta, tipo_mov`,
        [desde, hasta]
      );

      const cuentas = await db.all('SELECT * FROM cuentas_contables ORDER BY codigo');
      const result = cuentas.map(c => {
        const debe  = movRows.find(r => r.cuenta === c.codigo && r.tipo_mov === 'debe');
        const haber = movRows.find(r => r.cuenta === c.codigo && r.tipo_mov === 'haber');
        const totalDebe  = debe  ? Number(debe.total)  : 0;
        const totalHaber = haber ? Number(haber.total) : 0;
        const saldo = (c.tipo === 'activo' || c.tipo === 'gasto')
          ? totalDebe - totalHaber
          : totalHaber - totalDebe;
        return { ...c, debe: totalDebe, haber: totalHaber, saldo };
      }).filter(c => c.debe > 0 || c.haber > 0);

      res.json(result);
    } catch (e) { handleRouteError(res, e, 'Error obteniendo mayor:'); }
  });

  app.get('/api/contabilidad/resultados', async (req, res) => {
    try {
      const desde = req.query.desde || operativeDateKey();
      const hasta = req.query.hasta || desde;

      const ingresos = await db.all(
        `SELECT c.codigo, c.nombre,
           COALESCE((SELECT SUM(monto) FROM asientos_contables WHERE cuenta_haber = c.codigo AND fecha BETWEEN $1 AND $2), 0)
           - COALESCE((SELECT SUM(monto) FROM asientos_contables WHERE cuenta_debe  = c.codigo AND fecha BETWEEN $1 AND $2), 0)
           AS saldo
         FROM cuentas_contables c WHERE c.tipo = 'ingreso'`,
        [desde, hasta]
      );

      const gastos = await db.all(
        `SELECT c.codigo, c.nombre,
           COALESCE((SELECT SUM(monto) FROM asientos_contables WHERE cuenta_debe  = c.codigo AND fecha BETWEEN $1 AND $2), 0)
           - COALESCE((SELECT SUM(monto) FROM asientos_contables WHERE cuenta_haber = c.codigo AND fecha BETWEEN $1 AND $2), 0)
           AS saldo
         FROM cuentas_contables c WHERE c.tipo = 'gasto'`,
        [desde, hasta]
      );

      const totalIngresos = ingresos.reduce((s, r) => s + Number(r.saldo), 0);
      const totalGastos   = gastos.reduce((s, r) => s + Number(r.saldo), 0);

      res.json({ ingresos, gastos, totalIngresos, totalGastos, utilidad: totalIngresos - totalGastos });
    } catch (e) { handleRouteError(res, e, 'Error obteniendo resultados:'); }
  });
};
