// ==============================================================
// TACO PARADO · PANEL ADMIN · LÓGICA COMPLETA
// ==============================================================

// CONSTANTES
const EDITOR_W = 560, EDITOR_H = 353;      // Dimensiones del editor
const FINAL_W = 1012, FINAL_H = 638;        // Dimensiones finales 300dpi

const TOKEN_TYPES = {
  nombre: {
    label: 'Nombre', desc: '{{nombre}}', icon: 'A', iconColor: '#FF9000',
    type: 'text', sample: 'CARLOS RAMÍREZ',
    defaults: { w: 260, h: 40, font: 'Archivo Black', size: 22, color: '#FFFFFF', shadow: true, shadowColor: '#1A3F91', align: 'left', weight: '900' }
  },
  id: {
    label: 'ID del miembro', desc: '{{id}}', icon: '#', iconColor: '#5271FF',
    type: 'text', sample: 'TP-000271',
    defaults: { w: 180, h: 28, font: 'Space Mono', size: 18, color: '#FFFFFF', shadow: true, shadowColor: '#1A3F91', align: 'left', weight: '700' }
  },
  qr: {
    label: 'Código QR', desc: '{{qr}}', icon: '▦', iconColor: '#1A3F91',
    type: 'qr', defaults: { w: 120, h: 120 }
  },
  foto: {
    label: 'Foto / Personaje', desc: '{{foto}}', icon: '🖼', iconColor: '#EC7020',
    type: 'image', defaults: { w: 130, h: 130 }
  },
  nivel: {
    label: 'Nivel (tier)', desc: '{{nivel}}', icon: '★', iconColor: '#FFD77A',
    type: 'text', sample: '★★★ ORO',
    defaults: { w: 100, h: 24, font: 'Bungee', size: 14, color: '#1A3F91', shadow: false, align: 'center', weight: '400' }
  },
  fecha_alta: {
    label: 'Fecha de ingreso', desc: '{{fecha_alta}}', icon: '📅', iconColor: '#5BAE4C',
    type: 'text', sample: '04/26',
    defaults: { w: 80, h: 20, font: 'Space Mono', size: 12, color: '#FFFFFF', shadow: false, align: 'center', weight: '700' }
  },
  instagram: {
    label: 'Instagram', desc: '{{instagram}}', icon: '@', iconColor: '#E1306C',
    type: 'text', sample: '@carlosr',
    defaults: { w: 140, h: 20, font: 'Space Mono', size: 11, color: '#FFFFFF', shadow: false, align: 'left', weight: '700' }
  }
};

// STATE
let clientes = [];
let currentUser = null;
let selectedId = null;
let editingId = null;
let currentFilter = 'all';
let config = { qrBase: '', ig: '@tacoparado.co', prefijo: 'TP-', logoUrl: null };
let plantillas = [];
let plantillaActiva = null;

const PUBLIC_BASE = window.location.origin + window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '') + '/perfil.html?id=';

const editor = {
  currentFace: 'front',
  templates: { front: null, back: null },
  fields: { front: [], back: [] },
  selectedFieldId: null,
  previewMode: false,
  editingId: null
};

// ==============================================================
// HELPERS
// ==============================================================
async function waitForSupabase() {
  while (!window.supabase) await new Promise(r => setTimeout(r, 50));
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function toast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('error');
  if (type === 'error') t.classList.add('error');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function showSync(show) {
  document.getElementById('sync-indicator').classList.toggle('show', show);
}
function showLoading(msg) {
  document.getElementById('loading').classList.add('show');
  document.querySelector('#loading > div:nth-child(2)').textContent = msg || 'GENERANDO…';
}
function setLoadingProgress(msg) {
  document.getElementById('loading-progress').textContent = msg || '';
}
function hideLoading() {
  document.getElementById('loading').classList.remove('show');
}

function logoDefault() {
  // Si hay logo configurado en Supabase, usarlo
  if (config.logoUrl) {
    return `<img src="${config.logoUrl}" crossorigin="anonymous" style="width:100%; height:100%; object-fit:contain;">`;
  }
  // Fallback: taco genérico
  return tacoSVGSample();
}

function tacoSVGSample() {
  return `<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg' width='90%' height='90%'>
    <circle cx='100' cy='100' r='85' fill='#5271FF' stroke='#1A3F91' stroke-width='4'/>
    <ellipse cx='100' cy='115' rx='48' ry='38' fill='#FFD24D' stroke='#1A3F91' stroke-width='3'/>
    <path d='M 58 105 Q 70 90, 85 95 Q 100 85, 115 95 Q 130 88, 142 105 L 140 108 Q 125 100, 115 108 Q 100 98, 85 108 Q 70 102, 60 108 Z' fill='#5BAE4C' stroke='#1A3F91' stroke-width='2'/>
    <circle cx='88' cy='122' r='8' fill='#fff' stroke='#1A3F91' stroke-width='2'/>
    <circle cx='112' cy='122' r='8' fill='#fff' stroke='#1A3F91' stroke-width='2'/>
    <circle cx='90' cy='124' r='3.5' fill='#1A3F91'/>
    <circle cx='114' cy='124' r='3.5' fill='#1A3F91'/>
    <path d='M 90 138 Q 100 146, 110 138' stroke='#1A3F91' stroke-width='2.5' fill='none' stroke-linecap='round'/>
  </svg>`;
}

function normalizarInstagram(input) {
  if (!input) return null;
  let v = input.trim();
  if (!v) return null;
  v = v.replace(/\s+/g, '');
  if (v.startsWith('@')) {
    const user = v.slice(1).replace(/[^a-zA-Z0-9._]/g, '');
    return user ? `https://instagram.com/${user}` : null;
  }
  v = v.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (v.toLowerCase().startsWith('instagram.com/') || v.toLowerCase().startsWith('instagr.am/')) {
    const path = v.split('/').slice(1).join('/').split('?')[0].split('#')[0];
    const user = path.replace(/\/$/, '').replace(/[^a-zA-Z0-9._]/g, '');
    return user ? `https://instagram.com/${user}` : null;
  }
  if (/^[a-zA-Z0-9._]+$/.test(v)) return `https://instagram.com/${v}`;
  return null;
}

function obtenerDestinoQR(cliente) {
  const ig = normalizarInstagram(cliente.instagram);
  if (ig) return { url: ig, tipo: 'instagram' };
  return { url: (config.qrBase || PUBLIC_BASE) + cliente.id, tipo: 'perfil' };
}

function tierName(tier) {
  return { bronce: '★ BRONCE', plata: '★★ PLATA', oro: '★★★ ORO', master: '♛ MASTER' }[tier] || '';
}

// ==============================================================
// AUTH
// ==============================================================
async function checkAuth() {
  await waitForSupabase();
  const { data: { session } } = await window.supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    showApp();
  } else {
    showLogin();
  }
  window.supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { currentUser = null; showLogin(); }
    else if (event === 'SIGNED_IN' && session) { currentUser = session.user; showApp(); }
  });
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

async function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('user-email').textContent = currentUser.email;
  await loadData();
  setupRealtime();
}

window.logout = async function() {
  await window.supabase.auth.signOut();
};

document.getElementById('login-form').onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errDiv = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');
  errDiv.classList.remove('show');
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    await waitForSupabase();
    const { error } = await window.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (err) {
    errDiv.textContent = '❌ ' + (err.message || 'Error');
    errDiv.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Iniciar sesión';
  }
};

// ==============================================================
// LOAD DATA
// ==============================================================
async function loadData() {
  showSync(true);
  try {
    const { data: clData } = await window.supabase.from('clientes').select('*').order('created_at', { ascending: false });
    clientes = clData || [];

    const { data: cfgData } = await window.supabase.from('config').select('*');
    if (cfgData) {
      cfgData.forEach(r => {
        if (r.key === 'qrBase') config.qrBase = r.value;
        if (r.key === 'ig') config.ig = r.value;
        if (r.key === 'prefijo') config.prefijo = r.value;
        if (r.key === 'logoUrl') config.logoUrl = r.value;
      });
    }
    if (!config.qrBase) config.qrBase = PUBLIC_BASE;

    const { data: plData } = await window.supabase.from('plantillas').select('*').order('created_at', { ascending: false });
    plantillas = plData || [];
    plantillaActiva = plantillas.find(p => p.activa) || null;

    document.getElementById('cfg-qr-base').value = config.qrBase;
    document.getElementById('cfg-ig').value = config.ig;
    actualizarLogoUI();

    actualizarPlantillaUI();
    renderTabla();
    updateStats();
    renderTokensList();
  } catch (err) {
    console.error(err);
    toast('⚠️ Error al cargar datos', 'error');
  } finally {
    showSync(false);
  }
}

function updateStats() {
  document.getElementById('stat-total').textContent = clientes.length;
  const pending = clientes.filter(c => !c.carnet_entregado).length;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('count-all').textContent = clientes.length;
  document.getElementById('count-pending').textContent = pending;
  document.getElementById('count-delivered').textContent = clientes.length - pending;
}

// ==============================================================
// TABS
// ==============================================================
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => switchTab(t.dataset.tab);
});

window.switchTab = function(name) {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(x => x.classList.toggle('active', x.id === 'panel-' + name));
  if (name === 'plantillas') setTimeout(() => editorRenderCanvas(), 50);
};

// ==============================================================
// REALTIME
// ==============================================================
async function setupRealtime() {
  await waitForSupabase();
  window.supabase.channel('tp-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, (payload) => {
      if (!document.hidden) loadData();
      if (payload.eventType === 'INSERT') toast('🔔 Nuevo cliente registrado');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'plantillas' }, () => {
      if (!document.hidden) loadData();
    })
    .subscribe();
}

// ==============================================================
// FORM CLIENTES
// ==============================================================
document.getElementById('cliente-form').onsubmit = async (e) => {
  e.preventDefault();
  if (!editingId) { toast('Selecciona un cliente primero', 'error'); return; }
  const nombre = document.getElementById('cli-nombre').value.trim();
  if (!nombre) return;

  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  showSync(true);
  try {
    const { error } = await window.supabase.from('clientes').update({
      nombre,
      tel: document.getElementById('cli-tel').value.trim() || null,
      email: document.getElementById('cli-email').value.trim() || null,
      instagram: document.getElementById('cli-instagram').value.trim() || null,
      tier: document.getElementById('cli-tier').value
    }).eq('id', editingId);
    if (error) throw error;
    toast('✓ Cliente actualizado');
    resetForm();
    await loadData();
  } catch (err) {
    toast('⚠️ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Actualizar';
    showSync(false);
  }
};

document.getElementById('btn-cancel').onclick = resetForm;

function resetForm() {
  editingId = null;
  document.getElementById('cliente-form').reset();
  document.getElementById('cli-tier').value = 'bronce';
  document.getElementById('form-title').textContent = 'EDITAR';
  document.getElementById('form-sub').textContent = 'Selecciona un cliente de la lista';
  document.getElementById('btn-save').textContent = 'Actualizar';
  document.getElementById('btn-save').disabled = true;
}

window.editarCliente = function(id) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  editingId = id;
  document.getElementById('cli-nombre').value = c.nombre;
  document.getElementById('cli-tel').value = c.tel || '';
  document.getElementById('cli-email').value = c.email || '';
  document.getElementById('cli-instagram').value = c.instagram || '';
  document.getElementById('cli-tier').value = c.tier;
  document.getElementById('form-title').textContent = 'EDITAR · ' + c.id;
  document.getElementById('form-sub').textContent = c.nombre;
  document.getElementById('btn-save').disabled = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.eliminarCliente = async function(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  showSync(true);
  try {
    const { error } = await window.supabase.from('clientes').delete().eq('id', id);
    if (error) throw error;
    if (selectedId === id) unselectCliente();
    await loadData();
    toast('✓ Eliminado');
  } catch (err) {
    toast('⚠️ ' + err.message, 'error');
  } finally {
    showSync(false);
  }
};

window.toggleEntrega = async function(id, estado) {
  showSync(true);
  try {
    const update = { carnet_entregado: estado, fecha_entrega: estado ? new Date().toISOString() : null };
    const { error } = await window.supabase.from('clientes').update(update).eq('id', id);
    if (error) throw error;
    await loadData();
    toast(estado ? '✓ Marcado como entregado' : '✓ Revertido a pendiente');
  } catch (err) {
    toast('⚠️ ' + err.message, 'error');
  } finally {
    showSync(false);
  }
};

// ==============================================================
// TABLA
// ==============================================================
window.setFilter = function(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === filter));
  renderTabla();
};

document.getElementById('search').oninput = renderTabla;

function renderTabla() {
  const q = document.getElementById('search').value.toLowerCase().trim();
  const body = document.getElementById('tabla-body');
  const empty = document.getElementById('empty-state');

  let filtrados = clientes;
  if (currentFilter === 'pending') filtrados = filtrados.filter(c => !c.carnet_entregado);
  if (currentFilter === 'delivered') filtrados = filtrados.filter(c => c.carnet_entregado);
  if (q) filtrados = filtrados.filter(c => c.nombre.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));

  body.innerHTML = '';
  if (filtrados.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  filtrados.forEach(c => {
    const tr = document.createElement('tr');
    if (c.id === selectedId) tr.classList.add('selected');
    const esHoy = c.alta === new Date().toISOString().slice(0, 10);
    if (esHoy && !c.carnet_entregado) tr.classList.add('new-registration');

    const inicial = c.nombre.charAt(0).toUpperCase();
    const tierLabels = { bronce: '★ Bronce', plata: '★★ Plata', oro: '★★★ Oro', master: '♛ Master' };

    tr.innerHTML = `
      <td><div class="mini-avatar">${c.imagen ? `<img src="${c.imagen}">` : `<span class="initial">${inicial}</span>`}</div></td>
      <td><span class="id-tag">${c.id}</span></td>
      <td><strong>${escapeHtml(c.nombre)}</strong>${esHoy && !c.carnet_entregado ? ' <span style="background:#22c55e; color:#fff; padding:1px 5px; border-radius:3px; font-size:9px; font-family: Space Mono; letter-spacing: 0.5px;">NUEVO</span>' : ''}</td>
      <td><span class="tier-badge tier-${c.tier}">${tierLabels[c.tier]}</span></td>
      <td style="font-family:'Space Mono',monospace; font-size:11px;">${c.tel || '—'}</td>
      <td style="font-family:'Space Mono',monospace; font-size:10px; color:var(--muted);">${c.alta}</td>
      <td>${c.carnet_entregado ? '<span class="entrega-status entrega-done"><span class="entrega-dot"></span>ENTREGADO</span>' : '<span class="entrega-status entrega-pending"><span class="entrega-dot"></span>PENDIENTE</span>'}</td>
      <td><div class="row-actions">
        <button onclick="seleccionarCliente('${c.id}')">👁 VER</button>
        <button onclick="editarCliente('${c.id}')">✎</button>
        ${c.carnet_entregado
          ? `<button class="undeliver-btn" onclick="toggleEntrega('${c.id}', false)" title="Marcar pendiente">↩</button>`
          : `<button class="deliver-btn" onclick="toggleEntrega('${c.id}', true)" title="Marcar entregado">✓ ENTREGAR</button>`}
        <button onclick="eliminarCliente('${c.id}')" style="color:#B5351A;">🗑</button>
      </div></td>
    `;
    body.appendChild(tr);
  });
}

// ==============================================================
// PREVIEW
// ==============================================================
window.seleccionarCliente = function(id) {
  selectedId = id;
  const c = clientes.find(x => x.id === id);
  if (!c) return;

  const container = document.getElementById('cards-preview');

  if (!plantillaActiva) {
    container.innerHTML = `<div style="padding:30px; background:#FEF3C7; border-radius:10px; border-left:3px solid #D97706; max-width:100%;">
      <p style="color:#92400E; font-size:14px; line-height:1.5;">⚠️ No hay plantilla de carnet activa.<br><a onclick="switchTab('plantillas')" style="color:#B45309; font-weight:700; cursor:pointer; text-decoration:underline;">Crea una desde el editor →</a></p>
    </div>`;
    document.getElementById('btn-export').disabled = true;
  } else {
    container.innerHTML = '';
    document.getElementById('btn-export').disabled = false;
    ['front', 'back'].forEach(face => {
      const hasFace = plantillaActiva.templates?.[face] || (plantillaActiva.fields?.[face] && plantillaActiva.fields[face].length > 0);
      if (!hasFace) return;
      const wrap = document.createElement('div');
      const cardEl = renderCarnetDinamico(c, face);
      wrap.appendChild(cardEl);
      const lbl = document.createElement('div');
      lbl.className = 'card-label';
      lbl.textContent = face === 'front' ? 'FRENTE' : 'REVERSO';
      wrap.appendChild(lbl);
      container.appendChild(wrap);
    });
  }

  const destino = obtenerDestinoQR(c);
  document.getElementById('share-url').textContent = destino.url;
  document.getElementById('share-url-wrap').style.display = 'block';
  document.getElementById('preview-panel').style.display = 'block';
  renderTabla();
  document.getElementById('preview-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.unselectCliente = function() {
  selectedId = null;
  document.getElementById('preview-panel').style.display = 'none';
  renderTabla();
};

window.copiarURL = async function() {
  try {
    await navigator.clipboard.writeText(document.getElementById('share-url').textContent);
    toast('✓ URL copiada');
  } catch {
    toast('⚠️ No se pudo copiar', 'error');
  }
};

// ==============================================================
// RENDER CARNET DINÁMICO
// ==============================================================
function renderCarnetDinamico(cliente, face, options = {}) {
  const scale = options.scale || 1;
  const W = EDITOR_W * scale;
  const H = EDITOR_H * scale;

  const wrap = document.createElement('div');
  wrap.className = 'card-dynamic';
  wrap.style.width = W + 'px';
  wrap.style.height = H + 'px';

  if (plantillaActiva.templates?.[face]) {
    const img = document.createElement('img');
    img.className = 'bg-template';
    img.src = plantillaActiva.templates[face];
    img.crossOrigin = 'anonymous';
    wrap.appendChild(img);
  }

  const fields = plantillaActiva.fields?.[face] || [];
  fields.forEach(field => {
    const tokenDef = TOKEN_TYPES[field.tokenType];
    if (!tokenDef) return;

    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = (field.x * scale) + 'px';
    el.style.top = (field.y * scale) + 'px';
    el.style.width = (field.w * scale) + 'px';
    el.style.height = (field.h * scale) + 'px';

    if (tokenDef.type === 'text') {
      el.className = 'dyn-field';
      el.style.fontFamily = `'${field.font}', sans-serif`;
      el.style.fontSize = (field.size * scale) + 'px';
      el.style.color = field.color;
      el.style.fontWeight = field.weight || '700';
      el.style.justifyContent = field.align === 'center' ? 'center' : (field.align === 'right' ? 'flex-end' : 'flex-start');
      if (field.shadow) {
        el.style.textShadow = `${2 * scale}px ${2 * scale}px 0 ${field.shadowColor || '#1A3F91'}`;
      }
      let texto = '';
      if (field.tokenType === 'nombre') texto = cliente.nombre.toUpperCase();
      else if (field.tokenType === 'id') texto = cliente.id;
      else if (field.tokenType === 'nivel') texto = tierName(cliente.tier);
      else if (field.tokenType === 'fecha_alta') texto = cliente.alta ? (cliente.alta.slice(5, 7) + '/' + cliente.alta.slice(2, 4)) : '';
      else if (field.tokenType === 'instagram') {
        const ig = normalizarInstagram(cliente.instagram);
        texto = ig ? '@' + ig.replace('https://instagram.com/', '') : (cliente.instagram || '');
      }
      el.textContent = texto;
    } else if (tokenDef.type === 'qr') {
      el.className = 'dyn-qr';
      const qrInner = document.createElement('div');
      el.appendChild(qrInner);
      const destino = obtenerDestinoQR(cliente);
      setTimeout(() => {
        qrInner.innerHTML = '';
        new QRCode(qrInner, {
          text: destino.url,
          width: (field.w - 8) * scale,
          height: (field.h - 8) * scale,
          colorDark: destino.tipo === 'instagram' ? '#C13584' : '#1A3F91',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
      }, 20);
    } else if (tokenDef.type === 'image') {
      el.className = 'dyn-image';
      if (cliente.imagen) {
        const img = document.createElement('img');
        img.src = cliente.imagen;
        img.crossOrigin = 'anonymous';
        el.appendChild(img);
      } else {
        el.innerHTML = logoDefault();
      }
    }

    wrap.appendChild(el);
  });

  return wrap;
}

// ==============================================================
// EDITOR DE PLANTILLAS
// ==============================================================
function renderTokensList() {
  const list = document.getElementById('tokens-list');
  if (!list) return;
  const placed = (editor.fields[editor.currentFace] || []).map(f => f.tokenType);

  list.innerHTML = Object.keys(TOKEN_TYPES).map(key => {
    const t = TOKEN_TYPES[key];
    const isPlaced = placed.includes(key);
    return `
      <button class="token-btn ${isPlaced ? 'placed' : ''}" ${isPlaced ? '' : `onclick="editorAgregarToken('${key}')"`} title="${isPlaced ? 'Ya agregado' : 'Clic para agregar'}">
        <div class="token-icon" style="background:${t.iconColor};">${t.icon}</div>
        <div class="token-info"><div class="token-name">${t.label}</div><div class="token-desc">${t.desc}</div></div>
      </button>
    `;
  }).join('');
}

document.getElementById('template-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    editor.templates[editor.currentFace] = ev.target.result;
    editorRenderCanvas();
    toast('✓ Plantilla cargada');
  };
  reader.readAsDataURL(file);
});

window.setFace = function(face) {
  editor.currentFace = face;
  editor.selectedFieldId = null;
  document.querySelectorAll('.face-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.face === face);
  });
  document.getElementById('canvas-front').style.display = face === 'front' ? 'block' : 'none';
  document.getElementById('canvas-back').style.display = face === 'back' ? 'block' : 'none';
  document.getElementById('canvas-title').textContent = face === 'front' ? 'FRENTE DEL CARNET' : 'REVERSO DEL CARNET';
  renderTokensList();
  editorRenderCanvas();
  renderEditorProps();
};

function editorRenderCanvas() {
  ['front', 'back'].forEach(face => {
    const canvas = document.getElementById('canvas-' + face);
    if (!canvas) return;
    const hasTemplate = !!editor.templates[face];

    let bgImg = canvas.querySelector('.template-bg');
    if (hasTemplate) {
      canvas.classList.add('has-template');
      if (!bgImg) {
        bgImg = document.createElement('img');
        bgImg.className = 'template-bg';
        bgImg.crossOrigin = 'anonymous';
        canvas.insertBefore(bgImg, canvas.firstChild);
      }
      bgImg.src = editor.templates[face];
    } else {
      canvas.classList.remove('has-template');
      if (bgImg) bgImg.remove();
    }

    canvas.querySelectorAll('.placed-token').forEach(n => n.remove());
    (editor.fields[face] || []).forEach(field => {
      const el = renderEditorField(field);
      canvas.appendChild(el);
    });
  });

  const guides = document.getElementById('toggle-guides').checked;
  document.querySelectorAll('.card-canvas').forEach(c => c.classList.toggle('show-guides', guides));
}

function renderEditorField(field) {
  const tokenDef = TOKEN_TYPES[field.tokenType];
  const el = document.createElement('div');
  el.className = 'placed-token';
  if (editor.selectedFieldId === field.id) el.classList.add('selected');
  if (editor.previewMode) el.classList.add('preview-mode');
  el.style.left = field.x + 'px';
  el.style.top = field.y + 'px';
  el.style.width = field.w + 'px';
  el.style.height = field.h + 'px';
  el.dataset.fieldId = field.id;

  if (tokenDef.type === 'text') {
    const t = document.createElement('div');
    t.className = 'token-text';
    t.style.fontFamily = `'${field.font}', sans-serif`;
    t.style.fontSize = field.size + 'px';
    t.style.color = field.color;
    t.style.fontWeight = field.weight || '700';
    t.style.justifyContent = field.align === 'center' ? 'center' : (field.align === 'right' ? 'flex-end' : 'flex-start');
    if (field.shadow) t.style.textShadow = '2px 2px 0 ' + (field.shadowColor || '#1A3F91');
    t.textContent = tokenDef.sample;
    el.appendChild(t);
  } else if (tokenDef.type === 'qr') {
    const q = document.createElement('div');
    q.className = 'token-image';
    el.appendChild(q);
    setTimeout(() => {
      q.innerHTML = '';
      new QRCode(q, {
        text: 'https://tacoparado.co/m/TP-000271',
        width: Math.min(field.w, field.h) - 8,
        height: Math.min(field.w, field.h) - 8,
        colorDark: '#1A3F91', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    }, 10);
  } else if (tokenDef.type === 'image') {
    const i = document.createElement('div');
    i.className = 'token-image';
    i.style.borderRadius = '50%';
    i.innerHTML = logoDefault();
    el.appendChild(i);
  }

  if (!editor.previewMode) {
    const h = document.createElement('div');
    h.className = 'handle handle-br';
    el.appendChild(h);
    h.addEventListener('mousedown', (e) => editorStartResize(e, field));
    h.addEventListener('touchstart', (e) => editorStartResize(e.touches[0], field));

    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.innerHTML = '×';
    del.onclick = (e) => { e.stopPropagation(); editorEliminarField(field.id); };
    el.appendChild(del);
  }

  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('handle') || e.target.classList.contains('delete-btn')) return;
    editorSeleccionarField(field.id);
    editorStartDrag(e, field);
  });
  el.addEventListener('touchstart', (e) => {
    if (e.target.classList.contains('handle') || e.target.classList.contains('delete-btn')) return;
    editorSeleccionarField(field.id);
    editorStartDrag(e.touches[0], field);
  }, { passive: true });

  return el;
}

window.editorAgregarToken = function(key) {
  const t = TOKEN_TYPES[key];
  if (!t) return;
  const field = {
    id: 'f' + Date.now() + Math.random().toString(36).slice(2, 6),
    tokenType: key,
    x: (EDITOR_W - t.defaults.w) / 2,
    y: (EDITOR_H - t.defaults.h) / 2,
    w: t.defaults.w,
    h: t.defaults.h,
    ...t.defaults
  };
  if (!editor.fields[editor.currentFace]) editor.fields[editor.currentFace] = [];
  editor.fields[editor.currentFace].push(field);
  editor.selectedFieldId = field.id;
  editorRenderCanvas();
  renderTokensList();
  renderEditorProps();
  toast('✓ Campo agregado');
};

function editorSeleccionarField(id) {
  editor.selectedFieldId = id;
  editorRenderCanvas();
  renderEditorProps();
}

window.editorEliminarField = function(id) {
  editor.fields[editor.currentFace] = editor.fields[editor.currentFace].filter(f => f.id !== id);
  if (editor.selectedFieldId === id) editor.selectedFieldId = null;
  editorRenderCanvas();
  renderTokensList();
  renderEditorProps();
};

let editorDragState = null;
function editorStartDrag(e, field) {
  if (e.preventDefault) e.preventDefault();
  editorDragState = { type: 'drag', field, startX: e.clientX, startY: e.clientY, origX: field.x, origY: field.y };
}
function editorStartResize(e, field) {
  if (e.preventDefault) e.preventDefault();
  if (e.stopPropagation) e.stopPropagation();
  editorDragState = { type: 'resize', field, startX: e.clientX, startY: e.clientY, origW: field.w, origH: field.h };
}

function handleEditorMove(e) {
  if (!editorDragState) return;
  const dx = e.clientX - editorDragState.startX;
  const dy = e.clientY - editorDragState.startY;
  if (editorDragState.type === 'drag') {
    editorDragState.field.x = Math.max(0, Math.min(EDITOR_W - editorDragState.field.w, editorDragState.origX + dx));
    editorDragState.field.y = Math.max(0, Math.min(EDITOR_H - editorDragState.field.h, editorDragState.origY + dy));
  } else {
    editorDragState.field.w = Math.max(20, editorDragState.origW + dx);
    editorDragState.field.h = Math.max(20, editorDragState.origH + dy);
  }
  const node = document.querySelector(`[data-field-id="${editorDragState.field.id}"]`);
  if (node) {
    node.style.left = editorDragState.field.x + 'px';
    node.style.top = editorDragState.field.y + 'px';
    node.style.width = editorDragState.field.w + 'px';
    node.style.height = editorDragState.field.h + 'px';
  }
}

document.addEventListener('mousemove', handleEditorMove);
document.addEventListener('touchmove', (e) => {
  if (editorDragState && e.touches[0]) handleEditorMove(e.touches[0]);
}, { passive: false });
document.addEventListener('mouseup', () => {
  if (editorDragState) { editorDragState = null; editorRenderCanvas(); renderEditorProps(); }
});
document.addEventListener('touchend', () => {
  if (editorDragState) { editorDragState = null; editorRenderCanvas(); renderEditorProps(); }
});

function renderEditorProps() {
  const container = document.getElementById('props-content');
  const sub = document.getElementById('props-sub');
  if (!container) return;

  if (!editor.selectedFieldId) {
    sub.textContent = 'SELECCIONA UN CAMPO';
    container.innerHTML = `<div class="no-selection"><div class="icon">👆</div><p>SELECCIONA UN CAMPO<br>PARA AJUSTARLO</p></div>`;
    return;
  }

  const field = editor.fields[editor.currentFace].find(f => f.id === editor.selectedFieldId);
  if (!field) return;
  const tokenDef = TOKEN_TYPES[field.tokenType];
  sub.textContent = 'EDITANDO · ' + tokenDef.label.toUpperCase();

  let html = `
    <div class="prop-group"><label>Posición</label>
      <div class="prop-grid-2">
        <div><label style="font-size:8px;">X</label><input type="number" value="${Math.round(field.x)}" onchange="editorUpdateProp('x', this.value)"></div>
        <div><label style="font-size:8px;">Y</label><input type="number" value="${Math.round(field.y)}" onchange="editorUpdateProp('y', this.value)"></div>
      </div>
    </div>
    <div class="prop-group"><label>Tamaño</label>
      <div class="prop-grid-2">
        <div><label style="font-size:8px;">Ancho</label><input type="number" value="${Math.round(field.w)}" onchange="editorUpdateProp('w', this.value)"></div>
        <div><label style="font-size:8px;">Alto</label><input type="number" value="${Math.round(field.h)}" onchange="editorUpdateProp('h', this.value)"></div>
      </div>
    </div>
  `;

  if (tokenDef.type === 'text') {
    html += `
      <hr style="margin:12px 0; border:none; border-top:1px solid var(--border);">
      <div class="prop-group"><label>Fuente</label>
        <select onchange="editorUpdateProp('font', this.value)">
          <option ${field.font === 'Archivo Black' ? 'selected' : ''}>Archivo Black</option>
          <option ${field.font === 'Bungee' ? 'selected' : ''}>Bungee</option>
          <option ${field.font === 'Anton' ? 'selected' : ''}>Anton</option>
          <option ${field.font === 'Bebas Neue' ? 'selected' : ''}>Bebas Neue</option>
          <option ${field.font === 'Permanent Marker' ? 'selected' : ''}>Permanent Marker</option>
          <option ${field.font === 'Rubik Mono One' ? 'selected' : ''}>Rubik Mono One</option>
          <option ${field.font === 'Space Mono' ? 'selected' : ''}>Space Mono</option>
          <option ${field.font === 'Archivo' ? 'selected' : ''}>Archivo</option>
        </select>
      </div>
      <div class="prop-group"><label>Tamaño <span class="prop-value">${field.size}px</span></label>
        <input type="range" min="8" max="60" value="${field.size}" oninput="editorUpdateProp('size', this.value); this.previousElementSibling.querySelector('.prop-value').textContent = this.value + 'px';">
      </div>
      <div class="prop-grid-2">
        <div class="prop-group"><label>Color</label><input type="color" value="${field.color}" onchange="editorUpdateProp('color', this.value)"></div>
        <div class="prop-group"><label>Alineación</label><select onchange="editorUpdateProp('align', this.value)">
          <option value="left" ${field.align === 'left' ? 'selected' : ''}>Izq</option>
          <option value="center" ${field.align === 'center' ? 'selected' : ''}>Centro</option>
          <option value="right" ${field.align === 'right' ? 'selected' : ''}>Der</option>
        </select></div>
      </div>
      <div class="prop-group"><label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" ${field.shadow ? 'checked' : ''} onchange="editorUpdateProp('shadow', this.checked)">
        <span>Sombra</span>
      </label></div>
      ${field.shadow ? `<div class="prop-group"><label>Color sombra</label><input type="color" value="${field.shadowColor || '#1A3F91'}" onchange="editorUpdateProp('shadowColor', this.value)"></div>` : ''}
    `;
  }

  html += `<button class="btn btn-ghost" style="width:100%; margin-top:10px;" onclick="editorEliminarField('${field.id}')">🗑️ Eliminar</button>`;
  container.innerHTML = html;
}

window.editorUpdateProp = function(prop, value) {
  const field = editor.fields[editor.currentFace].find(f => f.id === editor.selectedFieldId);
  if (!field) return;
  if (['x', 'y', 'w', 'h', 'size'].includes(prop)) value = parseFloat(value);
  field[prop] = value;
  editorRenderCanvas();
  if (prop === 'shadow') renderEditorProps();
};

document.getElementById('toggle-guides').addEventListener('change', () => editorRenderCanvas());
document.getElementById('toggle-preview').addEventListener('change', (e) => {
  editor.previewMode = e.target.checked;
  if (editor.previewMode) editor.selectedFieldId = null;
  editorRenderCanvas();
  renderEditorProps();
});

// ==============================================================
// GUARDAR PLANTILLA
// ==============================================================
async function subirImagenPlantilla(dataUrl, face) {
  if (!dataUrl) return null;
  if (dataUrl.startsWith('http')) return dataUrl;
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const fileName = `${Date.now()}_${face}_${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await window.supabase.storage.from('plantillas')
    .upload(fileName, blob, { contentType: 'image/png', upsert: true });
  if (error) throw error;
  const { data } = window.supabase.storage.from('plantillas').getPublicUrl(fileName);
  return data.publicUrl;
}

window.guardarPlantilla = async function() {
  const nombreInput = document.getElementById('plantilla-nombre-input');
  const nombre = nombreInput.value.trim() || 'Plantilla ' + new Date().toLocaleDateString();
  const totalFields = (editor.fields.front?.length || 0) + (editor.fields.back?.length || 0);
  if (totalFields === 0 && !editor.templates.front && !editor.templates.back) {
    toast('⚠️ Agrega al menos una imagen o campo', 'error');
    return;
  }

  showLoading('Guardando plantilla…');
  try {
    setLoadingProgress('Subiendo imagen frontal…');
    const frontUrl = await subirImagenPlantilla(editor.templates.front, 'front');
    setLoadingProgress('Subiendo imagen trasera…');
    const backUrl = await subirImagenPlantilla(editor.templates.back, 'back');

    const plantillaData = {
      nombre,
      templates: { front: frontUrl, back: backUrl },
      fields: editor.fields,
      activa: true
    };

    setLoadingProgress('Guardando en base de datos…');
    await window.supabase.from('plantillas').update({ activa: false }).neq('id', '00000000-0000-0000-0000-000000000000');

    if (editor.editingId) {
      const { error } = await window.supabase.from('plantillas')
        .update({ ...plantillaData, updated_at: new Date().toISOString() })
        .eq('id', editor.editingId);
      if (error) throw error;
    } else {
      plantillaData.created_by = currentUser.id;
      const { data, error } = await window.supabase.from('plantillas').insert(plantillaData).select().single();
      if (error) throw error;
      editor.editingId = data.id;
    }

    await loadData();
    toast('✓ Plantilla guardada y activada');
  } catch (err) {
    console.error(err);
    toast('⚠️ ' + err.message, 'error');
  } finally {
    hideLoading();
  }
};

window.nuevaPlantilla = function() {
  if (!confirm('¿Crear una plantilla nueva? Se perderán los cambios no guardados.')) return;
  editor.editingId = null;
  editor.templates = { front: null, back: null };
  editor.fields = { front: [], back: [] };
  editor.selectedFieldId = null;
  editor.currentFace = 'front';
  document.getElementById('plantilla-nombre-input').value = '';
  setFace('front');
  editorRenderCanvas();
  renderEditorProps();
  renderTokensList();
};

window.limpiarCara = function() {
  if (!confirm('¿Limpiar ' + (editor.currentFace === 'front' ? 'FRENTE' : 'REVERSO') + '?')) return;
  editor.templates[editor.currentFace] = null;
  editor.fields[editor.currentFace] = [];
  editor.selectedFieldId = null;
  editorRenderCanvas();
  renderTokensList();
  renderEditorProps();
};

window.toggleListaPlantillas = function() {
  const list = document.getElementById('plantillas-lista');
  const shown = list.style.display !== 'none';
  list.style.display = shown ? 'none' : 'block';
  if (!shown) renderListaPlantillas();
};

function renderListaPlantillas() {
  const container = document.getElementById('plantillas-list-content');
  if (plantillas.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:var(--muted); font-family:Space Mono,monospace; font-size:11px; padding:20px;">No hay plantillas guardadas</p>';
    return;
  }
  container.innerHTML = plantillas.map(p => `
    <div class="plantilla-item ${p.activa ? 'active' : ''}">
      <div style="width:36px; height:24px; border-radius:3px; background:#E8E4D8; overflow:hidden; flex-shrink:0;">
        ${p.templates?.front ? `<img src="${p.templates.front}" style="width:100%; height:100%; object-fit:cover;">` : ''}
      </div>
      <div class="p-name">${escapeHtml(p.nombre)}</div>
      ${p.activa ? '<span class="p-active-badge">ACTIVA</span>' : ''}
      <button class="btn btn-ghost" style="font-size:10px; padding:4px 8px;" onclick="cargarPlantillaEnEditor('${p.id}')">✎ Editar</button>
      ${!p.activa ? `<button class="btn btn-primary" style="font-size:10px; padding:4px 8px;" onclick="activarPlantilla('${p.id}')">Activar</button>` : ''}
      <button class="btn btn-ghost" style="font-size:10px; padding:4px 8px; color:#B5351A;" onclick="eliminarPlantilla('${p.id}')">🗑</button>
    </div>
  `).join('');
}

window.activarPlantilla = async function(id) {
  showSync(true);
  try {
    await window.supabase.from('plantillas').update({ activa: false }).neq('id', id);
    await window.supabase.from('plantillas').update({ activa: true }).eq('id', id);
    await loadData();
    renderListaPlantillas();
    toast('✓ Plantilla activada');
  } catch (err) {
    toast('⚠️ ' + err.message, 'error');
  } finally {
    showSync(false);
  }
};

window.cargarPlantillaEnEditor = function(id) {
  const p = plantillas.find(x => x.id === id);
  if (!p) return;
  editor.editingId = id;
  editor.templates = p.templates || { front: null, back: null };
  editor.fields = p.fields || { front: [], back: [] };
  editor.selectedFieldId = null;
  editor.currentFace = 'front';
  document.getElementById('plantilla-nombre-input').value = p.nombre;
  setFace('front');
  renderTokensList();
  editorRenderCanvas();
  renderEditorProps();
  document.getElementById('plantillas-lista').style.display = 'none';
  toast('✓ Plantilla cargada en el editor');
};

window.eliminarPlantilla = async function(id) {
  if (!confirm('¿Eliminar esta plantilla?')) return;
  showSync(true);
  try {
    const { error } = await window.supabase.from('plantillas').delete().eq('id', id);
    if (error) throw error;
    if (editor.editingId === id) nuevaPlantilla();
    await loadData();
    renderListaPlantillas();
    toast('✓ Plantilla eliminada');
  } catch (err) {
    toast('⚠️ ' + err.message, 'error');
  } finally {
    showSync(false);
  }
};

function actualizarPlantillaUI() {
  if (plantillaActiva) {
    document.getElementById('plantilla-actual-nombre').textContent = plantillaActiva.nombre;
    const frontCount = plantillaActiva.fields?.front?.length || 0;
    const backCount = plantillaActiva.fields?.back?.length || 0;
    document.getElementById('plantilla-actual-info').textContent = `${frontCount + backCount} campos · Frente: ${frontCount} · Reverso: ${backCount}`;
    document.getElementById('no-template-warning').style.display = 'none';
  } else {
    document.getElementById('plantilla-actual-nombre').textContent = 'Sin plantilla activa';
    document.getElementById('plantilla-actual-info').textContent = 'Crea tu primera plantilla abajo';
    document.getElementById('no-template-warning').style.display = 'block';
  }
}

// ==============================================================
// LOGO DE MARCA
// ==============================================================
function actualizarLogoUI() {
  const preview = document.getElementById('logo-preview');
  const removeBtn = document.getElementById('btn-remove-logo');
  if (!preview) return;

  if (config.logoUrl) {
    preview.innerHTML = `<img src="${config.logoUrl}" alt="Logo" style="max-width:100%; max-height:120px; object-fit:contain;">`;
    preview.style.display = 'flex';
    if (removeBtn) removeBtn.style.display = 'inline-block';
  } else {
    preview.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; gap:8px; color:var(--muted);">
        ${tacoSVGSample()}
        <span style="font-family:'Space Mono',monospace; font-size:10px; letter-spacing:1px;">DEFAULT · TACO GENÉRICO</span>
      </div>
    `;
    preview.style.display = 'flex';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

document.getElementById('logo-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast('⚠️ Máximo 5 MB', 'error');
    return;
  }

  showLoading('Subiendo logo…');
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const fileName = `logo_${Date.now()}.${ext}`;
    const { error: upErr } = await window.supabase.storage
      .from('branding')
      .upload(fileName, file, { contentType: file.type, upsert: true });
    if (upErr) throw upErr;

    const { data } = window.supabase.storage.from('branding').getPublicUrl(fileName);
    const publicUrl = data.publicUrl;

    setLoadingProgress('Guardando…');
    const { error: cfgErr } = await window.supabase
      .from('config')
      .upsert({ key: 'logoUrl', value: publicUrl }, { onConflict: 'key' });
    if (cfgErr) throw cfgErr;

    config.logoUrl = publicUrl;
    actualizarLogoUI();
    toast('✓ Logo actualizado');
    e.target.value = '';
  } catch (err) {
    console.error(err);
    toast('⚠️ ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

window.eliminarLogo = async function() {
  if (!confirm('¿Quitar el logo? Volverá a mostrarse el taco genérico por defecto.')) return;
  showSync(true);
  try {
    const { error } = await window.supabase.from('config').delete().eq('key', 'logoUrl');
    if (error) throw error;
    config.logoUrl = null;
    actualizarLogoUI();
    toast('✓ Logo eliminado');
  } catch (err) {
    toast('⚠️ ' + err.message, 'error');
  } finally {
    showSync(false);
  }
};

// ==============================================================
// CONFIG
// ==============================================================
window.guardarConfig = async function() {
  config.qrBase = document.getElementById('cfg-qr-base').value.trim() || PUBLIC_BASE;
  config.ig = document.getElementById('cfg-ig').value.trim() || '@tacoparado.co';
  showSync(true);
  try {
    const rows = [
      { key: 'qrBase', value: config.qrBase },
      { key: 'ig', value: config.ig }
    ];
    for (const row of rows) {
      const { error } = await window.supabase.from('config').upsert(row, { onConflict: 'key' });
      if (error) throw error;
    }
    toast('✓ Ajustes guardados');
  } catch (err) {
    toast('⚠️ ' + err.message, 'error');
  } finally {
    showSync(false);
  }
};

// ==============================================================
// EXPORT
// ==============================================================
window.openExportModal = function() {
  if (!selectedId || !plantillaActiva) return;
  const c = clientes.find(x => x.id === selectedId);
  document.getElementById('export-modal-target').textContent = c.nombre + ' · ' + c.id;
  document.getElementById('export-modal').classList.add('show');
};

window.closeExportModal = function() {
  document.getElementById('export-modal').classList.remove('show');
};

async function renderCarnetHighRes(cliente, face) {
  const SCALE_EXPORT = 2.4;
  const stage = document.getElementById('render-stage');
  stage.innerHTML = '';
  const cardEl = renderCarnetDinamico(cliente, face, { scale: SCALE_EXPORT });
  stage.appendChild(cardEl);

  const imgs = cardEl.querySelectorAll('img');
  await Promise.all(Array.from(imgs).map(img => new Promise(res => {
    if (img.complete && img.naturalWidth > 0) res();
    else {
      img.onload = res;
      img.onerror = res;
      setTimeout(res, 3000);
    }
  })));
  await new Promise(r => setTimeout(r, 500));

  const canvas = await html2canvas(cardEl, {
    scale: 1,
    backgroundColor: null,
    useCORS: true,
    logging: false,
    width: EDITOR_W * SCALE_EXPORT,
    height: EDITOR_H * SCALE_EXPORT
  });

  stage.innerHTML = '';
  return canvas;
}

window.exportarPDF = async function(tipo) {
  closeExportModal();
  if (tipo === 'todos-lamina') { await exportarLaminaTodos(); return; }

  const c = clientes.find(x => x.id === selectedId);
  if (!c) return;
  if (!plantillaActiva) { toast('⚠️ No hay plantilla activa', 'error'); return; }

  showLoading('Renderizando carnet…');
  try {
    const { jsPDF } = window.jspdf;
    const caraFront = plantillaActiva.templates?.front || (plantillaActiva.fields?.front?.length > 0);
    const caraBack = plantillaActiva.templates?.back || (plantillaActiva.fields?.back?.length > 0);

    if (tipo === 'individual') {
      const pdf = new jsPDF({ unit: 'mm', format: [85.6, 54], orientation: 'landscape' });
      let first = true;
      if (caraFront) {
        setLoadingProgress('Generando frente…');
        const fc = await renderCarnetHighRes(c, 'front');
        pdf.addImage(fc.toDataURL('image/png'), 'PNG', 0, 0, 85.6, 54);
        first = false;
      }
      if (caraBack) {
        setLoadingProgress('Generando reverso…');
        if (!first) pdf.addPage([85.6, 54], 'landscape');
        const bc = await renderCarnetHighRes(c, 'back');
        pdf.addImage(bc.toDataURL('image/png'), 'PNG', 0, 0, 85.6, 54);
      }
      pdf.save(`carnet_${c.id}.pdf`);
      toast('✓ PDF descargado');
    } else if (tipo === 'lamina') {
      await generarLaminaA4([c]);
      toast('✓ Lámina A4 descargada');
    }
  } catch (e) {
    console.error(e);
    toast('⚠️ Error: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
};

async function exportarLaminaTodos() {
  if (clientes.length === 0) { toast('No hay clientes'); return; }
  if (!plantillaActiva) { toast('⚠️ No hay plantilla activa', 'error'); return; }
  showLoading('Generando lámina con ' + clientes.length + ' clientes…');
  try {
    await generarLaminaA4(clientes);
    toast('✓ Lámina descargada');
  } catch (e) {
    console.error(e);
    toast('⚠️ Error', 'error');
  } finally {
    hideLoading();
  }
}

async function generarLaminaA4(lista) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const cardW = 85.6, cardH = 54;
  const gapX = 4, gapY = 2.5;
  const marginX = (210 - 2 * cardW - gapX) / 2;
  const marginY = (297 - 5 * cardH - 4 * gapY) / 2;
  const perPage = 5;

  const caraFront = plantillaActiva.templates?.front || (plantillaActiva.fields?.front?.length > 0);
  const caraBack = plantillaActiva.templates?.back || (plantillaActiva.fields?.back?.length > 0);

  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    const posOnPage = i % perPage;
    if (posOnPage === 0 && i > 0) pdf.addPage();
    setLoadingProgress(`Cliente ${i + 1}/${lista.length} · ${c.nombre}`);
    const y = marginY + posOnPage * (cardH + gapY);

    if (caraFront) {
      const fc = await renderCarnetHighRes(c, 'front');
      pdf.addImage(fc.toDataURL('image/png'), 'PNG', marginX, y, cardW, cardH);
    }
    if (caraBack) {
      const bc = await renderCarnetHighRes(c, 'back');
      pdf.addImage(bc.toDataURL('image/png'), 'PNG', marginX + cardW + gapX, y, cardW, cardH);
    }

    pdf.setDrawColor(180, 180, 180);
    pdf.setLineWidth(0.1);
    drawCrop(pdf, marginX, y, cardW, cardH);
    if (caraBack) drawCrop(pdf, marginX + cardW + gapX, y, cardW, cardH);
  }

  pdf.setPage(1);
  pdf.setFontSize(8);
  pdf.setTextColor(100);
  pdf.text('TACO PARADO · Lámina de impresión · 85.6 × 54 mm', 10, 8);
  pdf.save(lista.length === 1 ? `lamina_${lista[0].id}.pdf` : `lamina_${lista.length}_clientes.pdf`);
}

function drawCrop(pdf, x, y, w, h) {
  const L = 2;
  pdf.line(x - L, y, x - 0.5, y);
  pdf.line(x, y - L, x, y - 0.5);
  pdf.line(x + w + 0.5, y, x + w + L, y);
  pdf.line(x + w, y - L, x + w, y - 0.5);
  pdf.line(x - L, y + h, x - 0.5, y + h);
  pdf.line(x, y + h + 0.5, x, y + h + L);
  pdf.line(x + w + 0.5, y + h, x + w + L, y + h);
  pdf.line(x + w, y + h + 0.5, x + w, y + h + L);
}

window.exportarPNG = async function() {
  closeExportModal();
  const c = clientes.find(x => x.id === selectedId);
  if (!c || !plantillaActiva) return;
  showLoading('Generando PNG…');
  try {
    if (plantillaActiva.templates?.front || plantillaActiva.fields?.front?.length) {
      setLoadingProgress('Frente…');
      const fc = await renderCarnetHighRes(c, 'front');
      downloadCanvas(fc, `carnet_${c.id}_frente.png`);
    }
    await new Promise(r => setTimeout(r, 300));
    if (plantillaActiva.templates?.back || plantillaActiva.fields?.back?.length) {
      setLoadingProgress('Reverso…');
      const bc = await renderCarnetHighRes(c, 'back');
      downloadCanvas(bc, `carnet_${c.id}_reverso.png`);
    }
    toast('✓ PNGs descargados');
  } catch (e) {
    console.error(e);
    toast('⚠️ Error', 'error');
  } finally {
    hideLoading();
  }
};

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

window.exportarJSON = function() {
  const data = { clientes, config, plantillas, exportado: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tacoparado_backup_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('✓ Backup exportado');
};

// ==============================================================
// INIT
// ==============================================================
checkAuth();
