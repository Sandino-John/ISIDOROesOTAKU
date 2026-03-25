const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const { desde, hasta, tipo } = req.query;

  const stockActual = db.prepare(`
    SELECT p.*, c.nombre as categoria_nombre,
      (p.stock_actual * p.precio_compra) as valor_total
    FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id
    ORDER BY p.nombre
  `).all();

  const valorTotal = stockActual.reduce((sum, p) => sum + (p.valor_total || 0), 0);
  const stockBajo = stockActual.filter(p => p.stock_actual <= p.stock_minimo);

  let movimientos = [];
  if (desde || hasta) {
    let qE = `SELECT 'entrada' as tipo, e.fecha, e.cantidad, e.precio_unitario, p.nombre as producto, pr.nombre as contraparte, e.notas
      FROM entradas e JOIN productos p ON e.producto_id = p.id LEFT JOIN proveedores pr ON e.proveedor_id = pr.id WHERE 1=1`;
    let qS = `SELECT 'salida' as tipo, s.fecha, s.cantidad, s.precio_unitario, p.nombre as producto, s.cliente as contraparte, s.notas
      FROM salidas s JOIN productos p ON s.producto_id = p.id WHERE 1=1`;
    const params = [];
    if (desde) { qE += ` AND e.fecha >= ?`; qS += ` AND s.fecha >= ?`; params.push(desde); }
    if (hasta) { qE += ` AND e.fecha <= ?`; qS += ` AND s.fecha <= ?`; params.push(hasta); }

    let allParams = [...params, ...params];
    if (tipo === 'entradas') {
      movimientos = db.prepare(qE + ' ORDER BY e.fecha DESC').all(...params);
    } else if (tipo === 'salidas') {
      movimientos = db.prepare(qS + ' ORDER BY s.fecha DESC').all(...params);
    } else {
      movimientos = db.prepare(`${qE} UNION ALL ${qS} ORDER BY fecha DESC`).all(...allParams);
    }
  }

  res.render('almacen/reportes/index', { stockActual, valorTotal, stockBajo, movimientos, desde, hasta, tipo, titulo: 'Reportes', baseUrl: '/almacen' });
});

module.exports = router;
