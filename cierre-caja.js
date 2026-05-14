// ==============================================================
// TACO PARADO · CIERRE DE CAJA · DENOMINACIONES + TRANSFERENCIAS
// ==============================================================

const BILLETES = [
  { val: 100000, label: '$100.000' },
  { val: 50000,  label: '$50.000'  },
  { val: 20000,  label: '$20.000'  },
  { val: 10000,  label: '$10.000'  },
  { val: 5000,   label: '$5.000'   },
  { val: 2000,   label: '$2.000'   }
];

const MONEDAS = [
  { val: 1000, label: '$1.000' },
  { val: 500,  label: '$500'   },
  { val: 200,  label: '$200'   },
  { val: 100,  label: '$100'   },
  { val: 50,   label: '$50'    }
];

const BANCOS = ['Bancolombia', 'Nequi', 'Davivienda', 'Daviplata', 'BBVA', 'Banco de Bogotá', 'Otro'];

// STATE
let currentUser = null;
let userRole = null;
let userSedeId = null;
let sedes = [];
let selectedSedeId = null;
let cierres = [];
let editandoCierreId = null;

let denomCounts = {};       // {100000: 5, 50000: 8, ...}
let transferencias = [];    // [{banco, monto, nota, hora}]
let egresos = [];           // [{motivo, monto, metodo, recibo_url}]
let conciliacion = {};      // {Bancolombia: {esperado, recibido, diferencia}, ...}

// ============= HELPERS =============
function fmt(n) { return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0); }
function fmtMoney(n) { return '$' + fmt(n); }
function escapeHTML(s) { return (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
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
    showSinAcceso('Tu cuenta no tiene permisos para el cierre de caja.');
    return;
  }
  const r = roles[0];
  userRole = r.rol;
  userSedeId = r.sede_id;

  if (userRole !== 'admin' && userRole !== 'admin_contador') {
    showSinAcceso('El cierre de caja solo está disponible para administradores y contadores.');
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

function showApp() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('userEmail').textContent = currentUser.email;
  document.getElementById('userRole').textContent = userRole === 'admin' ? 'ADMIN' : 'CONTADOR';

  renderSedeSelector();
  initFilters();
  renderDenominaciones();
  loadCierres();
}

function renderSedeSelector() {
  const c = document.getElementById('sedeSelector');
  if (userRole === 'admin' && sedes.length > 1) {
    c.innerHTML = sedes.map(s => `
      <button class="sede-btn ${s.id === selectedSedeId ? 'active' : ''}" onclick="cambiarSede('${s.id}')">📍 ${escapeHTML(s.nombre)}</button>
    `).join('');
  } else {
    const sede = sedes.find(s => s.id === selectedSedeId);
    c.innerHTML = sede ? `<div class="sede-fixed">📍 ${escapeHTML(sede.nombre)}</div>` : '';
  }
}

window.cambiarSede = function(id) {
  selectedSedeId = id;
  renderSedeSelector();
  loadCierres();
};

window.logout = async function() {
  await window.supabase.auth.signOut();
  window.location.href = 'admin.html';
};

// ============= TABS =============
window.changeTab = function(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.panel === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  if (name === 'nuevo') initFormNuevo();
  if (name === 'reportes') loadReportes();
};

function initFilters() {
  const mes = document.getElementById('filtroMes');
  mes.value = new Date().toISOString().slice(0, 7);
}

// ============= CARGAR CIERRES =============
async function loadCierres() {
  if (!selectedSedeId) return;
  try {
    const filtroMes = document.getElementById('filtroMes').value;
    const inicio = filtroMes + '-01';
    const finDate = new Date(filtroMes + '-01');
    finDate.setMonth(finDate.getMonth() + 1);
    const fin = finDate.toISOString().slice(0, 10);

    const { data, error } = await window.supabase.from('cierres_caja').select('*')
      .eq('sede_id', selectedSedeId)
      .gte('fecha', inicio).lt('fecha', fin)
      .order('fecha', { ascending: false });
    if (error) throw error;
    cierres = data || [];
    renderCierres();
    renderResumen();
  } catch (e) {
    console.error(e);
    toast('Error: ' + e.message, 'error');
  }
}

function renderCierres() {
  const tb = document.getElementById('tblCierres');
  if (cierres.length === 0) {
    tb.innerHTML = '<tr><td colspan="8"><div class="empty">Sin cierres este mes. Crea el primero con "+ Nuevo Cierre".</div></td></tr>';
    return;
  }
  tb.innerHTML = cierres.map(c => {
    const sede = sedes.find(s => s.id === c.sede_id);
    const estadoBadge = c.estado === 'cerrado'
      ? '<span style="background:#DCFCE7; color:#166534; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:800;">✓ CERRADO</span>'
      : '<span style="background:#FEF3C7; color:#854d0e; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:800;">📋 BORRADOR</span>';
    return `<tr>
      <td><strong>${c.fecha}</strong></td>
      <td>${escapeHTML(sede?.nombre || '—')}</td>
      <td class="money" style="color:var(--green);">${fmtMoney(c.ventas_totales)}</td>
      <td class="money">${fmtMoney(c.efectivo_neto)}</td>
      <td class="money">${fmtMoney(c.total_transferencias)}</td>
      <td class="money" style="color:var(--red);">${fmtMoney(c.egresos)}</td>
      <td>${estadoBadge}</td>
      <td>
        <button class="btn-icon" onclick="verCierre('${c.id}')" title="Ver detalle">👁</button>
        <button class="btn-icon" onclick="editarCierre('${c.id}')" title="Editar">✎</button>
        ${userRole === 'admin' ? `<button class="btn-icon danger" onclick="eliminarCierre('${c.id}')">✕</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function renderResumen() {
  const stats = document.getElementById('statsResumen');
  const ventas = cierres.reduce((s, c) => s + (c.ventas_totales || 0), 0);
  const efectivo = cierres.reduce((s, c) => s + (c.efectivo_neto || 0), 0);
  const transf = cierres.reduce((s, c) => s + (c.total_transferencias || 0), 0);
  const eg = cierres.reduce((s, c) => s + (c.egresos || 0), 0);

  stats.innerHTML = `
    <div class="stat-card green"><div class="label">Ventas Mes</div><div class="value">${fmtMoney(ventas)}</div></div>
    <div class="stat-card"><div class="label">Efectivo Neto</div><div class="value">${fmtMoney(efectivo)}</div></div>
    <div class="stat-card orange"><div class="label">Transferencias</div><div class="value">${fmtMoney(transf)}</div></div>
    <div class="stat-card red"><div class="label">Egresos</div><div class="value">${fmtMoney(eg)}</div></div>
    <div class="stat-card"><div class="label">Cierres</div><div class="value">${cierres.length}</div></div>
  `;
}

// ============= INIT FORMULARIO NUEVO =============
function initFormNuevo() {
  if (!editandoCierreId) {
    document.getElementById('cierreFecha').value = new Date().toISOString().slice(0, 10);
    document.getElementById('baseInicial').value = 300000;
    denomCounts = {};
    transferencias = [];
    egresos = [];
    conciliacion = {};
    document.getElementById('totalDatafono').value = '';
    document.getElementById('notas').value = '';
  }
  renderDenominaciones();
  renderTransferencias();
  renderEgresos();
  renderConciliacion();
  calcularTodo();
}

// ============= DENOMINACIONES =============
function renderDenominaciones() {
  const billetesGrid = document.getElementById('billetesGrid');
  const monedasGrid = document.getElementById('monedasGrid');

  billetesGrid.innerHTML = BILLETES.map(b => {
    const cnt = denomCounts[b.val] || 0;
    const total = cnt * b.val;
    return `
      <label class="denom-card ${total === 0 ? 'empty' : ''}">
        <span class="denom-label">${b.label}</span>
        <input type="number" min="0" value="${cnt || ''}" placeholder="0"
          onchange="actualizarDenominacion(${b.val}, this.value)"
          oninput="actualizarDenominacion(${b.val}, this.value)">
        <span class="equals">=</span>
        <span class="total">${fmtMoney(total)}</span>
      </label>
    `;
  }).join('');

  monedasGrid.innerHTML = MONEDAS.map(m => {
    const cnt = denomCounts[m.val] || 0;
    const total = cnt * m.val;
    return `
      <label class="denom-card ${total === 0 ? 'empty' : ''}">
        <span class="denom-label">${m.label}</span>
        <input type="number" min="0" value="${cnt || ''}" placeholder="0"
          onchange="actualizarDenominacion(${m.val}, this.value)"
          oninput="actualizarDenominacion(${m.val}, this.value)">
        <span class="equals">=</span>
        <span class="total">${fmtMoney(total)}</span>
      </label>
    `;
  }).join('');
}

window.actualizarDenominacion = function(val, count) {
  denomCounts[val] = parseInt(count) || 0;
  // Actualizar solo la card sin re-renderizar toda la grid (mantiene el foco)
  const cards = document.querySelectorAll('.denom-card');
  cards.forEach(card => {
    const label = card.querySelector('.denom-label').textContent;
    const denoms = [...BILLETES, ...MONEDAS];
    const d = denoms.find(x => x.label === label);
    if (d) {
      const cnt = denomCounts[d.val] || 0;
      const total = cnt * d.val;
      card.querySelector('.total').textContent = fmtMoney(total);
      card.classList.toggle('empty', total === 0);
    }
  });
  calcularTodo();
};

function calcularTotalEfectivo() {
  let total = 0;
  for (const denom in denomCounts) {
    total += (denomCounts[denom] || 0) * parseInt(denom);
  }
  return total;
}

// ============= TRANSFERENCIAS =============
window.agregarTransferencia = function() {
  transferencias.push({ banco: 'Bancolombia', monto: 0, nota: '', hora: '' });
  renderTransferencias();
  // Foco en el monto del último
  setTimeout(() => {
    const inputs = document.querySelectorAll('#transferenciasList .item-row .monto-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
};

function renderTransferencias() {
  const list = document.getElementById('transferenciasList');
  if (transferencias.length === 0) {
    list.innerHTML = '<div class="item-empty">Sin transferencias todavía. Clic en ➕ para agregar.</div>';
  } else {
    list.innerHTML = transferencias.map((t, i) => `
      <div class="item-row">
        <select onchange="actualizarTransferencia(${i}, 'banco', this.value)">
          ${BANCOS.map(b => `<option value="${b}" ${b === t.banco ? 'selected' : ''}>${b}</option>`).join('')}
        </select>
        <input type="number" class="monto-input" step="100" placeholder="0"
          value="${t.monto || ''}"
          oninput="actualizarTransferencia(${i}, 'monto', this.value)">
        <input type="text" class="nota-field" placeholder="Nota (opcional): cliente, mesa, etc."
          value="${escapeHTML(t.nota || '')}"
          oninput="actualizarTransferencia(${i}, 'nota', this.value)">
        <button class="remove-btn" onclick="quitarTransferencia(${i})" title="Quitar">✕</button>
      </div>
    `).join('');
  }

  // Total + breakdown
  const total = transferencias.reduce((s, t) => s + (parseFloat(t.monto) || 0), 0);
  document.getElementById('totalTransferencias').textContent = fmtMoney(total);

  const porBanco = {};
  transferencias.forEach(t => {
    porBanco[t.banco] = (porBanco[t.banco] || 0) + (parseFloat(t.monto) || 0);
  });
  const breakdown = Object.entries(porBanco).filter(([b, m]) => m > 0).map(([b, m]) => `${b}: ${fmtMoney(m)}`).join('  ·  ');
  document.getElementById('breakdownTransf').textContent = breakdown;

  renderConciliacion();
}

window.actualizarTransferencia = function(idx, campo, valor) {
  if (campo === 'monto') valor = parseFloat(valor) || 0;
  transferencias[idx][campo] = valor;
  // Recalcular sin re-renderizar toda la lista (mantener foco)
  const total = transferencias.reduce((s, t) => s + (parseFloat(t.monto) || 0), 0);
  document.getElementById('totalTransferencias').textContent = fmtMoney(total);

  const porBanco = {};
  transferencias.forEach(t => {
    porBanco[t.banco] = (porBanco[t.banco] || 0) + (parseFloat(t.monto) || 0);
  });
  const breakdown = Object.entries(porBanco).filter(([b, m]) => m > 0).map(([b, m]) => `${b}: ${fmtMoney(m)}`).join('  ·  ');
  document.getElementById('breakdownTransf').textContent = breakdown;

  renderConciliacion();
  calcularTodo();
};

window.quitarTransferencia = function(idx) {
  transferencias.splice(idx, 1);
  renderTransferencias();
  calcularTodo();
};

// ============= EGRESOS =============
window.agregarEgreso = function() {
  egresos.push({ motivo: '', monto: 0, metodo: 'efectivo', recibo_url: '' });
  renderEgresos();
  setTimeout(() => {
    const inputs = document.querySelectorAll('#egresosList .item-row .motivo-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
};

function renderEgresos() {
  const list = document.getElementById('egresosList');
  if (egresos.length === 0) {
    list.innerHTML = '<div class="item-empty">Sin egresos todavía. Clic en ➕ para agregar.</div>';
  } else {
    list.innerHTML = egresos.map((e, i) => `
      <div class="item-row" style="grid-template-columns: 1fr 130px 110px 70px 40px;">
        <input type="text" class="motivo-input" placeholder="Motivo (ej: mercado, gas, sueldo)"
          value="${escapeHTML(e.motivo || '')}"
          oninput="actualizarEgreso(${i}, 'motivo', this.value)">
        <input type="number" step="100" placeholder="Monto"
          value="${e.monto || ''}"
          oninput="actualizarEgreso(${i}, 'monto', this.value)">
        <select onchange="actualizarEgreso(${i}, 'metodo', this.value)">
          <option value="efectivo" ${e.metodo === 'efectivo' ? 'selected' : ''}>💵 Efectivo</option>
          <option value="transferencia" ${e.metodo === 'transferencia' ? 'selected' : ''}>💳 Transfer.</option>
        </select>
        <label class="btn-icon" style="text-align:center; cursor:pointer;" title="Subir recibo">
          ${e.recibo_url ? '✅' : '📷'}
          <input type="file" accept="image/*" hidden onchange="subirRecibo(${i}, event)">
        </label>
        <button class="remove-btn" onclick="quitarEgreso(${i})">✕</button>
      </div>
    `).join('');
  }

  const total = egresos.reduce((s, e) => s + (parseFloat(e.monto) || 0), 0);
  document.getElementById('totalEgresos').textContent = fmtMoney(total);

  const efe = egresos.filter(e => e.metodo === 'efectivo').reduce((s, e) => s + (parseFloat(e.monto) || 0), 0);
  const trf = egresos.filter(e => e.metodo === 'transferencia').reduce((s, e) => s + (parseFloat(e.monto) || 0), 0);
  document.getElementById('breakdownEgresos').textContent = (efe > 0 || trf > 0)
    ? `Efectivo: ${fmtMoney(efe)}  ·  Transferencia: ${fmtMoney(trf)}`
    : '';
}

window.actualizarEgreso = function(idx, campo, valor) {
  if (campo === 'monto') valor = parseFloat(valor) || 0;
  egresos[idx][campo] = valor;
  // Sólo recalcular total sin re-renderizar
  const total = egresos.reduce((s, e) => s + (parseFloat(e.monto) || 0), 0);
  document.getElementById('totalEgresos').textContent = fmtMoney(total);
  const efe = egresos.filter(e => e.metodo === 'efectivo').reduce((s, e) => s + (parseFloat(e.monto) || 0), 0);
  const trf = egresos.filter(e => e.metodo === 'transferencia').reduce((s, e) => s + (parseFloat(e.monto) || 0), 0);
  document.getElementById('breakdownEgresos').textContent = (efe > 0 || trf > 0) ? `Efectivo: ${fmtMoney(efe)}  ·  Transferencia: ${fmtMoney(trf)}` : '';
  calcularTodo();
};

window.quitarEgreso = function(idx) {
  egresos.splice(idx, 1);
  renderEgresos();
  calcularTodo();
};

window.subirRecibo = async function(idx, event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('Foto muy grande (máx 5 MB)', 'error'); return; }

  try {
    const ext = file.name.split('.').pop();
    const fname = `recibo_${Date.now()}_${idx}.${ext}`;
    const { error } = await window.supabase.storage.from('cierres').upload(fname, file, { upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = window.supabase.storage.from('cierres').getPublicUrl(fname);
    egresos[idx].recibo_url = publicUrl;
    renderEgresos();
    toast('✓ Recibo cargado');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

// ============= CONCILIACIÓN BANCARIA =============
function renderConciliacion() {
  const list = document.getElementById('conciliacionList');
  // Bancos donde hubo transferencias
  const bancosUsados = [...new Set(transferencias.map(t => t.banco).filter(Boolean))];

  if (bancosUsados.length === 0) {
    list.innerHTML = '<div class="item-empty">No hay transferencias todavía. La conciliación aparecerá aquí cuando agregues alguna.</div>';
    return;
  }

  list.innerHTML = bancosUsados.map(banco => {
    const esperado = transferencias.filter(t => t.banco === banco).reduce((s, t) => s + (parseFloat(t.monto) || 0), 0);
    const recibido = parseFloat(conciliacion[banco]?.recibido) || 0;
    const diff = recibido - esperado;
    const cls = recibido > 0 ? (Math.abs(diff) < 1 ? 'match' : 'mismatch') : '';
    const status = recibido === 0
      ? '<span style="color:var(--text-soft);">Pendiente</span>'
      : Math.abs(diff) < 1
      ? '<span style="color:var(--green); font-weight:800;">✅ Cuadra</span>'
      : diff > 0
      ? `<span style="color:var(--orange); font-weight:800;">+${fmtMoney(diff)} sobra</span>`
      : `<span style="color:var(--red); font-weight:800;">${fmtMoney(diff)} falta</span>`;

    return `
      <div class="concil-card ${cls}">
        <div class="banco-name">${escapeHTML(banco)}</div>
        <div>
          <div style="font-size:10px; color:var(--text-soft); letter-spacing:1px; text-transform:uppercase; font-weight:800;">Esperado</div>
          <div class="esperado">${fmtMoney(esperado)}</div>
        </div>
        <div>
          <div style="font-size:10px; color:var(--text-soft); letter-spacing:1px; text-transform:uppercase; font-weight:800;">Recibido en banco</div>
          <input type="number" step="100" placeholder="0"
            value="${conciliacion[banco]?.recibido || ''}"
            oninput="actualizarConciliacion('${banco}', this.value)">
        </div>
        <div>${status}</div>
      </div>
    `;
  }).join('');
}

window.actualizarConciliacion = function(banco, recibido) {
  if (!conciliacion[banco]) conciliacion[banco] = {};
  conciliacion[banco].recibido = parseFloat(recibido) || 0;
  renderConciliacion();
};

// ============= CÁLCULO RESUMEN =============
function calcularTodo() {
  const efectivoContado = calcularTotalEfectivo();
  const baseInicial = parseFloat(document.getElementById('baseInicial').value) || 0;
  const totalEgresos = egresos.reduce((s, e) => s + (parseFloat(e.monto) || 0), 0);
  const egresosEfectivo = egresos.filter(e => e.metodo === 'efectivo').reduce((s, e) => s + (parseFloat(e.monto) || 0), 0);
  const totalTransf = transferencias.reduce((s, t) => s + (parseFloat(t.monto) || 0), 0);
  const totalDatafono = parseFloat(document.getElementById('totalDatafono').value) || 0;

  // Efectivo neto = lo contado - base + egresos en efectivo
  // (porque los egresos ya salieron, no están en lo contado, hay que sumarlos)
  const efectivoNeto = efectivoContado - baseInicial + egresosEfectivo;

  // Ventas totales = efectivo neto + transferencias + datafono
  const ventasTotales = efectivoNeto + totalTransf + totalDatafono;

  // Actualizar total efectivo arriba
  document.getElementById('totalEfectivo').textContent = fmtMoney(efectivoContado);

  // Construir resumen visual
  const cont = document.getElementById('resumenContent');
  cont.innerHTML = `
    <div class="resumen-row">
      <span>Efectivo contado en caja</span>
      <span>${fmtMoney(efectivoContado)}</span>
    </div>
    <div class="resumen-row subtract">
      <span style="margin-left:14px;">Base inicial (no es venta)</span>
      <span>${fmtMoney(baseInicial)}</span>
    </div>
    <div class="resumen-row add">
      <span style="margin-left:14px;">Egresos en efectivo (salieron de la caja)</span>
      <span>${fmtMoney(egresosEfectivo)}</span>
    </div>
    <div class="resumen-row" style="font-weight:800; padding:10px 0; border-top:2px dashed rgba(255,255,255,0.3); border-bottom:2px dashed rgba(255,255,255,0.3); margin:6px 0;">
      <span>EFECTIVO NETO (ventas en efectivo)</span>
      <span style="color:#86efac;">${fmtMoney(efectivoNeto)}</span>
    </div>
    <div class="resumen-row add">
      <span>Transferencias del día</span>
      <span>${fmtMoney(totalTransf)}</span>
    </div>
    <div class="resumen-row add">
      <span>Datáfono / Tarjetas</span>
      <span>${fmtMoney(totalDatafono)}</span>
    </div>
    <div class="resumen-row total">
      <span>💰 VENTAS TOTALES DEL DÍA</span>
      <span>${fmtMoney(ventasTotales)}</span>
    </div>
    <div style="margin-top:14px; font-size:11px; color:rgba(255,255,255,0.7); display:flex; gap:14px; flex-wrap:wrap; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.15);">
      <span>📊 ${transferencias.length} transferencia${transferencias.length !== 1 ? 's' : ''}</span>
      <span>📤 ${egresos.length} egreso${egresos.length !== 1 ? 's' : ''} ($${fmt(totalEgresos)})</span>
    </div>
  `;
}

// ============= GUARDAR CIERRE =============
window.guardarCierre = async function(estado) {
  const fecha = document.getElementById('cierreFecha').value;
  if (!fecha) { toast('Falta la fecha', 'error'); return; }
  if (!selectedSedeId) { toast('Selecciona una sede', 'error'); return; }

  const efectivoContado = calcularTotalEfectivo();
  const baseInicial = parseFloat(document.getElementById('baseInicial').value) || 0;
  const totalEgresos = egresos.reduce((s, e) => s + (parseFloat(e.monto) || 0), 0);
  const egresosEfectivo = egresos.filter(e => e.metodo === 'efectivo').reduce((s, e) => s + (parseFloat(e.monto) || 0), 0);
  const totalTransf = transferencias.reduce((s, t) => s + (parseFloat(t.monto) || 0), 0);
  const totalDatafono = parseFloat(document.getElementById('totalDatafono').value) || 0;
  const efectivoNeto = efectivoContado - baseInicial + egresosEfectivo;
  const ventasTotales = efectivoNeto + totalTransf + totalDatafono;

  const datos = {
    sede_id: selectedSedeId,
    fecha,
    efectivo_contado: efectivoContado,
    base_caja: baseInicial,
    monto_efectivo: efectivoContado,
    egresos_efectivo: egresosEfectivo,
    total_caja: efectivoContado,
    efectivo_neto: efectivoNeto,
    total_transferencias: totalTransf,
    total_datafono: totalDatafono,
    ventas_totales: ventasTotales,
    egresos: totalEgresos,
    total_dia: ventasTotales,
    denominaciones: denomCounts,
    notas: document.getElementById('notas').value.trim() || null,
    estado,
    cerrado_por: currentUser.id,
    cerrado_por_email: currentUser.email,
    updated_at: new Date().toISOString()
  };

  try {
    let cierreId;
    if (editandoCierreId) {
      const { error } = await window.supabase.from('cierres_caja').update(datos).eq('id', editandoCierreId);
      if (error) throw error;
      cierreId = editandoCierreId;
    } else {
      const existente = cierres.find(c => c.fecha === fecha && c.sede_id === selectedSedeId);
      if (existente) {
        if (!confirm(`Ya existe un cierre del ${fecha}. ¿Reemplazar?`)) return;
        await window.supabase.from('cierres_caja').delete().eq('id', existente.id);
      }
      const { data, error } = await window.supabase.from('cierres_caja').insert(datos).select().single();
      if (error) throw error;
      cierreId = data.id;
    }

    // Limpiar y reinsertar transferencias
    await window.supabase.from('cierres_transferencias').delete().eq('cierre_id', cierreId);
    if (transferencias.length > 0) {
      const tInsert = transferencias.filter(t => t.monto > 0).map(t => ({
        cierre_id: cierreId,
        banco: t.banco,
        monto: t.monto,
        nota: t.nota || null
      }));
      if (tInsert.length > 0) await window.supabase.from('cierres_transferencias').insert(tInsert);
    }

    // Limpiar y reinsertar egresos
    await window.supabase.from('cierres_egresos').delete().eq('cierre_id', cierreId);
    if (egresos.length > 0) {
      const eInsert = egresos.filter(e => e.motivo && e.monto > 0).map(e => ({
        cierre_id: cierreId,
        motivo: e.motivo,
        monto: e.monto,
        metodo: e.metodo,
        recibo_url: e.recibo_url || null
      }));
      if (eInsert.length > 0) await window.supabase.from('cierres_egresos').insert(eInsert);
    }

    // Conciliación bancaria
    await window.supabase.from('cierres_conciliacion_bancos').delete().eq('cierre_id', cierreId);
    const concilEntries = Object.entries(conciliacion).filter(([b, c]) => c.recibido > 0);
    if (concilEntries.length > 0) {
      const cInsert = concilEntries.map(([banco, c]) => {
        const esperado = transferencias.filter(t => t.banco === banco).reduce((s, t) => s + (parseFloat(t.monto) || 0), 0);
        return {
          cierre_id: cierreId,
          banco,
          esperado,
          recibido: c.recibido,
          diferencia: c.recibido - esperado,
          conciliado: Math.abs(c.recibido - esperado) < 1
        };
      });
      await window.supabase.from('cierres_conciliacion_bancos').insert(cInsert);
    }

    toast(estado === 'cerrado' ? '✓ Cierre guardado' : '📋 Borrador guardado');
    editandoCierreId = null;
    changeTab('historial');
    await loadCierres();
  } catch (err) {
    console.error(err);
    toast('Error: ' + err.message, 'error');
  }
};

window.cancelarNuevo = function() {
  editandoCierreId = null;
  changeTab('historial');
};

// ============= EDITAR =============
window.editarCierre = async function(id) {
  const c = cierres.find(x => x.id === id);
  if (!c) return;
  editandoCierreId = id;

  // Cargar transferencias y egresos
  const { data: trf } = await window.supabase.from('cierres_transferencias').select('*').eq('cierre_id', id);
  const { data: egr } = await window.supabase.from('cierres_egresos').select('*').eq('cierre_id', id);
  const { data: cnc } = await window.supabase.from('cierres_conciliacion_bancos').select('*').eq('cierre_id', id);

  transferencias = (trf || []).map(t => ({ banco: t.banco, monto: t.monto, nota: t.nota || '' }));
  egresos = (egr || []).map(e => ({ motivo: e.motivo, monto: e.monto, metodo: e.metodo, recibo_url: e.recibo_url || '' }));
  conciliacion = {};
  (cnc || []).forEach(x => { conciliacion[x.banco] = { recibido: x.recibido }; });
  denomCounts = c.denominaciones || {};

  changeTab('nuevo');
  setTimeout(() => {
    document.getElementById('cierreFecha').value = c.fecha;
    document.getElementById('baseInicial').value = c.base_caja || 0;
    document.getElementById('totalDatafono').value = c.total_datafono || '';
    document.getElementById('notas').value = c.notas || '';
    renderDenominaciones();
    renderTransferencias();
    renderEgresos();
    renderConciliacion();
    calcularTodo();
  }, 100);
};

window.eliminarCierre = async function(id) {
  const c = cierres.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`¿Eliminar el cierre del ${c.fecha}? Esta acción no se puede deshacer.`)) return;
  try {
    const { error } = await window.supabase.from('cierres_caja').delete().eq('id', id);
    if (error) throw error;
    toast('✓ Cierre eliminado');
    await loadCierres();
  } catch (err) { toast('Error: ' + err.message, 'error'); }
};

// ============= VER DETALLE =============
window.verCierre = async function(id) {
  const c = cierres.find(x => x.id === id);
  if (!c) return;
  const sede = sedes.find(s => s.id === c.sede_id);
  const { data: trf } = await window.supabase.from('cierres_transferencias').select('*').eq('cierre_id', id);
  const { data: egr } = await window.supabase.from('cierres_egresos').select('*').eq('cierre_id', id);
  const { data: cnc } = await window.supabase.from('cierres_conciliacion_bancos').select('*').eq('cierre_id', id);

  const denomList = Object.entries(c.denominaciones || {})
    .filter(([v, cnt]) => cnt > 0)
    .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
    .map(([v, cnt]) => `<tr><td>${fmtMoney(parseInt(v))}</td><td class="qty">x ${cnt}</td><td class="money">${fmtMoney(parseInt(v) * cnt)}</td></tr>`)
    .join('');

  const trfRows = (trf || []).map(t => `<tr><td><strong>${escapeHTML(t.banco)}</strong></td><td class="money">${fmtMoney(t.monto)}</td><td style="font-size:11px; color:var(--text-soft);">${escapeHTML(t.nota || '—')}</td></tr>`).join('');
  const egrRows = (egr || []).map(e => `<tr><td><strong>${escapeHTML(e.motivo)}</strong></td><td>${e.metodo === 'efectivo' ? '💵' : '💳'}</td><td class="money" style="color:var(--red);">${fmtMoney(e.monto)}</td><td>${e.recibo_url ? `<a href="${e.recibo_url}" target="_blank" class="btn-icon">📷 Ver</a>` : '—'}</td></tr>`).join('');
  const cncRows = (cnc || []).map(x => {
    const status = Math.abs(x.diferencia) < 1
      ? '<span style="color:var(--green); font-weight:800;">✅ Cuadra</span>'
      : x.diferencia > 0
      ? `<span style="color:var(--orange); font-weight:800;">+${fmtMoney(x.diferencia)} sobra</span>`
      : `<span style="color:var(--red); font-weight:800;">${fmtMoney(x.diferencia)} falta</span>`;
    return `<tr><td><strong>${escapeHTML(x.banco)}</strong></td><td class="money">${fmtMoney(x.esperado)}</td><td class="money">${fmtMoney(x.recibido)}</td><td>${status}</td></tr>`;
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
        <div>
          <div style="font-family:'Bungee',sans-serif; font-size:22px; color:var(--ink);">📋 CIERRE · ${c.fecha}</div>
          <div style="font-size:13px; color:var(--text-soft); margin-top:4px;">${escapeHTML(sede?.nombre || '')} · Por ${escapeHTML(c.cerrado_por_email || '')}</div>
        </div>
        <button onclick="this.closest('.modal-overlay').remove()" class="btn" style="background:var(--blood); color:white;">✕ CERRAR</button>
      </div>

      <div class="stats-grid">
        <div class="stat-card green"><div class="label">Ventas Totales</div><div class="value">${fmtMoney(c.ventas_totales)}</div></div>
        <div class="stat-card"><div class="label">Efectivo Neto</div><div class="value">${fmtMoney(c.efectivo_neto)}</div></div>
        <div class="stat-card orange"><div class="label">Transferencias</div><div class="value">${fmtMoney(c.total_transferencias)}</div></div>
        <div class="stat-card red"><div class="label">Egresos</div><div class="value">${fmtMoney(c.egresos)}</div></div>
      </div>

      ${c.notas ? `<div class="alert alert-warn" style="margin:14px 0;"><strong>📝 Notas:</strong> ${escapeHTML(c.notas)}</div>` : ''}

      ${denomList ? `
        <h3 style="font-family:'Bungee',sans-serif; font-size:14px; margin:18px 0 10px;">💵 Denominaciones</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Denominación</th><th class="qty">Cantidad</th><th class="money">Subtotal</th></tr></thead>
          <tbody>${denomList}</tbody>
        </table></div>` : ''}

      ${trfRows ? `
        <h3 style="font-family:'Bungee',sans-serif; font-size:14px; margin:18px 0 10px;">💳 Transferencias</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Banco</th><th class="money">Monto</th><th>Nota</th></tr></thead>
          <tbody>${trfRows}</tbody>
        </table></div>` : ''}

      ${egrRows ? `
        <h3 style="font-family:'Bungee',sans-serif; font-size:14px; margin:18px 0 10px;">📤 Egresos</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Motivo</th><th>Método</th><th class="money">Monto</th><th>Recibo</th></tr></thead>
          <tbody>${egrRows}</tbody>
        </table></div>` : ''}

      ${cncRows ? `
        <h3 style="font-family:'Bungee',sans-serif; font-size:14px; margin:18px 0 10px;">🏦 Conciliación Bancaria</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Banco</th><th class="money">Esperado</th><th class="money">Recibido</th><th>Estado</th></tr></thead>
          <tbody>${cncRows}</tbody>
        </table></div>` : ''}
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
};

// ============= REPORTES =============
async function loadReportes() {
  const stats = document.getElementById('statsReportes');
  const totales = cierres.reduce((acc, c) => ({
    ventas: acc.ventas + (c.ventas_totales || 0),
    efectivo: acc.efectivo + (c.efectivo_neto || 0),
    transf: acc.transf + (c.total_transferencias || 0),
    datafono: acc.datafono + (c.total_datafono || 0),
    egresos: acc.egresos + (c.egresos || 0)
  }), { ventas: 0, efectivo: 0, transf: 0, datafono: 0, egresos: 0 });

  const promedio = cierres.length > 0 ? totales.ventas / cierres.length : 0;

  stats.innerHTML = `
    <div class="stat-card green"><div class="label">Ventas del Mes</div><div class="value">${fmtMoney(totales.ventas)}</div></div>
    <div class="stat-card orange"><div class="label">Promedio Diario</div><div class="value">${fmtMoney(promedio)}</div></div>
    <div class="stat-card"><div class="label">Efectivo Neto</div><div class="value">${fmtMoney(totales.efectivo)}</div></div>
    <div class="stat-card"><div class="label">Transferencias</div><div class="value">${fmtMoney(totales.transf)}</div></div>
    <div class="stat-card"><div class="label">Datáfono</div><div class="value">${fmtMoney(totales.datafono)}</div></div>
    <div class="stat-card red"><div class="label">Egresos</div><div class="value">${fmtMoney(totales.egresos)}</div></div>
  `;

  const cont = document.getElementById('resumenMes');
  if (cierres.length === 0) {
    cont.innerHTML = '<div class="empty">Sin datos para este mes</div>';
    return;
  }

  cont.innerHTML = `
    <table style="width:100%; border-collapse:collapse;">
      <thead><tr style="background:var(--ink); color:white;"><th style="padding:10px; text-align:left;">Fecha</th><th style="padding:10px; text-align:right;">Ventas</th><th style="padding:10px; text-align:right;">Efectivo</th><th style="padding:10px; text-align:right;">Transf.</th><th style="padding:10px; text-align:right;">Egresos</th></tr></thead>
      <tbody>
        ${cierres.map(c => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:10px;"><strong>${c.fecha}</strong></td>
            <td style="padding:10px; text-align:right; font-family:'JetBrains Mono',monospace; color:var(--green);">${fmtMoney(c.ventas_totales)}</td>
            <td style="padding:10px; text-align:right; font-family:'JetBrains Mono',monospace;">${fmtMoney(c.efectivo_neto)}</td>
            <td style="padding:10px; text-align:right; font-family:'JetBrains Mono',monospace;">${fmtMoney(c.total_transferencias)}</td>
            <td style="padding:10px; text-align:right; font-family:'JetBrains Mono',monospace; color:var(--red);">${fmtMoney(c.egresos)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ============= INIT =============
checkAuth();
