const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const { buscar, categoria } = req.query;
  let query = `SELECT p.*, c.nombre as categoria_nombre,
    (SELECT cantidad FROM entradas WHERE producto_id = p.id ORDER BY id DESC LIMIT 1) as ultima_entrada
    FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE 1=1`;
  const params = [];
  if (buscar) { query += ` AND p.nombre LIKE ?`; params.push(`%${buscar}%`); }
  if (categoria) { query += ` AND p.categoria_id = ?`; params.push(categoria); }
  query += ` ORDER BY p.nombre`;

  const productos = db.prepare(query).all(...params);
  const categorias = db.prepare('SELECT * FROM categorias ORDER BY nombre').all();
  res.render('almacen/productos/index', { productos, categorias, buscar, categoria, titulo: 'Productos', baseUrl: '/almacen' });
});

router.get('/nuevo', (req, res) => {
  const categorias = db.prepare('SELECT * FROM categorias ORDER BY nombre').all();
  res.render('almacen/productos/form', { producto: null, categorias, titulo: 'Nuevo Producto', baseUrl: '/almacen' });
});

router.post('/nuevo', (req, res) => {
  const { nombre, categoria_id, precio_compra, precio_venta, stock_actual, stock_almacen, stock_nevera, stock_vitrina, stock_minimo } = req.body;
  db.prepare(`INSERT INTO productos (nombre, categoria_id, precio_compra, precio_venta, stock_actual, stock_almacen, stock_nevera, stock_vitrina, stock_minimo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(nombre, categoria_id || null,
    parseFloat(precio_compra) || 0, parseFloat(precio_venta) || 0,
    parseInt(stock_actual) || 0, parseInt(stock_almacen) || 0, parseInt(stock_nevera) || 0, parseInt(stock_vitrina) || 0, parseInt(stock_minimo) || 5);
  res.redirect('/almacen/productos');
});

router.get('/:id/editar', (req, res) => {
  const producto = db.prepare(`SELECT p.*, (SELECT cantidad FROM entradas WHERE producto_id = p.id ORDER BY id DESC LIMIT 1) as ultima_entrada FROM productos p WHERE p.id = ?`).get(req.params.id);
  if (!producto) return res.redirect('/almacen/productos');
  const categorias = db.prepare('SELECT * FROM categorias ORDER BY nombre').all();
  res.render('almacen/productos/form', { producto, categorias, titulo: 'Editar Producto', baseUrl: '/almacen' });
});

router.post('/:id/editar', (req, res) => {
  const { nombre, categoria_id, precio_compra, precio_venta, stock_actual, stock_almacen, stock_nevera, stock_vitrina, stock_minimo } = req.body;
  db.prepare(`UPDATE productos SET nombre=?, categoria_id=?, precio_compra=?, precio_venta=?, stock_actual=?, stock_almacen=?, stock_nevera=?, stock_vitrina=?, stock_minimo=?
    WHERE id=?`).run(nombre, categoria_id || null,
    parseFloat(precio_compra) || 0, parseFloat(precio_venta) || 0,
    parseInt(stock_actual) || 0, parseInt(stock_almacen) || 0, parseInt(stock_nevera) || 0, parseInt(stock_vitrina) || 0, parseInt(stock_minimo) || 5, req.params.id);
  res.redirect('/almacen/productos');
});

router.post('/:id/eliminar', (req, res) => {
  db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
  res.redirect('/almacen/productos');
});

module.exports = router;
