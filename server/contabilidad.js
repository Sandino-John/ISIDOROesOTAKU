const { handleRouteError, readArray } = require('./http-utils');

module.exports = function registerContabilidadRoutes({ app, db, requireAuth }) {
  function operativeDateKey() {
    const now    = new Date();
    const offset = -4;
    const utc    = now.getTime() + now.getTimezoneOffset() * 60000;
    const local  = new Date(utc + offset * 3600000);
    if (local.getHours() < 6) local.setDate(local.getDate() - 1);
    return local.toISOString().slice(0, 10);
  }

  app.get('/api/contabilidad/cuentas', requireAuth, async (req, res) => {
    try {
      const rows = await db.all(
        'SELECT * FROM cuentas_contables WHERE motel_id = $1 ORDER BY codigo',
        [req.motel_id]
      );
      res.json(rows);
    } catch (e) { handleRouteError(res, e, 'Error obteniendo cuentas:'); }
  });

  app.post('/api/contabilidad/asiento', requireAuth, async (req, res) => {
    try {
      const asientos = readArray(req.body?.asientos, 'Asientos', { minLength: 1 });
      const fecha = operativeDateKey();
      const ts    = Date.now();
      const mid   = req.motel_id;

      await db.transaction(async (client) => {
        for (const a of asientos) {
          if (!a.concepto || !a.cuenta_debe || !a.cuenta_haber || !a.monto) continue;
          await client.query(
            `INSERT INTO asientos_contables
               (motel_id, fecha, ts, concepto, cuenta_debe, cuenta_haber, monto, referencia, ref_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [mid, fecha, ts, a.concepto, a.cuenta_debe, a.cuenta_haber, a.monto,
             a.referencia || null, a.ref_id || null]
          );
        }
      });

      res.json({ ok: true, fecha, count: asientos.length });
    } catch (e) { handleRouteError(res, e, 'Error registrando asientos:'); }
  });

  app.get('/api/contabilidad/diario', requireAuth, async (req, res) => {
    try {
      const mid   = req.motel_id;
      const desde = req.query.desde || operativeDateKey();
      const hasta = req.query.hasta || desde;
      const rows  = await db.all(
        `SELECT a.*, cd.nombre AS nombre_debe, ch.nombre AS nombre_haber
         FROM asientos_contables a
         LEFT JOIN cuentas_contables cd ON cd.motel_id = a.motel_id AND cd.codigo = a.cuenta_debe
         LEFT JOIN cuentas_contables ch ON ch.motel_id = a.motel_id AND ch.codigo = a.cuenta_haber
         WHERE a.motel_id = $1 AND a.fecha BETWEEN $2 AND $3
         ORDER BY a.ts ASC`,
        [mid, desde, hasta]
      );
      res.json(rows);
    } catch (e) { handleRouteError(res, e, 'Error obteniendo diario:'); }
  });

  app.get('/api/contabilidad/mayor', requireAuth, async (req, res) => {
    try {
      const mid   = req.motel_id;
      const desde = req.query.desde || operativeDateKey();
      const hasta = req.query.hasta || desde;

      const movRows = await db.all(
        `SELECT cuenta, tipo_mov, SUM(monto) AS total FROM (
           SELECT cuenta_debe  AS cuenta, 'debe'  AS tipo_mov, monto
             FROM asientos_contables WHERE motel_id = $1 AND fecha BETWEEN $2 AND $3
           UNION ALL
           SELECT cuenta_haber AS cuenta, 'haber' AS tipo_mov, monto
             FROM asientos_contables WHERE motel_id = $1 AND fecha BETWEEN $2 AND $3
         ) t GROUP BY cuenta, tipo_mov`,
        [mid, desde, hasta]
      );

      const cuentas = await db.all(
        'SELECT * FROM cuentas_contables WHERE motel_id = $1 ORDER BY codigo',
        [mid]
      );
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

  app.get('/api/contabilidad/resultados', requireAuth, async (req, res) => {
    try {
      const mid   = req.motel_id;
      const desde = req.query.desde || operativeDateKey();
      const hasta = req.query.hasta || desde;

      const ingresos = await db.all(
        `SELECT c.codigo, c.nombre,
           COALESCE((SELECT SUM(monto) FROM asientos_contables
                     WHERE motel_id = $1 AND cuenta_haber = c.codigo AND fecha BETWEEN $2 AND $3), 0)
           - COALESCE((SELECT SUM(monto) FROM asientos_contables
                       WHERE motel_id = $1 AND cuenta_debe  = c.codigo AND fecha BETWEEN $2 AND $3), 0)
           AS saldo
         FROM cuentas_contables c WHERE c.motel_id = $1 AND c.tipo = 'ingreso'`,
        [mid, desde, hasta]
      );

      const gastos = await db.all(
        `SELECT c.codigo, c.nombre,
           COALESCE((SELECT SUM(monto) FROM asientos_contables
                     WHERE motel_id = $1 AND cuenta_debe  = c.codigo AND fecha BETWEEN $2 AND $3), 0)
           - COALESCE((SELECT SUM(monto) FROM asientos_contables
                       WHERE motel_id = $1 AND cuenta_haber = c.codigo AND fecha BETWEEN $2 AND $3), 0)
           AS saldo
         FROM cuentas_contables c WHERE c.motel_id = $1 AND c.tipo = 'gasto'`,
        [mid, desde, hasta]
      );

      const totalIngresos = ingresos.reduce((s, r) => s + Number(r.saldo), 0);
      const totalGastos   = gastos.reduce((s, r) => s + Number(r.saldo), 0);

      res.json({ ingresos, gastos, totalIngresos, totalGastos, utilidad: totalIngresos - totalGastos });
    } catch (e) { handleRouteError(res, e, 'Error obteniendo resultados:'); }
  });
};
