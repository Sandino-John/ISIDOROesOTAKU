const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const { desde, hasta } = req.query;
  let query = `SELECT e.*, p.nombre as producto
    FROM entradas e
    JOIN productos p ON e.producto_id = p.id
    WHERE 1=1`;
  const params = [];
  if (desde) { query += ` AND e.fecha >= ?`; params.push(desde); }
  if (hasta) { query += ` AND e.fecha <= ?`; params.push(hasta); }
  query += ` ORDER BY e.created_at DESC`;

  const entradas = db.prepare(query).all(...params);
  const productos = db.prepare('SELECT * FROM productos ORDER BY nombre').all();
  res.render('almacen/entradas/index', { entradas, productos, desde, hasta, titulo: 'Entradas', baseUrl: '/almacen' });
});

router.post('/', (req, res) => {
  const { producto_id, cantidad, precio_unitario, fecha, notas } = req.body;
  const cant = parseInt(cantidad);
  if (!producto_id || !cant || cant <= 0) return res.redirect('/almacen/entradas?error=datos');

  const entrada = db.transaction(() => {
    db.prepare(`INSERT INTO entradas (producto_id, cantidad, precio_unitario, fecha, notas)
      VALUES (?, ?, ?, ?, ?)`).run(producto_id, cant,
      parseFloat(precio_unitario) || 0, fecha || new Date().toISOString().split('T')[0], notas || null);
    db.prepare('UPDATE productos SET stock_almacen = stock_almacen + ?, stock_actual = stock_almacen + ? + stock_nevera + COALESCE(stock_vitrina, 0) WHERE id = ?').run(cant, cant, producto_id);
  });
  entrada();
  res.redirect('/almacen/entradas');
});

module.exports = router;
