const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuthHtml } = require('../../server/auth');
const { monthRange } = require('../../server/time-utils');

router.use(requireAuthHtml);

router.get('/', async (req, res) => {
  try {
    const mid = req.motel_id;
    const { start: monthStart } = monthRange();

    const { rows: [{ c: totalProductos }] } = await db.query(
      'SELECT COUNT(*) AS c FROM inv_productos WHERE motel_id = $1',
      [mid]
    );
    const { rows: [{ v: valorInventario }] } = await db.query(
      'SELECT COALESCE(SUM(stock_actual * precio_compra), 0) AS v FROM inv_productos WHERE motel_id = $1',
      [mid]
    );
    const stockBajo = await db.all(
      'SELECT * FROM inv_productos WHERE motel_id = $1 AND stock_actual <= stock_minimo ORDER BY stock_actual ASC',
      [mid]
    );
    const ultimosMovimientos = await db.all(
      `SELECT tipo, fecha, cantidad, producto, created_at FROM (
         SELECT 'entrada' AS tipo, e.fecha, e.cantidad, p.nombre AS producto, e.created_at
           FROM inv_entradas e JOIN inv_productos p ON e.producto_id = p.id
           WHERE e.motel_id = $1
         UNION ALL
         SELECT 'salida' AS tipo, s.fecha, s.cantidad, p.nombre AS producto, s.created_at
           FROM inv_salidas s JOIN inv_productos p ON s.producto_id = p.id
           WHERE s.motel_id = $1
       ) t ORDER BY created_at DESC LIMIT 10`,
      [mid]
    );
    const { rows: [{ t: totalEntradas }] } = await db.query(
      `SELECT COALESCE(SUM(cantidad), 0) AS t FROM inv_entradas
       WHERE motel_id = $1 AND fecha >= $2`,
      [mid, monthStart]
    );
    const { rows: [{ t: totalSalidas }] } = await db.query(
      `SELECT COALESCE(SUM(cantidad), 0) AS t FROM inv_salidas
       WHERE motel_id = $1 AND fecha >= $2`,
      [mid, monthStart]
    );

    res.render('almacen/index', {
      totalProductos: Number(totalProductos),
      valorInventario: Number(valorInventario),
      stockBajo,
      ultimosMovimientos,
      totalEntradas: Number(totalEntradas),
      totalSalidas:  Number(totalSalidas),
      titulo:  'Dashboard',
      baseUrl: '/almacen'
    });
  } catch (e) {
    console.error('Error dashboard almacén:', e);
    res.status(500).send('Error interno: ' + e.message);
  }
});

module.exports = router;
