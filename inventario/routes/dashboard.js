const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const totalProductos = db.prepare('SELECT COUNT(*) as c FROM productos').get().c;
  const valorInventario = db.prepare('SELECT COALESCE(SUM(stock_actual * precio_compra), 0) as v FROM productos').get().v;
  const stockBajo = db.prepare('SELECT * FROM productos WHERE stock_actual <= stock_minimo ORDER BY stock_actual ASC').all();

  const ultimosMovimientos = db.prepare(`
    SELECT tipo, fecha, cantidad, producto, created_at FROM (
      SELECT 'entrada' as tipo, e.fecha, e.cantidad, p.nombre as producto, e.created_at
      FROM entradas e JOIN productos p ON e.producto_id = p.id
      UNION ALL
      SELECT 'salida' as tipo, s.fecha, s.cantidad, p.nombre as producto, s.created_at
      FROM salidas s JOIN productos p ON s.producto_id = p.id
    ) ORDER BY created_at DESC LIMIT 10
  `).all();

  const totalEntradas = db.prepare("SELECT COALESCE(SUM(cantidad), 0) as t FROM entradas WHERE fecha >= date('now','start of month')").get().t;
  const totalSalidas = db.prepare("SELECT COALESCE(SUM(cantidad), 0) as t FROM salidas WHERE fecha >= date('now','start of month')").get().t;

  res.render('almacen/index', {
    totalProductos,
    valorInventario,
    stockBajo,
    ultimosMovimientos,
    totalEntradas,
    totalSalidas,
    titulo: 'Dashboard',
    baseUrl: '/almacen'
  });
});

module.exports = router;
