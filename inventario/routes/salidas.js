const express = require('express');
const router = express.Router();
const db = require('../db'); // mismo pool — mov_inventario está en el PMS, inv_productos en inv_

router.get('/', async (req, res) => {
  try {
    const { desde, hasta, tipo } = req.query;

    let query = `SELECT m.*,
      TO_CHAR(TO_TIMESTAMP(m.ts / 1000), 'YYYY-MM-DD HH24:MI:SS') as fecha_fmt
      FROM mov_inventario m WHERE 1=1`;
    const params = [];

    if (tipo)  { params.push(tipo);                             query += ` AND m.tipo = $${params.length}`; }
    if (desde) { params.push(new Date(desde).getTime());        query += ` AND m.ts >= $${params.length}`; }
    if (hasta) { params.push(new Date(hasta + 'T23:59:59').getTime()); query += ` AND m.ts <= $${params.length}`; }

    query += ' ORDER BY m.ts DESC LIMIT 200';

    const movimientos = await db.all(query, params);

    // Mapear pms_legacy_id → nombre desde inv_productos
    const prodInv = await db.all('SELECT id, nombre, pms_legacy_id FROM inv_productos');
    const prodMap = {};
    prodInv.forEach(p => {
      if (p.pms_legacy_id) prodMap[p.pms_legacy_id] = p.nombre;
      prodMap[p.id] = prodMap[p.id] || p.nombre;
    });

    movimientos.forEach(m => {
      m.producto_nombre = prodMap[m.producto_id] || `Producto #${m.producto_id}`;
    });

    const tipos = (await db.all('SELECT DISTINCT tipo FROM mov_inventario ORDER BY tipo')).map(t => t.tipo);

    res.render('almacen/salidas/index', {
      movimientos, tipos, desde, hasta,
      tipoFiltro: tipo || '',
      titulo: 'Movimientos',
      baseUrl: '/almacen'
    });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
