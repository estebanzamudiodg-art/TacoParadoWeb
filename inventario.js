// ==============================================================
// TACO PARADO · INVENTARIO · SUPABASE + SEDES + ROLES
// ==============================================================

const SUPABASE_URL = 'https://xyqyhabhujmmjofnfizg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5cXloYWJodWptbWpvZm5maXpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODE5NzAsImV4cCI6MjA5MjM1Nzk3MH0.9Cj7XZUjLUiBHPWw6Br4FWz2_g8T1hgg20zyrrThhZQ';

const TIPOS_MERMA = ['suadero','longaniza','birria','asada','pastor','oreja','lengua'];

// STATE
let currentUser = null;
let userRole = null;    // 'admin' | 'jefe_produccion' | 'lider_punto'
let userSedeId = null;  // null = admin (todas), uuid = sede específica
let sedes = [];
let selectedSedeId = null; // sede activa seleccionada en el UI

let proveedores = [];
let productos = [];
let mermas = [];
let catalogo = [];      // catálogo de precios por proveedor
let auditoria = [];     // log de auditoría

let reviewItems = [];
let scanFile = null;

// Carnes que se rastrean para vista crudo/cocinado
const CARNES = ['pastor', 'suadero', 'longaniza', 'birria', 'asada', 'oreja', 'lengua'];

// ==============================================================
// HELPERS
// ==============================================================
function fmt(n) {
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0);
}
function fmtMoney(n) {
  return '$' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0);
}
function escapeHTML(s) {
  return (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 2800);
}

async function waitForSupabase() {
  while (!window.supabase) await new Promise(r => setTimeout(r, 50));
}

// Helper: día de la semana en español
function diaSemana(fechaStr) {
  if (!fechaStr) return '—';
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const d = new Date(fechaStr + 'T12:00:00');
  return dias[d.getDay()];
}

function fechaCorta(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(fechaStr + 'T12:00:00');
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

// AUDITORÍA: registrar acción
async function logAudit(accion, entidad, entidad_id, descripcion, datos_antes = null, datos_despues = null) {
  try {
    await window.supabase.from('auditoria_inventario').insert({
      sede_id: selectedSedeId,
      user_id: currentUser?.id,
      user_email: currentUser?.email,
      accion, entidad, entidad_id: String(entidad_id || ''),
      descripcion,
      datos_antes, datos_despues
    });
  } catch (e) { console.warn('Audit fail:', e); }
}

// ==============================================================
// AUTH
// ==============================================================
async function checkAuth() {
  await waitForSupabase();
  const { data: { session } } = await window.supabase.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = session.user;

  // Cargar rol del usuario
  const { data: roles } = await window.supabase
    .from('usuarios_roles')
    .select('rol, sede_id')
    .eq('user_id', currentUser.id);

  if (!roles || roles.length === 0) {
    // Sin rol, no tiene acceso
    document.getElementById('loading-screen').innerHTML = `
      <div style="text-align:center; padding:60px 20px; color: #fff;">
        <div style="font-size:48px; margin-bottom:16px;">🚫</div>
        <div style="font-family:'Bungee',sans-serif; font-size:20px; margin-bottom:8px;">SIN ACCESO</div>
        <div style="font-family:'Inter',sans-serif; font-size:14px; opacity:0.8; margin-bottom:20px;">Tu cuenta no tiene permisos para el inventario.<br>Contacta al administrador.</div>
        <a href="index.html" style="color:var(--mustard); font-weight:700;">← Volver al panel</a>
      </div>
    `;
    return;
  }

  const r = roles[0];
  userRole = r.rol;
  userSedeId = r.sede_id;

  // Líder de punto NO tiene acceso al inventario
  if (userRole === 'lider_punto') {
    document.getElementById('loading-screen').innerHTML = `
      <div style="text-align:center; padding:60px 20px; color: #fff;">
        <div style="font-size:48px; margin-bottom:16px;">📋</div>
        <div style="font-family:'Bungee',sans-serif; font-size:20px; margin-bottom:8px;">ACCESO LIMITADO</div>
        <div style="font-family:'Inter',sans-serif; font-size:14px; opacity:0.8; margin-bottom:20px;">Tu rol de Líder de Punto no incluye acceso al inventario.<br>Usa el panel principal para registrar visitas.</div>
        <a href="index.html" style="color:var(--mustard); font-weight:700;">← Ir al panel de clientes</a>
      </div>
    `;
    return;
  }

  await loadSedes();
  showApp();
}

async function loadSedes() {
  const { data } = await window.supabase.from('sedes').select('*').eq('activa', true).order('nombre');
  sedes = data || [];

  if (userRole === 'admin') {
    // Admin ve selector de sedes
    selectedSedeId = sedes.length > 0 ? sedes[0].id : null;
  } else {
    // Jefe de producción solo ve su sede
    selectedSedeId = userSedeId;
  }
}

function showApp() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // Mostrar info del usuario
  document.getElementById('userEmail').textContent = currentUser.email;
  document.getElementById('userRole').textContent = {
    admin: 'ADMINISTRADOR',
    jefe_produccion: 'JEFE DE PRODUCCIÓN',
    lider_punto: 'LÍDER DE PUNTO'
  }[userRole] || userRole;

  // Render selector de sede
  renderSedeSelector();

  // Cargar datos
  loadData();
  setFaviconFromConfig();
}

async function setFaviconFromConfig() {
  try {
    const { data } = await window.supabase.from('config').select('value').eq('key', 'logoUrl').maybeSingle();
    if (data?.value) {
      let link = document.querySelector("link[rel='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = data.value;
    }
  } catch (e) { /* silent */ }
}

function renderSedeSelector() {
  const container = document.getElementById('sedeSelector');
  if (userRole === 'admin' && sedes.length > 1) {
    container.innerHTML = sedes.map(s => `
      <button class="sede-btn ${s.id === selectedSedeId ? 'active' : ''}" onclick="cambiarSede('${s.id}')">
        📍 ${escapeHTML(s.nombre)}
      </button>
    `).join('');
    container.style.display = 'flex';
  } else {
    // Mostrar nombre de la sede asignada
    const sede = sedes.find(s => s.id === selectedSedeId);
    container.innerHTML = sede ? `<div class="sede-fixed">📍 ${escapeHTML(sede.nombre)}</div>` : '';
    container.style.display = 'flex';
  }
}

window.cambiarSede = function(sedeId) {
  selectedSedeId = sedeId;
  renderSedeSelector();
  loadData();
};

// ==============================================================
// LOAD DATA (desde Supabase, filtrado por sede)
// ==============================================================
async function loadData() {
  if (!selectedSedeId) return;

  try {
    const [provRes, prodRes, merRes, catRes] = await Promise.all([
      window.supabase.from('proveedores').select('*').eq('sede_id', selectedSedeId).order('nombre'),
      window.supabase.from('productos').select('*').eq('sede_id', selectedSedeId).order('created_at', { ascending: false }),
      window.supabase.from('mermas').select('*').eq('sede_id', selectedSedeId).order('fecha', { ascending: false }),
      window.supabase.from('productos_catalogo').select('*').eq('sede_id', selectedSedeId).eq('activo', true).order('nombre')
    ]);

    proveedores = provRes.data || [];
    productos = prodRes.data || [];
    mermas = merRes.data || [];
    catalogo = catRes.data || [];

    renderAll();
    await loadCierres();
    await loadAuditoria();
  } catch (err) {
    console.error(err);
    toast('Error al cargar datos: ' + err.message, 'error');
  }
}

async function loadAuditoria() {
  try {
    let q = window.supabase.from('auditoria_inventario').select('*').order('created_at', { ascending: false }).limit(200);
    if (userRole !== 'admin' && selectedSedeId) q = q.eq('sede_id', selectedSedeId);
    const { data } = await q;
    auditoria = data || [];
    renderAuditoria();
  } catch (e) { console.error('Error auditoria:', e); }
}

// ==============================================================
// RENDER ALL
// ==============================================================
function renderAll() {
  refreshProveedorSelects();
  refreshCatalogoSelects();
  renderStockActual();
  renderProveedores();
  renderProductos();
  renderMermas();
  renderCatalogo();
  renderStats();

  const today = new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' });
  document.getElementById('todayDate').textContent = today.toUpperCase();
}

function renderStats() {
  document.getElementById('statProveedores').textContent = proveedores.length;
  document.getElementById('statProductos').textContent = productos.length;
  const totalInv = productos.reduce((s, p) => s + (p.cantidad || 0) * (p.precio || 0), 0);
  document.getElementById('statInversion').textContent = fmtMoney(totalInv);
  document.getElementById('statMermas').textContent = mermas.length;
  const totalMermaKg = mermas.reduce((s, m) => s + (m.cantidad || 0), 0);
  document.getElementById('statMermasKg').textContent = fmt(totalMermaKg);
}

// ==============================================================
// PROVEEDORES
// ==============================================================
window.saveProveedor = async function() {
  const id = document.getElementById('provId').value;
  const nombre = document.getElementById('provNombre').value.trim();
  const categoria = document.getElementById('provCategoria').value;
  const telefono = document.getElementById('provTelefono').value.trim();
  const contacto = document.getElementById('provContacto').value.trim();
  if (!nombre) { toast('Falta el nombre', 'error'); return; }

  try {
    if (id) {
      const antes = proveedores.find(x => x.id === id);
      const update = { nombre, categoria, contacto, telefono };
      const { error } = await window.supabase.from('proveedores').update(update).eq('id', id);
      if (error) throw error;
      await logAudit('editar', 'proveedor', id, `Editó proveedor "${nombre}"`, antes, update);
      toast('Proveedor actualizado');
    } else {
      const insert = { sede_id: selectedSedeId, nombre, categoria, contacto, telefono };
      const { data, error } = await window.supabase.from('proveedores').insert(insert).select().single();
      if (error) throw error;
      await logAudit('crear', 'proveedor', data.id, `Agregó proveedor "${nombre}"`, null, insert);
      toast('Proveedor agregado');
    }
    await loadData();
    toggleForm('formProveedor');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

window.editProveedor = function(id) {
  const p = proveedores.find(x => x.id === id);
  if (!p) return;
  document.getElementById('provId').value = p.id;
  document.getElementById('provNombre').value = p.nombre;
  document.getElementById('provCategoria').value = p.categoria || 'general';
  document.getElementById('provContacto').value = p.contacto || '';
  document.getElementById('provTelefono').value = p.telefono || '';
  document.getElementById('formProveedorTitle').textContent = 'Editar proveedor';
  const f = document.getElementById('formProveedor');
  if (!f.classList.contains('open')) f.classList.add('open');
  f.scrollIntoView({ behavior:'smooth', block:'nearest' });
};

window.deleteProveedor = async function(id) {
  const p = proveedores.find(x => x.id === id);
  if (!p) return;
  const usados = productos.filter(pr => pr.proveedor_id === id).length;
  const msg = usados > 0 ? `Tiene ${usados} producto(s). ¿Eliminar?` : '¿Eliminar proveedor?';
  if (!confirm(msg)) return;
  try {
    const { error } = await window.supabase.from('proveedores').delete().eq('id', id);
    if (error) throw error;
    await logAudit('eliminar', 'proveedor', id, `Eliminó proveedor "${p.nombre}"`, p, null);
    await loadData();
    toast('Eliminado');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
};

function renderProveedores() {
  const tb = document.getElementById('tblProveedores');
  if (proveedores.length === 0) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty">No hay proveedores. Agrega uno.</div></td></tr>';
    return;
  }
  tb.innerHTML = proveedores.map(p => {
    const count = productos.filter(pr => pr.proveedor_id === p.id).length;
    return `<tr>
      <td><strong>${escapeHTML(p.nombre)}</strong></td>
      <td><span class="badge ${p.categoria || 'general'}">${p.categoria || 'general'}</span></td>
      <td>${p.telefono ? `📱 ${escapeHTML(p.telefono)}` : '<em style="opacity:.4">—</em>'}</td>
      <td>${p.contacto ? `👤 ${escapeHTML(p.contacto)}` : '<em style="opacity:.4">—</em>'}</td>
      <td class="qty">${count}</td>
      <td>
        <button class="btn-icon" onclick="editProveedor('${p.id}')">✎</button>
        <button class="btn-icon danger" onclick="deleteProveedor('${p.id}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function refreshProveedorSelects() {
  const opts = proveedores.map(p =>
    `<option value="${p.id}">${escapeHTML(p.nombre)} · ${p.categoria||'general'}</option>`
  ).join('');
  const empty = '<option value="">— sin proveedores —</option>';
  const all = '<option value="">Todos los proveedores</option>';

  const sel = document.getElementById('prodProveedor');
  const filter = document.getElementById('filterProdProv');
  const scanProv = document.getElementById('scanProveedor');
  const scanProvTxt = document.getElementById('scanProveedorTxt');
  const catProv = document.getElementById('catProveedor');
  if (sel) sel.innerHTML = opts || empty;
  if (filter) filter.innerHTML = all + opts;
  if (scanProv) scanProv.innerHTML = '<option value="">-- Seleccionar --</option>' + opts;
  if (scanProvTxt) scanProvTxt.innerHTML = '<option value="">-- Seleccionar --</option>' + opts;
  if (catProv) catProv.innerHTML = '<option value="">— Cualquier proveedor —</option>' + opts;
}

// ==============================================================
// PRODUCTOS
// ==============================================================
window.saveProducto = async function() {
  const id = document.getElementById('prodId').value;
  const nombre = document.getElementById('prodNombre').value.trim();
  const cantidad = parseFloat(document.getElementById('prodCantidad').value) || 0;
  const unidad = document.getElementById('prodUnidad').value;
  const precio = parseFloat(document.getElementById('prodPrecio').value) || 0;
  const proveedor_id = document.getElementById('prodProveedor').value;
  const numero_factura = document.getElementById('prodFactura')?.value.trim() || null;
  const fecha = document.getElementById('prodFecha')?.value || new Date().toISOString().slice(0,10);
  const estado = document.getElementById('prodEstado')?.value || 'crudo';
  const catalogo_id = document.getElementById('prodCatalogo')?.value || null;
  if (!nombre) { toast('Falta el nombre', 'error'); return; }

  try {
    if (id) {
      const antes = productos.find(p => p.id === id);
      const update = {
        nombre, cantidad, unidad, precio,
        proveedor_id: proveedor_id || null,
        numero_factura, fecha, estado,
        catalogo_id: catalogo_id || null,
        updated_at: new Date().toISOString()
      };
      const { error } = await window.supabase.from('productos').update(update).eq('id', id);
      if (error) throw error;
      await logAudit('editar', 'producto', id, `Editó "${nombre}"`, antes, update);
      toast('Producto actualizado');
    } else {
      const insert = {
        sede_id: selectedSedeId, nombre, cantidad, unidad, precio,
        proveedor_id: proveedor_id || null,
        catalogo_id: catalogo_id || null,
        numero_factura, fecha, estado,
        responsable_id: currentUser.id,
        responsable_email: currentUser.email
      };
      const { data, error } = await window.supabase.from('productos').insert(insert).select().single();
      if (error) throw error;
      await logAudit('crear', 'producto', data.id, `Agregó "${nombre}" (${cantidad} ${unidad}) por ${fmtMoney(precio)}`, null, insert);
      toast('Producto agregado');
    }
    await loadData();
    toggleForm('formProducto');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

window.editProducto = function(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  document.getElementById('prodId').value = p.id;
  document.getElementById('prodNombre').value = p.nombre;
  document.getElementById('prodCantidad').value = p.cantidad;
  document.getElementById('prodUnidad').value = p.unidad || 'kg';
  document.getElementById('prodPrecio').value = p.precio;
  document.getElementById('prodProveedor').value = p.proveedor_id || '';
  const fact = document.getElementById('prodFactura'); if (fact) fact.value = p.numero_factura || '';
  const fec = document.getElementById('prodFecha'); if (fec) fec.value = p.fecha || new Date().toISOString().slice(0,10);
  const est = document.getElementById('prodEstado'); if (est) est.value = p.estado || 'crudo';
  const cat = document.getElementById('prodCatalogo'); if (cat) cat.value = p.catalogo_id || '';
  document.getElementById('formProductoTitle').textContent = 'Editar producto';
  const f = document.getElementById('formProducto');
  if (!f.classList.contains('open')) f.classList.add('open');
  f.scrollIntoView({ behavior:'smooth', block:'nearest' });
};

window.deleteProducto = async function(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
  try {
    const { error } = await window.supabase.from('productos').delete().eq('id', id);
    if (error) throw error;
    await logAudit('eliminar', 'producto', id, `Eliminó "${p.nombre}"`, p, null);
    await loadData();
    toast('Eliminado');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
};

// Auto-completar precio cuando se selecciona del catálogo
window.aplicarCatalogo = function() {
  const catId = document.getElementById('prodCatalogo').value;
  if (!catId) return;
  const cat = catalogo.find(c => c.id === catId);
  if (!cat) return;
  document.getElementById('prodNombre').value = cat.nombre;
  document.getElementById('prodPrecio').value = cat.precio_kg;
  document.getElementById('prodUnidad').value = cat.unidad || 'kg';
  if (cat.proveedor_id) document.getElementById('prodProveedor').value = cat.proveedor_id;
};

function renderProductos() {
  const tb = document.getElementById('tblProductos');
  const fNombre = (document.getElementById('filterProdNombre')?.value || '').toLowerCase();
  const fProv = document.getElementById('filterProdProv')?.value;

  let lista = productos.filter(p => {
    if (fNombre && !p.nombre.toLowerCase().includes(fNombre)) return false;
    if (fProv && p.proveedor_id !== fProv) return false;
    return true;
  });

  if (lista.length === 0) {
    tb.innerHTML = '<tr><td colspan="10"><div class="empty">Sin productos en el inventario.</div></td></tr>';
    return;
  }

  tb.innerHTML = lista.map(p => {
    const prov = proveedores.find(x => x.id === p.proveedor_id);
    const subtotal = (p.cantidad || 0) * (p.precio || 0);
    const estadoBadge = p.estado === 'cocinado'
      ? '<span class="badge" style="background:#fed7aa; color:#7c2d12;">🔥 Cocinado</span>'
      : '<span class="badge" style="background:#fef3c7; color:#854d0e;">🥩 Crudo</span>';
    return `<tr>
      <td>
        <strong>${escapeHTML(p.nombre)}</strong>
        ${p.numero_factura ? `<div style="font-size:10px; opacity:.6; margin-top:2px;">Factura: ${escapeHTML(p.numero_factura)}</div>` : ''}
      </td>
      <td>${estadoBadge}</td>
      <td class="qty">${fmt(p.cantidad)} ${p.unidad || ''}</td>
      <td class="price">${fmtMoney(p.precio)}</td>
      <td class="price"><strong>${fmtMoney(subtotal)}</strong></td>
      <td>${prov ? escapeHTML(prov.nombre) : '<em style="opacity:.5">sin prov.</em>'}</td>
      <td>
        <div style="font-size:11px;">${fechaCorta(p.fecha)}</div>
        <div style="font-size:9px; opacity:.6;">${diaSemana(p.fecha)}</div>
      </td>
      <td style="font-size:10px; opacity:.7;">${escapeHTML((p.responsable_email || '').split('@')[0] || '—')}</td>
      <td>
        <button class="btn-icon" onclick="editProducto('${p.id}')">✎</button>
        <button class="btn-icon danger" onclick="deleteProducto('${p.id}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

// ==============================================================
// MERMAS
// ==============================================================
window.recalcMerma = function() {
  const antes = parseFloat(document.getElementById('mermaPesoAntes').value) || 0;
  const despues = parseFloat(document.getElementById('mermaPesoDespues').value) || 0;
  const costo = parseFloat(document.getElementById('mermaCosto').value) || 0;
  const calcAbs = document.getElementById('calcAbsoluta');
  const calcPct = document.getElementById('calcPorcentaje');
  const calcRend = document.getElementById('calcRendimiento');
  const calcVal = document.getElementById('calcValor');
  const items = document.querySelectorAll('.merma-calc-item');
  items.forEach(it => it.classList.remove('alert'));

  if (antes <= 0) { calcAbs.textContent = '0 kg'; calcPct.textContent = '0%'; calcRend.textContent = '100%'; calcVal.textContent = '$0'; return; }

  const merma = Math.max(0, antes - despues);
  const pct = (merma / antes) * 100;
  const rend = 100 - pct;
  const valor = merma * costo;
  calcAbs.textContent = fmt(merma) + ' kg';
  calcPct.textContent = pct.toFixed(1) + '%';
  calcRend.textContent = rend.toFixed(1) + '%';
  calcVal.textContent = fmtMoney(valor);
  if (pct > 35) { items[1]?.classList.add('alert'); items[3]?.classList.add('alert'); }
  if (despues > antes) { items[0]?.classList.add('alert'); }
};

window.saveMerma = async function() {
  const id = document.getElementById('mermaId').value;
  const tipo = document.getElementById('mermaTipo').value;
  const peso_antes = parseFloat(document.getElementById('mermaPesoAntes').value) || 0;
  const peso_despues = parseFloat(document.getElementById('mermaPesoDespues').value) || 0;
  const costo = parseFloat(document.getElementById('mermaCosto').value) || 0;
  const fecha = document.getElementById('mermaFecha').value || new Date().toISOString().slice(0,10);
  const motivo = document.getElementById('mermaMotivo').value.trim();
  if (peso_antes <= 0) { toast('Ingresa el peso antes', 'error'); return; }

  const cantidad = Math.max(0, peso_antes - peso_despues);
  const porcentaje = peso_antes > 0 ? (cantidad / peso_antes) * 100 : 0;

  try {
    if (id) {
      const antes = mermas.find(x => x.id === id);
      const update = { tipo, peso_antes, peso_despues, cantidad, porcentaje, costo, fecha, motivo };
      const { error } = await window.supabase.from('mermas').update(update).eq('id', id);
      if (error) throw error;
      await logAudit('editar', 'merma', id, `Editó merma de ${tipo}`, antes, update);
      toast('Merma actualizada');
    } else {
      const insert = {
        sede_id: selectedSedeId, tipo, peso_antes, peso_despues, cantidad, porcentaje, costo, fecha, motivo, registrado_por: currentUser.id
      };
      const { data, error } = await window.supabase.from('mermas').insert(insert).select().single();
      if (error) throw error;
      await logAudit('crear', 'merma', data.id, `Registró merma de ${tipo}: ${fmt(cantidad)} kg (${porcentaje.toFixed(1)}%)`, null, insert);
      toast('Merma registrada');
    }
    await loadData();
    toggleForm('formMerma');
    ['mermaPesoAntes','mermaPesoDespues','mermaCosto','mermaMotivo'].forEach(i => document.getElementById(i).value = '');
    recalcMerma();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

window.editMerma = function(id) {
  const m = mermas.find(x => x.id === id);
  if (!m) return;
  document.getElementById('mermaId').value = m.id;
  document.getElementById('mermaTipo').value = m.tipo;
  document.getElementById('mermaPesoAntes').value = m.peso_antes ?? m.cantidad ?? 0;
  document.getElementById('mermaPesoDespues').value = m.peso_despues ?? 0;
  document.getElementById('mermaCosto').value = m.costo || '';
  document.getElementById('mermaFecha').value = m.fecha;
  document.getElementById('mermaMotivo').value = m.motivo || '';
  document.getElementById('formMermaTitle').textContent = 'Editar merma';
  const f = document.getElementById('formMerma');
  if (!f.classList.contains('open')) f.classList.add('open');
  recalcMerma();
  f.scrollIntoView({ behavior:'smooth', block:'nearest' });
};

window.deleteMerma = async function(id) {
  const m = mermas.find(x => x.id === id);
  if (!m) return;
  if (!confirm('¿Eliminar merma?')) return;
  try {
    const { error } = await window.supabase.from('mermas').delete().eq('id', id);
    if (error) throw error;
    await logAudit('eliminar', 'merma', id, `Eliminó merma de ${m.tipo} (${fmt(m.cantidad)} kg)`, m, null);
    await loadData();
    toast('Eliminada');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
};

function renderMermas() {
  const resumen = document.getElementById('mermasResumen');
  if (resumen) {
    resumen.innerHTML = TIPOS_MERMA.map(tipo => {
      const items = mermas.filter(m => m.tipo === tipo);
      const totalAntes = items.reduce((s, m) => s + (m.peso_antes || m.cantidad || 0), 0);
      const totalDespues = items.reduce((s, m) => s + (m.peso_despues || 0), 0);
      const totalMerma = items.reduce((s, m) => s + (m.cantidad || 0), 0);
      const pctProm = totalAntes > 0 ? (totalMerma / totalAntes) * 100 : 0;
      return `
        <div class="merma-card" onclick="filterMermaTipo('${tipo}')">
          <div class="merma-card-count">${items.length}</div>
          <div class="merma-card-name">${tipo}</div>
          <div class="merma-card-total">${fmt(totalMerma)}</div>
          <div class="merma-card-unit">kg merma · ${pctProm.toFixed(1)}%</div>
          <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(30,58,138,.25); font-size:11px; line-height:1.6; font-weight:600;">
            <div>Crudo: <strong>${fmt(totalAntes)} kg</strong></div>
            <div>Cocido: <strong>${fmt(totalDespues)} kg</strong></div>
          </div>
        </div>`;
    }).join('');
  }

  const tb = document.getElementById('tblMermas');
  if (mermas.length === 0) {
    tb.innerHTML = '<tr><td colspan="9"><div class="empty">Sin mermas registradas.</div></td></tr>';
    return;
  }
  const sorted = [...mermas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  tb.innerHTML = sorted.map(m => {
    const antes = m.peso_antes ?? m.cantidad ?? 0;
    const despues = m.peso_despues ?? 0;
    const mermaKg = m.cantidad || Math.max(0, antes - despues);
    const pct = antes > 0 ? (mermaKg / antes) * 100 : 0;
    const valor = mermaKg * (m.costo || 0);
    return `<tr>
      <td class="qty">${m.fecha || '—'}</td>
      <td><strong style="text-transform:capitalize;">${escapeHTML(m.tipo)}</strong></td>
      <td class="qty">${fmt(antes)}</td>
      <td class="qty">${fmt(despues)}</td>
      <td class="qty"><strong style="color:var(--blood)">${fmt(mermaKg)}</strong></td>
      <td class="qty"><strong>${pct.toFixed(1)}%</strong></td>
      <td class="price">${fmtMoney(valor)}</td>
      <td>${escapeHTML(m.motivo || '—')}</td>
      <td>
        <button class="btn-icon" onclick="editMerma('${m.id}')">✎</button>
        <button class="btn-icon danger" onclick="deleteMerma('${m.id}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

window.filterMermaTipo = function(tipo) {
  document.getElementById('mermaTipo').value = tipo;
  document.getElementById('mermaFecha').value = new Date().toISOString().slice(0,10);
  if (!document.getElementById('formMerma').classList.contains('open')) toggleForm('formMerma');
  recalcMerma();
};

// ==============================================================
// ESCANEAR / OCR
// ==============================================================
function setupDropzone() {
  const dz = document.getElementById('dropzone');
  if (!dz) return;
  dz.addEventListener('click', () => document.getElementById('fileInput').click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  document.getElementById('fileInput').addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });
  document.addEventListener('paste', e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) { handleFile(item.getAsFile()); break; }
    }
  });
}

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) { toast('Solo imágenes', 'error'); return; }
  scanFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('previewImg').src = e.target.result;
    document.querySelector('.dropzone-content').style.display = 'none';
    document.getElementById('dropzonePreview').style.display = 'block';
    document.getElementById('scanActions').style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

window.resetScanFoto = function() {
  scanFile = null;
  document.getElementById('fileInput').value = '';
  document.querySelector('.dropzone-content').style.display = 'block';
  document.getElementById('dropzonePreview').style.display = 'none';
  document.getElementById('scanActions').style.display = 'none';
  document.getElementById('scanProgress').style.display = 'none';
  document.getElementById('ocrRaw').style.display = 'none';
};

document.addEventListener('click', e => {
  if (e.target.id === 'btnProcesarOCR') procesarOCR();
});

async function procesarOCR() {
  if (!scanFile) return;
  if (typeof Tesseract === 'undefined') { toast('Cargando OCR...', 'error'); return; }
  const progressDiv = document.getElementById('scanProgress');
  const fill = document.getElementById('progressFill');
  const text = document.getElementById('progressText');
  progressDiv.style.display = 'block';
  document.getElementById('btnProcesarOCR').disabled = true;
  fill.style.width = '0%';
  text.textContent = 'Iniciando OCR...';

  try {
    const result = await Tesseract.recognize(scanFile, 'spa+eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          fill.style.width = pct + '%';
          text.textContent = `Reconociendo... ${pct}%`;
        } else {
          text.textContent = m.status.charAt(0).toUpperCase() + m.status.slice(1);
        }
      }
    });
    fill.style.width = '100%';
    text.textContent = 'Listo.';
    document.getElementById('ocrRaw').style.display = 'block';
    document.getElementById('ocrRawText').value = result.data.text;
    extraerDeTexto(result.data.text);
  } catch (err) {
    console.error(err);
    toast('Error en OCR', 'error');
  } finally {
    document.getElementById('btnProcesarOCR').disabled = false;
  }
}

window.extraerDeTexto = function(texto) {
  if (!texto || !texto.trim()) { toast('Sin texto', 'error'); return; }
  const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  const items = [];
  const reCantidad = /(\d+[.,]?\d*)\s*(kg|kilos?|gr?|gramos?|lb|libras?|und|unid|unidades?|cajas?|canastas?|pacas?|x)\b/i;
  const rePrecio = /\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:[.,]\d{1,2})?\b/g;

  for (const linea of lineas) {
    if (/^(factura|fecha|total|subtotal|iva|cliente|nit|direcc|tel|n[°o]\.?|cant|descripc|valor|unit|item)/i.test(linea)) continue;
    if (linea.length < 4) continue;
    const cantMatch = linea.match(reCantidad);
    const precioMatches = [...linea.matchAll(rePrecio)];
    let cantidad = 0, unidad = 'kg', precio = 0, nombre = linea;

    if (cantMatch) {
      cantidad = parseFloat(cantMatch[1].replace(',','.')) || 0;
      const u = cantMatch[2].toLowerCase();
      if (u.startsWith('kg') || u.startsWith('kilo')) unidad = 'kg';
      else if (u === 'g' || u.startsWith('gr')) unidad = 'g';
      else if (u.startsWith('lb') || u.startsWith('libra')) unidad = 'lb';
      else if (u.startsWith('caja')) unidad = 'caja';
      else unidad = 'unidad';
      nombre = nombre.replace(cantMatch[0], '').trim();
    }
    if (precioMatches.length) {
      const ultimo = precioMatches[precioMatches.length - 1];
      precio = parseInt(ultimo[1].replace(/[.,]/g, '')) || 0;
      precioMatches.forEach(pm => { nombre = nombre.replace(pm[0], '').trim(); });
    }
    nombre = nombre.replace(/[|*_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[\d\s.,$\-]+/, '').replace(/[\d\s.,$\-]+$/, '').trim();
    if (nombre.length < 2 || (cantidad === 0 && precio === 0)) continue;
    items.push({ nombre, cantidad: cantidad || 1, unidad, precio, checked: true });
  }

  if (!items.length) { toast('No se detectaron items', 'error'); return; }
  reviewItems = items;
  renderReview();
  toast(`${items.length} items detectados`);
  document.getElementById('reviewSection').scrollIntoView({ behavior:'smooth', block:'start' });
};

function renderReview() {
  const tbody = document.getElementById('reviewBody');
  document.getElementById('reviewSection').style.display = 'block';
  tbody.innerHTML = reviewItems.map((it, i) => `
    <tr class="${it.checked ? '' : 'unchecked'}" data-i="${i}">
      <td><input type="checkbox" ${it.checked ? 'checked' : ''} onchange="toggleReview(${i})"></td>
      <td><input type="text" value="${escapeHTML(it.nombre)}" oninput="updateReview(${i},'nombre',this.value)"></td>
      <td><input type="number" step="0.01" min="0" value="${it.cantidad}" oninput="updateReview(${i},'cantidad',parseFloat(this.value)||0)"></td>
      <td><select onchange="updateReview(${i},'unidad',this.value)">
        ${['kg','g','lb','unidad','caja','canasta','paca'].map(u => `<option value="${u}" ${it.unidad===u?'selected':''}>${u}</option>`).join('')}
      </select></td>
      <td><input type="number" step="1" min="0" value="${it.precio}" oninput="updateReview(${i},'precio',parseInt(this.value)||0)"></td>
      <td><button class="btn-row-delete" onclick="removeReview(${i})">×</button></td>
    </tr>
  `).join('');
}

window.toggleReview = function(i) { reviewItems[i].checked = !reviewItems[i].checked; renderReview(); };
window.updateReview = function(i, field, val) { reviewItems[i][field] = val; };
window.removeReview = function(i) { reviewItems.splice(i, 1); renderReview(); };
window.addReviewRow = function() { reviewItems.push({ nombre:'', cantidad:1, unidad:'kg', precio:0, checked:true }); renderReview(); };

window.cancelReview = function() {
  reviewItems = [];
  document.getElementById('reviewSection').style.display = 'none';
  resetScanFoto();
  const txtInput = document.getElementById('scanTextoInput');
  if (txtInput) txtInput.value = '';
};

window.confirmarImportacion = async function() {
  const modoFoto = document.getElementById('scanFoto').classList.contains('active');
  const provId = modoFoto ? document.getElementById('scanProveedor').value : document.getElementById('scanProveedorTxt').value;
  const fecha = modoFoto ? document.getElementById('scanFecha').value : document.getElementById('scanFechaTxt').value;
  if (!provId) { toast('Selecciona proveedor', 'error'); return; }

  const fechaFinal = fecha || new Date().toISOString().slice(0,10);
  const aImportar = reviewItems.filter(it => it.checked && it.nombre.trim());
  if (!aImportar.length) { toast('Marca al menos un item', 'error'); return; }

  try {
    const rows = aImportar.map(it => ({
      sede_id: selectedSedeId,
      nombre: it.nombre.trim(),
      cantidad: it.cantidad,
      unidad: it.unidad,
      precio: it.precio,
      proveedor_id: provId,
      fecha: fechaFinal
    }));
    const { error } = await window.supabase.from('productos').insert(rows);
    if (error) throw error;
    await loadData();
    toast(`✓ ${aImportar.length} producto(s) importados`);
    cancelReview();
    // Ir a pestaña inventario
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-panel="productos"]').classList.add('active');
    document.getElementById('panel-productos').classList.add('active');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

// ==============================================================
// STOCK ACTUAL (Vista crudo/cocinado por carne)
// ==============================================================
function renderStockActual() {
  const container = document.getElementById('stockActual');
  if (!container) return;

  // Calcular crudo y cocinado por carne (de productos en inventario)
  const stock = {};
  CARNES.forEach(carne => {
    stock[carne] = { crudo: 0, cocinado: 0, total_kg: 0 };
  });

  // Productos en inventario (entrada)
  productos.forEach(p => {
    const nombreLower = (p.nombre || '').toLowerCase();
    const carne = CARNES.find(c => nombreLower.includes(c));
    if (!carne) return;
    if (p.unidad !== 'kg') return; // solo contamos kg

    if (p.estado === 'cocinado') {
      stock[carne].cocinado += (p.cantidad || 0);
    } else {
      stock[carne].crudo += (p.cantidad || 0);
    }
  });

  // Restar mermas (las mermas son lo que se perdió, no entran al stock final)
  // Ya está implícito: peso_despues = lo que queda cocinado real
  // Pero como el inventario se registra después de cocinar, no tocamos

  container.innerHTML = `
    <div class="stock-grid">
      ${CARNES.map(carne => {
        const s = stock[carne];
        const total = s.crudo + s.cocinado;
        const pctCocinado = total > 0 ? (s.cocinado / total) * 100 : 0;
        return `
          <div class="stock-card" onclick="filtrarPorCarne('${carne}')">
            <div class="stock-name">${carne}</div>
            <div class="stock-bars">
              <div class="stock-bar-row">
                <span class="stock-label">🥩 Crudo</span>
                <span class="stock-val">${fmt(s.crudo)} kg</span>
              </div>
              <div class="stock-bar-row">
                <span class="stock-label">🔥 Cocinado</span>
                <span class="stock-val">${fmt(s.cocinado)} kg</span>
              </div>
            </div>
            <div class="stock-total">Total: <strong>${fmt(total)} kg</strong></div>
            ${total > 0 ? `<div class="stock-progress"><div style="width:${pctCocinado}%"></div></div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

window.filtrarPorCarne = function(carne) {
  const input = document.getElementById('filterProdNombre');
  if (input) {
    input.value = carne;
    renderProductos();
    document.querySelector('.tabla-wrap-prod')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

// ==============================================================
// CATÁLOGO DE PRECIOS POR PROVEEDOR
// ==============================================================
window.saveCatalogo = async function() {
  const id = document.getElementById('catId').value;
  const nombre = document.getElementById('catNombre').value.trim();
  const categoria = document.getElementById('catCategoria').value;
  const unidad = document.getElementById('catUnidad').value;
  const precio_kg = parseFloat(document.getElementById('catPrecio').value) || 0;
  const proveedor_id = document.getElementById('catProveedor').value;
  if (!nombre) { toast('Falta el nombre', 'error'); return; }

  try {
    if (id) {
      const antes = catalogo.find(c => c.id === id);
      const update = { nombre, categoria, unidad, precio_kg, proveedor_id: proveedor_id || null, updated_at: new Date().toISOString() };
      const { error } = await window.supabase.from('productos_catalogo').update(update).eq('id', id);
      if (error) throw error;
      const cambioPrecio = antes && antes.precio_kg !== precio_kg
        ? ` (precio: ${fmtMoney(antes.precio_kg)} → ${fmtMoney(precio_kg)})` : '';
      await logAudit('editar', 'catalogo', id, `Editó catálogo "${nombre}"${cambioPrecio}`, antes, update);
      toast('Catálogo actualizado');
    } else {
      const insert = { sede_id: selectedSedeId, nombre, categoria, unidad, precio_kg, proveedor_id: proveedor_id || null };
      const { data, error } = await window.supabase.from('productos_catalogo').insert(insert).select().single();
      if (error) throw error;
      await logAudit('crear', 'catalogo', data.id, `Agregó "${nombre}" al catálogo (${fmtMoney(precio_kg)}/${unidad})`, null, insert);
      toast('Producto agregado al catálogo');
    }
    await loadData();
    toggleForm('formCatalogo');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

window.editCatalogo = function(id) {
  const c = catalogo.find(x => x.id === id);
  if (!c) return;
  document.getElementById('catId').value = c.id;
  document.getElementById('catNombre').value = c.nombre;
  document.getElementById('catCategoria').value = c.categoria || 'general';
  document.getElementById('catUnidad').value = c.unidad || 'kg';
  document.getElementById('catPrecio').value = c.precio_kg;
  document.getElementById('catProveedor').value = c.proveedor_id || '';
  document.getElementById('formCatalogoTitle').textContent = 'Editar producto del catálogo';
  const f = document.getElementById('formCatalogo');
  if (!f.classList.contains('open')) f.classList.add('open');
  f.scrollIntoView({ behavior:'smooth', block:'nearest' });
};

window.deleteCatalogo = async function(id) {
  const c = catalogo.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`¿Eliminar "${c.nombre}" del catálogo?`)) return;
  try {
    const { error } = await window.supabase.from('productos_catalogo').delete().eq('id', id);
    if (error) throw error;
    await logAudit('eliminar', 'catalogo', id, `Eliminó "${c.nombre}" del catálogo`, c, null);
    await loadData();
    toast('Eliminado');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
};

function renderCatalogo() {
  const tb = document.getElementById('tblCatalogo');
  if (!tb) return;
  if (catalogo.length === 0) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty">Sin productos en el catálogo. Agrega los precios base de tus proveedores.</div></td></tr>';
    return;
  }
  tb.innerHTML = catalogo.map(c => {
    const prov = proveedores.find(p => p.id === c.proveedor_id);
    return `<tr>
      <td><strong>${escapeHTML(c.nombre)}</strong></td>
      <td><span class="badge ${c.categoria||'general'}">${c.categoria||'general'}</span></td>
      <td class="price"><strong>${fmtMoney(c.precio_kg)}</strong> /${c.unidad||'kg'}</td>
      <td>${prov ? escapeHTML(prov.nombre) : '<em style="opacity:.5">cualquiera</em>'}</td>
      <td style="font-size:10px; opacity:.6;">${c.updated_at ? new Date(c.updated_at).toLocaleDateString('es-CO') : '—'}</td>
      <td>
        <button class="btn-icon" onclick="editCatalogo('${c.id}')">✎</button>
        <button class="btn-icon danger" onclick="deleteCatalogo('${c.id}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function refreshCatalogoSelects() {
  const sel = document.getElementById('prodCatalogo');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sin catálogo (escribir manual) —</option>' +
    catalogo.map(c => {
      const prov = proveedores.find(p => p.id === c.proveedor_id);
      return `<option value="${c.id}">${escapeHTML(c.nombre)} · ${fmtMoney(c.precio_kg)}${prov ? ' · ' + escapeHTML(prov.nombre) : ''}</option>`;
    }).join('');
}

// ==============================================================
// AUDITORÍA
// ==============================================================
function renderAuditoria() {
  const tb = document.getElementById('tblAuditoria');
  if (!tb) return;
  if (auditoria.length === 0) {
    tb.innerHTML = '<tr><td colspan="5"><div class="empty">Sin actividad registrada.</div></td></tr>';
    return;
  }

  const accionIco = { crear: '➕', editar: '✏️', eliminar: '🗑️' };
  const accionColor = { crear: '#16a34a', editar: '#0891b2', eliminar: '#dc2626' };

  tb.innerHTML = auditoria.map(a => {
    const fecha = new Date(a.created_at);
    const fechaFmt = fecha.toLocaleDateString('es-CO', { day:'2-digit', month:'short' });
    const horaFmt = fecha.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
    const sede = sedes.find(s => s.id === a.sede_id);
    return `<tr>
      <td>
        <div style="font-weight:700;">${fechaFmt}</div>
        <div style="font-size:10px; opacity:.6;">${horaFmt}</div>
      </td>
      <td style="font-size:11px;">${escapeHTML((a.user_email || '').split('@')[0] || '—')}</td>
      <td>
        <span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; color:${accionColor[a.accion]||'#666'};">
          ${accionIco[a.accion] || '•'} ${a.accion.toUpperCase()}
        </span>
        <div style="font-size:10px; opacity:.6; margin-top:2px;">${escapeHTML(a.entidad)}</div>
      </td>
      <td style="font-size:12px;">${escapeHTML(a.descripcion || '—')}</td>
      <td style="font-size:10px; opacity:.7;">${escapeHTML(sede?.nombre || '—')}</td>
    </tr>`;
  }).join('');
}

// ==============================================================
// CIERRE DIARIO DE INVENTARIO
// ==============================================================
let cierres = [];

async function loadCierres() {
  try {
    let query = window.supabase.from('cierres_inventario').select('*').order('fecha', { ascending: false }).limit(60);
    // Admin ve todos, jefe solo su sede
    if (userRole !== 'admin' && selectedSedeId) {
      query = query.eq('sede_id', selectedSedeId);
    }
    const { data } = await query;
    cierres = data || [];
    renderCierres();
  } catch (e) {
    console.error('Error cargando cierres:', e);
  }
}

window.realizarCierre = async function() {
  if (!selectedSedeId) { toast('Selecciona una sede', 'error'); return; }

  const hoy = new Date().toISOString().slice(0, 10);
  const sede = sedes.find(s => s.id === selectedSedeId);

  // Verificar si ya existe cierre de hoy
  const existente = cierres.find(c => c.fecha === hoy && c.sede_id === selectedSedeId);
  if (existente) {
    if (!confirm(`⚠️ Ya existe un cierre de hoy (${hoy}) para ${sede?.nombre}.\n\n¿Quieres reemplazarlo con los datos actuales?`)) return;
    // Eliminar el anterior
    await window.supabase.from('cierres_inventario').delete().eq('id', existente.id);
  }

  const notas = prompt(`📝 Notas del cierre de hoy (${sede?.nombre}):\n\n(opcional — ej: "faltó proveedor de carnes", "día lento", etc.)`, '');

  const totalInv = productos.reduce((s, p) => s + (p.cantidad || 0) * (p.precio || 0), 0);
  const totalMermaKg = mermas.filter(m => m.fecha === hoy).reduce((s, m) => s + (m.cantidad || 0), 0);

  const resumen = {
    totalProductos: productos.length,
    totalProveedores: proveedores.length,
    totalInversion: totalInv,
    totalMermas: mermas.filter(m => m.fecha === hoy).length,
    totalMermaKg,
    fecha: hoy,
    sede: sede?.nombre || ''
  };

  try {
    const { error } = await window.supabase.from('cierres_inventario').insert({
      sede_id: selectedSedeId,
      fecha: hoy,
      cerrado_por: currentUser.id,
      cerrado_por_email: currentUser.email,
      productos: productos.map(p => ({
        nombre: p.nombre,
        cantidad: p.cantidad,
        unidad: p.unidad,
        precio: p.precio,
        proveedor: proveedores.find(x => x.id === p.proveedor_id)?.nombre || null,
        subtotal: (p.cantidad || 0) * (p.precio || 0)
      })),
      proveedores: proveedores.map(p => ({
        nombre: p.nombre,
        categoria: p.categoria,
        contacto: p.contacto
      })),
      mermas: mermas.filter(m => m.fecha === hoy).map(m => ({
        tipo: m.tipo,
        peso_antes: m.peso_antes,
        peso_despues: m.peso_despues,
        cantidad: m.cantidad,
        porcentaje: m.porcentaje,
        costo: m.costo,
        motivo: m.motivo
      })),
      resumen,
      notas: notas || null
    });

    if (error) throw error;
    await logAudit('crear', 'cierre', hoy, `Cerró el día ${hoy} (${resumen.totalProductos} productos, ${fmtMoney(resumen.totalInversion)})`, null, resumen);
    toast('✓ Cierre del día registrado correctamente');
    await loadCierres();

    // Ir a la pestaña historial
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-panel="historial"]').classList.add('active');
    document.getElementById('panel-historial').classList.add('active');
  } catch (err) {
    console.error(err);
    toast('Error al guardar cierre: ' + err.message, 'error');
  }
};

function renderCierres() {
  const tb = document.getElementById('tblCierres');
  if (!tb) return;

  // Status: verificar si hoy ya tiene cierre
  const hoy = new Date().toISOString().slice(0, 10);
  const cierreHoy = cierres.find(c => c.fecha === hoy && c.sede_id === selectedSedeId);
  const statusDiv = document.getElementById('cierre-status');

  if (cierreHoy) {
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = `
      <div style="background:var(--cream); border:3px solid #16a34a; border-radius:14px; padding:16px 20px; display:flex; align-items:center; gap:14px;">
        <div style="font-size:28px;">✅</div>
        <div>
          <div style="font-family:'Bungee',sans-serif; font-size:14px; color:#166534;">CIERRE DE HOY REALIZADO</div>
          <div style="font-family:'Inter',sans-serif; font-size:12px; color:var(--ink); margin-top:2px;">
            Por <strong>${escapeHTML(cierreHoy.cerrado_por_email || '')}</strong> · 
            ${cierreHoy.resumen?.totalProductos || 0} productos · 
            ${fmtMoney(cierreHoy.resumen?.totalInversion || 0)} inversión
            ${cierreHoy.notas ? ` · <em>"${escapeHTML(cierreHoy.notas)}"</em>` : ''}
          </div>
        </div>
      </div>
    `;
  } else {
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = `
      <div style="background:var(--cream); border:3px solid var(--blood); border-radius:14px; padding:16px 20px; display:flex; align-items:center; gap:14px;">
        <div style="font-size:28px;">⏳</div>
        <div>
          <div style="font-family:'Bungee',sans-serif; font-size:14px; color:var(--blood);">PENDIENTE · CIERRE DE HOY</div>
          <div style="font-family:'Inter',sans-serif; font-size:12px; color:var(--ink); margin-top:2px;">
            Recuerda cerrar el día antes de irte. Usa el botón "📸 Cerrar el día de hoy".
          </div>
        </div>
      </div>
    `;
  }

  if (cierres.length === 0) {
    tb.innerHTML = '<tr><td colspan="8"><div class="empty">Sin cierres registrados. Usa el botón "📸 Cerrar el día de hoy".</div></td></tr>';
    return;
  }

  tb.innerHTML = cierres.map(c => {
    const sede = sedes.find(s => s.id === c.sede_id);
    const r = c.resumen || {};
    const esHoy = c.fecha === hoy;
    return `
      <tr style="${esHoy ? 'background:rgba(22,163,34,0.06);' : ''}">
        <td><strong style="${esHoy ? 'color:#16a34a;' : ''}">${c.fecha}</strong>${esHoy ? ' <span style="background:#16a34a; color:#fff; padding:1px 6px; border-radius:4px; font-size:9px; font-weight:800;">HOY</span>' : ''}</td>
        <td>${escapeHTML(sede?.nombre || '—')}</td>
        <td style="font-size:12px;">${escapeHTML(c.cerrado_por_email || '—')}</td>
        <td class="qty">${r.totalProductos || 0}</td>
        <td class="price">${fmtMoney(r.totalInversion || 0)}</td>
        <td class="qty">${fmt(r.totalMermaKg || 0)}</td>
        <td style="font-size:12px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(c.notas || '—')}</td>
        <td>
          <button class="btn-icon" onclick="verCierre('${c.id}')" title="Ver detalle">👁</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.verCierre = function(id) {
  const c = cierres.find(x => x.id === id);
  if (!c) return;
  const sede = sedes.find(s => s.id === c.sede_id);
  const r = c.resumen || {};
  const prods = c.productos || [];
  const mermasC = c.mermas || [];

  let prodRows = prods.map(p =>
    `<tr><td>${escapeHTML(p.nombre)}</td><td class="qty">${fmt(p.cantidad)} ${p.unidad||''}</td><td class="price">${fmtMoney(p.precio)}</td><td class="price"><strong>${fmtMoney(p.subtotal||0)}</strong></td><td>${escapeHTML(p.proveedor||'—')}</td></tr>`
  ).join('');

  let mermaRows = mermasC.map(m =>
    `<tr><td style="text-transform:capitalize;">${escapeHTML(m.tipo)}</td><td class="qty">${fmt(m.peso_antes||0)}</td><td class="qty">${fmt(m.peso_despues||0)}</td><td class="qty"><strong style="color:var(--blood)">${fmt(m.cantidad||0)}</strong></td><td>${escapeHTML(m.motivo||'—')}</td></tr>`
  ).join('');

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed; inset:0; background:rgba(13,36,81,0.8); display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px;';
  modal.innerHTML = `
    <div style="background:var(--cream); border:4px solid var(--ink); border-radius:20px; padding:28px; max-width:900px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.4);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;">
        <div>
          <div style="font-family:'Bungee',sans-serif; font-size:22px; color:var(--ink);">📋 CIERRE ${c.fecha}</div>
          <div style="font-family:'Inter',sans-serif; font-size:13px; color:var(--ink); margin-top:4px; opacity:0.7;">
            ${escapeHTML(sede?.nombre || '')} · Por ${escapeHTML(c.cerrado_por_email || '')}
          </div>
        </div>
        <button onclick="this.closest('div[style]').remove()" style="background:var(--blood); color:#fff; border:3px solid var(--ink); border-radius:10px; padding:8px 16px; font-weight:800; cursor:pointer; font-family:'Inter',sans-serif; font-size:12px;">✕ CERRAR</button>
      </div>

      ${c.notas ? `<div style="background:var(--paper); border:2px solid var(--ink); border-radius:12px; padding:12px 16px; margin-bottom:20px; font-family:'Inter',sans-serif; font-size:13px;"><strong>📝 Notas:</strong> ${escapeHTML(c.notas)}</div>` : ''}

      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin-bottom:20px;">
        <div style="background:var(--paper); border:2px solid var(--ink); border-radius:12px; padding:12px; border-left:5px solid var(--blood);">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.08em; opacity:0.65; font-weight:700;">Productos</div>
          <div style="font-family:'Inter',sans-serif; font-size:24px; font-weight:900; color:var(--blood);">${r.totalProductos||0}</div>
        </div>
        <div style="background:var(--paper); border:2px solid var(--ink); border-radius:12px; padding:12px; border-left:5px solid var(--ink);">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.08em; opacity:0.65; font-weight:700;">Inversión</div>
          <div style="font-family:'Inter',sans-serif; font-size:24px; font-weight:900; color:var(--ink);">${fmtMoney(r.totalInversion||0)}</div>
        </div>
        <div style="background:var(--paper); border:2px solid var(--ink); border-radius:12px; padding:12px; border-left:5px solid var(--mustard);">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.08em; opacity:0.65; font-weight:700;">Merma (kg)</div>
          <div style="font-family:'Inter',sans-serif; font-size:24px; font-weight:900; color:var(--blood-dark);">${fmt(r.totalMermaKg||0)}</div>
        </div>
      </div>

      <div style="font-family:'Bungee',sans-serif; font-size:16px; color:var(--ink); margin-bottom:10px;">Productos</div>
      <div class="table-wrap" style="margin-bottom:20px;">
        <table>
          <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th><th>Proveedor</th></tr></thead>
          <tbody>${prodRows || '<tr><td colspan="5" style="text-align:center; opacity:.5;">Sin productos</td></tr>'}</tbody>
        </table>
      </div>

      ${mermaRows ? `
        <div style="font-family:'Bungee',sans-serif; font-size:16px; color:var(--ink); margin-bottom:10px;">Mermas del día</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tipo</th><th>Antes (kg)</th><th>Después (kg)</th><th>Merma (kg)</th><th>Motivo</th></tr></thead>
            <tbody>${mermaRows}</tbody>
          </table>
        </div>
      ` : ''}
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
};

// ==============================================================
// EXPORTAR
// ==============================================================
window.exportToExcel = function() {
  if (typeof XLSX === 'undefined') { toast('Cargando librería...', 'error'); return; }
  const wb = XLSX.utils.book_new();
  const sede = sedes.find(s => s.id === selectedSedeId);
  const sedeName = sede ? sede.nombre : 'General';

  // Resumen
  const resumen = [
    ['TACO PARADO · INVENTARIO'],
    ['Sede', sedeName],
    ['Fecha', new Date().toLocaleDateString('es-CO')],
    [''],
    ['Proveedores', proveedores.length],
    ['Productos', productos.length],
    ['Inversión total', productos.reduce((s,p) => s + (p.cantidad||0) * (p.precio||0), 0)],
    ['Mermas registradas', mermas.length],
    ['Total mermas (kg)', mermas.reduce((s,m) => s + (m.cantidad||0), 0)]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');

  // Proveedores
  const provData = [['Nombre','Categoría','Contacto','Productos']];
  proveedores.forEach(p => {
    provData.push([p.nombre, p.categoria||'', p.contacto||'', productos.filter(x=>x.proveedor_id===p.id).length]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(provData), 'Proveedores');

  // Productos
  const prodData = [['Producto','Cantidad','Unidad','Precio Unit.','Subtotal','Proveedor','Fecha']];
  productos.forEach(p => {
    const prov = proveedores.find(x => x.id === p.proveedor_id);
    prodData.push([p.nombre, p.cantidad, p.unidad, p.precio, (p.cantidad||0)*(p.precio||0), prov?.nombre||'', p.fecha||'']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prodData), 'Inventario');

  // Mermas
  const mermaData = [['Fecha','Tipo','Antes (kg)','Después (kg)','Merma (kg)','%','Valor','Motivo']];
  mermas.forEach(m => {
    const antes = m.peso_antes ?? m.cantidad ?? 0;
    const despues = m.peso_despues ?? 0;
    const mk = m.cantidad || Math.max(0, antes-despues);
    const pct = antes > 0 ? (mk/antes)*100 : 0;
    mermaData.push([m.fecha, m.tipo, antes, despues, mk, pct.toFixed(1)+'%', mk*(m.costo||0), m.motivo||'']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mermaData), 'Mermas');

  XLSX.writeFile(wb, `Inventario_${sedeName.replace(/\s/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('✓ Excel descargado');
};

window.exportBackup = function() {
  const data = { proveedores, productos, mermas, sede: selectedSedeId, exportado: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `inventario_backup_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('✓ Backup descargado');
};

// ==============================================================
// FORMS / TABS / UI
// ==============================================================
window.toggleForm = function(id) {
  const f = document.getElementById(id);
  f.classList.toggle('open');
  if (f.classList.contains('open')) f.scrollIntoView({ behavior:'smooth', block:'nearest' });
  if (id === 'formProducto' && !f.classList.contains('open')) {
    document.getElementById('prodId').value = '';
    document.getElementById('formProductoTitle').textContent = 'Nuevo producto';
    ['prodNombre','prodCantidad','prodPrecio'].forEach(i => document.getElementById(i).value = '');
  }
  if (id === 'formProveedor' && !f.classList.contains('open')) {
    document.getElementById('provId').value = '';
    document.getElementById('formProveedorTitle').textContent = 'Nuevo proveedor';
    ['provNombre','provTelefono','provContacto'].forEach(i => document.getElementById(i).value = '');
  }
  if (id === 'formMerma' && !f.classList.contains('open')) {
    document.getElementById('mermaId').value = '';
    document.getElementById('formMermaTitle').textContent = 'Registrar merma de cocción';
    ['mermaPesoAntes','mermaPesoDespues','mermaCosto','mermaMotivo'].forEach(i => document.getElementById(i).value = '');
    recalcMerma();
  }
  if (id === 'formCatalogo' && !f.classList.contains('open')) {
    document.getElementById('catId').value = '';
    document.getElementById('formCatalogoTitle').textContent = 'Nuevo producto del catálogo';
    ['catNombre','catPrecio'].forEach(i => document.getElementById(i).value = '');
  }
};

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.panel).classList.add('active');
  });
});

window.changeSub = function(name) {
  document.querySelectorAll('.sub-tab').forEach(s => s.classList.toggle('active', s.dataset.sub === name));
  document.querySelectorAll('.sub-panel').forEach(p => p.classList.toggle('active', p.id === 'sub-' + name));
};

// Scan modes
document.querySelectorAll('.scan-mode').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.scan-mode').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.scan-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('scan' + btn.dataset.mode.charAt(0).toUpperCase() + btn.dataset.mode.slice(1)).classList.add('active');
  });
});

window.logout = async function() {
  await window.supabase.auth.signOut();
  window.location.href = 'index.html';
};

// ==============================================================
// INIT
// ==============================================================
function initDates() {
  const iso = new Date().toISOString().slice(0,10);
  const mf = document.getElementById('mermaFecha');
  const sf = document.getElementById('scanFecha');
  const sft = document.getElementById('scanFechaTxt');
  const pf = document.getElementById('prodFecha');
  if (mf) mf.value = iso;
  if (sf) sf.value = iso;
  if (sft) sft.value = iso;
  if (pf) pf.value = iso;
}

initDates();
setupDropzone();
checkAuth();
