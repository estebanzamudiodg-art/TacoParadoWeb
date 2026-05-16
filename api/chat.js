// =====================================================================
// TACO PARADO · CHATBOT API (Vercel Edge Function)
// =====================================================================
// Endpoint: POST /api/chat
// Usa Groq con Llama 3.3 70B (gratis)
// =====================================================================

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://xyqyhabhujmmjofnfizg.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5cXloYWJodWptbWpvZm5maXpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODE5NzAsImV4cCI6MjA5MjM1Nzk3MH0.9Cj7XZUjLUiBHPWw6Br4FWz2_g8T1hgg20zyrrThhZQ';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function buildSystemPrompt(menu, sedes) {
  const menuTexto = menu.map(p => {
    let linea = `- ${p.nombre}: $${p.precio.toLocaleString('es-CO')} COP`;
    if (p.descripcion) linea += ` (${p.descripcion})`;
    if (p.categoria) linea += ` [${p.categoria}]`;
    if (p.opciones && p.opciones.length > 0) {
      const opciones = p.opciones.map(o => {
        if (o.tipo === 'multi-quantity') return `${o.label} (elegir ${o.total}): ${o.valores.join(', ')}`;
        return `${o.label}: ${o.valores.join(', ')}`;
      }).join(' | ');
      linea += ` OPCIONES: ${opciones}`;
    }
    if (p.agotado) linea += ' [AGOTADO HOY]';
    return linea;
  }).join('\n');

  const sedesTexto = sedes.map(s => `- ${s.nombre}: ${s.direccion || ''} ${s.horario ? '(' + s.horario + ')' : ''}`).join('\n');

  return `Eres ChilangoBot, el asistente virtual de Taco Parado, taquería en Villavicencio, Colombia.

# PERSONALIDAD
- Amigable, cercano, juguetón pero profesional
- Tono colombiano (NO mexicano forzado)
- Emojis con moderación (1-3 por mensaje)
- Respuestas CORTAS (2-4 líneas máximo)
- SOLO hablas de Taco Parado, redirige si preguntan otras cosas
- Si cliente se molesta o pide humano: WhatsApp +57 311 482 2019

# REGLAS ESTRICTAS
1. NUNCA inventes precios o productos
2. Si está AGOTADO, NO lo recomiendes
3. SIEMPRE COP con formato $XX.XXX
4. Si piden algo con opciones (sabor Pastor/Birria etc), PREGUNTA cuál

# MENÚ
${menuTexto}

# SEDES
${sedesTexto}

# CONTACTO
WhatsApp: +57 311 482 2019 · Instagram: @tacoparado.co

# UPSELLING (con criterio, no spam)
- Solo tacos → sugiere bebida
- Bandeja → ofrece agregar queso
- >$50.000 → menciona combos
- Domicilio → pregunta bebida extra

# ACCIONES PARA AGREGAR/MODIFICAR CARRITO
Al final de tu respuesta, si vas a modificar el carrito, INCLUYE este bloque (será ocultado del cliente):

[ACTION:add_to_cart]
{"producto_nombre": "Pastor", "cantidad": 2, "opciones": [{"label":"Sabor","valor":"Pastor"}]}
[/ACTION]

Para quitar:
[ACTION:remove_from_cart]
{"producto_nombre": "Pastor"}
[/ACTION]

Para finalizar:
[ACTION:checkout]
{}
[/ACTION]

Para limpiar:
[ACTION:clear_cart]
{}
[/ACTION]

# EJEMPLOS

Cliente: "hola"
Respuesta: "¡Hola! 🌮 Soy ChilangoBot, tu asistente. ¿En qué te ayudo? ¿Quieres ver el menú o ya sabes qué pedir?"

Cliente: "dame 2 al pastor"
Respuesta: "¡Listo! Te agrego 2 tacos al pastor 🌮

[ACTION:add_to_cart]
{"producto_nombre": "Pastor", "cantidad": 2}
[/ACTION]

¿Algo de tomar? Tenemos gaseosas y aguas a $5.000."

Empieza siempre saludando si es primer mensaje. Sé cálido, breve y útil.`;
}

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const body = await req.json();
    const { session_id, message, history = [], cart = [] } = body;

    if (!session_id || !message) return jsonResponse({ error: 'Faltan parámetros' }, 400, corsHeaders);
    if (!process.env.GROQ_API_KEY) {
      return jsonResponse({
        error: 'GROQ_API_KEY no configurada',
        reply: 'El chatbot no está configurado todavía. Por favor escribe al WhatsApp +57 311 482 2019 🙏'
      }, 200, corsHeaders);
    }

    // Cargar menú y sedes
    const [menuRes, sedesRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/productos_menu?activo=eq.true&select=*&order=orden`, {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
      }),
      fetch(`${SUPABASE_URL}/rest/v1/sedes?activa=eq.true&select=*`, {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
      })
    ]);
    const menu = await menuRes.json();
    const sedes = await sedesRes.json();

    const systemPrompt = buildSystemPrompt(menu, sedes);
    const messages = [{ role: 'system', content: systemPrompt }];
    history.slice(-10).forEach(m => {
      messages.push({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content });
    });

    let mensajeUsuario = message;
    if (cart.length > 0) {
      const carritoTexto = cart.map(c => `${c.cantidad}x ${c.nombre} ($${(c.subtotal || c.precio * c.cantidad).toLocaleString('es-CO')})`).join(', ');
      mensajeUsuario = `[Carrito actual: ${carritoTexto}]\n\n${message}`;
    }
    messages.push({ role: 'user', content: mensajeUsuario });

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!groqRes.ok) {
      const errorText = await groqRes.text();
      console.error('Groq error:', errorText);
      return jsonResponse({
        reply: 'Disculpa, tuve un problema técnico. ¿Puedes escribir al WhatsApp +57 311 482 2019? 🙏'
      }, 200, corsHeaders);
    }

    const groqData = await groqRes.json();
    const replyText = groqData.choices?.[0]?.message?.content || 'Disculpa, no entendí. ¿Puedes repetir?';
    const { cleanReply, actions } = parseActions(replyText);

    saveSession(session_id, message, cleanReply, cart).catch(e => console.error('save:', e));

    return jsonResponse({
      reply: cleanReply,
      actions,
      cart_suggestion: matchProductsInActions(actions, menu)
    }, 200, corsHeaders);

  } catch (err) {
    console.error('Handler error:', err);
    return jsonResponse({
      error: err.message,
      reply: 'Hubo un error. Intenta de nuevo o escribe a WhatsApp +57 311 482 2019 🙏'
    }, 200, corsHeaders);
  }
}

function jsonResponse(data, status, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function parseActions(text) {
  const actions = [];
  const regex = /\[ACTION:(\w+)\]\s*(\{[^[]*?\})\s*\[\/ACTION\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      actions.push({ type: match[1], data: JSON.parse(match[2]) });
    } catch (e) {}
  }
  const cleanReply = text.replace(regex, '').trim();
  return { cleanReply, actions };
}

function matchProductsInActions(actions, menu) {
  return actions
    .filter(a => a.type === 'add_to_cart')
    .map(a => {
      const nombreBuscar = (a.data.producto_nombre || '').toLowerCase().trim();
      const producto = menu.find(p =>
        p.nombre.toLowerCase() === nombreBuscar ||
        p.nombre.toLowerCase().includes(nombreBuscar) ||
        nombreBuscar.includes(p.nombre.toLowerCase())
      );
      if (!producto) return null;
      return {
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: a.data.cantidad || 1,
        opciones: a.data.opciones || null,
        emoji: producto.emoji || '🌮',
        imagen_url: producto.imagen_url
      };
    })
    .filter(Boolean);
}

async function saveSession(session_id, userMsg, botReply, cart) {
  try {
    const existing = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_sesiones?session_id=eq.${session_id}&select=id,mensajes`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    const data = await existing.json();
    const nuevoMsg = [
      { role: 'user', content: userMsg, ts: new Date().toISOString() },
      { role: 'bot', content: botReply, ts: new Date().toISOString() }
    ];
    if (data && data.length > 0) {
      const mensajes = data[0].mensajes || [];
      mensajes.push(...nuevoMsg);
      await fetch(`${SUPABASE_URL}/rest/v1/chat_sesiones?id=eq.${data[0].id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          mensajes,
          ultima_actividad: new Date().toISOString(),
          carrito_final: cart,
          total_estimado: cart.reduce((s, x) => s + (x.subtotal || x.precio * x.cantidad), 0)
        })
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/chat_sesiones`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ session_id, mensajes: nuevoMsg, carrito_final: cart })
      });
    }
  } catch (e) { console.error('saveSession:', e); }
}
