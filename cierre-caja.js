// ==============================================================
// TACO PARADO · CIERRE DE CAJA · LÓGICA COMPLETA
// ==============================================================

// Métodos de pago estándar (igual que en tu cierre POS)
const METODOS_PAGO = [
  { key: 'efectivo',      nombre: 'Monto en Efectivo',  esEfectivo: true,  esBanco: false },
  { key: 'mastercard',    nombre: 'MasterCard',          esEfectivo: false, esBanco: true  },
  { key: 'visa',          nombre: 'Visa',                esEfectivo: false, esBanco: true  },
  { key: 'datafono',      nombre: 'Datáfono',            esEfectivo: false, esBanco: true  },
  { key: 'transferencia', nombre: 'Transferencia',       esEfectivo: false, esBanco: true  },
  { key: 'bancolombia',   nombre: 'Bancolombia',         esEfectivo: false, esBanco: true  },
  { key: 'nequi',         nombre: 'Nequi',               esEfectivo: false, esBanco: true  },
  { key: 'davivienda',    nombre: 'Davivienda',          esEfectivo: false, esBanco: true  },
  { key: 'daviplata',     nombre: 'Daviplata',           esEfectivo: false, esBanco: true  },
  { key: 'apps',          nombre: 'Apps',                esEfectivo: false, esBanco: true  },
  { key: 'consignacion',  nombre: 'Consignación',        esEfectivo: false, esBanco: true  },
  { key: 'nota_credito',  nombre: 'Nota Crédito',        esEfectivo: false, esBanco: false },
  { key: 'nota_debito',   nombre: 'Nota Débito',         esEfectivo: false, esBanco: false },
  { key: 'puntos',        nombre: 'Puntos',              esEfectivo: false, esBanco: false }
];

// STATE
let currentUser = null;
let userRole = null;
let userSedeId = null;
let sedes = [];
let selectedSedeId = null;
let cierres = [];
let editandoCierreId = null;
let scanFile = null;
let scanFileUrl = null;

// ============= HELPERS =============
function fmt(n) {
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
}
function fmtMoney(n) {
  return '$' + fmt(n);
}
function escapeHTML(s) {
  return (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 3000);
}
async function waitForSupabase() {
  while (!window.supabase) await new Promise(r => setTimeout(r, 50));
}

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

  // Solo admin y admin_contador pueden acceder
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
  renderMetodosForm();
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
  const hoy = new Date();
  mes.value = hoy.toISOString().slice(0, 7);
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

    let q = window.supabase.from('cierres_caja').select('*')
      .gte('fecha', inicio).lt('fecha', fin)
      .order('fecha', { ascending: false });
    if (userRole !== 'admin') q = q.eq('sede_id', selectedSedeId);
    else q = q.eq('sede_id', selectedSedeId);

    const { data, error } = await q;
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
    tb.innerHTML = '<tr><td colspan="9"><div class="empty">Sin cierres este mes. Crea el primero con "+ Nuevo Cierre".</div></td></tr>';
    return;
  }
  tb.innerHTML = cierres.map(c => {
    const sede = sedes.find(s => s.id === c.sede_id);
    const estadoBadge = c.estado === 'cerrado'
      ? '<span style="background:#DCFCE7; color:#166534; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:800;">✓ CERRADO</span>'
      : c.estado === 'conciliado'
      ? '<span style="background:#DBEAFE; color:#1E40AF; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:800;">🔵 CONCILIADO</span>'
      : '<span style="background:#FEF3C7; color:#854d0e; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:800;">📋 BORRADOR</span>';
    return `<tr>
      <td><strong>${c.fecha}</strong></td>
      <td>${escapeHTML(sede?.nombre || '—')}</td>
      <td>#${c.numero_cierre || '—'}</td>
      <td class="qty">${c.numero_facturas || 0}</td>
      <td class="money">${fmtMoney(c.total_dia)}</td>
      <td class="money" style="color:var(--red);">${fmtMoney(c.egresos)}</td>
      <td class="money" style="color:var(--green);">${fmtMoney(c.total_caja)}</td>
      <td>${estadoBadge}</td>
      <td>
        <button class="btn-icon" onclick="verCierre('${c.id}')" title="Ver detalle">👁</button>
        <button class="btn-icon" onclick="editarCierre('${c.id}')" title="Editar">✎</button>
        ${userRole === 'admin' ? `<button class="btn-icon danger" onclick="eliminarCierre('${c.id}')" title="Eliminar">✕</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function renderResumen() {
  const stats = document.getElementById('statsResumen');
  const totalDia = cierres.reduce((s, c) => s + (c.total_dia || 0), 0);
  const totalEgresos = cierres.reduce((s, c) => s + (c.egresos || 0), 0);
  const totalCaja = cierres.reduce((s, c) => s + (c.total_caja || 0), 0);
  const totalDif = cierres.reduce((s, c) => s + (c.diferencia_declarada || 0), 0);

  stats.innerHTML = `
    <div class="stat-card green"><div class="label">Total Mes</div><div class="value">${fmtMoney(totalDia)}</div></div>
    <div class="stat-card red"><div class="label">Egresos Mes</div><div class="value">${fmtMoney(totalEgresos)}</div></div>
    <div class="stat-card orange"><div class="label">Caja Acumulada</div><div class="value">${fmtMoney(totalCaja)}</div></div>
    <div class="stat-card ${totalDif < 0 ? 'red' : 'green'}"><div class="label">Diferencias</div><div class="value">${fmtMoney(totalDif)}</div></div>
    <div class="stat-card"><div class="label">Cierres</div><div class="value">${cierres.length}</div></div>
  `;
}

// ============= FORM NUEVO =============
function initFormNuevo() {
  if (!editandoCierreId) {
    document.getElementById('cierreFecha').value = new Date().toISOString().slice(0, 10);
    // Sugerir el siguiente número de cierre
    const ultNum = Math.max(0, ...cierres.map(c => c.numero_cierre || 0));
    document.getElementById('cierreNumero').value = ultNum + 1;
  }
}

function renderMetodosForm() {
  const tb = document.getElementById('tblMetodos');
  tb.innerHTML = METODOS_PAGO.map(m => `
    <tr data-metodo="${m.key}">
      <td><strong>${escapeHTML(m.nombre)}</strong></td>
      <td><input type="number" class="met-ingresa" data-key="${m.key}" step="100" placeholder="0" oninput="recalcularMetodos()" style="width:120px; padding:6px; border:1.5px solid var(--border); border-radius:6px; text-align:right; font-family:'JetBrains Mono',monospace; font-weight:700;"></td>
      <td><input type="number" class="met-sale" data-key="${m.key}" step="100" placeholder="0" oninput="recalcularMetodos()" style="width:120px; padding:6px; border:1.5px solid var(--border); border-radius:6px; text-align:right; font-family:'JetBrains Mono',monospace; font-weight:700;"></td>
      <td class="money met-queda" data-key="${m.key}">$0</td>
      ${m.esBanco ? `<td><input type="number" class="met-banco" data-key="${m.key}" step="100" placeholder="0" oninput="recalcularMetodos()" style="width:120px; padding:6px; border:1.5px solid var(--border); border-radius:6px; text-align:right; font-family:'JetBrains Mono',monospace; font-weight:700;"></td>` : '<td style="opacity:0.4; text-align:center;">—</td>'}
      <td class="met-diff" data-key="${m.key}">—</td>
    </tr>
  `).join('');
}

window.recalcularMetodos = function() {
  let totalEfectivoIngresa = 0;
  document.querySelectorAll('#tblMetodos tr').forEach(tr => {
    const key = tr.dataset.metodo;
    const ing = parseFloat(tr.querySelector('.met-ingresa').value) || 0;
    const sale = parseFloat(tr.querySelector('.met-sale').value) || 0;
    const queda = ing - sale;
    tr.querySelector('.met-queda').textContent = fmtMoney(queda);

    const metodo = METODOS_PAGO.find(m => m.key === key);
    if (metodo?.esEfectivo) totalEfectivoIngresa += ing;

    // Conciliación bancaria
    if (metodo?.esBanco) {
      const bancoInput = tr.querySelector('.met-banco');
      const banco = parseFloat(bancoInput?.value) || 0;
      const diffEl = tr.querySelector('.met-diff');
      if (ing > 0 && banco > 0) {
        const diff = banco - ing;
        if (Math.abs(diff) < 1) {
          diffEl.innerHTML = '<span style="color:var(--green); font-weight:800;">✓ Cuadra</span>';
        } else if (diff > 0) {
          diffEl.innerHTML = `<span style="color:var(--orange); font-weight:800;">+${fmtMoney(diff)} sobra</span>`;
        } else {
          diffEl.innerHTML = `<span style="color:var(--red); font-weight:800;">${fmtMoney(diff)} falta</span>`;
        }
      } else {
        diffEl.innerHTML = '<span style="opacity:0.4;">—</span>';
      }
    }
  });

  // Actualizar el campo de Monto Efectivo
  document.getElementById('montoEfectivo').value = totalEfectivoIngresa;
  recalcularCaja();
  // Auto-llenar Total Facturas si está vacío
  const totalFact = document.getElementById('totalFacturas');
  if (!totalFact.value || totalFact.dataset.auto === '1') {
    const sumIngresos = Array.from(document.querySelectorAll('.met-ingresa')).reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
    totalFact.value = sumIngresos;
    totalFact.dataset.auto = '1';
    recalcularTotales();
  }
};

window.recalcularTotales = function() {
  const tf = parseFloat(document.getElementById('totalFacturas').value) || 0;
  const ing = parseFloat(document.getElementById('ingresos').value) || 0;
  const ab = parseFloat(document.getElementById('abonos').value) || 0;
  const pp = parseFloat(document.getElementById('pendientePago').value) || 0;
  const eg = parseFloat(document.getElementById('egresos').value) || 0;
  const total = tf + ing + ab - pp - eg;
  document.getElementById('totalDia').value = total;
};

window.recalcularCaja = function() {
  const monto = parseFloat(document.getElementById('montoEfectivo').value) || 0;
  const base = parseFloat(document.getElementById('baseCaja').value) || 0;
  const eg = parseFloat(document.getElementById('egresosEfectivo').value) || 0;
  const total = monto + base - eg;
  document.getElementById('totalCaja').value = total;
  document.getElementById('totalCajaDeclarar').value = total;
  calcularDiferencia();
};

window.calcularDiferencia = function() {
  const total = parseFloat(document.getElementById('totalCajaDeclarar').value) || 0;
  const dec = parseFloat(document.getElementById('montoDeclarado').value) || 0;
  const diff = dec - total;
  const box = document.getElementById('diferenciaBox');
  if (dec === 0) { box.innerHTML = ''; return; }
  if (Math.abs(diff) < 1) {
    box.innerHTML = `<div class="alert alert-success">✅ <strong>$0 SOBRA</strong> · El cuadre es exacto. Todo cuadra perfectamente.</div>`;
  } else if (diff > 0) {
    box.innerHTML = `<div class="alert alert-warn">⚠️ <strong>+${fmtMoney(diff)} SOBRA</strong> · El cajero contó más dinero del esperado. Verifica si hay vueltos sin entregar o pagos no registrados.</div>`;
  } else {
    box.innerHTML = `<div class="alert alert-error">🚨 <strong>${fmtMoney(Math.abs(diff))} FALTA</strong> · Hay un faltante en caja. Revisa registros, posibles errores de digitación o cobros no efectivos.</div>`;
  }
};

// ============= OCR =============
function setupDropzone() {
  const dz = document.getElementById('dropzone');
  if (!dz) return;
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  document.getElementById('fileInput').addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });
}

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) { toast('Solo imágenes', 'error'); return; }
  scanFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('previewImg').src = e.target.result;
    scanFileUrl = e.target.result;
    document.getElementById('previewBox').style.display = 'block';
    document.getElementById('dropzone').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

window.resetScan = function() {
  scanFile = null;
  scanFileUrl = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('previewBox').style.display = 'none';
  document.getElementById('dropzone').style.display = 'block';
  document.getElementById('progressBox').style.display = 'none';
};

window.procesarOCR = async function() {
  if (!scanFile) return;
  if (typeof Tesseract === 'undefined') { toast('Cargando OCR...', 'error'); return; }
  const pBox = document.getElementById('progressBox');
  const pFill = document.getElementById('progressFill');
  const pText = document.getElementById('progressText');
  pBox.style.display = 'block';
  document.getElementById('btnProcesarOCR').disabled = true;
  pFill.style.width = '0%';
  pText.textContent = 'Iniciando OCR...';

  try {
    const result = await Tesseract.recognize(scanFile, 'spa+eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          pFill.style.width = pct + '%';
          pText.textContent = `Reconociendo... ${pct}%`;
        } else {
          pText.textContent = m.status;
        }
      }
    });
    pFill.style.width = '100%';
    pText.textContent = '✓ Listo. Extrayendo datos...';
    extraerDatosCierre(result.data.text);
  } catch (err) {
    console.error(err);
    toast('Error en OCR', 'error');
  } finally {
    document.getElementById('btnProcesarOCR').disabled = false;
  }
};

// Función inteligente para extraer datos del cierre POS
function extraerDatosCierre(texto) {
  if (!texto || !texto.trim()) { toast('Sin texto detectado', 'error'); return; }
  const lineas = texto.split('\n').map(l => l.trim()).filter(l => l);
  let extraidos = 0;

  // Patrones a buscar
  const patrones = {
    'cierreNumero':   /cierre\s*(?:de\s*)?caja[:\s#]*(\d+)/i,
    'cierreFacturas': /(?:registro\s*de\s*facturas|total\s*facturas)[:\s#]*(\d+)/i,
    'totalFacturas':  /total\s*factura[s]?[:\s]+\$?([\d.,]+)/i,
    'ingresos':       /^ingresos[:\s]+\$?([\d.,]+)/i,
    'abonos':         /^abonos[:\s]+\$?([\d.,]+)/i,
    'pendientePago':  /pendiente\s*(?:de\s*)?pago[:\s]+\$?([\d.,]+)/i,
    'egresos':        /^egresos[:\s]+\$?([\d.,]+)/i,
    'baseCaja':       /^base[:\s]+\$?([\d.,]+)/i,
    'egresosEfectivo':/egresos\s*efectivo[:\s]+\$?([\d.,]+)/i,
    'montoDeclarado': /monto\s*declarado[:\s]+\$?([\d.,]+)/i
  };

  // Buscar en todas las líneas
  for (const linea of lineas) {
    for (const [campo, regex] of Object.entries(patrones)) {
      const m = linea.match(regex);
      if (m && m[1]) {
        const valor = parseFloat(m[1].replace(/[.,]/g, ''));
        const el = document.getElementById(campo);
        if (el && !el.value) {
          el.value = valor || 0;
          extraidos++;
        }
      }
    }
  }

  // Detectar montos por método de pago (heurística simple)
  const metodosTexto = {
    'efectivo':      /(?:monto\s+(?:en\s+)?efectivo|^efectivo)[:\s]+\$?([\d.,]+)/i,
    'mastercard':    /master\s*card[:\s]+\$?([\d.,]+)/i,
    'visa':          /^visa[:\s]+\$?([\d.,]+)/i,
    'datafono':      /dat[áa]fono[:\s]+\$?([\d.,]+)/i,
    'transferencia': /transferencia[:\s]+\$?([\d.,]+)/i,
    'bancolombia':   /bancolombia[:\s]+\$?([\d.,]+)/i,
    'nequi':         /nequi[:\s]+\$?([\d.,]+)/i,
    'davivienda':    /davivienda[:\s]+\$?([\d.,]+)/i,
    'consignacion':  /consignaci[óo]n[:\s]+\$?([\d.,]+)/i
  };

  for (const linea of lineas) {
    for (const [key, regex] of Object.entries(metodosTexto)) {
      const m = linea.match(regex);
      if (m && m[1]) {
        const valor = parseFloat(m[1].replace(/[.,]/g, ''));
        const input = document.querySelector(`.met-ingresa[data-key="${key}"]`);
        if (input && !input.value && valor > 0) {
          input.value = valor;
          extraidos++;
        }
      }
    }
  }

  recalcularMetodos();
  recalcularTotales();

  if (extraidos > 0) {
    toast(`✓ ${extraidos} campos extraídos · Revisa y corrige si es necesario`);
    document.querySelector('.form-section:nth-of-type(2)').scrollIntoView({ behavior: 'smooth' });
  } else {
    toast('No se detectaron datos · llena el formulario manualmente', 'error');
  }
}

// ============= GUARDAR CIERRE =============
window.guardarCierre = async function(estado) {
  const fecha = document.getElementById('cierreFecha').value;
  if (!fecha) { toast('Falta la fecha', 'error'); return; }
  if (!selectedSedeId) { toast('Selecciona una sede', 'error'); return; }

  // Recopilar datos del formulario
  const datos = {
    sede_id: selectedSedeId,
    fecha,
    numero_cierre: parseInt(document.getElementById('cierreNumero').value) || null,
    numero_facturas: parseInt(document.getElementById('cierreFacturas').value) || 0,
    total_facturas: parseFloat(document.getElementById('totalFacturas').value) || 0,
    ingresos: parseFloat(document.getElementById('ingresos').value) || 0,
    abonos: parseFloat(document.getElementById('abonos').value) || 0,
    pendiente_pago: parseFloat(document.getElementById('pendientePago').value) || 0,
    egresos: parseFloat(document.getElementById('egresos').value) || 0,
    total_dia: parseFloat(document.getElementById('totalDia').value) || 0,
    monto_efectivo: parseFloat(document.getElementById('montoEfectivo').value) || 0,
    base_caja: parseFloat(document.getElementById('baseCaja').value) || 0,
    egresos_efectivo: parseFloat(document.getElementById('egresosEfectivo').value) || 0,
    total_caja: parseFloat(document.getElementById('totalCaja').value) || 0,
    monto_declarado: parseFloat(document.getElementById('montoDeclarado').value) || 0,
    diferencia_declarada: (parseFloat(document.getElementById('montoDeclarado').value) || 0) - (parseFloat(document.getElementById('totalCajaDeclarar').value) || 0),
    notas: document.getElementById('notas').value.trim() || null,
    estado,
    cerrado_por: currentUser.id,
    cerrado_por_email: currentUser.email,
    updated_at: new Date().toISOString()
  };

  // Horas inicio/fin
  const ti = document.getElementById('cierreHoraInicio').value;
  const tf = document.getElementById('cierreHoraFin').value;
  if (ti) datos.fecha_inicio = `${fecha}T${ti}:00`;
  if (tf) {
    const fechaSig = new Date(fecha);
    fechaSig.setDate(fechaSig.getDate() + 1);
    datos.fecha_fin = `${fechaSig.toISOString().slice(0,10)}T${tf}:00`;
  }

  try {
    let cierreId;
    if (editandoCierreId) {
      const { error } = await window.supabase.from('cierres_caja').update(datos).eq('id', editandoCierreId);
      if (error) throw error;
      cierreId = editandoCierreId;
    } else {
      // Verificar si ya existe (sede + fecha es único)
      const existente = cierres.find(c => c.fecha === fecha && c.sede_id === selectedSedeId);
      if (existente) {
        if (!confirm(`Ya existe un cierre del ${fecha} para esta sede. ¿Reemplazar?`)) return;
        await window.supabase.from('cierres_caja').delete().eq('id', existente.id);
      }
      const { data, error } = await window.supabase.from('cierres_caja').insert(datos).select().single();
      if (error) throw error;
      cierreId = data.id;
    }

    // Subir archivo OCR si lo hay
    if (scanFile) {
      const ext = scanFile.name.split('.').pop();
      const fname = `cierre_${cierreId}_${Date.now()}.${ext}`;
      const { error: upErr } = await window.supabase.storage.from('cierres').upload(fname, scanFile, { upsert: true });
      if (!upErr) {
        const { data: { publicUrl } } = window.supabase.storage.from('cierres').getPublicUrl(fname);
        await window.supabase.from('cierres_caja').update({ archivo_url: publicUrl }).eq('id', cierreId);
      }
    }

    // Guardar métodos de pago
    await window.supabase.from('cierres_metodos_pago').delete().eq('cierre_id', cierreId);
    const metodos = [];
    document.querySelectorAll('#tblMetodos tr').forEach(tr => {
      const key = tr.dataset.metodo;
      const meta = METODOS_PAGO.find(m => m.key === key);
      const ing = parseFloat(tr.querySelector('.met-ingresa').value) || 0;
      const sale = parseFloat(tr.querySelector('.met-sale').value) || 0;
      const banco = parseFloat(tr.querySelector('.met-banco')?.value) || 0;
      if (ing > 0 || sale > 0 || banco > 0) {
        metodos.push({
          cierre_id: cierreId,
          metodo: meta.nombre,
          ingresa: ing,
          sale: sale,
          queda: ing - sale,
          esperado_banco: meta.esBanco ? ing : null,
          recibido_banco: meta.esBanco ? banco : null,
          diferencia: meta.esBanco ? (banco - ing) : 0,
          conciliado: meta.esBanco ? (Math.abs(banco - ing) < 1) : false
        });
      }
    });
    if (metodos.length > 0) await window.supabase.from('cierres_metodos_pago').insert(metodos);

    toast(estado === 'cerrado' ? '✓ Cierre guardado correctamente' : '📋 Borrador guardado');
    editandoCierreId = null;
    resetForm();
    changeTab('historial');
    await loadCierres();
  } catch (err) {
    console.error(err);
    toast('Error: ' + err.message, 'error');
  }
};

function resetForm() {
  document.querySelectorAll('#panel-nuevo input').forEach(i => {
    if (i.id === 'baseCaja') { i.value = '300000'; return; }
    if (i.id === 'cierreHoraInicio' || i.id === 'cierreHoraFin') { i.value = '05:00'; return; }
    if (i.type !== 'date' && i.type !== 'time') i.value = '';
  });
  document.getElementById('notas').value = '';
  document.getElementById('diferenciaBox').innerHTML = '';
  resetScan();
}

// ============= EDITAR =============
window.editarCierre = async function(id) {
  const c = cierres.find(x => x.id === id);
  if (!c) return;
  editandoCierreId = id;
  changeTab('nuevo');
  setTimeout(() => {
    document.getElementById('cierreFecha').value = c.fecha;
    document.getElementById('cierreNumero').value = c.numero_cierre || '';
    document.getElementById('cierreFacturas').value = c.numero_facturas || '';
    document.getElementById('totalFacturas').value = c.total_facturas || '';
    document.getElementById('ingresos').value = c.ingresos || '';
    document.getElementById('abonos').value = c.abonos || '';
    document.getElementById('pendientePago').value = c.pendiente_pago || '';
    document.getElementById('egresos').value = c.egresos || '';
    document.getElementById('baseCaja').value = c.base_caja || 300000;
    document.getElementById('egresosEfectivo').value = c.egresos_efectivo || '';
    document.getElementById('montoDeclarado').value = c.monto_declarado || '';
    document.getElementById('notas').value = c.notas || '';
    cargarMetodosCierre(id);
    recalcularTotales();
  }, 100);
};

async function cargarMetodosCierre(cierreId) {
  const { data: metodos } = await window.supabase.from('cierres_metodos_pago').select('*').eq('cierre_id', cierreId);
  if (!metodos) return;
  metodos.forEach(m => {
    const meta = METODOS_PAGO.find(x => x.nombre === m.metodo);
    if (!meta) return;
    const tr = document.querySelector(`#tblMetodos tr[data-metodo="${meta.key}"]`);
    if (!tr) return;
    tr.querySelector('.met-ingresa').value = m.ingresa || '';
    tr.querySelector('.met-sale').value = m.sale || '';
    const banco = tr.querySelector('.met-banco');
    if (banco) banco.value = m.recibido_banco || '';
  });
  recalcularMetodos();
}

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
  const { data: metodos } = await window.supabase.from('cierres_metodos_pago').select('*').eq('cierre_id', id);

  const metodosRows = (metodos || []).map(m => `
    <tr>
      <td><strong>${escapeHTML(m.metodo)}</strong></td>
      <td class="money">${fmtMoney(m.ingresa)}</td>
      <td class="money">${fmtMoney(m.sale)}</td>
      <td class="money">${fmtMoney(m.queda)}</td>
      <td class="money">${m.recibido_banco !== null ? fmtMoney(m.recibido_banco) : '—'}</td>
      <td>${m.diferencia === 0 ? '<span style="color:var(--green); font-weight:800;">✓</span>' : (m.diferencia > 0 ? `<span style="color:var(--orange);">+${fmtMoney(m.diferencia)}</span>` : `<span style="color:var(--red);">${fmtMoney(m.diferencia)}</span>`)}</td>
    </tr>
  `).join('');

  const totalIng = (metodos || []).reduce((s, m) => s + (m.ingresa || 0), 0);
  const totalSale = (metodos || []).reduce((s, m) => s + (m.sale || 0), 0);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
        <div>
          <div style="font-family:'Bungee',sans-serif; font-size:22px; color:var(--ink);">📋 CIERRE #${c.numero_cierre || '—'} · ${c.fecha}</div>
          <div style="font-size:13px; color:var(--text-soft); margin-top:4px;">${escapeHTML(sede?.nombre || '')} · Por ${escapeHTML(c.cerrado_por_email || '')}</div>
        </div>
        <button onclick="this.closest('.modal-overlay').remove()" class="btn" style="background:var(--blood); color:white;">✕ CERRAR</button>
      </div>

      <div class="stats-grid">
        <div class="stat-card green"><div class="label">Total del Día</div><div class="value">${fmtMoney(c.total_dia)}</div></div>
        <div class="stat-card red"><div class="label">Egresos</div><div class="value">${fmtMoney(c.egresos)}</div></div>
        <div class="stat-card orange"><div class="label">Total Caja</div><div class="value">${fmtMoney(c.total_caja)}</div></div>
        <div class="stat-card ${c.diferencia_declarada === 0 ? 'green' : (c.diferencia_declarada > 0 ? 'orange' : 'red')}">
          <div class="label">Diferencia</div>
          <div class="value">${c.diferencia_declarada === 0 ? '$0 ✓' : fmtMoney(c.diferencia_declarada)}</div>
        </div>
      </div>

      ${c.notas ? `<div class="alert alert-warn" style="margin:14px 0;"><strong>📝 Notas:</strong> ${escapeHTML(c.notas)}</div>` : ''}

      <h3 style="font-family:'Bungee',sans-serif; font-size:14px; margin:18px 0 10px;">💳 Métodos de Pago</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Método</th><th class="money">Ingresa</th><th class="money">Sale</th><th class="money">Queda</th><th class="money">Banco</th><th>Estado</th></tr></thead>
          <tbody>${metodosRows || '<tr><td colspan="6" style="text-align:center; opacity:0.5;">Sin movimientos</td></tr>'}</tbody>
        </table>
      </div>

      <h3 style="font-family:'Bungee',sans-serif; font-size:14px; margin:18px 0 10px;">📊 Detallado</h3>
      <div class="table-wrap">
        <table>
          <tr><td>Total contado</td><td class="money">${fmtMoney(c.total_facturas)}</td></tr>
          <tr><td>Ingresos</td><td class="money">${fmtMoney(c.ingresos)}</td></tr>
          <tr><td>Abonos</td><td class="money">${fmtMoney(c.abonos)}</td></tr>
          <tr><td>Pendiente de pago</td><td class="money">${fmtMoney(c.pendiente_pago)}</td></tr>
          <tr><td>Egresos</td><td class="money" style="color:var(--red);">${fmtMoney(c.egresos)}</td></tr>
          <tr style="background:var(--paper); font-weight:800;"><td><strong>TOTAL DEL DÍA</strong></td><td class="money"><strong>${fmtMoney(c.total_dia)}</strong></td></tr>
        </table>
      </div>

      ${c.archivo_url ? `<div style="margin-top:14px;"><a href="${c.archivo_url}" target="_blank" class="btn">📎 Ver archivo OCR original</a></div>` : ''}
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
};

// ============= REPORTES =============
async function loadReportes() {
  const stats = document.getElementById('statsReportes');
  const totales = cierres.reduce((acc, c) => ({
    dia: acc.dia + (c.total_dia || 0),
    egresos: acc.egresos + (c.egresos || 0),
    caja: acc.caja + (c.total_caja || 0),
    facturas: acc.facturas + (c.numero_facturas || 0),
    diferencias: acc.diferencias + (c.diferencia_declarada || 0)
  }), { dia: 0, egresos: 0, caja: 0, facturas: 0, diferencias: 0 });

  const promedio = cierres.length > 0 ? totales.dia / cierres.length : 0;

  stats.innerHTML = `
    <div class="stat-card green"><div class="label">Ventas del Mes</div><div class="value">${fmtMoney(totales.dia)}</div></div>
    <div class="stat-card orange"><div class="label">Promedio Diario</div><div class="value">${fmtMoney(promedio)}</div></div>
    <div class="stat-card red"><div class="label">Egresos Totales</div><div class="value">${fmtMoney(totales.egresos)}</div></div>
    <div class="stat-card"><div class="label">Total Facturas</div><div class="value">${totales.facturas}</div></div>
    <div class="stat-card"><div class="label">Días con Cierre</div><div class="value">${cierres.length}</div></div>
    <div class="stat-card ${totales.diferencias < 0 ? 'red' : (totales.diferencias > 0 ? 'orange' : 'green')}">
      <div class="label">Faltantes/Sobrantes</div>
      <div class="value">${fmtMoney(totales.diferencias)}</div>
    </div>
  `;

  // Resumen por día
  const resumenMes = document.getElementById('resumenMes');
  if (cierres.length === 0) {
    resumenMes.innerHTML = '<div class="empty">Sin datos para este mes</div>';
    return;
  }

  resumenMes.innerHTML = `
    <table style="width:100%; border-collapse:collapse;">
      <thead><tr style="background:var(--ink); color:white;"><th style="padding:10px; text-align:left;">Fecha</th><th style="padding:10px; text-align:right;">Ventas</th><th style="padding:10px; text-align:right;">Egresos</th><th style="padding:10px; text-align:right;">Caja</th></tr></thead>
      <tbody>
        ${cierres.map(c => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:10px;"><strong>${c.fecha}</strong></td>
            <td style="padding:10px; text-align:right; font-family:'JetBrains Mono',monospace; color:var(--green);">${fmtMoney(c.total_dia)}</td>
            <td style="padding:10px; text-align:right; font-family:'JetBrains Mono',monospace; color:var(--red);">${fmtMoney(c.egresos)}</td>
            <td style="padding:10px; text-align:right; font-family:'JetBrains Mono',monospace;">${fmtMoney(c.total_caja)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ============= INIT =============
setupDropzone();
checkAuth();
