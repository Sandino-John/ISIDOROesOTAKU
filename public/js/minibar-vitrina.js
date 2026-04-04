// ─── MINIBAR, VITRINA E INVENTARIO LIGERO ──────────────────────────────────

function renderMbManage() {
  const q = (document.getElementById('mbSearchInput')?.value||'').toLowerCase();
  const filtered = minibarProducts.filter(p =>
    p.name.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q)
  );
  const NEVERA_CATS = ['🍺 Bebidas Alcohólicas','🥤 Refrescos','⚡ Energizantes'];
  const header = `<div style="display:flex;align-items:center;padding:4px 8px;border-bottom:1px solid var(--border);margin-bottom:4px">
    <div style="flex:1;font-size:0.65rem;color:var(--text3);font-weight:600;text-transform:uppercase">Producto</div>
    <div style="width:130px;display:flex;align-items:center;justify-content:space-between">
      <div style="width:45px;text-align:center;font-size:0.75rem;color:var(--text3);font-weight:600">📦</div>
      <div style="width:12px;text-align:center;font-size:0.6rem;color:var(--text3)">→</div>
      <div style="width:45px;text-align:center;font-size:0.75rem;color:var(--text3);font-weight:600">🧊</div>
    </div>
  </div>`;
  const rows = filtered.map(p => {
    const isNevera = NEVERA_CATS.includes(p.cat);
    const destino = isNevera ? 'nevera' : 'vitrina';
    const canTransfer = (p.stock_almacen || 0) > 0;
    return `
    <div class="mb-manage-item">
      <div style="flex:1;min-width:0">
        <div class="mb-manage-name">${p.name}</div>
        <div class="mb-manage-cat">${p.cat}</div>
      </div>
      <div style="width:130px;display:flex;align-items:center;justify-content:space-between">
        <span style="width:45px;text-align:center;background:var(--surface2);padding:2px 4px;border-radius:4px;font-size:1rem;font-weight:700;color:var(--text2)">${p.stock_almacen || 0}</span>
        <button onclick="transferStock(${p.inv_id || p.id}, '${destino}', '${p.name}')" style="width:12px;height:12px;background:${canTransfer ? '#22c55e' : '#555'};color:#fff;border:none;border-radius:2px;padding:0;font-size:0.4rem;line-height:12px;cursor:${canTransfer ? 'pointer' : 'not-allowed'};font-weight:700;flex-shrink:0" ${canTransfer ? '' : 'disabled'}>→</button>
        <span style="width:45px;text-align:center;background:${p.stock <= 5 ? '#dc2626' : 'var(--surface2)'};padding:2px 4px;border-radius:4px;font-size:1rem;font-weight:700;color:${p.stock <= 5 ? '#fff' : 'var(--text1)'}">${p.stock}</span>
      </div>
    </div>`;
  }).join('');
  document.getElementById('mbManageList').innerHTML = (header + rows) || '<div style="font-size:0.75rem;color:var(--text3);padding:8px">Sin resultados</div>';
}

async function transferStock(invId, destino, nombre) {
  const cant = prompt(`¿Cuántas unidades de "${nombre}" pasar del almacén a ${destino}?`, '1');
  if (!cant || isNaN(cant) || parseInt(cant) <= 0) return;
  const cantidad = parseInt(cant);
  try {
    const endpoint = destino === 'nevera' ? 'inventario/mover-nevera' : 'inventario/mover-vitrina';
    const res = await api(endpoint, 'POST', { inv_id: invId, cantidad });
    if (res.error) { toast(`❌ ${res.error}`); return; }
    // Recargar productos frescos
    const freshProducts = await api('inventario/productos-minibar');
    if (freshProducts && freshProducts.length) {
      minibarProducts = freshProducts.map(p => {
        if (!p.img) {
          const def = DEFAULT_PRODUCTS.find(d => d.id === p.id || d.name === p.name);
          if (def) p.img = def.img;
        }
        return p;
      });
    }
    renderMbManage();
    toast(`✓ ${cantidad} ${nombre} → ${destino}`);
  } catch(e) {
    toast(`❌ Error al traspasar: ${e.message}`);
  }
}

// ─── MINIBAR DATA ─────────────────────────────────────────────────────────────
const DEFAULT_PRODUCTS = [
  // BEBIDAS
  {id:1,  cat:'🍺 Bebidas Alcohólicas', name:'Paceña Macanuda',  price:20, stock:30, img:'Paceña_Macanuda.jpg'},
  {id:2,  cat:'🍺 Bebidas Alcohólicas', name:'Paceña Lata',      price:12, stock:30, img:'pacena.png'},
  {id:3,  cat:'🍺 Bebidas Alcohólicas', name:'Vino',             price:35, stock:15, img:'Vino.png'},
  {id:4,  cat:'🥤 Refrescos',           name:'Coca Cola Popular', price:8, stock:30, img:'coca_cola_popular.webp'},
  {id:5,  cat:'🥤 Refrescos',           name:'Coca Cola Personal', price:8, stock:30, img:'coca_cola_personal.webp'},
  {id:6,  cat:'🥤 Refrescos',           name:'Coca 2lt',         price:20, stock:20, img:'Coca_cola_2lt.jpg'},
  {id:32, cat:'🥤 Refrescos',           name:'Coca Cola Mini',   price:3,  stock:50, img:'coca_cola_mini.webp'},
  {id:33, cat:'🥤 Refrescos',           name:'Soda 2 lts.',      price:20, stock:20, img:'Soda_2_lts..webp'},
  {id:7,  cat:'🥤 Refrescos',           name:'Agua',             price:10, stock:40, img:'agua.png'},
  {id:8,  cat:'🥤 Refrescos',           name:'Agua 2lt',         price:15, stock:20, img:'Agua_2lt.jpg'},
  {id:9,  cat:'🥤 Refrescos',           name:'Ades',             price:15, stock:20, img:'Ades.png'},
  {id:10, cat:'⚡ Energizantes',        name:'Black',            price:10, stock:20, img:'Black.png'},
  {id:11, cat:'⚡ Energizantes',        name:'Ciclón',           price:8,  stock:20, img:'Ciclon.png'},
  {id:12, cat:'⚡ Energizantes',        name:'Powerade',         price:15, stock:20, img:'powerade.png'},
  // VITRINA
  {id:13, cat:'🍟 Snacks',              name:'Papa Frita',       price:7,  stock:30, img:'Papas_fritas.jpg'},
  {id:14, cat:'🍟 Snacks',              name:'Chipilo',          price:7,  stock:30, img:'Chipilo.jpg'},
  {id:15, cat:'🍟 Snacks',              name:'Maní',             price:7,  stock:30, img:'mani.jpg'},
  {id:16, cat:'🍟 Snacks',              name:'Nachos',           price:10, stock:20, img:'nachos.jpg'},
  {id:17, cat:'💊 Farmacia / Adultos',  name:'Pantera Suelto',   price:5,  stock:50, img:'pantera_suelto.jpeg'},
  {id:18, cat:'💊 Farmacia / Adultos',  name:'Maxmen Suelto',    price:7,  stock:50, img:'maxmen suelto.jpeg'},
  {id:19, cat:'💊 Farmacia / Adultos',  name:'Pantera Caja',     price:12, stock:20, img:'pantera caja.jpg'},
  {id:20, cat:'💊 Farmacia / Adultos',  name:'Maxmen Caja',      price:17, stock:20, img:'Maxmen caja.jpg'},
  {id:21, cat:'💊 Farmacia / Adultos',  name:'Día D',            price:35, stock:15, img:'dia_d.png'},
  {id:22, cat:'💊 Farmacia / Adultos',  name:'Viagra',           price:15, stock:15, img:'Maximo_viagra.png'},
  {id:23, cat:'🧴 Higiene',             name:'Alikal',           price:8,  stock:20, img:'alikal.png'},
  {id:24, cat:'🧴 Higiene',             name:'Encendedor',       price:2,  stock:30, img:'encendedor.jpg'},
  {id:25, cat:'🧴 Higiene',             name:'Jaboncillo',       price:10, stock:20, img:'Jaboncillo.jpg'},
  {id:26, cat:'🧴 Higiene',             name:'Rasurador',        price:5,  stock:20, img:'Rasurador.jpg'},
  {id:27, cat:'🧴 Higiene',             name:'Sedal',            price:4,  stock:20, img:'Sedal.png'},
  {id:28, cat:'🍺 Bebidas Alcohólicas', name:'Huary Botella',    price:20, stock:0,  img:'Huary_Botella.webp'},
  {id:29, cat:'🍺 Bebidas Alcohólicas', name:'Paceña Palito',    price:5,  stock:0,  img:'Paceña_Palito.png'},
];
let minibarProducts = [...DEFAULT_PRODUCTS];

let mbCart = {}; // { productId: qty }
let mbRoomNum = null;

// saveProducts() eliminado — el almacén/inventario es la fuente única de verdad

function openMinibar(num, event) {
  event.stopPropagation();
  mbRoomNum = num;
  mbCart = {};

  // Pre-load existing minibar items into cart
  const existing = occupancy[num]?.minibar || [];
  existing.forEach(i => { mbCart[i.id] = i.qty; });

  document.getElementById('mb-roomlabel').textContent = `Hab. ${num}`;
  renderMbProducts();
  renderCart();
  document.getElementById('minibarOverlay').classList.add('open');
}

function renderMbProducts() {
  const cats = {};
  minibarProducts.forEach(p => {
    if (!cats[p.cat]) cats[p.cat] = [];
    cats[p.cat].push(p);
  });

  let html = '';
  Object.entries(cats).forEach(([cat, prods]) => {
    html += `<div class="mb-cat-title">${cat}</div><div class="mb-products-grid">`;
    prods.forEach(p => {
      const qty = mbCart[p.id] || 0;
      const oos = p.stock <= 0;
      html += `
        <div class="mb-product${oos?' out-of-stock':''}" data-mbid="${p.id}"
          onclick="mbChange(${p.id},1)"
          oncontextmenu="mbChange(${p.id},-1);return false;">
          ${p.img
            ? `<img class="mb-product-img" src="/images/${p.img}" alt="${p.name}">`
            : `<div class="mb-product-noimg">📦</div>`}
          <div class="mb-product-foot">
            <div class="mb-product-name">${p.name}</div>
            <div class="mb-foot-row">
              <span class="mb-product-price">Bs ${p.price}</span>
              <span class="mb-qty-badge${qty>0?' mb-qty-active':''}" id="mbqty-${p.id}">${qty>0?qty:''}</span>
            </div>
          </div>
        </div>`;
    });
    html += '</div>';
  });
  document.getElementById('mbProducts').innerHTML = html;
}

function mbChange(id, delta) {
  const p = minibarProducts.find(p=>p.id===id);
  if (!p) return;
  const cur = mbCart[id] || 0;
  const newQty = Math.max(0, Math.min(p.stock, cur + delta));
  if (newQty === cur) return; // no cambió
  if (newQty === 0) delete mbCart[id];
  else mbCart[id] = newQty;
  const el = document.getElementById('mbqty-'+id);
  if (el) {
    el.textContent = newQty > 0 ? newQty : '';
    el.classList.toggle('mb-qty-active', newQty > 0);
  }
  // Animación flash +1 / -1
  const card = document.querySelector(`[data-mbid="${id}"]`);
  if (card) {
    const flash = document.createElement('div');
    flash.className = 'mb-flash ' + (delta > 0 ? 'add' : 'sub');
    flash.textContent = delta > 0 ? '+1' : '-1';
    card.appendChild(flash);
    setTimeout(() => flash.remove(), 700);
  }
  renderCart();
}

function renderCart() {
  const items = document.getElementById('cartItems');
  const keys = Object.keys(mbCart).filter(k=>mbCart[k]>0);
  if (!keys.length) {
    items.innerHTML = '<div class="cart-empty">Vacío</div>';
    document.getElementById('cartTotal').textContent = 'Bs 0';
    return;
  }
  let total = 0;
  items.innerHTML = keys.map(id => {
    const p = minibarProducts.find(p=>p.id==id);
    const subtotal = p.price * mbCart[id];
    total += subtotal;
    return `<div class="cart-item"><span class="cart-item-name">${p.name} ×${mbCart[id]}</span><span class="cart-item-price">Bs ${subtotal}</span></div>`;
  }).join('');
  document.getElementById('cartTotal').textContent = `Bs ${total}`;
}

async function confirmMinibar() {
  if (!mbRoomNum) return;
  const items = Object.keys(mbCart).filter(k=>mbCart[k]>0).map(id => {
    const p = minibarProducts.find(p=>p.id==id);
    return { id:p.id, inv_id:p.inv_id, name:p.name, price:p.price, qty:mbCart[id], cat:p.cat };
  });

  // Calcular diferencia respecto al estado anterior (por si se edita)
  const prev = occupancy[mbRoomNum].minibar || [];
  const prevMap = {};
  prev.forEach(i => { prevMap[i.id] = i.qty; });

  const MINIBAR_CATS_LOCAL = ['🍺 Bebidas Alcohólicas','🥤 Refrescos','⚡ Energizantes'];

  // Registrar ventas/devoluciones en inventario.db (sin tocar stock local)
  for (const i of items) {
    const diff = i.qty - (prevMap[i.id] || 0);
    const isMinibar = MINIBAR_CATS_LOCAL.includes(i.cat);
    if (diff > 0) {
      const endpoint = isMinibar ? 'inventario/vender' : 'inventario/vender-vitrina';
      await api(endpoint, 'POST', { producto_id: i.id, inv_id: i.inv_id, cantidad: diff, monto: i.price * diff, metodo_pago: 'habitacion' });
    } else if (diff < 0) {
      const endpoint = isMinibar ? 'inventario/devolver' : 'inventario/devolver-vitrina';
      await api(endpoint, 'POST', { producto_id: i.id, inv_id: i.inv_id, cantidad: Math.abs(diff) });
    }
  }
  // Si quitó items que antes estaban, también revertir
  for (const i of prev) {
    if (!items.find(x=>x.id===i.id)) {
      const prod = minibarProducts.find(p=>p.id===i.id);
      const isMinibar = prod && MINIBAR_CATS_LOCAL.includes(prod.cat);
      const endpoint = isMinibar ? 'inventario/devolver' : 'inventario/devolver-vitrina';
      await api(endpoint, 'POST', { producto_id: i.id, inv_id: prod?.inv_id, cantidad: i.qty });
    }
  }

  occupancy[mbRoomNum].minibar = items;
  saveOcc();
  backupToLocalStorage();

  // Recargar stock fresco del inventario
  try {
    const freshProducts = await api('inventario/productos-minibar');
    if (freshProducts && freshProducts.length) {
      minibarProducts = freshProducts.map(p => {
        if (!p.img) {
          const def = DEFAULT_PRODUCTS.find(d => d.id === p.id || d.name === p.name);
          if (def) p.img = def.img;
        }
        return p;
      });
    }
  } catch(e) { console.warn('No se pudo recargar stock:', e); }

  closeModal('minibarOverlay');
  render();
  const total = items.reduce((s,i)=>s+i.price*i.qty,0);
  toast(`🛒 Minibar Hab. ${mbRoomNum} — Bs ${total} agregado`);
}

function clearCart() {
  mbCart = {};
  renderMbProducts();
  renderCart();
}

function closeMinibarOutside(e) { if (e.target.id==='minibarOverlay') closeModal('minibarOverlay'); }

function openMinibarFromCheckout() {
  closeModal('checkoutOverlay');
  openMinibar(selectedRoom.num, { stopPropagation: ()=>{} });
}

function quickPrint(num, event) {
  event.stopPropagation();
  const room = ROOM_DEFS.find(r => r.num == num);
  const occ = occupancy[num];
  if (!room || !occ) return;
  const bill = calcBill(room, occ.checkin, Date.now());
  const minibarItems = occ.minibar || [];
  const minibarTotal = minibarItems.reduce((s,i)=>s+i.price*i.qty,0);
  const typeNames = { ac:'Aire Acondicionado', fan:'Ventilador', fan2:'Ventilador', simple:'Simple' };
  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`
    <html><head><title>Recibo Hab. ${num}</title>
    <style>
      body{font-family:monospace;padding:20px;max-width:320px;margin:0 auto}
      h2{text-align:center;margin-bottom:4px}
      .sub{text-align:center;color:#666;font-size:12px;margin-bottom:16px}
      hr{border:1px dashed #ccc;margin:10px 0}
      .row{display:flex;justify-content:space-between;margin:4px 0;font-size:13px}
      .total{font-size:16px;font-weight:bold}
    </style></head><body>
    <h2>🦋 Motel 23</h2>
    <div class="sub">Recibo de estadía</div>
    <hr>
    <div class="row"><span>Habitación:</span><span>${num} — ${typeNames[room.type]}</span></div>
    <div class="row"><span>Transporte:</span><span>${occ.guest}</span></div>
    <div class="row"><span>Entrada:</span><span>${NOCTA_TIME.formatDateTime(occ.checkin)}</span></div>
    <div class="row"><span>Tiempo:</span><span>${formatDuration(Date.now()-occ.checkin)}</span></div>
    <hr>
    <div class="row"><span>${bill.breakdown||'Noche completa'}</span><span>Bs ${bill.base||bill.total}</span></div>
    ${bill.extraLabel?`<div class="row"><span>${bill.extraLabel}</span><span>Bs ${bill.extraCharge}</span></div>`:''}
    ${minibarItems.length?`<hr><div class="row"><b>Minibar</b></div>${minibarItems.map(i=>`<div class="row"><span>${i.name} ×${i.qty}</span><span>Bs ${i.price*i.qty}</span></div>`).join('')}`:''}
    <hr>
    <div class="row total"><span>TOTAL:</span><span>Bs ${bill.total+minibarTotal}</span></div>
    <hr>
    <div style="text-align:center;font-size:11px;color:#999;margin-top:10px">Gracias por su visita</div>
    <script>window.print();<\/script>
    </body></html>
  `);
}

let inv_data = [];

async function inv_render() {
  inv_data = await api('inventario');
  inv_renderSelectores();
  inv_renderTabla();
}
const renderInventario = inv_render; // alias para compatibilidad

function inv_renderSelectores() {
  const optsCargar = minibarProducts.map(p =>
    `<option value="${p.id}" data-precio="${p.price}">${p.name} — Bs ${p.price}</option>`
  ).join('');

  const selCargar = document.getElementById('inv-select-prod');
  const selMover  = document.getElementById('inv-select-mover');
  if (selCargar) selCargar.innerHTML = optsCargar;
  if (selMover)  selMover.innerHTML  = inv_data.length ? inv_data.filter(p => p.almacen > 0).map(p =>
    `<option value="${p.producto_id}">${p.nombre} (almacén: ${p.almacen})</option>`
  ).join('') : '<option value="">— Sin stock en almacén —</option>';
}

function inv_renderTabla() {
  const el = document.getElementById('inv-tabla');
  if (!el) return;
  if (!inv_data.length) {
    el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:12px 0">Sin datos de inventario</div>';
    return;
  }
  const rows = inv_data.map(p => {
    const esperado = p.vendido * p.precio;
    const alertaN = p.nevera <= 2 && p.nevera > 0 ? ' style="color:var(--red)"' : '';
    const alertaV = (p.vitrina || 0) <= 2 && (p.vitrina || 0) > 0 ? ' style="color:var(--red)"' : '';
    return `<tr>
      <td style="padding:4px 6px">${p.nombre}</td>
      <td style="padding:4px 6px;text-align:center">${p.almacen}</td>
      <td style="padding:4px 6px;text-align:center"${alertaN}>${p.nevera}</td>
      <td style="padding:4px 6px;text-align:center"${alertaV}>${p.vitrina || 0}</td>
      <td style="padding:4px 6px;text-align:center">${p.vendido}</td>
      <td style="padding:4px 6px;text-align:right">Bs ${esperado}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="color:var(--text3);font-size:0.65rem;text-transform:uppercase">
          <th style="padding:4px 6px;text-align:left">Producto</th>
          <th style="padding:4px 6px">Almacén</th>
          <th style="padding:4px 6px">Nevera</th>
          <th style="padding:4px 6px">Vitrina</th>
          <th style="padding:4px 6px">Vendido</th>
          <th style="padding:4px 6px;text-align:right">Esperado</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}
const renderInvTabla = inv_renderTabla;

async function inv_cargar() {
  const sel = document.getElementById('inv-select-prod');
  const cantEl = document.getElementById('inv-cantidad');
  const cantidad = parseInt(cantEl.value);
  if (!sel.value || !cantidad || cantidad <= 0) { toast('Selecciona producto y cantidad'); return; }

  const prod = minibarProducts.find(p => p.id == sel.value);
  if (!prod) return;

  const res = await api('inventario/cargar', 'POST', {
    producto_id: prod.id,
    nombre: prod.name,
    precio: prod.price,
    cantidad
  });
  if (res.ok) {
    cantEl.value = '';
    toast(`${cantidad} ${prod.name} cargados al almacén`);
    inv_render();
  }
}
const invCargar = inv_cargar;

async function inv_mover() {
  const sel = document.getElementById('inv-select-mover');
  const cantEl = document.getElementById('inv-mover-cantidad');
  const destino = document.querySelector('input[name="inv-destino"]:checked')?.value || 'nevera';
  const cantidad = parseInt(cantEl.value);
  if (!sel.value || !cantidad || cantidad <= 0) { toast('Selecciona producto y cantidad'); return; }

  const endpoint = destino === 'vitrina' ? 'inventario/mover-vitrina' : 'inventario/mover';
  const res = await api(endpoint, 'POST', { producto_id: parseInt(sel.value), cantidad });
  if (res.ok) {
    cantEl.value = '';
    const prod = inv_data.find(p => p.producto_id == sel.value);
    toast(`${cantidad} ${prod?.nombre || ''} movidos a ${destino}`);
    inv_render();
  } else if (res.error) {
    toast(res.error);
  }
}
const invMover = inv_mover;

// ─── CONSUMO PERSONAL ───────────────────────────────────────────────────────
let personalCart = {};
let personalMode = 'personal'; // 'personal' = precio-1, 'vip' = gratis

function setPersonalMode(mode) {
  personalMode = mode;
  personalCart = {};
  const btnPersonal = document.getElementById('personal-mode-personal');
  const btnVip = document.getElementById('personal-mode-vip');
  const desc = document.getElementById('personal-mode-desc');
  if (mode === 'personal') {
    btnPersonal.style.background = 'var(--accent)'; btnPersonal.style.color = '#fff'; btnPersonal.style.borderColor = 'var(--accent)';
    btnVip.style.background = 'var(--surface2)'; btnVip.style.color = 'var(--text2)'; btnVip.style.borderColor = 'var(--border)';
    desc.textContent = 'Precio con Bs 1 de descuento';
  } else {
    btnVip.style.background = '#eab308'; btnVip.style.color = '#000'; btnVip.style.borderColor = '#eab308';
    btnPersonal.style.background = 'var(--surface2)'; btnPersonal.style.color = 'var(--text2)'; btnPersonal.style.borderColor = 'var(--border)';
    desc.textContent = 'Sin cobro — solo registro';
  }
  renderPersonalPanel();
}

function renderPersonalPanel() {
  const panel = document.getElementById('personal-productos');
  if (!panel) return;

  const cats = {};
  minibarProducts.forEach(p => {
    if (!cats[p.cat]) cats[p.cat] = [];
    cats[p.cat].push(p);
  });

  let html = '';
  Object.entries(cats).forEach(([cat, prods]) => {
    html += `<div style="font-size:0.7rem;color:var(--text3);margin:8px 0 4px;font-weight:600">${cat}</div>`;
    prods.forEach(p => {
      const qty = personalCart[p.id] || 0;
      const precioPersonal = personalMode === 'vip' ? 0 : Math.max(0, p.price - 1);
      const priceLabel = personalMode === 'vip'
        ? `<span style="font-size:0.65rem;color:#eab308;margin-left:4px">GRATIS</span><span style="font-size:0.55rem;color:var(--text3);text-decoration:line-through;margin-left:2px">Bs ${p.price}</span>`
        : `<span style="font-size:0.65rem;color:var(--accent);margin-left:4px">Bs ${precioPersonal}</span><span style="font-size:0.55rem;color:var(--text3);text-decoration:line-through;margin-left:2px">Bs ${p.price}</span>`;
      html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <span style="font-size:0.8rem">${p.name}</span>
          ${priceLabel}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <button onclick="personalChange(${p.id},-1)" style="width:22px;height:22px;border-radius:50%;border:1px solid var(--border);background:var(--bg2);cursor:pointer;font-size:0.75rem">−</button>
          <span style="min-width:18px;text-align:center;font-weight:600;font-size:0.85rem">${qty}</span>
          <button onclick="personalChange(${p.id},1)" style="width:22px;height:22px;border-radius:50%;border:1px solid var(--border);background:var(--bg2);cursor:pointer;font-size:0.75rem">+</button>
        </div>
      </div>`;
    });
  });

  panel.innerHTML = html;
  renderPersonalTotal();
}

function personalChange(id, delta) {
  const cur = personalCart[id] || 0;
  const newQty = Math.max(0, cur + delta);
  if (newQty === 0) delete personalCart[id];
  else personalCart[id] = newQty;
  renderPersonalPanel();
}

function renderPersonalTotal() {
  const el = document.getElementById('personal-total');
  if (!el) return;
  let total = 0;
  Object.entries(personalCart).forEach(([id, qty]) => {
    const prod = minibarProducts.find(p => p.id == id);
    if (prod) {
      const precio = personalMode === 'vip' ? 0 : Math.max(0, prod.price - 1);
      total += precio * qty;
    }
  });
  el.textContent = personalMode === 'vip' ? 'Bs 0 (registro)' : `Bs ${total}`;
  const btn = document.getElementById('personal-confirmar-btn');
  if (btn) btn.disabled = Object.keys(personalCart).length === 0;
}

async function confirmPersonalSale() {
  const items = Object.entries(personalCart);
  if (!items.length) { toast('Carrito vacío'); return; }

  const promptText = personalMode === 'vip' ? 'Nombre (V.I.P.):' : 'Nombre del empleado:';
  const nombre = prompt(promptText);
  if (!nombre || !nombre.trim()) { toast('Debe ingresar el nombre'); return; }

  const NEVERA_CATS = ['🍺 Bebidas Alcohólicas','🥤 Refrescos','⚡ Energizantes'];
  const tipoConsumo = personalMode === 'vip' ? 'consumo-vip' : 'consumo-personal';
  const emoji = personalMode === 'vip' ? '👑' : '👷';
  const metodoPago = personalMode === 'vip' ? 'vip' : 'efectivo';
  let total = 0;
  const detalles = [];

  for (const [id, qty] of items) {
    const prod = minibarProducts.find(p => p.id == id);
    if (!prod) continue;
    const precioPersonal = personalMode === 'vip' ? 0 : Math.max(0, prod.price - 1);
    total += precioPersonal * qty;
    detalles.push({ id: prod.id, inv_id: prod.inv_id, name: prod.name, price: precioPersonal, priceNormal: prod.price, qty });

    // Descontar stock de nevera o vitrina según categoría
    const isMinibar = NEVERA_CATS.includes(prod.cat);
    const endpoint = isMinibar ? 'inventario/vender' : 'inventario/vender-vitrina';
    await api(endpoint, 'POST', { producto_id: prod.id, inv_id: prod.inv_id, cantidad: qty, tipo_consumo: tipoConsumo, monto: precioPersonal * qty, metodo_pago: metodoPago });
  }

  // Registrar en turno
  const entry = {
    room: null,
    type: tipoConsumo,
    guest: nombre.trim(),
    checkinTs: Date.now(),
    checkoutTs: Date.now(),
    bill: { time: 0, rate: 0, total: 0 },
    minibar: [],
    personalItems: detalles,
    total: total,
    pago: {
      hab: { monto: 0, cash: 0, qr: 0, comision: 0, cambio: 0 },
      minibar: { monto: 0, cash: 0, qr: 0, comision: 0, cambio: 0 },
      personal: {
        monto: total,
        tipo: personalMode,
        empleado: nombre.trim(),
        descuento: detalles.reduce((s, d) => s + d.qty, 0),
        cash: total,
        qr: 0,
        comision: 0,
        cambio: 0
      }
    }
  };

  currentShift.entries.push(entry);
  await saveShift();
  if (total > 0) registrarAsientoConsumo(personalMode, total);

  // Recargar stock fresco
  try {
    const freshProducts = await api('inventario/productos-minibar');
    if (freshProducts && freshProducts.length) {
      minibarProducts = freshProducts.map(p => {
        if (!p.img) {
          const def = DEFAULT_PRODUCTS.find(d => d.id === p.id || d.name === p.name);
          if (def) p.img = def.img;
        }
        return p;
      });
    }
  } catch(e) {}

  // Limpiar
  personalCart = {};
  renderPersonalPanel();
  renderCaja();
  render();

  const nombres = detalles.map(d => `${d.qty}x ${d.name}`).join(', ');
  const montoText = personalMode === 'vip' ? 'GRATIS' : `Bs ${total}`;
  toast(`${emoji} ${nombre}: ${nombres} — ${montoText}`);
}

// ─── VENTA DIRECTA VITRINA (legacy) ────────────────────────────────────────
let inv_vitrinaCart = {};

function inv_openVitrina() {
  inv_vitrinaCart = {};
  inv_renderVitrina();
  openDrawer('vitrina', document.getElementById('rail-vitrina'));
}

function inv_renderVitrina() {
  const panel = document.getElementById('panel-vitrina-productos');
  if (!panel) return;

  // Filtrar solo productos de vitrina (no-bebidas)
  const vitProds = minibarProducts.filter(p => !MINIBAR_CATS.includes(p.cat));
  const cats = [...new Set(vitProds.map(p => p.cat))];

  let html = '';
  cats.forEach(cat => {
    const prods = vitProds.filter(p => p.cat === cat);
    html += `<div style="font-size:0.7rem;color:var(--text3);margin:8px 0 4px;font-weight:600">${cat}</div>`;
    prods.forEach(p => {
      const qty = inv_vitrinaCart[p.id] || 0;
      // Buscar stock en vitrina desde inv_data
      const inv = inv_data.find(i => i.producto_id === p.id);
      const stock = inv ? (inv.vitrina || 0) : 0;
      html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <span style="font-size:0.8rem">${p.name}</span>
          <span style="font-size:0.65rem;color:var(--text3);margin-left:4px">Bs ${p.price} · stock: ${stock}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <button onclick="inv_vitrinaChange(${p.id},-1)" style="width:24px;height:24px;border-radius:50%;border:1px solid var(--border);background:var(--bg2);cursor:pointer;font-size:0.8rem">−</button>
          <span style="min-width:20px;text-align:center;font-weight:600">${qty}</span>
          <button onclick="inv_vitrinaChange(${p.id},1)" style="width:24px;height:24px;border-radius:50%;border:1px solid var(--border);background:var(--bg2);cursor:pointer;font-size:0.8rem">+</button>
        </div>
      </div>`;
    });
  });

  panel.innerHTML = html;
  inv_renderVitrinaTotal();
}

function inv_vitrinaChange(id, delta) {
  const cur = inv_vitrinaCart[id] || 0;
  const newQty = Math.max(0, cur + delta);
  if (newQty === 0) delete inv_vitrinaCart[id];
  else inv_vitrinaCart[id] = newQty;
  inv_renderVitrina();
}

function inv_renderVitrinaTotal() {
  const el = document.getElementById('vitrina-total');
  if (!el) return;
  let total = 0;
  Object.entries(inv_vitrinaCart).forEach(([id, qty]) => {
    const prod = minibarProducts.find(p => p.id == id);
    if (prod) total += prod.price * qty;
  });
  el.textContent = `Bs ${total}`;
  const btn = document.getElementById('vitrina-confirmar-btn');
  if (btn) btn.disabled = total === 0;
}

async function inv_confirmVitrinaSale() {
  const items = Object.entries(inv_vitrinaCart);
  if (!items.length) { toast('Carrito vacío'); return; }

  // Determinar método de pago
  const method = document.querySelector('input[name="vitrina-pago"]:checked')?.value || 'cash';

  let total = 0;
  const detalles = [];

  for (const [id, qty] of items) {
    const prod = minibarProducts.find(p => p.id == id);
    if (!prod) continue;
    const monto = prod.price * qty;
    total += monto;
    detalles.push({ id: prod.id, name: prod.name, price: prod.price, qty });

    // Registrar venta en inventario
    await api('inventario/vender-vitrina', 'POST', { producto_id: prod.id, cantidad: qty });
  }

  // Registrar en turno como entrada vitrina-directa
  const entry = {
    room: null,
    type: 'vitrina-directa',
    guest: null,
    checkinTs: Date.now(),
    checkoutTs: Date.now(),
    bill: { time: 0, rate: 0, total: 0 },
    minibar: [],
    vitrinaItems: detalles,
    total: total,
    pago: {
      hab: { monto: 0, cash: 0, qr: 0, comision: 0, cambio: 0 },
      minibar: { monto: 0, cash: 0, qr: 0, comision: 0, cambio: 0 },
      vitrina: {
        monto: total,
        cash: method === 'cash' ? total : 0,
        qr: method === 'qr' ? total : 0,
        comision: 0,
        cambio: 0
      }
    }
  };

  currentShift.entries.push(entry);
  await saveShift();

  // Limpiar carrito
  inv_vitrinaCart = {};
  inv_renderVitrina();
  inv_render();
  renderCaja();
  render();

  const nombres = detalles.map(d => `${d.qty}x ${d.name}`).join(', ');
  toast(`Venta vitrina: ${nombres} — Bs ${total} (${method === 'cash' ? 'efectivo' : 'QR'})`);
}

// ─── INVENTARIO / ALMACÉN (MODAL) ────────────────────────────────────────────
function openInventario() {
  // Crear overlay si no existe
  let overlay = document.getElementById('inventario-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'inventario-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);opacity:0;transition:opacity 0.3s ease';
    overlay.innerHTML = `
      <div style="position:relative;width:94vw;height:92vh;border-radius:16px;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.5);border:1px solid rgba(139,92,246,0.3)">
        <div style="position:absolute;top:0;left:0;right:0;height:40px;background:linear-gradient(135deg,#1a1a2e,#16213e);display:flex;align-items:center;justify-content:space-between;padding:0 16px;z-index:2">
          <span style="font-family:Outfit,sans-serif;font-weight:700;font-size:0.85rem;color:#a78bfa;letter-spacing:0.5px">📦 ALMACÉN / INVENTARIO</span>
          <button onclick="closeInventario()" style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);color:#f87171;border-radius:8px;padding:4px 14px;font-size:0.8rem;cursor:pointer;font-weight:700;font-family:Outfit,sans-serif;transition:all 0.2s" onmouseover="this.style.background='rgba(239,68,68,0.4)'" onmouseout="this.style.background='rgba(239,68,68,0.2)'">✕ Cerrar <span style="font-size:0.65rem;opacity:0.7;margin-left:4px">ESC</span></button>
        </div>
        <iframe id="inventario-iframe" src="/almacen" style="width:100%;height:100%;border:none;padding-top:40px;background:#f5f6fa"></iframe>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeInventario(); });
  }
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.style.opacity = '1');
  document.addEventListener('keydown', inventarioEscHandler);
}

function closeInventario() {
  const overlay = document.getElementById('inventario-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
  }
  document.removeEventListener('keydown', inventarioEscHandler);
}

function inventarioEscHandler(e) {
  if (e.key === 'Escape') closeInventario();
}
