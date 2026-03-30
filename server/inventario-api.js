const { handleRouteError, readNumber, readString } = require('./http-utils');

module.exports = function registerInventarioApiRoutes({ app, db }) {
  // invDb y db son el mismo pool — las tablas del almacén tienen prefijo inv_

  async function findInventoryProduct(invId, productoId) {
    if (invId) {
      const row = await db.get('SELECT * FROM inv_productos WHERE id = $1', [invId]);
      if (row) return row;
    }
    if (productoId) {
      return db.get('SELECT * FROM inv_productos WHERE pms_legacy_id = $1', [productoId]);
    }
    return null;
  }

  app.get('/api/inventario', async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM inventario ORDER BY nombre');
      res.json(rows);
    } catch (e) { handleRouteError(res, e, 'Error obteniendo inventario:'); }
  });

  app.post('/api/inventario/cargar', async (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1 });
      const nombre     = readString(req.body?.nombre, 'nombre');
      const precio     = readNumber(req.body?.precio, 'precio', { min: 0 });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });

      await db.transaction(async (client) => {
        await client.query(
          `INSERT INTO inventario (producto_id, nombre, precio, almacen, nevera, vitrina, vendido)
           VALUES ($1, $2, $3, $4, 0, 0, 0)
           ON CONFLICT (producto_id) DO UPDATE SET
             nombre  = EXCLUDED.nombre,
             precio  = EXCLUDED.precio,
             almacen = inventario.almacen + EXCLUDED.almacen`,
          [productoId, nombre, precio, cantidad]
        );
        await client.query(
          `INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad, nota)
           VALUES ($1, $2, 'carga_almacen', $3, $4)`,
          [Date.now(), productoId, cantidad, req.body?.nota || null]
        );
      });

      res.json({ ok: true });
    } catch (e) { handleRouteError(res, e, 'Error cargando inventario:'); }
  });

  app.post('/api/inventario/mover', async (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1 });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });

      const row = await db.get('SELECT * FROM inventario WHERE producto_id = $1', [productoId]);
      if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
      if (row.almacen < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en almacén (hay ${row.almacen})` });

      await db.transaction(async (client) => {
        await client.query(
          'UPDATE inventario SET almacen = almacen - $1, nevera = nevera + $1 WHERE producto_id = $2',
          [cantidad, productoId]
        );
        await client.query(
          `INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
           VALUES ($1, $2, 'almacen_a_nevera', $3)`,
          [Date.now(), productoId, cantidad]
        );
      });

      res.json({ ok: true });
    } catch (e) { handleRouteError(res, e, 'Error moviendo inventario a nevera:'); }
  });

  app.get('/api/inventario/productos-minibar', async (req, res) => {
    try {
      const rows = await db.all(
        `SELECT p.id, p.pms_legacy_id, c.nombre as cat, p.nombre as name,
                p.precio_venta as price,
                (p.stock_nevera + COALESCE(p.stock_vitrina, 0)) as stock,
                p.stock_almacen, p.stock_nevera,
                COALESCE(p.stock_vitrina, 0) as stock_vitrina
         FROM inv_productos p
         LEFT JOIN inv_categorias c ON p.categoria_id = c.id
         ORDER BY c.id, p.nombre`
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

  app.post('/api/inventario/vender', async (req, res) => {
    try {
      const productoId  = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad    = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId       = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });
      const monto       = readNumber(req.body?.monto, 'monto', { min: 0, optional: true });
      const { tipo_consumo, metodo_pago } = req.body || {};

      const row = await findInventoryProduct(invId, productoId);
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
           WHERE id = $2`,
          [cantidad, row.id]
        );
        await client.query(
          `INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad, monto, metodo_pago)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [Date.now(), productoId || row.pms_legacy_id, tipoMov, cantidad, monto || 0, metodo_pago || null]
        );
      });

      res.json({ ok: true, tracked: true });
    } catch (e) { handleRouteError(res, e, 'Error registrando venta de inventario:'); }
  });

  app.post('/api/inventario/devolver', async (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId      = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });

      const row = await findInventoryProduct(invId, productoId);
      if (!row) return res.json({ ok: true, tracked: false });

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE inv_productos SET
             stock_nevera = stock_nevera + $1,
             stock_actual = stock_almacen + (stock_nevera + $1) + COALESCE(stock_vitrina, 0)
           WHERE id = $2`,
          [cantidad, row.id]
        );
        await client.query(
          `INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
           VALUES ($1, $2, 'devolucion', $3)`,
          [Date.now(), productoId || row.pms_legacy_id, cantidad]
        );
      });

      res.json({ ok: true, tracked: true });
    } catch (e) { handleRouteError(res, e, 'Error devolviendo inventario a nevera:'); }
  });

  app.get('/api/inventario/movimientos', async (req, res) => {
    try {
      const rows = await db.all(
        `SELECT m.*, i.nombre, i.precio
         FROM mov_inventario m
         LEFT JOIN inventario i ON i.producto_id = m.producto_id
         ORDER BY m.id DESC LIMIT 200`
      );
      res.json(rows);
    } catch (e) { handleRouteError(res, e, 'Error obteniendo movimientos:'); }
  });

  app.get('/api/inventario/reconciliacion', async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM inventario ORDER BY nombre');
      const reporte = rows.map(r => ({ ...r, ingresoEsperado: r.vendido * r.precio }));
      res.json(reporte);
    } catch (e) { handleRouteError(res, e, 'Error obteniendo reconciliacion:'); }
  });

  app.post('/api/inventario/mover-nevera', async (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId      = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });

      const row = await findInventoryProduct(invId, productoId);
      if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
      if (row.stock_almacen < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en almacén (hay ${row.stock_almacen})` });

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE inv_productos SET stock_almacen = stock_almacen - $1, stock_nevera = stock_nevera + $1
           WHERE id = $2`,
          [cantidad, row.id]
        );
        await client.query(
          `INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
           VALUES ($1, $2, 'almacen_a_nevera', $3)`,
          [Date.now(), productoId || row.pms_legacy_id, cantidad]
        );
      });

      res.json({ ok: true });
    } catch (e) { handleRouteError(res, e, 'Error moviendo almacén a nevera:'); }
  });

  app.post('/api/inventario/mover-vitrina', async (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId      = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });

      const row = await findInventoryProduct(invId, productoId);
      if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
      if (row.stock_almacen < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en almacén (hay ${row.stock_almacen})` });

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE inv_productos SET
             stock_almacen = stock_almacen - $1,
             stock_vitrina = COALESCE(stock_vitrina, 0) + $1
           WHERE id = $2`,
          [cantidad, row.id]
        );
        await client.query(
          `INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
           VALUES ($1, $2, 'almacen_a_vitrina', $3)`,
          [Date.now(), productoId || row.pms_legacy_id, cantidad]
        );
      });

      res.json({ ok: true });
    } catch (e) { handleRouteError(res, e, 'Error moviendo almacén a vitrina:'); }
  });

  app.post('/api/inventario/vender-vitrina', async (req, res) => {
    try {
      const productoId  = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad    = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId       = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });
      const monto       = readNumber(req.body?.monto, 'monto', { min: 0, optional: true });
      const { tipo_consumo, metodo_pago } = req.body || {};

      const row = await findInventoryProduct(invId, productoId);
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
           WHERE id = $2`,
          [cantidad, row.id]
        );
        await client.query(
          `INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad, monto, metodo_pago)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [Date.now(), productoId || row.pms_legacy_id, tipoMov, cantidad, monto || 0, metodo_pago || null]
        );
      });

      res.json({ ok: true, tracked: true });
    } catch (e) { handleRouteError(res, e, 'Error registrando venta de vitrina:'); }
  });

  app.post('/api/inventario/devolver-vitrina', async (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad   = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId      = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });

      const row = await findInventoryProduct(invId, productoId);
      if (!row) return res.json({ ok: true, tracked: false });

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE inv_productos SET
             stock_vitrina = COALESCE(stock_vitrina, 0) + $1,
             stock_actual  = stock_almacen + stock_nevera + (COALESCE(stock_vitrina, 0) + $1)
           WHERE id = $2`,
          [cantidad, row.id]
        );
        await client.query(
          `INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
           VALUES ($1, $2, 'devolucion_vitrina', $3)`,
          [Date.now(), productoId || row.pms_legacy_id, cantidad]
        );
      });

      res.json({ ok: true, tracked: true });
    } catch (e) { handleRouteError(res, e, 'Error devolviendo inventario a vitrina:'); }
  });

  app.get('/api/inventario/balance', async (req, res) => {
    try {
      const desde = readNumber(req.query.desde, 'desde', { integer: true, min: 0, optional: true }) || 0;
      const rows  = await db.all(
        `SELECT m.tipo, m.cantidad, m.producto_id
         FROM mov_inventario m
         WHERE m.ts >= $1 AND m.tipo IN ('venta', 'venta_vitrina')
         ORDER BY m.ts`,
        [desde]
      );

      let minibar = { total: 0, items: [] };
      let vitrina = { total: 0, items: [] };

      for (const r of rows) {
        const prod  = await db.get('SELECT nombre, precio_venta FROM inv_productos WHERE pms_legacy_id = $1', [r.producto_id]);
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
