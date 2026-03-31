const { handleRouteError, readNumber, readString } = require('./http-utils');

module.exports = function registerInventarioApiRoutes({ app, db, requireAuth }) {

  async function findInventoryProduct(invId, productoId, motelId) {
    if (invId) {
      const row = await db.get(
        'SELECT * FROM inv_productos WHERE id = $1 AND motel_id = $2',
        [invId, motelId]
      );
      if (row) return row;
    }
    if (productoId) {
      return db.get(
        'SELECT * FROM inv_productos WHERE pms_legacy_id = $1 AND motel_id = $2',
        [productoId, motelId]
      );
    }
    return null;
  }

  app.get('/api/inventario', requireAuth, async (req, res) => {
    try {
      const rows = await db.all(
        'SELECT * FROM inventario WHERE motel_id = $1 ORDER BY nombre',
        [req.motel_id]
      );
      res.json(rows);
    } catch (e) { handleRouteError(res, e, 'Error obteniendo inventario:'); }
  });

  app.post('/api/inventario/cargar', requireAuth, async (req, res) => {
    try {
      const mid        = req.motel_id;
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1 });
      const nombre     = readString(req.body?.nombre, 'nombre');
      const precio     = readNumber(req.body?.precio, 'precio', { min: 0 });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });

      await db.transaction(async (client) => {
        await client.query(
          `INSERT INTO inventario (motel_id, producto_id, nombre, precio, almacen, nevera, vitrina, vendido)
           VALUES ($1, $2, $3, $4, $5, 0, 0, 0)
           ON CONFLICT (motel_id, producto_id) DO UPDATE SET
             nombre  = EXCLUDED.nombre,
             precio  = EXCLUDED.precio,
             almacen = inventario.almacen + EXCLUDED.almacen`,
          [mid, productoId, nombre, precio, cantidad]
        );
        await client.query(
          `INSERT INTO mov_inventario (motel_id, ts, producto_id, tipo, cantidad, nota)
           VALUES ($1, $2, $3, 'carga_almacen', $4, $5)`,
          [mid, Date.now(), productoId, cantidad, req.body?.nota || null]
        );
      });

      res.json({ ok: true });
    } catch (e) { handleRouteError(res, e, 'Error cargando inventario:'); }
  });

  app.post('/api/inventario/mover', requireAuth, async (req, res) => {
    try {
      const mid        = req.motel_id;
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1 });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });

      const row = await db.get(
        'SELECT * FROM inventario WHERE motel_id = $1 AND producto_id = $2',
        [mid, productoId]
      );
      if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
      if (row.almacen < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en almacén (hay ${row.almacen})` });

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE inventario SET almacen = almacen - $1, nevera = nevera + $1
           WHERE motel_id = $2 AND producto_id = $3`,
          [cantidad, mid, productoId]
        );
        await client.query(
          `INSERT INTO mov_inventario (motel_id, ts, producto_id, tipo, cantidad)
           VALUES ($1, $2, $3, 'almacen_a_nevera', $4)`,
          [mid, Date.now(), productoId, cantidad]
        );
      });

      res.json({ ok: true });
    } catch (e) { handleRouteError(res, e, 'Error moviendo inventario a nevera:'); }
  });

  app.get('/api/inventario/productos-minibar', requireAuth, async (req, res) => {
    try {
      const rows = await db.all(
        `SELECT p.id, p.pms_legacy_id, c.nombre AS cat, p.nombre AS name,
                p.precio_venta AS price,
                (p.stock_nevera + COALESCE(p.stock_vitrina, 0)) AS stock,
                p.stock_almacen, p.stock_nevera,
                COALESCE(p.stock_vitrina, 0) AS stock_vitrina
         FROM inv_productos p
         LEFT JOIN inv_categorias c ON p.categoria_id = c.id
         WHERE p.motel_id = $1
         ORDER BY c.id, p.nombre`,
        [req.motel_id]
      );
      const result = rows.map(r => ({
        id:            r.pms_legacy_id || r.id,
        inv_id:        r.id,
        cat:           r.cat,
        name:          r.name,
        price:         Number(r.price),
        stock:         Number(r.stock),
        stock_almacen: Number(r.stock_almacen),
        stock_nevera:  Number(r.stock_nevera),
        stock_vitrina: Number(r.stock_vitrina),
      }));
      res.json(result);
    } catch (e) { handleRouteError(res, e, 'Error cargando productos del inventario:'); }
  });

  app.post('/api/inventario/vender', requireAuth, async (req, res) => {
    try {
      const mid        = req.motel_id;
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId      = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });
      const monto      = readNumber(req.body?.monto, 'monto', { min: 0, optional: true });
      const { tipo_consumo, metodo_pago } = req.body || {};

      const row = await findInventoryProduct(invId, productoId, mid);
      if (!row) return res.json({ ok: true, tracked: false });
      if (row.stock_nevera < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en nevera (hay ${row.stock_nevera})` });

      const tipoMov = tipo_consumo === 'consumo-vip'      ? 'consumo_vip'
                    : tipo_consumo === 'consumo-personal'  ? 'consumo_personal'
                    : 'venta';

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE inv_productos SET
             stock_nevera = stock_nevera - $1,
             stock_actual = stock_almacen + (stock_nevera - $1) + COALESCE(stock_vitrina, 0)
           WHERE id = $2 AND motel_id = $3`,
          [cantidad, row.id, mid]
        );
        await client.query(
          `INSERT INTO mov_inventario (motel_id, ts, producto_id, tipo, cantidad, monto, metodo_pago)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [mid, Date.now(), productoId || row.pms_legacy_id, tipoMov, cantidad, monto || 0, metodo_pago || null]
        );
      });

      res.json({ ok: true, tracked: true });
    } catch (e) { handleRouteError(res, e, 'Error registrando venta de inventario:'); }
  });

  app.post('/api/inventario/devolver', requireAuth, async (req, res) => {
    try {
      const mid        = req.motel_id;
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId      = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });

      const row = await findInventoryProduct(invId, productoId, mid);
      if (!row) return res.json({ ok: true, tracked: false });

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE inv_productos SET
             stock_nevera = stock_nevera + $1,
             stock_actual = stock_almacen + (stock_nevera + $1) + COALESCE(stock_vitrina, 0)
           WHERE id = $2 AND motel_id = $3`,
          [cantidad, row.id, mid]
        );
        await client.query(
          `INSERT INTO mov_inventario (motel_id, ts, producto_id, tipo, cantidad)
           VALUES ($1, $2, $3, 'devolucion', $4)`,
          [mid, Date.now(), productoId || row.pms_legacy_id, cantidad]
        );
      });

      res.json({ ok: true, tracked: true });
    } catch (e) { handleRouteError(res, e, 'Error devolviendo inventario a nevera:'); }
  });

  app.get('/api/inventario/movimientos', requireAuth, async (req, res) => {
    try {
      const rows = await db.all(
        `SELECT m.*, i.nombre, i.precio
         FROM mov_inventario m
         LEFT JOIN inventario i ON i.motel_id = m.motel_id AND i.producto_id = m.producto_id
         WHERE m.motel_id = $1
         ORDER BY m.id DESC LIMIT 200`,
        [req.motel_id]
      );
      res.json(rows);
    } catch (e) { handleRouteError(res, e, 'Error obteniendo movimientos:'); }
  });

  app.get('/api/inventario/reconciliacion', requireAuth, async (req, res) => {
    try {
      const rows = await db.all(
        'SELECT * FROM inventario WHERE motel_id = $1 ORDER BY nombre',
        [req.motel_id]
      );
      const reporte = rows.map(r => ({ ...r, ingresoEsperado: r.vendido * r.precio }));
      res.json(reporte);
    } catch (e) { handleRouteError(res, e, 'Error obteniendo reconciliacion:'); }
  });

  app.post('/api/inventario/mover-nevera', requireAuth, async (req, res) => {
    try {
      const mid        = req.motel_id;
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId      = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });

      const row = await findInventoryProduct(invId, productoId, mid);
      if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
      if (row.stock_almacen < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en almacén (hay ${row.stock_almacen})` });

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE inv_productos SET stock_almacen = stock_almacen - $1, stock_nevera = stock_nevera + $1
           WHERE id = $2 AND motel_id = $3`,
          [cantidad, row.id, mid]
        );
        await client.query(
          `INSERT INTO mov_inventario (motel_id, ts, producto_id, tipo, cantidad)
           VALUES ($1, $2, $3, 'almacen_a_nevera', $4)`,
          [mid, Date.now(), productoId || row.pms_legacy_id, cantidad]
        );
      });

      res.json({ ok: true });
    } catch (e) { handleRouteError(res, e, 'Error moviendo almacén a nevera:'); }
  });

  app.post('/api/inventario/mover-vitrina', requireAuth, async (req, res) => {
    try {
      const mid        = req.motel_id;
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId      = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });

      const row = await findInventoryProduct(invId, productoId, mid);
      if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
      if (row.stock_almacen < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en almacén (hay ${row.stock_almacen})` });

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE inv_productos SET
             stock_almacen = stock_almacen - $1,
             stock_vitrina = COALESCE(stock_vitrina, 0) + $1
           WHERE id = $2 AND motel_id = $3`,
          [cantidad, row.id, mid]
        );
        await client.query(
          `INSERT INTO mov_inventario (motel_id, ts, producto_id, tipo, cantidad)
           VALUES ($1, $2, $3, 'almacen_a_vitrina', $4)`,
          [mid, Date.now(), productoId || row.pms_legacy_id, cantidad]
        );
      });

      res.json({ ok: true });
    } catch (e) { handleRouteError(res, e, 'Error moviendo almacén a vitrina:'); }
  });

  app.post('/api/inventario/vender-vitrina', requireAuth, async (req, res) => {
    try {
      const mid        = req.motel_id;
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId      = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });
      const monto      = readNumber(req.body?.monto, 'monto', { min: 0, optional: true });
      const { tipo_consumo, metodo_pago } = req.body || {};

      const row = await findInventoryProduct(invId, productoId, mid);
      if (!row) return res.json({ ok: true, tracked: false });
      const vitrina = row.stock_vitrina || 0;
      if (vitrina < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en vitrina (hay ${vitrina})` });

      const tipoMov = tipo_consumo === 'consumo-vip'     ? 'consumo_vip'
                    : tipo_consumo === 'consumo-personal' ? 'consumo_personal'
                    : 'venta_vitrina';

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE inv_productos SET
             stock_vitrina = COALESCE(stock_vitrina, 0) - $1,
             stock_actual  = stock_almacen + stock_nevera + (COALESCE(stock_vitrina, 0) - $1)
           WHERE id = $2 AND motel_id = $3`,
          [cantidad, row.id, mid]
        );
        await client.query(
          `INSERT INTO mov_inventario (motel_id, ts, producto_id, tipo, cantidad, monto, metodo_pago)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [mid, Date.now(), productoId || row.pms_legacy_id, tipoMov, cantidad, monto || 0, metodo_pago || null]
        );
      });

      res.json({ ok: true, tracked: true });
    } catch (e) { handleRouteError(res, e, 'Error registrando venta de vitrina:'); }
  });

  app.post('/api/inventario/devolver-vitrina', requireAuth, async (req, res) => {
    try {
      const mid        = req.motel_id;
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId      = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });

      const row = await findInventoryProduct(invId, productoId, mid);
      if (!row) return res.json({ ok: true, tracked: false });

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE inv_productos SET
             stock_vitrina = COALESCE(stock_vitrina, 0) + $1,
             stock_actual  = stock_almacen + stock_nevera + (COALESCE(stock_vitrina, 0) + $1)
           WHERE id = $2 AND motel_id = $3`,
          [cantidad, row.id, mid]
        );
        await client.query(
          `INSERT INTO mov_inventario (motel_id, ts, producto_id, tipo, cantidad)
           VALUES ($1, $2, $3, 'devolucion_vitrina', $4)`,
          [mid, Date.now(), productoId || row.pms_legacy_id, cantidad]
        );
      });

      res.json({ ok: true, tracked: true });
    } catch (e) { handleRouteError(res, e, 'Error devolviendo inventario a vitrina:'); }
  });

  app.get('/api/inventario/balance', requireAuth, async (req, res) => {
    try {
      const mid   = req.motel_id;
      const desde = readNumber(req.query.desde, 'desde', { integer: true, min: 0, optional: true }) || 0;
      const rows  = await db.all(
        `SELECT m.tipo, m.cantidad, m.producto_id
         FROM mov_inventario m
         WHERE m.motel_id = $1 AND m.ts >= $2 AND m.tipo IN ('venta', 'venta_vitrina')
         ORDER BY m.ts`,
        [mid, desde]
      );

      let minibar = { total: 0, items: [] };
      let vitrina = { total: 0, items: [] };

      for (const r of rows) {
        const prod  = await db.get(
          'SELECT nombre, precio_venta FROM inv_productos WHERE pms_legacy_id = $1 AND motel_id = $2',
          [r.producto_id, mid]
        );
        const precio = prod ? Number(prod.precio_venta) : 0;
        const nombre = prod ? prod.nombre : `Producto ${r.producto_id}`;
        const monto  = r.cantidad * precio;
        const item   = { nombre, cantidad: r.cantidad, monto };
        if (r.tipo === 'venta') { minibar.total += monto; minibar.items.push(item); }
        else                    { vitrina.total += monto; vitrina.items.push(item); }
      }

      res.json({ minibar, vitrina });
    } catch (e) { handleRouteError(res, e, 'Error calculando balance de inventario:'); }
  });
};
