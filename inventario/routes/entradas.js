const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    let query = `SELECT e.*, p.nombre as producto
      FROM inv_entradas e JOIN inv_productos p ON e.producto_id = p.id WHERE 1=1`;
    const params = [];
    if (desde) { params.push(desde); query += ` AND e.fecha >= $${params.length}`; }
    if (hasta) { params.push(hasta); query += ` AND e.fecha <= $${params.length}`; }
    query += ' ORDER BY e.created_at DESC';

    const entradas  = await db.all(query, params);
    const productos = await db.all('SELECT * FROM inv_productos ORDER BY nombre');
    res.render('almacen/entradas/index', { entradas, productos, desde, hasta, titulo: 'Entradas', baseUrl: '/almacen' });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/', async (req, res) => {
  try {
    const { producto_id, cantidad, precio_unitario, fecha, notas } = req.body;
    const cant = parseInt(cantidad);
    if (!producto_id || !cant || cant <= 0) return res.redirect('/almacen/entradas?error=datos');

    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO inv_entradas (producto_id, cantidad, precio_unitario, fecha, notas)
         VALUES ($1, $2, $3, $4, $5)`,
        [producto_id, cant, parseFloat(precio_unitario) || 0,
         fecha || new Date().toISOString().split('T')[0], notas || null]
      );
      await client.query(
        `UPDATE inv_productos SET
           stock_almacen = stock_almacen + $1,
           stock_actual  = stock_almacen + $1 + stock_nevera + COALESCE(stock_vitrina, 0)
         WHERE id = $2`,
        [cant, producto_id]
      );
    });

    res.redirect('/almacen/entradas');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
