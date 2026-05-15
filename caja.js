// ==============================================================
// TACO PARADO · CAJA POS · LÓGICA COMPLETA
// ==============================================================

// STATE
let currentUser = null;
let userRole = null;
let userSedeId = null;
let sedes = [];
let selectedSedeId = null;
let mesas = [];
let menuProductos = [];
let categoriaActiva = 'Todo';

// Pedido en curso
let pedidoActual = {
  id: null,                    // null = nuevo, uuid = editando borrador
  mesa_id: null,
  mesa_numero: null,
  modalidad: 'mesa',           // 'mesa' o 'llevar'
  cliente_id: null,
  cliente_nombre: null,
  cliente_tel: null,
  items: [],                   // [{producto_id, nombre, precio, cantidad, opciones, subtotal}]
  propina: 0,
  notas: ''
};

let pedidosHistorial = [];
let pedidoCobrado = null;      // último pedido cobrado (para imprimir)

const ORDEN_CATEGORIAS = ['Tacos', 'Bandejas', 'Hamburguesas', 'Nachos', 'Burritos', 'Bebidas'];

// ============= HELPERS =============
function fmt(n) { return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0); }
function fmtMoney(n) { return '$' + fmt(n); }
function escapeHTML(s) { return (s||'').toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 3000);
}
async function waitForSupabase() { while (!window.supabase) await new Promise(r => setTimeout(r, 50)); }

// ============= AUTH =============
async function checkAuth() {
  await waitForSupabase();
  const { data: { session } } = await window.supabase.auth.getSession();
  if (!session) { window.location.href = 'admin.html'; return; }
  currentUser = session.user;

  const { data: roles } = await window.supabase
    .from('usuarios_roles').select('rol, sede_id').eq('user_id', currentUser.id);

  if (!roles || roles.length === 0) {
    showSinAcceso('Tu cuenta no tiene permisos para operar la caja.');
    return;
  }
  const r = roles[0];
  userRole = r.rol;
  userSedeId = r.sede_id;

  if (!['admin', 'cajero', 'lider_punto'].includes(userRole)) {
    showSinAcceso('Solo administradores, cajeros y líderes pueden operar la caja.');
    return;
  }

  await loadSedes();
  showApp();
}

function showSinAcceso(msg) {
  document.getElementById('loading-screen').innerHTML = `
    <div style="text-align:center; padding:60px 20px; color:#fff;">
      <div style="font-size:48px; margin-bottom:16px;">🚫</div>
      <div style="font-family:'Bungee',sans-serif; font-size:20px; margin-bottom:8px;">SIN ACCESO</div>
      <div style="font-family:'Inter',sans-serif; font-size:14px; opacity:0.85; margin-bottom:24px;">${msg}</div>
      <a href="admin.html" style="color:#FFD24D; font-weight:700; text-decoration:none;">← Volver al panel</a>
    </div>`;
}

async function loadSedes() {
  const { data } = await window.supabase.from('sedes').select('*').eq('activa', true).order('nombre');
  sedes = data || [];
  selectedSedeId = (userRole === 'admin') ? (sedes[0]?.id || null) : userSedeId;
}

async function showApp() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('userEmail').textContent = currentUser.email;
  document.getElementById('userRole').textContent = userRole.toUpperCase();

  const sede = sedes.find(s => s.id === selectedSedeId);
  document.getElementById('sedeTag').textContent = `📍 ${sede?.nombre || '—'}`;

  await cargarMenu();
  await cargarMesas();
  await cargarStats();
  document.getElementById('filtroFecha').value = new Date().toISOString().slice(0, 10);
  await loadPedidos();
  setupRealtime();
}

window.logout = async function() {
  await window.supabase.auth.signOut();
  window.location.href = 'admin.html';
};

// ============= TABS =============
window.changeTab = function(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.panel === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  if (name === 'llevar') {
    pedidoActual = nuevoPedidoVacio('llevar');
    renderMenu('llevar');
    renderCart('llevar');
  }
  if (name === 'historial') loadPedidos();
};

function nuevoPedidoVacio(modalidad) {
  return {
    id: null,
    mesa_id: null,
    mesa_numero: null,
    modalidad,
    cliente_id: null,
    cliente_nombre: null,
    cliente_tel: null,
    items: [],
    propina: 0,
    notas: ''
  };
}

// ============= CARGAR MENÚ =============
async function cargarMenu() {
  const { data } = await window.supabase
    .from('productos_menu')
    .select('*')
    .eq('activo', true)
    .order('orden');
  menuProductos = (data || []).sort((a, b) => {
    const ia = ORDEN_CATEGORIAS.indexOf(a.categoria);
    const ib = ORDEN_CATEGORIAS.indexOf(b.categoria);
    const va = ia === -1 ? 999 : ia;
    const vb = ib === -1 ? 999 : ib;
    if (va !== vb) return va - vb;
    return (a.orden || 0) - (b.orden || 0);
  });
}

function renderMenu(contexto) {
  // contexto: 'llevar' o 'mesa'
  const sufijo = contexto === 'mesa' ? 'Mesa' : 'Llevar';
  const cats = ['Todo', ...new Set(menuProductos.map(p => p.categoria))];

  const catsContainer = document.getElementById('menuCats' + sufijo);
  catsContainer.innerHTML = cats.map(c => `
    <button class="cat-btn ${categoriaActiva === c ? 'active' : ''}" onclick="setCategoria('${c}', '${contexto}')">${escapeHTML(c)}</button>
  `).join('');

  const grid = document.getElementById('menuGrid' + sufijo);
  let productos = menuProductos;
  if (categoriaActiva !== 'Todo') {
    productos = productos.filter(p => p.categoria === categoriaActiva);
  }

  grid.innerHTML = productos.map(p => `
    <div class="prod-btn ${p.agotado ? 'agotado' : ''}" onclick="${p.agotado ? '' : `agregarAlPedido('${p.id}')`}">
      <div class="prod-emoji">${p.emoji || '🌮'}</div>
      <div class="prod-nombre">${escapeHTML(p.nombre)}</div>
      <div class="prod-precio">${fmtMoney(p.precio)}</div>
    </div>
  `).join('');
}

window.setCategoria = function(cat, contexto) {
  categoriaActiva = cat;
  renderMenu(contexto);
};

// ============= PEDIDO =============
window.agregarAlPedido = async function(productoId) {
  const producto = menuProductos.find(p => p.id === productoId);
  if (!producto || producto.agotado) return;

  // Si tiene opciones, pedirlas
  let opciones = null;
  if (producto.opciones && producto.opciones.length > 0) {
    opciones = await pedirOpciones(producto);
    if (!opciones) return;  // canceló
  }

  // Buscar si ya existe el mismo item con mismas opciones
  const opcKey = opciones ? JSON.stringify(opciones) : '';
  const existente = pedidoActual.items.find(x =>
    x.producto_id === productoId && (JSON.stringify(x.opciones || null) === (opciones ? JSON.stringify(opciones) : 'null'))
  );

  if (existente) {
    existente.cantidad++;
    existente.subtotal = existente.cantidad * existente.precio_unitario;
  } else {
    pedidoActual.items.push({
      producto_id: producto.id,
      nombre: producto.nombre,
      precio_unitario: producto.precio,
      cantidad: 1,
      subtotal: producto.precio,
      opciones,
      emoji: producto.emoji
    });
  }

  // Re-render según contexto
  const contexto = pedidoActual.modalidad === 'mesa' ? 'mesa' : 'llevar';
  renderCart(contexto);

  // Si es mesa, guardar borrador en BD
  if (pedidoActual.modalidad === 'mesa' && pedidoActual.mesa_id) {
    await guardarBorradorMesa();
  }
};

async function pedirOpciones(producto) {
  // Por simplicidad, prompt sencillo. En producción se podría hacer modal bonito
  return new Promise(resolve => {
    const grupos = producto.opciones;
    const elegidas = [];
    for (const g of grupos) {
      if (g.tipo === 'multi-quantity') {
        // Para multi-quantity, abrir un prompt por cada valor (limitado por total)
        const items = {};
        let restante = g.total || 0;
        for (const v of g.valores) {
          if (restante === 0) break;
          const cant = parseInt(prompt(`${producto.nombre}\n${g.label}\n¿Cuántos ${v}? (Faltan: ${restante})`, '0')) || 0;
          if (cant > 0 && cant <= restante) {
            items[v] = cant;
            restante -= cant;
          }
        }
        if (Object.keys(items).length === 0) { resolve(null); return; }
        elegidas.push({ label: g.label, tipo: 'multi-quantity', items });
      } else {
        const opciones = g.valores.map((v, i) => `${i+1}. ${v}`).join('\n');
        const seleccion = prompt(`${producto.nombre}\n${g.label}:\n${opciones}\n\nNúmero de opción:`);
        const idx = parseInt(seleccion) - 1;
        if (idx < 0 || idx >= g.valores.length) { resolve(null); return; }
        elegidas.push({ label: g.label, tipo: 'single', valor: g.valores[idx] });
      }
    }
    resolve(elegidas);
  });
}

function renderCart(contexto) {
  const sufijo = contexto === 'mesa' ? 'Mesa' : 'Llevar';
  const itemsContainer = document.getElementById('cartItems' + sufijo);
  const totalesContainer = document.getElementById('cartTotales' + sufijo);
  const btnCobrar = document.getElementById('btnCobrar' + sufijo);

  // Cliente label
  const clienteLabel = document.getElementById('clienteLabel' + (contexto === 'mesa' ? 'Mesa' : ''));
  if (clienteLabel) {
    if (pedidoActual.cliente_nombre) {
      clienteLabel.innerHTML = `✓ ${escapeHTML(pedidoActual.cliente_nombre)} <span style="font-size:9px; opacity:0.7;">(toca para cambiar)</span>`;
    } else {
      clienteLabel.innerHTML = `👤 + Asociar cliente`;
    }
  }

  if (pedidoActual.items.length === 0) {
    itemsContainer.innerHTML = `
      <div class="cart-empty">
        <div class="emoji">🌮</div>
        <div class="lbl">SIN PRODUCTOS</div>
        <div style="font-size: 11px;">Toca un producto del menú</div>
      </div>`;
    totalesContainer.style.display = 'none';
    btnCobrar.disabled = true;
    return;
  }

  itemsContainer.innerHTML = pedidoActual.items.map((item, idx) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-nombre">${item.emoji || '🌮'} ${escapeHTML(item.nombre)}</div>
        ${renderOpcionesTexto(item.opciones)}
      </div>
      <div class="cart-item-controls">
        <button onclick="cambiarCantItem(${idx}, -1)">−</button>
        <span class="cart-item-cant">${item.cantidad}</span>
        <button onclick="cambiarCantItem(${idx}, 1)">+</button>
      </div>
      <div class="cart-item-sub">${fmtMoney(item.subtotal)}</div>
      <button class="cart-item-x" onclick="quitarItem(${idx})">✕ Quitar</button>
    </div>
  `).join('');

  const subtotal = pedidoActual.items.reduce((s, x) => s + x.subtotal, 0);
  const propina = pedidoActual.propina || 0;
  const total = subtotal + propina;

  totalesContainer.style.display = 'block';
  totalesContainer.innerHTML = `
    <div class="cart-row">
      <span>Subtotal</span>
      <span>${fmtMoney(subtotal)}</span>
    </div>
    <div class="cart-row">
      <span>Propina <button onclick="abrirPropina()" style="background: var(--cream); border: 1px solid var(--ink); padding: 1px 6px; border-radius: 4px; font-size: 10px; cursor: pointer; margin-left: 4px;">editar</button></span>
      <span>${fmtMoney(propina)}</span>
    </div>
    <div class="cart-row total">
      <span>TOTAL</span>
      <span>${fmtMoney(total)}</span>
    </div>
  `;
  btnCobrar.disabled = false;
}

function renderOpcionesTexto(opciones) {
  if (!opciones || opciones.length === 0) return '';
  const partes = opciones.map(o => {
    if (o.tipo === 'multi-quantity') {
      return Object.entries(o.items).map(([n, c]) => `${c} ${n}`).join(' + ');
    }
    return o.valor;
  });
  return `<div class="cart-item-opciones">${escapeHTML(partes.join(' · '))}</div>`;
}

window.cambiarCantItem = function(idx, delta) {
  const item = pedidoActual.items[idx];
  if (!item) return;
  item.cantidad += delta;
  if (item.cantidad <= 0) {
    pedidoActual.items.splice(idx, 1);
  } else {
    item.subtotal = item.cantidad * item.precio_unitario;
  }
  const contexto = pedidoActual.modalidad === 'mesa' ? 'mesa' : 'llevar';
  renderCart(contexto);
  if (pedidoActual.modalidad === 'mesa' && pedidoActual.mesa_id) {
    guardarBorradorMesa();
  }
};

window.quitarItem = function(idx) {
  pedidoActual.items.splice(idx, 1);
  const contexto = pedidoActual.modalidad === 'mesa' ? 'mesa' : 'llevar';
  renderCart(contexto);
  if (pedidoActual.modalidad === 'mesa' && pedidoActual.mesa_id) {
    guardarBorradorMesa();
  }
};

window.abrirPropina = function() {
  const subtotal = pedidoActual.items.reduce((s, x) => s + x.subtotal, 0);
  const sugerencia = Math.round(subtotal * 0.1 / 100) * 100;
  const valor = prompt(`Propina (sugerencia 10%: ${fmtMoney(sugerencia)})\n\nIngresa el monto:`, pedidoActual.propina || sugerencia);
  if (valor === null) return;
  pedidoActual.propina = parseInt(valor) || 0;
  const contexto = pedidoActual.modalidad === 'mesa' ? 'mesa' : 'llevar';
  renderCart(contexto);
};

window.limpiarCarrito = function() {
  if (pedidoActual.items.length > 0 && !confirm('¿Cancelar el pedido actual?')) return;
  pedidoActual = nuevoPedidoVacio(pedidoActual.modalidad);
  renderCart(pedidoActual.modalidad === 'mesa' ? 'mesa' : 'llevar');
};

// ============= MESAS =============
async function cargarMesas() {
  const { data } = await window.supabase
    .from('mesas')
    .select('*')
    .eq('sede_id', selectedSedeId)
    .eq('activa', true)
    .order('numero');
  mesas = data || [];
  renderMesas();
}

function renderMesas() {
  const cont = document.getElementById('mesasContainer');
  cont.innerHTML = mesas.map(m => {
    const estadoClass = m.estado || 'libre';
    return `
      <div class="mesa-card ${estadoClass}" onclick="abrirMesa('${m.id}', ${m.numero})">
        <div class="mesa-num">${m.numero}</div>
        <div class="mesa-label">${m.estado === 'ocupada' ? '🟠 OCUPADA' : m.estado === 'reservada' ? '🔴 RESERVADA' : '🟢 LIBRE'}</div>
        ${m.estado === 'ocupada' ? `<div class="mesa-info">Pedido en curso</div>` : ''}
      </div>
    `;
  }).join('') + `
    <div class="mesa-add" onclick="agregarMesa()">
      <div class="plus">+</div>
      <div class="lbl">Agregar mesa</div>
    </div>
  `;
}

window.agregarMesa = async function() {
  const num = prompt('Número de la nueva mesa:');
  if (!num) return;
  try {
    const { error } = await window.supabase.from('mesas').insert({
      sede_id: selectedSedeId,
      numero: parseInt(num),
      capacidad: 4
    });
    if (error) throw error;
    toast('✓ Mesa creada');
    await cargarMesas();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

window.abrirMesa = async function(mesaId, mesaNumero) {
  const mesa = mesas.find(m => m.id === mesaId);
  if (!mesa) return;

  pedidoActual = nuevoPedidoVacio('mesa');
  pedidoActual.mesa_id = mesaId;
  pedidoActual.mesa_numero = mesaNumero;

  // Si la mesa tiene pedido en curso, cargarlo
  if (mesa.pedido_actual_id) {
    const { data: ped } = await window.supabase.from('pedidos').select('*').eq('id', mesa.pedido_actual_id).maybeSingle();
    const { data: items } = await window.supabase.from('pedido_items').select('*').eq('pedido_id', mesa.pedido_actual_id);
    if (ped) {
      pedidoActual.id = ped.id;
      pedidoActual.cliente_id = ped.cliente_id;
      pedidoActual.cliente_nombre = ped.cliente_nombre;
      pedidoActual.cliente_tel = ped.cliente_tel;
      pedidoActual.propina = ped.propina || 0;
      pedidoActual.notas = ped.notas || '';
      if (items) {
        pedidoActual.items = items.map(i => ({
          producto_id: i.producto_id,
          nombre: i.nombre,
          precio_unitario: i.precio_unitario,
          cantidad: i.cantidad,
          subtotal: i.subtotal,
          opciones: i.opciones,
          emoji: menuProductos.find(p => p.id === i.producto_id)?.emoji
        }));
      }
    }
  }

  document.getElementById('mesaModalTitulo').textContent = `🍽️ MESA ${mesaNumero}`;
  document.getElementById('modalMesa').classList.add('active');
  renderMenu('mesa');
  renderCart('mesa');
};

window.cerrarMesa = function() {
  document.getElementById('modalMesa').classList.remove('active');
  pedidoActual = nuevoPedidoVacio('llevar');
};

async function guardarBorradorMesa() {
  // Crear o actualizar pedido borrador
  const subtotal = pedidoActual.items.reduce((s, x) => s + x.subtotal, 0);
  const total = subtotal + (pedidoActual.propina || 0);

  if (!pedidoActual.id) {
    // Crear nuevo
    const { data, error } = await window.supabase.from('pedidos').insert({
      sede_id: selectedSedeId,
      mesa_id: pedidoActual.mesa_id,
      mesa_numero: pedidoActual.mesa_numero,
      cliente_id: pedidoActual.cliente_id,
      cliente_nombre: pedidoActual.cliente_nombre,
      cliente_tel: pedidoActual.cliente_tel,
      subtotal,
      propina: pedidoActual.propina || 0,
      total,
      modalidad: 'mesa',
      estado: 'borrador',
      cajero_id: currentUser.id,
      cajero_email: currentUser.email
    }).select().single();
    if (error) { console.error(error); return; }
    pedidoActual.id = data.id;
    // Insertar items
    if (pedidoActual.items.length > 0) {
      const itemsInsert = pedidoActual.items.map(i => ({
        pedido_id: pedidoActual.id,
        producto_id: i.producto_id,
        nombre: i.nombre,
        precio_unitario: i.precio_unitario,
        cantidad: i.cantidad,
        subtotal: i.subtotal,
        opciones: i.opciones
      }));
      await window.supabase.from('pedido_items').insert(itemsInsert);
    }
    await cargarMesas();  // refrescar visualización
  } else {
    // Actualizar
    await window.supabase.from('pedidos').update({
      cliente_id: pedidoActual.cliente_id,
      cliente_nombre: pedidoActual.cliente_nombre,
      cliente_tel: pedidoActual.cliente_tel,
      subtotal,
      propina: pedidoActual.propina || 0,
      total,
      updated_at: new Date().toISOString()
    }).eq('id', pedidoActual.id);

    // Reemplazar items
    await window.supabase.from('pedido_items').delete().eq('pedido_id', pedidoActual.id);
    if (pedidoActual.items.length > 0) {
      const itemsInsert = pedidoActual.items.map(i => ({
        pedido_id: pedidoActual.id,
        producto_id: i.producto_id,
        nombre: i.nombre,
        precio_unitario: i.precio_unitario,
        cantidad: i.cantidad,
        subtotal: i.subtotal,
        opciones: i.opciones
      }));
      await window.supabase.from('pedido_items').insert(itemsInsert);
    }
  }
}

window.cancelarPedidoMesa = async function() {
  if (!confirm('¿Cancelar este pedido? Se liberará la mesa.')) return;
  if (pedidoActual.id) {
    await window.supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', pedidoActual.id);
  }
  cerrarMesa();
  await cargarMesas();
  toast('✓ Pedido cancelado');
};

// ============= BUSCADOR CLIENTES =============
window.abrirBuscadorCliente = function() {
  document.getElementById('modalCliente').classList.add('active');
  document.getElementById('buscarClienteInput').value = '';
  document.getElementById('resultadosClientes').innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-soft); font-size: 13px;">Escribe para buscar...</div>';
  setTimeout(() => document.getElementById('buscarClienteInput').focus(), 100);
};

window.cerrarBuscadorCliente = function() {
  document.getElementById('modalCliente').classList.remove('active');
};

let buscarClientesTimeout;
window.buscarClientes = function(q) {
  clearTimeout(buscarClientesTimeout);
  if (!q || q.trim().length < 2) {
    document.getElementById('resultadosClientes').innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-soft); font-size: 13px;">Escribe al menos 2 caracteres</div>';
    return;
  }
  buscarClientesTimeout = setTimeout(async () => {
    const query = `%${q.trim()}%`;
    const { data } = await window.supabase
      .from('clientes')
      .select('id, nombre, tel, tier, visitas_totales')
      .or(`nombre.ilike.${query},id.ilike.${query},tel.ilike.${query}`)
      .limit(10);
    renderResultadosClientes(data || []);
  }, 300);
};

function renderResultadosClientes(clientes) {
  const cont = document.getElementById('resultadosClientes');
  if (clientes.length === 0) {
    cont.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-soft); font-size: 13px;">No se encontraron clientes</div>';
    return;
  }
  cont.innerHTML = clientes.map(c => `
    <div onclick="seleccionarCliente('${c.id}', '${escapeHTML(c.nombre).replace(/'/g, '&#39;')}', '${escapeHTML(c.tel || '')}')" 
         style="padding: 10px; border: 2px solid var(--border); border-radius: 8px; margin-bottom: 6px; cursor: pointer; background: white; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-weight: 800; color: var(--ink);">${escapeHTML(c.nombre)}</div>
        <div style="font-size: 11px; color: var(--text-soft);">${escapeHTML(c.id)} · ${escapeHTML(c.tel || 'Sin tel')}</div>
      </div>
      <div style="text-align: right;">
        <div style="background: var(--orange); color: white; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 800;">${(c.tier || 'BRONCE').toUpperCase()}</div>
        <div style="font-size: 10px; color: var(--text-soft); margin-top: 2px;">${c.visitas_totales || 0} visitas</div>
      </div>
    </div>
  `).join('');
}

window.seleccionarCliente = function(id, nombre, tel) {
  pedidoActual.cliente_id = id;
  pedidoActual.cliente_nombre = nombre.replace(/&#39;/g, "'");
  pedidoActual.cliente_tel = tel;
  cerrarBuscadorCliente();
  const contexto = pedidoActual.modalidad === 'mesa' ? 'mesa' : 'llevar';
  renderCart(contexto);
  if (pedidoActual.modalidad === 'mesa' && pedidoActual.mesa_id) {
    guardarBorradorMesa();
  }
  toast(`✓ Cliente: ${pedidoActual.cliente_nombre}`);
};

window.quitarCliente = function() {
  pedidoActual.cliente_id = null;
  pedidoActual.cliente_nombre = null;
  pedidoActual.cliente_tel = null;
  cerrarBuscadorCliente();
  const contexto = pedidoActual.modalidad === 'mesa' ? 'mesa' : 'llevar';
  renderCart(contexto);
};

// ============= COBRO =============
let metodoPagoActual = 'efectivo';

window.abrirCobro = function() {
  if (pedidoActual.items.length === 0) return;
  const total = pedidoActual.items.reduce((s, x) => s + x.subtotal, 0) + (pedidoActual.propina || 0);
  document.getElementById('cobroTotal').textContent = fmtMoney(total);
  document.getElementById('efectivoRecibido').value = '';
  document.getElementById('vueltoCalc').textContent = '$0';
  document.getElementById('notasCobro').value = '';
  seleccionarMetodo('efectivo');
  document.getElementById('modalCobro').classList.add('active');
  setTimeout(() => document.getElementById('efectivoRecibido').focus(), 100);
};

window.cerrarCobro = function() {
  document.getElementById('modalCobro').classList.remove('active');
};

window.seleccionarMetodo = function(metodo) {
  metodoPagoActual = metodo;
  document.querySelectorAll('.pago-btn').forEach(b => b.classList.toggle('selected', b.dataset.metodo === metodo));
  document.getElementById('seccionEfectivo').style.display = metodo === 'efectivo' ? 'block' : 'none';
  document.getElementById('seccionTransferencia').style.display = metodo === 'transferencia' ? 'block' : 'none';
};

window.calcularVuelto = function() {
  const total = pedidoActual.items.reduce((s, x) => s + x.subtotal, 0) + (pedidoActual.propina || 0);
  const recibido = parseInt(document.getElementById('efectivoRecibido').value) || 0;
  const vuelto = recibido - total;
  const el = document.getElementById('vueltoCalc');
  if (vuelto >= 0) {
    el.textContent = fmtMoney(vuelto);
    el.style.color = 'var(--green)';
  } else {
    el.textContent = `Faltan ${fmtMoney(-vuelto)}`;
    el.style.color = 'var(--red)';
  }
};

window.procesarCobro = async function() {
  const subtotal = pedidoActual.items.reduce((s, x) => s + x.subtotal, 0);
  const total = subtotal + (pedidoActual.propina || 0);

  let efectivoRecibido = 0, vuelto = 0, banco = null;
  if (metodoPagoActual === 'efectivo') {
    efectivoRecibido = parseInt(document.getElementById('efectivoRecibido').value) || total;
    if (efectivoRecibido < total) {
      toast('El efectivo recibido es menor al total', 'error');
      return;
    }
    vuelto = efectivoRecibido - total;
  }
  if (metodoPagoActual === 'transferencia') {
    banco = document.getElementById('bancoTransferencia').value;
  }
  const notas = document.getElementById('notasCobro').value.trim();

  try {
    let pedidoId = pedidoActual.id;

    const dataPedido = {
      sede_id: selectedSedeId,
      mesa_id: pedidoActual.mesa_id,
      mesa_numero: pedidoActual.mesa_numero,
      cliente_id: pedidoActual.cliente_id,
      cliente_nombre: pedidoActual.cliente_nombre,
      cliente_tel: pedidoActual.cliente_tel,
      subtotal,
      propina: pedidoActual.propina || 0,
      total,
      modalidad: pedidoActual.modalidad,
      metodo_pago: metodoPagoActual,
      efectivo_recibido: efectivoRecibido,
      vuelto,
      banco_transferencia: banco,
      estado: 'cobrado',
      notas: notas || null,
      cajero_id: currentUser.id,
      cajero_email: currentUser.email,
      updated_at: new Date().toISOString()
    };

    if (pedidoId) {
      const { error } = await window.supabase.from('pedidos').update(dataPedido).eq('id', pedidoId);
      if (error) throw error;
    } else {
      const { data, error } = await window.supabase.from('pedidos').insert(dataPedido).select().single();
      if (error) throw error;
      pedidoId = data.id;

      // Insertar items (solo si es pedido nuevo, sin borrador previo)
      if (pedidoActual.items.length > 0) {
        const itemsInsert = pedidoActual.items.map(i => ({
          pedido_id: pedidoId,
          producto_id: i.producto_id,
          nombre: i.nombre,
          precio_unitario: i.precio_unitario,
          cantidad: i.cantidad,
          subtotal: i.subtotal,
          opciones: i.opciones
        }));
        await window.supabase.from('pedido_items').insert(itemsInsert);
      }
    }

    // Cargar info completa del pedido (con número auto-asignado)
    const { data: pedidoFinal } = await window.supabase.from('pedidos').select('*').eq('id', pedidoId).single();
    const { data: itemsFinal } = await window.supabase.from('pedido_items').select('*').eq('pedido_id', pedidoId);
    pedidoCobrado = { ...pedidoFinal, items: itemsFinal || [] };

    cerrarCobro();
    if (pedidoActual.modalidad === 'mesa') cerrarMesa();

    document.getElementById('exitoDetalle').innerHTML = `
      Pedido #${pedidoFinal.numero} · ${fmtMoney(total)}<br>
      ${metodoPagoActual === 'efectivo' ? `Vuelto: ${fmtMoney(vuelto)}` : metodoPagoActual === 'transferencia' ? `Banco: ${banco}` : 'Datáfono'}
    `;
    document.getElementById('modalExito').classList.add('active');

    pedidoActual = nuevoPedidoVacio('llevar');
    await cargarMesas();
    await cargarStats();
    await loadPedidos();

  } catch (err) {
    console.error(err);
    toast('Error: ' + err.message, 'error');
  }
};

window.cerrarExito = function() {
  document.getElementById('modalExito').classList.remove('active');
  renderCart('llevar');
};

// ============= STATS =============
async function cargarStats() {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data } = await window.supabase
    .from('pedidos')
    .select('total, estado')
    .eq('sede_id', selectedSedeId)
    .gte('fecha', hoy)
    .eq('estado', 'cobrado');

  const total = (data || []).reduce((s, p) => s + (p.total || 0), 0);
  const cant = (data || []).length;

  document.getElementById('statPedidos').textContent = cant;
  document.getElementById('statVentas').textContent = fmtMoney(total);
  document.getElementById('statTicket').textContent = cant > 0 ? fmtMoney(total / cant) : '$0';

  const ocupadas = mesas.filter(m => m.estado === 'ocupada').length;
  document.getElementById('statAbiertos').textContent = ocupadas;
}

// ============= HISTORIAL =============
async function loadPedidos() {
  const fecha = document.getElementById('filtroFecha').value;
  const { data } = await window.supabase
    .from('pedidos')
    .select('*')
    .eq('sede_id', selectedSedeId)
    .gte('fecha', fecha + 'T00:00:00')
    .lte('fecha', fecha + 'T23:59:59')
    .order('numero', { ascending: false });
  pedidosHistorial = data || [];
  renderPedidos();
}

function renderPedidos() {
  const cont = document.getElementById('pedidosListado');
  if (pedidosHistorial.length === 0) {
    cont.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-soft);">Sin pedidos en esta fecha</div>';
    return;
  }
  cont.innerHTML = pedidosHistorial.map(p => {
    const estadoColor = p.estado === 'cobrado' ? 'var(--green)' : p.estado === 'borrador' ? 'var(--orange)' : 'var(--red)';
    return `
      <div class="pedido-row">
        <div class="pedido-num-badge">#${p.numero}</div>
        <div class="pedido-info">
          <div class="pedido-info-titulo">
            ${p.modalidad === 'mesa' ? `🍽️ Mesa ${p.mesa_numero}` : p.modalidad === 'llevar' ? '🥡 Para llevar' : '🛵 Domicilio'}
            ${p.cliente_nombre ? ` · ${escapeHTML(p.cliente_nombre)}` : ''}
          </div>
          <div class="pedido-info-sub">
            ${new Date(p.fecha).toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'})} ·
            ${p.metodo_pago || '—'} ·
            <span style="color: ${estadoColor}; font-weight: 800;">${(p.estado || '').toUpperCase()}</span>
          </div>
        </div>
        <div class="pedido-total">${fmtMoney(p.total)}</div>
        <div class="pedido-acciones">
          <button onclick="verPedido('${p.id}')">👁 Ver</button>
          <button onclick="cambiarMetodoPago('${p.id}')" title="Cambiar solo método de pago">💳 Pago</button>
          <button onclick="reimprimirPedido('${p.id}')">🖨 Imprimir</button>
        </div>
      </div>
    `;
  }).join('');
}

window.verPedido = async function(id) {
  const { data: items } = await window.supabase.from('pedido_items').select('*').eq('pedido_id', id);
  const p = pedidosHistorial.find(x => x.id === id);
  if (!p) return;
  const detalle = (items || []).map(i =>
    `${i.cantidad}x ${i.nombre} - ${fmtMoney(i.subtotal)}${i.opciones ? ' [' + renderOpcionesTextoPlain(i.opciones) + ']' : ''}`
  ).join('\n');
  alert(`PEDIDO #${p.numero}\n${'-'.repeat(30)}\n${detalle}\n${'-'.repeat(30)}\nSubtotal: ${fmtMoney(p.subtotal)}\nPropina: ${fmtMoney(p.propina)}\nTOTAL: ${fmtMoney(p.total)}\n\nMétodo: ${p.metodo_pago}\nCajero: ${p.cajero_email}`);
};

function renderOpcionesTextoPlain(opciones) {
  if (!opciones) return '';
  const ops = Array.isArray(opciones) ? opciones : [];
  return ops.map(o => {
    if (o.tipo === 'multi-quantity') return Object.entries(o.items).map(([n, c]) => `${c} ${n}`).join('+');
    return o.valor;
  }).join(', ');
}

window.reimprimirPedido = async function(id) {
  const { data: items } = await window.supabase.from('pedido_items').select('*').eq('pedido_id', id);
  const p = pedidosHistorial.find(x => x.id === id);
  if (!p) return;
  pedidoCobrado = { ...p, items: items || [] };
  imprimirAmbos();
};

// ============= CAMBIAR MÉTODO DE PAGO (sin tocar valor ni items) =============
window.cambiarMetodoPago = async function(id) {
  const p = pedidosHistorial.find(x => x.id === id);
  if (!p) return;

  // Crear modal dinámico
  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.style.zIndex = '300';
  modal.innerHTML = `
    <div class="modal" style="max-width: 480px;">
      <div class="modal-title">💳 Cambiar método de pago</div>
      <div style="background: var(--cream); border: 2px solid var(--ink); border-radius: 10px; padding: 12px; margin-bottom: 14px; font-size: 13px;">
        <div><strong>Pedido:</strong> #${p.numero} · ${fmtMoney(p.total)}</div>
        <div><strong>Método actual:</strong> ${(p.metodo_pago || '—').toUpperCase()}</div>
        ${p.banco_transferencia ? `<div><strong>Banco:</strong> ${escapeHTML(p.banco_transferencia)}</div>` : ''}
        ${p.efectivo_recibido ? `<div><strong>Efectivo recibido:</strong> ${fmtMoney(p.efectivo_recibido)} (vuelto: ${fmtMoney(p.vuelto)})</div>` : ''}
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Nuevo método</div>
        <div class="pago-grid">
          <div class="pago-btn ${p.metodo_pago === 'efectivo' ? 'selected' : ''}" data-metodo="efectivo" onclick="seleccionarMetodoEdit(this, 'efectivo')">
            <span class="ico">💵</span>Efectivo
          </div>
          <div class="pago-btn ${p.metodo_pago === 'datafono' ? 'selected' : ''}" data-metodo="datafono" onclick="seleccionarMetodoEdit(this, 'datafono')">
            <span class="ico">💳</span>Datáfono
          </div>
          <div class="pago-btn ${p.metodo_pago === 'transferencia' ? 'selected' : ''}" data-metodo="transferencia" onclick="seleccionarMetodoEdit(this, 'transferencia')">
            <span class="ico">📱</span>Transfer.
          </div>
        </div>
      </div>

      <div class="modal-section" id="seccionEfectivoEdit" style="display:${p.metodo_pago === 'efectivo' ? 'block' : 'none'};">
        <div class="modal-section-title">Recibido del cliente</div>
        <input type="number" id="efectivoRecibidoEdit" placeholder="0" step="100" value="${p.efectivo_recibido || p.total}" oninput="calcularVueltoEdit(${p.total})">
        <div style="margin-top: 6px; font-size: 13px; font-weight: 800;">
          Vuelto: <span id="vueltoCalcEdit" style="color: var(--green); font-family: 'JetBrains Mono', monospace;">${fmtMoney(p.vuelto || 0)}</span>
        </div>
      </div>

      <div class="modal-section" id="seccionTransferenciaEdit" style="display:${p.metodo_pago === 'transferencia' ? 'block' : 'none'};">
        <div class="modal-section-title">Banco</div>
        <select id="bancoTransferenciaEdit">
          ${['Bancolombia','Nequi','Davivienda','Daviplata','BBVA','Otro'].map(b => 
            `<option value="${b}" ${p.banco_transferencia === b ? 'selected' : ''}>${b}</option>`
          ).join('')}
        </select>
      </div>

      <div style="display: flex; gap: 10px; margin-top: 16px;">
        <button onclick="this.closest('.modal-overlay').remove()" style="flex: 1; padding: 12px; border: 2.5px solid var(--ink); border-radius: 10px; background: white; font-weight: 800; cursor: pointer;">Cancelar</button>
        <button onclick="confirmarCambioMetodo('${id}', ${p.total})" style="flex: 2; padding: 12px; border: 3px solid var(--ink); border-radius: 10px; background: var(--blue); color: white; font-weight: 800; cursor: pointer; font-family: 'Bungee', sans-serif; letter-spacing: 1px; box-shadow: 0 3px 0 var(--ink);">✅ Guardar cambio</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window.__metodoEdit = p.metodo_pago || 'efectivo';

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

window.seleccionarMetodoEdit = function(btn, metodo) {
  window.__metodoEdit = metodo;
  const grid = btn.closest('.pago-grid');
  grid.querySelectorAll('.pago-btn').forEach(b => b.classList.toggle('selected', b.dataset.metodo === metodo));
  // Mostrar/ocultar secciones
  const modal = btn.closest('.modal');
  modal.querySelector('#seccionEfectivoEdit').style.display = metodo === 'efectivo' ? 'block' : 'none';
  modal.querySelector('#seccionTransferenciaEdit').style.display = metodo === 'transferencia' ? 'block' : 'none';
};

window.calcularVueltoEdit = function(total) {
  const recibido = parseInt(document.getElementById('efectivoRecibidoEdit').value) || 0;
  const vuelto = recibido - total;
  const el = document.getElementById('vueltoCalcEdit');
  if (vuelto >= 0) {
    el.textContent = fmtMoney(vuelto);
    el.style.color = 'var(--green)';
  } else {
    el.textContent = `Faltan ${fmtMoney(-vuelto)}`;
    el.style.color = 'var(--red)';
  }
};

window.confirmarCambioMetodo = async function(pedidoId, total) {
  const nuevoMetodo = window.__metodoEdit;
  if (!nuevoMetodo) { toast('Selecciona un método', 'error'); return; }

  const updateData = {
    metodo_pago: nuevoMetodo,
    updated_at: new Date().toISOString()
  };

  if (nuevoMetodo === 'efectivo') {
    const recibido = parseInt(document.getElementById('efectivoRecibidoEdit').value) || total;
    if (recibido < total) { toast('Efectivo recibido es menor al total', 'error'); return; }
    updateData.efectivo_recibido = recibido;
    updateData.vuelto = recibido - total;
    updateData.banco_transferencia = null;
  } else if (nuevoMetodo === 'transferencia') {
    updateData.banco_transferencia = document.getElementById('bancoTransferenciaEdit').value;
    updateData.efectivo_recibido = 0;
    updateData.vuelto = 0;
  } else {
    // datáfono
    updateData.efectivo_recibido = 0;
    updateData.vuelto = 0;
    updateData.banco_transferencia = null;
  }

  try {
    const { error } = await window.supabase.from('pedidos').update(updateData).eq('id', pedidoId);
    if (error) throw error;
    toast('✓ Método de pago actualizado');
    document.querySelectorAll('.modal-overlay').forEach(m => { if (m.style.zIndex === '300') m.remove(); });
    await loadPedidos();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

// ============= IMPRESIÓN (ventana popup, más confiable que media print) =============
function imprimirEnVentana(htmlContent, titulo) {
  // Abrir ventana popup
  const win = window.open('', '_blank', 'width=420,height=700,scrollbars=yes');
  if (!win) {
    toast('⚠️ Permite popups en tu navegador para imprimir', 'error');
    return;
  }

  const documentoCompleto = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<style>
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
  font-family: 'Arial Black', 'Helvetica', 'Arial', sans-serif;
  font-size: 14px;
  font-weight: 900;
  color: #000;
  padding: 3mm;
  width: 80mm;
  line-height: 1.4;
  -webkit-font-smoothing: none;
  text-rendering: geometricPrecision;
}
/* Todo el texto en bold para impresoras térmicas con poca tinta */
* { font-weight: 900 !important; color: #000 !important; }

.tit {
  text-align: center;
  font-size: 20px;
  font-weight: 900;
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}
.sub {
  text-align: center;
  font-size: 13px;
  margin-bottom: 3px;
  font-weight: 900;
}
hr {
  border: none;
  border-top: 2px solid #000;
  margin: 8px 0;
}
.row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 2px 0;
  gap: 8px;
  font-weight: 900;
}
.row.bold {
  font-weight: 900;
  font-size: 15px;
}
.row span:last-child { white-space: nowrap; }
.center { text-align: center; }
.small {
  font-size: 12px;
  font-weight: 900;
}
.bold { font-weight: 900; }
.item-line {
  margin: 6px 0;
  padding: 3px 0;
  border-bottom: 1px dashed #000;
}
.item-line:last-child { border-bottom: none; }
.item-line .item-name {
  font-weight: 900;
  font-size: 14px;
}
.item-line .item-opt {
  font-size: 12px;
  padding-left: 10px;
  margin-top: 3px;
  font-weight: 900;
}
.actions {
  padding: 12px;
  text-align: center;
  background: #f0f0f0;
}
.actions button {
  padding: 12px 24px;
  margin: 4px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  border: 2px solid #000;
  border-radius: 6px;
  background: #FF9000;
  color: #fff !important;
}
.actions button.secundario {
  background: #fff;
  color: #000 !important;
}

/* AL IMPRIMIR: ocultar botones, formato compacto */
@media print {
  .actions, .no-print { display: none !important; }
  body {
    padding: 2mm;
    font-size: 14px;
  }
  /* Forzar tinta máxima en impresora térmica */
  * {
    color: #000 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
@media screen {
  body { max-width: 80mm; margin: 0 auto; }
  .ticket-wrap {
    border: 2px dashed #999;
    padding: 4mm;
    margin: 10px auto;
    background: #fff;
  }
}
</style>
</head>
<body>
<div class="actions no-print">
  <button onclick="window.print()">🖨️ Imprimir</button>
  <button class="secundario" onclick="window.close()">✕ Cerrar</button>
</div>
<div class="ticket-wrap" id="ticket">
${htmlContent}
</div>
</body>
</html>`;

  // Usar document.open/write/close (más confiable que innerHTML para nuevas ventanas)
  win.document.open();
  win.document.write(documentoCompleto);
  win.document.close();

  // Esperar a que cargue todo y luego imprimir
  // Usar evento load + timeout doble para máxima compatibilidad
  const intentarImprimir = () => {
    try {
      win.focus();
      setTimeout(() => {
        win.print();
      }, 300);
    } catch (e) {
      console.error('Error al imprimir:', e);
    }
  };

  if (win.document.readyState === 'complete') {
    intentarImprimir();
  } else {
    win.addEventListener('load', intentarImprimir);
    // Fallback por si el load no se dispara
    setTimeout(intentarImprimir, 800);
  }
}

function generarReciboHTML() {
  if (!pedidoCobrado) return '';
  const sede = sedes.find(s => s.id === pedidoCobrado.sede_id);
  const fecha = new Date(pedidoCobrado.fecha);
  return `
    <div class="tit">TACO PARADO</div>
    <div class="sub">${escapeHTML(sede?.nombre || '')}</div>
    <div class="sub">${escapeHTML(sede?.direccion || '')}</div>
    <div class="sub">+57 311 482 2019</div>
    <hr>
    <div class="row"><span>Pedido:</span><span class="bold">#${pedidoCobrado.numero}</span></div>
    <div class="row"><span>Fecha:</span><span>${fecha.toLocaleString('es-CO')}</span></div>
    <div class="row"><span>Cajero:</span><span>${escapeHTML((pedidoCobrado.cajero_email || '').split('@')[0])}</span></div>
    ${pedidoCobrado.mesa_numero ? `<div class="row"><span>Mesa:</span><span>${pedidoCobrado.mesa_numero}</span></div>` : ''}
    ${pedidoCobrado.cliente_nombre ? `<div class="row"><span>Cliente:</span><span>${escapeHTML(pedidoCobrado.cliente_nombre)}</span></div>` : ''}
    <hr>
    ${pedidoCobrado.items.map(i => `
      <div class="item-line">
        <div class="row"><span class="item-name">${i.cantidad}x ${escapeHTML(i.nombre)}</span><span>${fmtMoney(i.subtotal)}</span></div>
        ${i.opciones ? `<div class="item-opt">→ ${escapeHTML(renderOpcionesTextoPlain(i.opciones))}</div>` : ''}
      </div>
    `).join('')}
    <hr>
    <div class="row"><span>Subtotal:</span><span>${fmtMoney(pedidoCobrado.subtotal)}</span></div>
    ${pedidoCobrado.propina > 0 ? `<div class="row"><span>Propina:</span><span>${fmtMoney(pedidoCobrado.propina)}</span></div>` : ''}
    <div class="row bold"><span>TOTAL:</span><span>${fmtMoney(pedidoCobrado.total)}</span></div>
    <hr>
    <div class="row"><span>Pago:</span><span>${(pedidoCobrado.metodo_pago || '').toUpperCase()}</span></div>
    ${pedidoCobrado.metodo_pago === 'efectivo' && pedidoCobrado.efectivo_recibido > 0 ? `
      <div class="row"><span>Recibido:</span><span>${fmtMoney(pedidoCobrado.efectivo_recibido)}</span></div>
      <div class="row"><span>Vuelto:</span><span>${fmtMoney(pedidoCobrado.vuelto)}</span></div>
    ` : ''}
    ${pedidoCobrado.banco_transferencia ? `<div class="row"><span>Banco:</span><span>${escapeHTML(pedidoCobrado.banco_transferencia)}</span></div>` : ''}
    <hr>
    <div class="center small">¡Gracias por tu compra!</div>
    <div class="center small">Sigue @tacoparado.co</div>
    <div class="center small" style="margin-top: 8px;">*** RECIBO DE VENTA ***</div>
    <div class="center small">No constituye factura electronica</div>
  `;
}

function generarComandaHTML() {
  if (!pedidoCobrado) return '';
  const fecha = new Date(pedidoCobrado.fecha);
  return `
    <div class="tit" style="font-size: 18px;">*** COMANDA ***</div>
    <div class="tit" style="font-size: 36px; margin: 10px 0; padding: 6px 0; border: 3px solid #000;">#${pedidoCobrado.numero}</div>
    <hr style="border-top: 3px solid #000;">
    <div class="row bold" style="font-size: 17px;">
      <span>${pedidoCobrado.modalidad === 'mesa' ? 'MESA ' + pedidoCobrado.mesa_numero : pedidoCobrado.modalidad === 'llevar' ? 'P/LLEVAR' : 'DOMICILIO'}</span>
      <span>${fecha.toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'})}</span>
    </div>
    ${pedidoCobrado.cliente_nombre ? `<div class="row" style="font-size: 14px;"><span>Cliente:</span><span>${escapeHTML(pedidoCobrado.cliente_nombre)}</span></div>` : ''}
    <hr style="border-top: 3px solid #000;">
    ${pedidoCobrado.items.map(i => `
      <div class="item-line" style="border-bottom: 2px dashed #000; padding: 6px 0; margin: 4px 0;">
        <div style="font-size: 18px; font-weight: 900; margin-bottom: 3px;">${i.cantidad}x ${escapeHTML(i.nombre).toUpperCase()}</div>
        ${i.opciones ? `<div style="font-size: 14px; padding-left: 12px; font-weight: 900;">► ${escapeHTML(renderOpcionesTextoPlain(i.opciones)).toUpperCase()}</div>` : ''}
        ${i.notas ? `<div style="font-size: 13px; padding-left: 12px; font-weight: 900;">📝 ${escapeHTML(i.notas)}</div>` : ''}
      </div>
    `).join('')}
    ${pedidoCobrado.notas ? `<hr style="border-top: 3px solid #000;"><div style="font-size: 15px; font-weight: 900;">NOTAS GENERALES:</div><div style="font-size: 14px; font-weight: 900;">${escapeHTML(pedidoCobrado.notas)}</div>` : ''}
    <hr style="border-top: 3px solid #000;">
    <div class="center" style="font-size: 12px;">${fecha.toLocaleDateString('es-CO')} · ${fecha.toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</div>
  `;
}

window.imprimirRecibo = function() {
  if (!pedidoCobrado) { toast('Sin pedido para imprimir', 'error'); return; }
  imprimirEnVentana(generarReciboHTML(), `Recibo #${pedidoCobrado.numero}`);
};

window.imprimirComanda = function() {
  if (!pedidoCobrado) { toast('Sin pedido para imprimir', 'error'); return; }
  imprimirEnVentana(generarComandaHTML(), `Comanda #${pedidoCobrado.numero}`);
};

window.imprimirAmbos = function() {
  if (!pedidoCobrado) { toast('Sin pedido para imprimir', 'error'); return; }
  // Comanda primero (para cocina), luego recibo
  const html = generarComandaHTML() + '<div style="page-break-before: always; height: 1px;"></div>' + generarReciboHTML();
  imprimirEnVentana(html, `Pedido #${pedidoCobrado.numero}`);
};

// ============= REALTIME =============
function setupRealtime() {
  window.supabase
    .channel('mesas-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas' }, async () => {
      await cargarMesas();
      await cargarStats();
    })
    .subscribe();
}

// ============= INIT =============
checkAuth();
