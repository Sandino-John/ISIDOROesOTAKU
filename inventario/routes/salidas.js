const express = require('express');
const router = express.Router();
const path = require('path');
const Database = require('better-sqlite3');

// Conexión a motel23.db para leer mov_inventario
const dbMotel = new Database(path.join(__dirname, '..', '..', 'motel23.db'));
// Conexión a inventario.db para nombres de productos
const dbInv = require('../db');

router.get('/', (req, res) => {
  const { desde, hasta, tipo } = req.query;

  // Traer movimientos de motel23.db
  let query = `SELECT m.*, datetime(m.ts/1000, 'unixepoch', 'localtime') as fecha_fmt
    FROM mov_inventario m
    WHERE 1=1`;
  const params = [];

  if (tipo) {
    query += ` AND m.tipo = ?`;
    params.push(tipo);
  }
  if (desde) {
    query += ` AND m.ts >= ?`;
    params.push(new Date(desde).getTime());
  }
  if (hasta) {
    query += ` AND m.ts <= ?`;
    params.push(new Date(hasta + 'T23:59:59').getTime());
  }

  query += ` ORDER BY m.ts DESC LIMIT 200`;

  const movimientos = dbMotel.prepare(query).all(...params);

  // Mapear pms_legacy_id → nombre desde inventario.db
  const prodInv = dbInv.prepare('SELECT id, nombre, pms_legacy_id FROM productos').all();
  const prodMap = {};
  prodInv.forEach(p => {
    if (p.pms_legacy_id) prodMap[p.pms_legacy_id] = p.nombre;
    prodMap[p.id] = prodMap[p.id] || p.nombre;
  });

  // Agregar nombre de producto a cada movimiento
  movimientos.forEach(m => {
    m.producto_nombre = prodMap[m.producto_id] || `Producto #${m.producto_id}`;
  });

  // Tipos disponibles para el filtro
  const tipos = dbMotel.prepare('SELECT DISTINCT tipo FROM mov_inventario ORDER BY tipo').all().map(t => t.tipo);

  res.render('almacen/salidas/index', {
    movimientos,
    tipos,
    desde,
    hasta,
    tipoFiltro: tipo || '',
    titulo: 'Movimientos',
    baseUrl: '/almacen'
  });
});

module.exports = router;
