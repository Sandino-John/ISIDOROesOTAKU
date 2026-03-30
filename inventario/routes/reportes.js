const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const { desde, hasta, tipo } = req.query;

    const stockActual = await db.all(
      `SELECT p.*, c.nombre as categoria_nombre,
         (p.stock_actual * p.precio_compra) as valor_total
       FROM inv_productos p LEFT JOIN inv_categorias c ON p.categoria_id = c.id
       ORDER BY p.nombre`
    );
    const valorTotal = stockActual.reduce((sum, p) => sum + (Number(p.valor_total) || 0), 0);
    const stockBajo  = stockActual.filter(p => p.stock_actual <= p.stock_minimo);

    let movimientos = [];
    if (desde || hasta) {
      const paramsE = [], paramsS = [];
      let qE = `SELECT 'entrada' as tipo, e.fecha, e.cantidad, e.precio_unitario, p.nombre as producto,
                  pr.nombre as contraparte, e.notas
                FROM inv_entradas e
                JOIN inv_productos p ON e.producto_id = p.id
                LEFT JOIN inv_proveedores pr ON e.proveedor_id = pr.id
                WHERE 1=1`;
      let qS = `SELECT 'salida' as tipo, s.fecha, s.cantidad, s.precio_unitario, p.nombre as producto,
                  s.cliente as contraparte, s.notas
                FROM inv_salidas s
                JOIN inv_productos p ON s.producto_id = p.id
                WHERE 1=1`;

      if (desde) {
        paramsE.push(desde); qE += ` AND e.fecha >= $${paramsE.length}`;
        paramsS.push(desde); qS += ` AND s.fecha >= $${paramsS.length}`;
      }
      if (hasta) {
        paramsE.push(hasta); qE += ` AND e.fecha <= $${paramsE.length}`;
        paramsS.push(hasta); qS += ` AND s.fecha <= $${paramsS.length}`;
      }

      if (tipo === 'entradas') {
        movimientos = await db.all(qE + ' ORDER BY e.fecha DESC', paramsE);
      } else if (tipo === 'salidas') {
        movimientos = await db.all(qS + ' ORDER BY s.fecha DESC', paramsS);
      } else {
        // UNION ALL: construimos con params numerados correctamente
        const allParams = [...paramsE, ...paramsS];
        // Re-numerar params del segundo bloque (qS)
        let qSrenumbered = qS.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) + paramsE.length}`);
        movimientos = await db.all(
          `${qE} UNION ALL ${qSrenumbered} ORDER BY fecha DESC`,
          allParams
        );
      }
    }

    res.render('almacen/reportes/index', {
      stockActual, valorTotal, stockBajo, movimientos,
      desde, hasta, tipo, titulo: 'Reportes', baseUrl: '/almacen'
    });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
