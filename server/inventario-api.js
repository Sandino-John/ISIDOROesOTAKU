const { handleRouteError, readNumber, readString } = require('./http-utils');

module.exports = function registerInventarioApiRoutes({ app, db, invDb }) {
  function findInventoryProduct(invId, productoId) {
    if (invId) {
      const byRealId = invDb.prepare('SELECT * FROM productos WHERE id = ?').get(invId);
      if (byRealId) return byRealId;
    }
    if (productoId) {
      return invDb.prepare('SELECT * FROM productos WHERE pms_legacy_id = ?').get(productoId);
    }
    return null;
  }

  app.get('/api/inventario', (req, res) => {
    const rows = db.prepare('SELECT * FROM inventario ORDER BY nombre').all();
    res.json(rows);
  });

  app.post('/api/inventario/cargar', (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1 });
      const nombre = readString(req.body?.nombre, 'nombre');
      const precio = readNumber(req.body?.precio, 'precio', { min: 0 });
      const cantidad = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });

      db.prepare(`
        INSERT INTO inventario (producto_id, nombre, precio, almacen, nevera, vitrina, vendido)
        VALUES (?, ?, ?, ?, 0, 0, 0)
        ON CONFLICT(producto_id) DO UPDATE SET
          nombre  = excluded.nombre,
          precio  = excluded.precio,
          almacen = almacen + excluded.almacen
      `).run(productoId, nombre, precio, cantidad);

      db.prepare(`
        INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad, nota)
        VALUES (?, ?, 'carga_almacen', ?, ?)
      `).run(Date.now(), productoId, cantidad, req.body?.nota || null);

      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e, 'Error cargando inventario:');
    }
  });

  app.post('/api/inventario/mover', (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1 });
      const cantidad = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });

      const row = db.prepare('SELECT * FROM inventario WHERE producto_id = ?').get(productoId);
      if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
      if (row.almacen < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en almacén (hay ${row.almacen})` });

      db.prepare(`
        UPDATE inventario SET almacen = almacen - ?, nevera = nevera + ?
        WHERE producto_id = ?
      `).run(cantidad, cantidad, productoId);

      db.prepare(`
        INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
        VALUES (?, ?, 'almacen_a_nevera', ?)
      `).run(Date.now(), productoId, cantidad);

      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e, 'Error moviendo inventario a nevera:');
    }
  });

  app.get('/api/inventario/productos-minibar', (req, res) => {
    try {
      const rows = invDb.prepare(`
        SELECT p.id, p.pms_legacy_id, c.nombre as cat, p.nombre as name,
               p.precio_venta as price,
               (p.stock_nevera + COALESCE(p.stock_vitrina, 0)) as stock,
               p.stock_almacen, p.stock_nevera, COALESCE(p.stock_vitrina, 0) as stock_vitrina
        FROM productos p
        LEFT JOIN categorias c ON p.categoria_id = c.id
        ORDER BY c.id, p.nombre
      `).all();
      const result = rows.map(r => ({
        id: r.pms_legacy_id || r.id,
        inv_id: r.id,
        cat: r.cat,
        name: r.name,
        price: r.price,
        stock: r.stock,
        stock_almacen: r.stock_almacen,
        stock_nevera: r.stock_nevera,
        stock_vitrina: r.stock_vitrina
      }));
      res.json(result);
    } catch (e) {
      handleRouteError(res, e, 'Error cargando productos del inventario:');
    }
  });

  app.post('/api/inventario/vender', (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });
      const monto = readNumber(req.body?.monto, 'monto', { min: 0, optional: true });
      const { tipo_consumo, metodo_pago } = req.body || {};

      const row = findInventoryProduct(invId, productoId);
      if (!row) return res.json({ ok: true, tracked: false });

      if (row.stock_nevera < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en nevera (hay ${row.stock_nevera})` });

      invDb.prepare(`
        UPDATE productos SET stock_nevera = stock_nevera - ?,
          stock_actual = stock_almacen + (stock_nevera - ?) + COALESCE(stock_vitrina, 0)
        WHERE id = ?
      `).run(cantidad, cantidad, row.id);

      const tipoMov = tipo_consumo === 'consumo-vip' ? 'consumo_vip'
        : tipo_consumo === 'consumo-personal' ? 'consumo_personal'
        : 'venta';
      db.prepare(`
        INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad, monto, metodo_pago)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(Date.now(), productoId || row.pms_legacy_id, tipoMov, cantidad, monto || 0, metodo_pago || null);

      res.json({ ok: true, tracked: true });
    } catch (e) {
      handleRouteError(res, e, 'Error registrando venta de inventario:');
    }
  });

  app.post('/api/inventario/devolver', (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });

      const row = findInventoryProduct(invId, productoId);
      if (!row) return res.json({ ok: true, tracked: false });

      invDb.prepare(`
        UPDATE productos SET stock_nevera = stock_nevera + ?,
          stock_actual = stock_almacen + (stock_nevera + ?) + COALESCE(stock_vitrina, 0)
        WHERE id = ?
      `).run(cantidad, cantidad, row.id);

      db.prepare(`
        INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
        VALUES (?, ?, 'devolucion', ?)
      `).run(Date.now(), productoId || row.pms_legacy_id, cantidad);

      res.json({ ok: true, tracked: true });
    } catch (e) {
      handleRouteError(res, e, 'Error devolviendo inventario a nevera:');
    }
  });

  app.get('/api/inventario/movimientos', (req, res) => {
    const rows = db.prepare(`
      SELECT m.*, i.nombre, i.precio
      FROM mov_inventario m
      LEFT JOIN inventario i ON i.producto_id = m.producto_id
      ORDER BY m.id DESC LIMIT 200
    `).all();
    res.json(rows);
  });

  app.get('/api/inventario/reconciliacion', (req, res) => {
    const rows = db.prepare('SELECT * FROM inventario ORDER BY nombre').all();
    const reporte = rows.map(r => ({
      ...r,
      ingresoEsperado: r.vendido * r.precio,
    }));
    res.json(reporte);
  });

  app.post('/api/inventario/mover-nevera', (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });

      const row = findInventoryProduct(invId, productoId);
      if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
      if (row.stock_almacen < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en almacén (hay ${row.stock_almacen})` });

      invDb.prepare(`
        UPDATE productos SET stock_almacen = stock_almacen - ?,
          stock_nevera = stock_nevera + ?
        WHERE id = ?
      `).run(cantidad, cantidad, row.id);

      db.prepare(`
        INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
        VALUES (?, ?, 'almacen_a_nevera', ?)
      `).run(Date.now(), productoId || row.pms_legacy_id, cantidad);

      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e, 'Error moviendo almacén a nevera:');
    }
  });

  app.post('/api/inventario/mover-vitrina', (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });

      const row = findInventoryProduct(invId, productoId);
      if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
      if (row.stock_almacen < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en almacén (hay ${row.stock_almacen})` });

      invDb.prepare(`
        UPDATE productos SET stock_almacen = stock_almacen - ?,
          stock_vitrina = COALESCE(stock_vitrina, 0) + ?
        WHERE id = ?
      `).run(cantidad, cantidad, row.id);

      db.prepare(`
        INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
        VALUES (?, ?, 'almacen_a_vitrina', ?)
      `).run(Date.now(), productoId || row.pms_legacy_id, cantidad);

      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e, 'Error moviendo almacén a vitrina:');
    }
  });

  app.post('/api/inventario/vender-vitrina', (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });
      const monto = readNumber(req.body?.monto, 'monto', { min: 0, optional: true });
      const { tipo_consumo, metodo_pago } = req.body || {};

      const row = findInventoryProduct(invId, productoId);
      if (!row) return res.json({ ok: true, tracked: false });

      const vitrina = row.stock_vitrina || 0;
      if (vitrina < cantidad)
        return res.status(400).json({ error: `Stock insuficiente en vitrina (hay ${vitrina})` });

      invDb.prepare(`
        UPDATE productos SET stock_vitrina = COALESCE(stock_vitrina, 0) - ?,
          stock_actual = stock_almacen + stock_nevera + (COALESCE(stock_vitrina, 0) - ?)
        WHERE id = ?
      `).run(cantidad, cantidad, row.id);

      const tipoMov = tipo_consumo === 'consumo-vip' ? 'consumo_vip'
        : tipo_consumo === 'consumo-personal' ? 'consumo_personal'
        : 'venta_vitrina';
      db.prepare(`
        INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad, monto, metodo_pago)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(Date.now(), productoId || row.pms_legacy_id, tipoMov, cantidad, monto || 0, metodo_pago || null);

      res.json({ ok: true, tracked: true });
    } catch (e) {
      handleRouteError(res, e, 'Error registrando venta de vitrina:');
    }
  });

  app.post('/api/inventario/devolver-vitrina', (req, res) => {
    try {
      const productoId = readNumber(req.body?.producto_id, 'producto_id', { integer: true, min: 1, optional: true });
      const cantidad = readNumber(req.body?.cantidad, 'cantidad', { integer: true, min: 1 });
      const invId = readNumber(req.body?.inv_id, 'inv_id', { integer: true, min: 1, optional: true });

      const row = findInventoryProduct(invId, productoId);
      if (!row) return res.json({ ok: true, tracked: false });

      invDb.prepare(`
        UPDATE productos SET stock_vitrina = COALESCE(stock_vitrina, 0) + ?,
          stock_actual = stock_almacen + stock_nevera + (COALESCE(stock_vitrina, 0) + ?)
        WHERE id = ?
      `).run(cantidad, cantidad, row.id);

      db.prepare(`
        INSERT INTO mov_inventario (ts, producto_id, tipo, cantidad)
        VALUES (?, ?, 'devolucion_vitrina', ?)
      `).run(Date.now(), productoId || row.pms_legacy_id, cantidad);

      res.json({ ok: true, tracked: true });
    } catch (e) {
      handleRouteError(res, e, 'Error devolviendo inventario a vitrina:');
    }
  });

  app.get('/api/inventario/balance', (req, res) => {
    try {
      const desde = readNumber(req.query.desde, 'desde', { integer: true, min: 0, optional: true }) || 0;
      const rows = db.prepare(`
        SELECT m.tipo, m.cantidad, m.producto_id
        FROM mov_inventario m
        WHERE m.ts >= ? AND m.tipo IN ('venta', 'venta_vitrina')
        ORDER BY m.ts
      `).all(desde);

      const getProduct = invDb.prepare('SELECT nombre, precio_venta FROM productos WHERE pms_legacy_id = ?');

      let minibar = { total: 0, items: [] };
      let vitrina = { total: 0, items: [] };

      rows.forEach(r => {
        const prod = getProduct.get(r.producto_id);
        const precio = prod ? prod.precio_venta : 0;
        const nombre = prod ? prod.nombre : `Producto ${r.producto_id}`;
        const monto = r.cantidad * precio;
        const item = { nombre, cantidad: r.cantidad, monto };
        if (r.tipo === 'venta') {
          minibar.total += monto;
          minibar.items.push(item);
        } else {
          vitrina.total += monto;
          vitrina.items.push(item);
        }
      });

      res.json({ minibar, vitrina });
    } catch (e) {
      handleRouteError(res, e, 'Error calculando balance de inventario:');
    }
  });
};
