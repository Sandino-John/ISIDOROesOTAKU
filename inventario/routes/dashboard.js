const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows: [{ c: totalProductos }] } = await db.query('SELECT COUNT(*) as c FROM inv_productos');
    const { rows: [{ v: valorInventario }] } = await db.query(
      'SELECT COALESCE(SUM(stock_actual * precio_compra), 0) as v FROM inv_productos'
    );
    const stockBajo = await db.all(
      'SELECT * FROM inv_productos WHERE stock_actual <= stock_minimo ORDER BY stock_actual ASC'
    );
    const ultimosMovimientos = await db.all(
      `SELECT tipo, fecha, cantidad, producto, created_at FROM (
         SELECT 'entrada' as tipo, e.fecha, e.cantidad, p.nombre as producto, e.created_at
           FROM inv_entradas e JOIN inv_productos p ON e.producto_id = p.id
         UNION ALL
         SELECT 'salida' as tipo, s.fecha, s.cantidad, p.nombre as producto, s.created_at
           FROM inv_salidas s JOIN inv_productos p ON s.producto_id = p.id
       ) t ORDER BY created_at DESC LIMIT 10`
    );
    const { rows: [{ t: totalEntradas }] } = await db.query(
      "SELECT COALESCE(SUM(cantidad), 0) as t FROM inv_entradas WHERE fecha >= DATE_TRUNC('month', CURRENT_DATE)"
    );
    const { rows: [{ t: totalSalidas }] } = await db.query(
      "SELECT COALESCE(SUM(cantidad), 0) as t FROM inv_salidas WHERE fecha >= DATE_TRUNC('month', CURRENT_DATE)"
    );

    res.render('almacen/index', {
      totalProductos: Number(totalProductos),
      valorInventario: Number(valorInventario),
      stockBajo,
      ultimosMovimientos,
      totalEntradas: Number(totalEntradas),
      totalSalidas: Number(totalSalidas),
      titulo: 'Dashboard',
      baseUrl: '/almacen'
    });
  } catch (e) {
    console.error('Error dashboard almacén:', e);
    res.status(500).send('Error interno: ' + e.message);
  }
});

module.exports = router;
