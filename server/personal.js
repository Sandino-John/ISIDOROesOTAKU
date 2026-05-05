const { handleRouteError, readNumber, readString, badRequest } = require('./http-utils');
const { boliviaDateKey } = require('./time-utils');

// Mapeo de tipos a cuentas contables
// Adelanto: sale de Caja Efectivo → Adelantos a Personal
// Pago sueldo: sale de Caja Efectivo → Sueldos y Salarios
// Bonificacion: sale de Caja Efectivo → Gastos Operativos
// Consumo: ya se maneja por minibar (5002 ← 4002)
// Multa / Nota: solo registro, sin impacto contable
const CONTAB_MAP = {
  adelanto:     { debe: '5004', haber: '1001', ref: 'adelanto_personal',  label: 'Adelanto' },
  pago:         { debe: '5005', haber: '1001', ref: 'pago_personal',      label: 'Pago sueldo' },
  bonificacion: { debe: '5001', haber: '1001', ref: 'bonificacion',       label: 'Bonificación' },
};
// Tipos que afectan la caja (generan egreso)
const TIPOS_CON_EGRESO = ['adelanto', 'pago', 'bonificacion'];

module.exports = function registerPersonalRoutes({ app, db, requireAuth }) {

  // ── Listar empleados con saldo ────────────────────────────────────────────
  app.get('/api/personal', requireAuth, async (req, res) => {
    try {
      const rows = await db.all(`
        SELECT e.id, e.nombre, e.cargo, e.telefono, e.activo, e.created_at,
               COALESCE(SUM(m.monto), 0) AS saldo
        FROM empleados e
        LEFT JOIN personal_movimientos m ON m.empleado_id = e.id
        WHERE e.motel_id = $1 AND e.activo = true
        GROUP BY e.id
        ORDER BY e.nombre
      `, [req.motel_id]);
      res.json(rows);
    } catch (e) { handleRouteError(res, e, 'Error listando personal:'); }
  });

  // ── Crear empleado ────────────────────────────────────────────────────────
  app.post('/api/personal', requireAuth, async (req, res) => {
    try {
      const nombre   = readString(req.body?.nombre, 'nombre');
      const cargo    = readString(req.body?.cargo, 'cargo', { optional: true });
      const telefono = readString(req.body?.telefono, 'telefono', { optional: true });

      const row = await db.get(
        `INSERT INTO empleados (motel_id, nombre, cargo, telefono)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [req.motel_id, nombre, cargo, telefono]
      );
      res.json({ ok: true, id: row.id });
    } catch (e) { handleRouteError(res, e, 'Error creando empleado:'); }
  });

  // ── Editar empleado ───────────────────────────────────────────────────────
  app.put('/api/personal/:id', requireAuth, async (req, res) => {
    try {
      const id = readNumber(req.params.id, 'id', { integer: true, min: 1 });
      const nombre   = readString(req.body?.nombre, 'nombre');
      const cargo    = readString(req.body?.cargo, 'cargo', { optional: true });
      const telefono = readString(req.body?.telefono, 'telefono', { optional: true });

      const row = await db.get(
        'SELECT id FROM empleados WHERE id = $1 AND motel_id = $2',
        [id, req.motel_id]
      );
      if (!row) return res.status(404).json({ error: 'Empleado no encontrado' });

      await db.run(
        'UPDATE empleados SET nombre = $1, cargo = $2, telefono = $3 WHERE id = $4',
        [nombre, cargo, telefono, id]
      );
      res.json({ ok: true });
    } catch (e) { handleRouteError(res, e, 'Error editando empleado:'); }
  });

  // ── Desactivar empleado (soft delete) ─────────────────────────────────────
  app.delete('/api/personal/:id', requireAuth, async (req, res) => {
    try {
      const id = readNumber(req.params.id, 'id', { integer: true, min: 1 });
      await db.run(
        'UPDATE empleados SET activo = false WHERE id = $1 AND motel_id = $2',
        [id, req.motel_id]
      );
      res.json({ ok: true });
    } catch (e) { handleRouteError(res, e, 'Error eliminando empleado:'); }
  });

  // ── Listar movimientos de un empleado ─────────────────────────────────────
  app.get('/api/personal/:id/movimientos', requireAuth, async (req, res) => {
    try {
      const id    = readNumber(req.params.id, 'id', { integer: true, min: 1 });
      const desde = readString(req.query?.desde, 'desde', { optional: true });
      const hasta = readString(req.query?.hasta, 'hasta', { optional: true });

      let sql = `SELECT * FROM personal_movimientos
                 WHERE empleado_id = $1 AND motel_id = $2`;
      const params = [id, req.motel_id];

      if (desde) { sql += ` AND fecha >= $${params.length + 1}`; params.push(desde); }
      if (hasta) { sql += ` AND fecha <= $${params.length + 1}`; params.push(hasta); }

      sql += ' ORDER BY created_at DESC, id DESC';

      const rows = await db.all(sql, params);
      res.json(rows);
    } catch (e) { handleRouteError(res, e, 'Error listando movimientos:'); }
  });

  // ── Registrar movimiento (con integración contable + caja) ────────────────
  app.post('/api/personal/:id/movimientos', requireAuth, async (req, res) => {
    try {
      const empleado_id = readNumber(req.params.id, 'id', { integer: true, min: 1 });
      const tipo        = readString(req.body?.tipo, 'tipo');
      const montoRaw    = readNumber(req.body?.monto, 'monto', { min: 0 });
      const concepto    = readString(req.body?.concepto, 'concepto', { optional: true });
      const fecha       = readString(req.body?.fecha, 'fecha', { optional: true }) || boliviaDateKey();

      const TIPOS_VALIDOS = ['consumo', 'adelanto', 'pago', 'multa', 'bonificacion', 'nota'];
      if (!TIPOS_VALIDOS.includes(tipo)) throw badRequest('Tipo de movimiento inválido');
      if (montoRaw <= 0) throw badRequest('Monto debe ser mayor a 0');

      // Verificar empleado
      const emp = await db.get(
        'SELECT id, nombre FROM empleados WHERE id = $1 AND motel_id = $2',
        [empleado_id, req.motel_id]
      );
      if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

      // Convención: pago y bonificacion restan deuda (negativo)
      const TIPOS_ABONO = ['pago', 'bonificacion'];
      const monto = TIPOS_ABONO.includes(tipo) ? -Math.abs(montoRaw) : Math.abs(montoRaw);
      const ts = Date.now();

      let movimientoId = null;
      await db.transaction(async (client) => {
        // 1. Registrar movimiento en cuaderno del empleado
        const movResult = await client.query(
          `INSERT INTO personal_movimientos (motel_id, empleado_id, tipo, monto, concepto, fecha)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [req.motel_id, empleado_id, tipo, monto, concepto || tipo, fecha]
        );
        movimientoId = movResult.rows[0]?.id || null;

        // 2. Crear asiento contable si corresponde
        const contab = CONTAB_MAP[tipo];
        if (contab) {
          const conceptoContab = `${contab.label}: ${emp.nombre}${concepto ? ' — ' + concepto : ''}`;
          await client.query(
            `INSERT INTO asientos_contables (motel_id, fecha, ts, concepto, cuenta_debe, cuenta_haber, monto, referencia, ref_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [req.motel_id, fecha, ts, conceptoContab, contab.debe, contab.haber, montoRaw, contab.ref, movimientoId ? `emp_mov_${movimientoId}` : `emp_${empleado_id}`]
          );
        }
      });

      // Indicar al frontend si debe registrar egreso en caja
      const requiereEgreso = TIPOS_CON_EGRESO.includes(tipo);
      res.json({
        ok: true,
        movimientoId,
        requiereEgreso,
        egreso: requiereEgreso
          ? {
              motivo: `${CONTAB_MAP[tipo].label}: ${emp.nombre}`,
              monto: montoRaw,
              movimientoId,
              source: 'rrhh'
            }
          : null
      });
    } catch (e) { handleRouteError(res, e, 'Error registrando movimiento:'); }
  });

  // ── Eliminar movimiento (corrección) ──────────────────────────────────────
  app.delete('/api/personal/movimientos/:id', requireAuth, async (req, res) => {
    try {
      const id = readNumber(req.params.id, 'id', { integer: true, min: 1 });
      const row = await db.get(
        `SELECT m.id, m.empleado_id, m.tipo, m.monto, m.concepto, m.fecha, e.nombre
         FROM personal_movimientos m
         JOIN empleados e ON e.id = m.empleado_id AND e.motel_id = m.motel_id
         WHERE m.id = $1 AND m.motel_id = $2`,
        [id, req.motel_id]
      );
      if (!row) return res.status(404).json({ error: 'Movimiento no encontrado' });

      await db.transaction(async (client) => {
        await client.query('DELETE FROM personal_movimientos WHERE id = $1 AND motel_id = $2', [id, req.motel_id]);

        const contab = CONTAB_MAP[row.tipo];
        if (contab) {
          const monto = Math.abs(Number(row.monto) || 0);
          const conceptoBase = row.concepto ? ` — ${row.concepto}` : '';
          const conceptoReversion = `Reversión ${contab.label}: ${row.nombre}${conceptoBase}`;
          await client.query(
            `INSERT INTO asientos_contables (motel_id, fecha, ts, concepto, cuenta_debe, cuenta_haber, monto, referencia, ref_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [req.motel_id, row.fecha, Date.now(), conceptoReversion, contab.haber, contab.debe, monto, `${contab.ref}_reversion`, `rev_emp_mov_${id}`]
          );
        }
      });

      const requiereCaja = TIPOS_CON_EGRESO.includes(row.tipo);
      res.json({
        ok: true,
        cajaReversion: requiereCaja
          ? {
              movimientoId: id,
              motivo: `${CONTAB_MAP[row.tipo].label}: ${row.nombre}`,
              monto: Math.abs(Number(row.monto) || 0),
              source: 'rrhh'
            }
          : null
      });
    } catch (e) { handleRouteError(res, e, 'Error eliminando movimiento:'); }
  });

  // ── Resumen mensual por empleado ──────────────────────────────────────────
  app.get('/api/personal/:id/resumen', requireAuth, async (req, res) => {
    try {
      const id    = readNumber(req.params.id, 'id', { integer: true, min: 1 });
      const desde = readString(req.query?.desde, 'desde', { optional: true });
      const hasta = readString(req.query?.hasta, 'hasta', { optional: true });

      let where = 'empleado_id = $1 AND motel_id = $2';
      const params = [id, req.motel_id];
      if (desde) { where += ` AND fecha >= $${params.length + 1}`; params.push(desde); }
      if (hasta) { where += ` AND fecha <= $${params.length + 1}`; params.push(hasta); }

      const rows = await db.all(
        `SELECT tipo, COUNT(*) as cantidad, SUM(ABS(monto)) as total
         FROM personal_movimientos WHERE ${where}
         GROUP BY tipo`,
        params
      );

      const resumen = {};
      rows.forEach(r => { resumen[r.tipo] = { cantidad: parseInt(r.cantidad), total: parseFloat(r.total) }; });
      res.json(resumen);
    } catch (e) { handleRouteError(res, e, 'Error obteniendo resumen:'); }
  });

};
