const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const { buscar, categoria } = req.query;
    let query = `SELECT p.*, c.nombre as categoria_nombre,
      (SELECT cantidad FROM inv_entradas WHERE producto_id = p.id ORDER BY id DESC LIMIT 1) as ultima_entrada
      FROM inv_productos p LEFT JOIN inv_categorias c ON p.categoria_id = c.id WHERE 1=1`;
    const params = [];
    if (buscar)    { params.push(`%${buscar}%`); query += ` AND p.nombre ILIKE $${params.length}`; }
    if (categoria) { params.push(categoria);      query += ` AND p.categoria_id = $${params.length}`; }
    query += ' ORDER BY p.nombre';

    const productos  = await db.all(query, params);
    const categorias = await db.all('SELECT * FROM inv_categorias ORDER BY nombre');
    res.render('almacen/productos/index', { productos, categorias, buscar, categoria, titulo: 'Productos', baseUrl: '/almacen' });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.get('/nuevo', async (req, res) => {
  try {
    const categorias = await db.all('SELECT * FROM inv_categorias ORDER BY nombre');
    res.render('almacen/productos/form', { producto: null, categorias, titulo: 'Nuevo Producto', baseUrl: '/almacen' });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/nuevo', async (req, res) => {
  try {
    const { nombre, categoria_id, precio_compra, precio_venta, stock_actual, stock_almacen, stock_nevera, stock_vitrina, stock_minimo } = req.body;
    await db.run(
      `INSERT INTO inv_productos (nombre, categoria_id, precio_compra, precio_venta, stock_actual, stock_almacen, stock_nevera, stock_vitrina, stock_minimo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [nombre, categoria_id || null,
       parseFloat(precio_compra) || 0, parseFloat(precio_venta) || 0,
       parseInt(stock_actual) || 0, parseInt(stock_almacen) || 0,
       parseInt(stock_nevera) || 0, parseInt(stock_vitrina) || 0,
       parseInt(stock_minimo) || 5]
    );
    res.redirect('/almacen/productos');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.get('/:id/editar', async (req, res) => {
  try {
    const producto = await db.get(
      `SELECT p.*, (SELECT cantidad FROM inv_entradas WHERE producto_id = p.id ORDER BY id DESC LIMIT 1) as ultima_entrada
       FROM inv_productos p WHERE p.id = $1`,
      [req.params.id]
    );
    if (!producto) return res.redirect('/almacen/productos');
    const categorias = await db.all('SELECT * FROM inv_categorias ORDER BY nombre');
    res.render('almacen/productos/form', { producto, categorias, titulo: 'Editar Producto', baseUrl: '/almacen' });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/:id/editar', async (req, res) => {
  try {
    const { nombre, categoria_id, precio_compra, precio_venta, stock_actual, stock_almacen, stock_nevera, stock_vitrina, stock_minimo } = req.body;
    await db.run(
      `UPDATE inv_productos SET nombre=$1, categoria_id=$2, precio_compra=$3, precio_venta=$4,
         stock_actual=$5, stock_almacen=$6, stock_nevera=$7, stock_vitrina=$8, stock_minimo=$9
       WHERE id=$10`,
      [nombre, categoria_id || null,
       parseFloat(precio_compra) || 0, parseFloat(precio_venta) || 0,
       parseInt(stock_actual) || 0, parseInt(stock_almacen) || 0,
       parseInt(stock_nevera) || 0, parseInt(stock_vitrina) || 0,
       parseInt(stock_minimo) || 5, req.params.id]
    );
    res.redirect('/almacen/productos');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/:id/eliminar', async (req, res) => {
  try {
    await db.run('DELETE FROM inv_productos WHERE id = $1', [req.params.id]);
    res.redirect('/almacen/productos');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
