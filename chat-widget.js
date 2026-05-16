// =====================================================================
// TACO PARADO · CHATBOT WIDGET (Flotante)
// =====================================================================
(function() {
  'use strict';

  const API_ENDPOINT = '/api/chat';
  const BOT_NAME = 'ChilangoBot';
  const BOT_EMOJI = '🌮';
  const AUTO_GREETING_DELAY = 30000;
  const WHATSAPP_NUMERO = '573114822019';

  let chatOpen = false;
  let sessionId = null;
  let mensajes = [];
  let enviando = false;
  let yaSaludoAutomatico = false;

  function getOrCreateSession() {
    let id = localStorage.getItem('tp_chat_session');
    if (!id) {
      id = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('tp_chat_session', id);
    }
    return id;
  }
  sessionId = getOrCreateSession();

  const styles = `
.tp-chat-button { position: fixed; bottom: 20px; right: 20px; width: 64px; height: 64px; background: linear-gradient(135deg, #FF9000, #f97316); border: 4px solid #0d2451; border-radius: 50%; box-shadow: 0 6px 0 #0d2451, 0 8px 20px rgba(0,0,0,0.25); cursor: pointer; z-index: 9998; display: flex; align-items: center; justify-content: center; font-size: 30px; transition: all 0.2s; animation: tp-chat-pulse 2s ease-in-out infinite; }
.tp-chat-button:hover { transform: translateY(-2px); }
.tp-chat-button.has-message::after { content: "1"; position: absolute; top: -4px; right: -4px; background: #dc2626; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 900; border: 2px solid #0d2451; font-family: 'Inter', sans-serif; }
@keyframes tp-chat-pulse { 0%, 100% { box-shadow: 0 6px 0 #0d2451, 0 8px 20px rgba(0,0,0,0.25), 0 0 0 0 rgba(255,144,0,0.7); } 50% { box-shadow: 0 6px 0 #0d2451, 0 8px 20px rgba(0,0,0,0.25), 0 0 0 15px rgba(255,144,0,0); } }

.tp-chat-window { position: fixed; bottom: 100px; right: 20px; width: 380px; max-width: calc(100vw - 40px); height: 600px; max-height: calc(100vh - 140px); background: #fff7ed; border: 4px solid #0d2451; border-radius: 20px; box-shadow: 0 12px 40px rgba(0,0,0,0.4); z-index: 9999; display: none; flex-direction: column; overflow: hidden; font-family: 'Inter', sans-serif; }
.tp-chat-window.open { display: flex; animation: tp-chat-slide-up 0.3s ease-out; }
@keyframes tp-chat-slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

.tp-chat-header { background: linear-gradient(135deg, #0d2451, #1A3F91); color: white; padding: 14px 18px; display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #0d2451; }
.tp-chat-avatar { width: 44px; height: 44px; background: #FF9000; border: 3px solid #FFD24D; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; }
.tp-chat-header-info { flex: 1; }
.tp-chat-header-name { font-family: 'Bungee', sans-serif; font-size: 16px; margin-bottom: 2px; }
.tp-chat-header-status { font-size: 11px; opacity: 0.85; display: flex; align-items: center; gap: 6px; }
.tp-chat-header-status::before { content: ""; width: 8px; height: 8px; background: #16a34a; border-radius: 50%; display: inline-block; animation: tp-blink 2s infinite; }
@keyframes tp-blink { 50% { opacity: 0.5; } }
.tp-chat-close { background: rgba(255,255,255,0.15); border: none; color: white; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 18px; font-weight: 900; }
.tp-chat-close:hover { background: rgba(255,255,255,0.25); }

.tp-chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: #fff7ed; }
.tp-chat-messages::-webkit-scrollbar { width: 6px; }
.tp-chat-messages::-webkit-scrollbar-thumb { background: rgba(13,36,81,0.2); border-radius: 4px; }

.tp-msg { max-width: 85%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.45; word-wrap: break-word; white-space: pre-wrap; animation: tp-msg-in 0.2s ease-out; }
@keyframes tp-msg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.tp-msg.bot { background: white; border: 2px solid #0d2451; color: #0d2451; align-self: flex-start; border-bottom-left-radius: 4px; }
.tp-msg.user { background: linear-gradient(135deg, #FF9000, #f97316); color: white; align-self: flex-end; border: 2px solid #0d2451; border-bottom-right-radius: 4px; font-weight: 600; }

.tp-chat-typing { background: white; border: 2px solid #0d2451; border-radius: 16px; border-bottom-left-radius: 4px; padding: 12px 16px; align-self: flex-start; display: none; gap: 4px; margin: 0 16px; }
.tp-chat-typing.show { display: flex; }
.tp-chat-typing span { width: 8px; height: 8px; background: #0d2451; border-radius: 50%; display: inline-block; animation: tp-dot 1.4s infinite; }
.tp-chat-typing span:nth-child(2) { animation-delay: 0.2s; }
.tp-chat-typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes tp-dot { 0%, 60%, 100% { transform: scale(1); opacity: 1; } 30% { transform: scale(0.7); opacity: 0.5; } }

.tp-chat-quick { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 16px 0; }
.tp-chat-quick-btn { background: #FFD24D; border: 2px solid #0d2451; color: #0d2451; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 0 #0d2451; font-family: 'Inter', sans-serif; transition: transform 0.1s; }
.tp-chat-quick-btn:hover { transform: translateY(-1px); }
.tp-chat-quick-btn:active { transform: translateY(1px); box-shadow: 0 1px 0 #0d2451; }

.tp-chat-cart { background: white; border-top: 2px solid #0d2451; padding: 10px 16px; font-family: 'JetBrains Mono', monospace; font-size: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.tp-chat-cart .label { font-weight: 700; color: #0d2451; }
.tp-chat-cart .total { font-weight: 900; color: #FF9000; font-size: 14px; }
.tp-chat-cart .btn-checkout { background: #25D366; color: white; border: 2px solid #0d2451; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 11px; cursor: pointer; font-family: 'Inter', sans-serif; }

.tp-chat-input-area { border-top: 3px solid #0d2451; background: white; padding: 12px; display: flex; gap: 8px; }
.tp-chat-input { flex: 1; padding: 10px 14px; border: 2px solid rgba(13,36,81,0.2); border-radius: 12px; font-size: 14px; font-family: 'Inter', sans-serif; outline: none; }
.tp-chat-input:focus { border-color: #FF9000; }
.tp-chat-send { background: #FF9000; color: white; border: 2px solid #0d2451; border-radius: 12px; padding: 0 16px; font-weight: 900; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 14px; box-shadow: 0 2px 0 #0d2451; }
.tp-chat-send:hover { transform: translateY(-1px); box-shadow: 0 3px 0 #0d2451; }
.tp-chat-send:disabled { opacity: 0.5; cursor: not-allowed; }

.tp-chat-bubble-pop { position: fixed; bottom: 100px; right: 20px; background: white; border: 3px solid #0d2451; border-radius: 16px; padding: 12px 18px; max-width: 280px; box-shadow: 0 8px 30px rgba(0,0,0,0.2); z-index: 9997; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; color: #0d2451; cursor: pointer; display: none; animation: tp-bubble-in 0.4s ease-out; }
.tp-chat-bubble-pop.show { display: block; }
.tp-chat-bubble-pop::after { content: ""; position: absolute; bottom: -12px; right: 30px; width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-top: 12px solid #0d2451; }
.tp-chat-bubble-pop .close-bubble { position: absolute; top: -8px; right: -8px; background: #dc2626; color: white; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #0d2451; cursor: pointer; font-size: 11px; font-weight: 900; }
@keyframes tp-bubble-in { from { opacity: 0; transform: translateY(20px) scale(0.9); } to { opacity: 1; transform: translateY(0) scale(1); } }

@media (max-width: 480px) {
  .tp-chat-window { bottom: 0; right: 0; width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; border-width: 0; }
  .tp-chat-button { bottom: 16px; right: 16px; }
}
`;

  const widgetHTML = `
<button class="tp-chat-button" id="tpChatBtn" aria-label="Abrir chat">${BOT_EMOJI}</button>
<div class="tp-chat-bubble-pop" id="tpChatBubble">
  <button class="close-bubble" onclick="event.stopPropagation(); document.getElementById('tpChatBubble').classList.remove('show');">✕</button>
  💬 <strong>¡Hola!</strong> Pregunta lo que quieras 🌮
</div>
<div class="tp-chat-window" id="tpChatWin">
  <div class="tp-chat-header">
    <div class="tp-chat-avatar">${BOT_EMOJI}</div>
    <div class="tp-chat-header-info">
      <div class="tp-chat-header-name">${BOT_NAME}</div>
      <div class="tp-chat-header-status">En línea</div>
    </div>
    <button class="tp-chat-close" id="tpChatClose" aria-label="Cerrar">✕</button>
  </div>
  <div class="tp-chat-messages" id="tpChatMessages"></div>
  <div class="tp-chat-typing" id="tpChatTyping"><span></span><span></span><span></span></div>
  <div class="tp-chat-quick" id="tpChatQuick"></div>
  <div class="tp-chat-cart" id="tpChatCart" style="display:none;">
    <span class="label">🛒 Total:</span>
    <span class="total" id="tpChatCartTotal">$0</span>
    <button class="btn-checkout" id="tpChatCheckout">📱 Enviar</button>
  </div>
  <div class="tp-chat-input-area">
    <input type="text" class="tp-chat-input" id="tpChatInput" placeholder="Escribe tu mensaje..." autocomplete="off">
    <button class="tp-chat-send" id="tpChatSendBtn">➤</button>
  </div>
</div>
`;

  function init() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    const container = document.createElement('div');
    container.id = 'tp-chat-container';
    container.innerHTML = widgetHTML;
    document.body.appendChild(container);

    document.getElementById('tpChatBtn').addEventListener('click', toggleChat);
    document.getElementById('tpChatClose').addEventListener('click', closeChat);
    document.getElementById('tpChatSendBtn').addEventListener('click', enviarMensaje);
    document.getElementById('tpChatInput').addEventListener('keypress', e => {
      if (e.key === 'Enter') enviarMensaje();
    });
    document.getElementById('tpChatBubble').addEventListener('click', e => {
      if (!e.target.classList.contains('close-bubble')) openChat();
    });
    document.getElementById('tpChatCheckout').addEventListener('click', enviarPorWhatsApp);

    setTimeout(() => {
      if (!chatOpen && !yaSaludoAutomatico) {
        showBubble();
        document.getElementById('tpChatBtn').classList.add('has-message');
        yaSaludoAutomatico = true;
      }
    }, AUTO_GREETING_DELAY);
  }

  function toggleChat() { chatOpen ? closeChat() : openChat(); }

  function openChat() {
    chatOpen = true;
    document.getElementById('tpChatWin').classList.add('open');
    document.getElementById('tpChatBubble').classList.remove('show');
    document.getElementById('tpChatBtn').classList.remove('has-message');

    if (mensajes.length === 0) {
      addBotMessage(
        '¡Hola! 🌮 Soy ChilangoBot, el asistente de Taco Parado.\n\n¿En qué te puedo ayudar? Estoy aquí para resolver dudas o ayudarte a hacer un pedido.',
        ['📋 Ver menú', '⏰ Horarios', '📍 Sedes', '🛒 Hacer pedido']
      );
    }
    actualizarCarritoUI();
    setTimeout(() => document.getElementById('tpChatInput').focus(), 300);
  }

  function closeChat() {
    chatOpen = false;
    document.getElementById('tpChatWin').classList.remove('open');
  }

  function showBubble() {
    document.getElementById('tpChatBubble').classList.add('show');
    setTimeout(() => document.getElementById('tpChatBubble').classList.remove('show'), 15000);
  }

  function addBotMessage(text, quickReplies = null) {
    mensajes.push({ role: 'bot', content: text, time: new Date() });
    renderMessage('bot', text);
    if (quickReplies) renderQuickReplies(quickReplies);
    scrollToBottom();
  }

  function addUserMessage(text) {
    mensajes.push({ role: 'user', content: text, time: new Date() });
    renderMessage('user', text);
    clearQuickReplies();
    scrollToBottom();
  }

  function renderMessage(role, text) {
    const cont = document.getElementById('tpChatMessages');
    const div = document.createElement('div');
    div.className = `tp-msg ${role}`;
    div.textContent = text;
    cont.appendChild(div);
  }

  function renderQuickReplies(opciones) {
    const cont = document.getElementById('tpChatQuick');
    cont.innerHTML = '';
    opciones.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'tp-chat-quick-btn';
      btn.textContent = opt;
      btn.onclick = () => { clearQuickReplies(); sendMessageWithText(opt); };
      cont.appendChild(btn);
    });
  }

  function clearQuickReplies() { document.getElementById('tpChatQuick').innerHTML = ''; }

  function scrollToBottom() {
    const cont = document.getElementById('tpChatMessages');
    setTimeout(() => cont.scrollTop = cont.scrollHeight, 50);
  }

  function showTyping(show) {
    const t = document.getElementById('tpChatTyping');
    show ? t.classList.add('show') : t.classList.remove('show');
  }

  function enviarMensaje() {
    const input = document.getElementById('tpChatInput');
    const text = input.value.trim();
    if (!text || enviando) return;
    input.value = '';
    sendMessageWithText(text);
  }

  async function sendMessageWithText(text) {
    if (enviando) return;
    enviando = true;
    document.getElementById('tpChatSendBtn').disabled = true;
    addUserMessage(text);
    showTyping(true);

    try {
      const carrito = (window.carrito || []).map(c => ({
        nombre: c.nombre,
        cantidad: c.cantidad,
        precio: c.precio,
        subtotal: c.precio * c.cantidad
      }));

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: text,
          history: mensajes.slice(-10),
          cart: carrito
        })
      });

      const data = await response.json();
      showTyping(false);

      if (data.reply) addBotMessage(data.reply);
      else addBotMessage('Disculpa, tuve un problema. ¿Puedes intentar de nuevo? 🙏');

      if (data.actions && data.actions.length > 0) {
        await procesarAcciones(data.actions, data.cart_suggestion || []);
      }
      actualizarCarritoUI();

    } catch (err) {
      console.error('Chat error:', err);
      showTyping(false);
      addBotMessage('Tuve un problema técnico. ¿Puedes escribir al WhatsApp +57 311 482 2019? 🙏');
    } finally {
      enviando = false;
      document.getElementById('tpChatSendBtn').disabled = false;
    }
  }

  async function procesarAcciones(actions, cartSuggestion) {
    for (const action of actions) {
      if (action.type === 'add_to_cart') {
        const sug = cartSuggestion.find(s => 
          s.nombre.toLowerCase() === (action.data.producto_nombre || '').toLowerCase()
        ) || cartSuggestion[0];

        if (sug && window.carrito) {
          const itemKey = sug.id + (action.data.opciones ? JSON.stringify(action.data.opciones) : '');
          const existing = window.carrito.find(c => c.itemKey === itemKey);
          if (existing) {
            existing.cantidad += sug.cantidad;
          } else {
            window.carrito.push({
              id: sug.id,
              itemKey,
              nombre: sug.nombre,
              precio: sug.precio,
              cantidad: sug.cantidad,
              emoji: sug.emoji,
              imagen_url: sug.imagen_url,
              opcionesElegidas: action.data.opciones || null
            });
          }
          if (window.actualizarCarritoUI) window.actualizarCarritoUI();
        }
      }
      if (action.type === 'clear_cart' && window.carrito) {
        window.carrito.length = 0;
        if (window.actualizarCarritoUI) window.actualizarCarritoUI();
      }
      if (action.type === 'checkout') {
        setTimeout(() => {
          if (window.abrirCheckout) window.abrirCheckout();
        }, 500);
      }
    }
  }

  function actualizarCarritoUI() {
    const carrito = window.carrito || [];
    const total = carrito.reduce((s, c) => s + (c.precio * c.cantidad), 0);
    const cartBox = document.getElementById('tpChatCart');
    if (!cartBox) return;
    if (carrito.length === 0) {
      cartBox.style.display = 'none';
    } else {
      cartBox.style.display = 'flex';
      document.getElementById('tpChatCartTotal').textContent = '$' + total.toLocaleString('es-CO');
    }
  }

  function enviarPorWhatsApp() {
    if (window.abrirCheckout) {
      closeChat();
      setTimeout(() => window.abrirCheckout(), 300);
    } else {
      const carrito = window.carrito || [];
      const total = carrito.reduce((s, c) => s + (c.precio * c.cantidad), 0);
      let msg = '¡Hola Taco Parado! 🌮\n\n*Pedido desde ChilangoBot:*\n\n';
      carrito.forEach(c => {
        msg += `• ${c.cantidad}x ${c.nombre} - $${(c.precio * c.cantidad).toLocaleString('es-CO')}\n`;
      });
      msg += `\n*TOTAL: $${total.toLocaleString('es-CO')}*`;
      const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank');
    }
  }

  window.tpChat = { open: openChat, close: closeChat, toggle: toggleChat, actualizarCarrito: actualizarCarritoUI };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
