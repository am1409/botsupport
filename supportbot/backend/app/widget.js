(function () {
  const script = document.currentScript;
  const CLIENT_ID   = script.getAttribute("data-client-id");
  const API_URL     = script.src.replace("/widget.js", "");
  const POSITION    = script.getAttribute("data-position") || "right";
  const PRIMARY_COLOR = script.getAttribute("data-color") || "#2563EB";
  const BOT_NAME    = script.getAttribute("data-name") || "Support";
  const GREETING    = script.getAttribute("data-greeting") || "Hi there! How can I help you today? 👋";
  const PLACEHOLDER = script.getAttribute("data-placeholder") || "Type a message...";
  const LANGUAGE    = script.getAttribute("data-language") || "en";
  const OFFLINE_MSG = script.getAttribute("data-offline") || "I don't have enough information to answer that. Please contact our support team directly.";

  if (!CLIENT_ID) return console.error("Nomi: missing data-client-id");

  // Language strings
  const LANG = {
    en: { online: "Typically replies instantly", send: "Send" },
    nl: { online: "Reageert doorgaans direct", send: "Verstuur" },
    de: { online: "Antwortet sofort", send: "Senden" },
    fr: { online: "Répond instantanément", send: "Envoyer" },
    es: { online: "Responde al instante", send: "Enviar" },
    it: { online: "Risponde immediatamente", send: "Invia" },
    pt: { online: "Responde instantaneamente", send: "Enviar" },
    ar: { online: "يرد فوراً", send: "إرسال" },
  };
  const T = LANG[LANGUAGE] || LANG.en;

  let sessionId = sessionStorage.getItem("nomi_session_" + CLIENT_ID);
  if (!sessionId) {
    sessionId = "nomi_" + Math.random().toString(36).slice(2) + Date.now();
    sessionStorage.setItem("nomi_session_" + CLIENT_ID, sessionId);
  }

  let history = [];
  let isOpen = false;
  let isTyping = false;

  const style = document.createElement("style");
  style.textContent = `
    #nomi-launcher {
      position: fixed; bottom: 24px; ${POSITION}: 24px;
      width: 56px; height: 56px; border-radius: 50%;
      background: ${PRIMARY_COLOR}; border: none; cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      display: flex; align-items: center; justify-content: center;
      z-index: 99998; transition: transform 0.2s, box-shadow 0.2s;
    }
    #nomi-launcher:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.25); }
    #nomi-launcher svg { width: 26px; height: 26px; fill: white; }
    #nomi-window {
      position: fixed; bottom: 92px; ${POSITION}: 24px;
      width: 360px; height: 520px; border-radius: 16px;
      background: #fff; box-shadow: 0 8px 48px rgba(0,0,0,0.16);
      display: flex; flex-direction: column; overflow: hidden;
      z-index: 99999; transform: scale(0.9) translateY(16px);
      opacity: 0; pointer-events: none;
      transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), opacity 0.2s;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #nomi-window.open { transform: scale(1) translateY(0); opacity: 1; pointer-events: all; }
    #nomi-header {
      padding: 16px 20px; background: ${PRIMARY_COLOR};
      color: white; display: flex; align-items: center; justify-content: space-between;
    }
    #nomi-header-info { display: flex; align-items: center; gap: 10px; }
    #nomi-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,0.25);
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    #nomi-header h3 { margin: 0; font-size: 15px; font-weight: 600; }
    #nomi-header p { margin: 2px 0 0; font-size: 12px; opacity: 0.85; }
    #nomi-close { background: none; border: none; color: white; cursor: pointer; padding: 4px; opacity: 0.8; }
    #nomi-close:hover { opacity: 1; }
    #nomi-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
    }
    #nomi-messages::-webkit-scrollbar { width: 4px; }
    #nomi-messages::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }
    .nomi-msg { max-width: 82%; line-height: 1.5; font-size: 14px; }
    .nomi-msg.user {
      align-self: flex-end; background: ${PRIMARY_COLOR};
      color: white; padding: 10px 14px; border-radius: 16px 16px 4px 16px;
    }
    .nomi-msg.bot {
      align-self: flex-start; background: #f1f5f9;
      color: #1e293b; padding: 10px 14px; border-radius: 16px 16px 16px 4px;
    }
    .nomi-msg.bot.typing span {
      display: inline-block; width: 6px; height: 6px; margin: 0 2px;
      background: #94a3b8; border-radius: 50%; animation: nomi-bounce 1.2s infinite;
    }
    .nomi-msg.bot.typing span:nth-child(2) { animation-delay: 0.2s; }
    .nomi-msg.bot.typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes nomi-bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-6px); }
    }
    #nomi-input-area {
      padding: 12px 16px; border-top: 1px solid #e2e8f0;
      display: flex; gap: 8px; align-items: flex-end;
    }
    #nomi-input {
      flex: 1; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 10px 14px; font-size: 14px; resize: none; max-height: 100px;
      outline: none; font-family: inherit; line-height: 1.5;
      transition: border-color 0.15s;
    }
    #nomi-input:focus { border-color: ${PRIMARY_COLOR}; }
    #nomi-send {
      width: 38px; height: 38px; border-radius: 10px;
      background: ${PRIMARY_COLOR}; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: opacity 0.15s;
    }
    #nomi-send:disabled { opacity: 0.4; cursor: default; }
    #nomi-send svg { width: 18px; height: 18px; fill: white; }
    #nomi-branding {
      text-align: center; padding: 6px; font-size: 11px;
      color: #94a3b8; border-top: 1px solid #f1f5f9;
    }
    #nomi-branding a { color: inherit; text-decoration: none; }
    @media (max-width: 420px) {
      #nomi-window { width: calc(100vw - 32px); bottom: 84px; ${POSITION}: 16px; }
    }
  `;
  document.head.appendChild(style);

  const launcher = document.createElement("button");
  launcher.id = "nomi-launcher";
  launcher.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;

  const win = document.createElement("div");
  win.id = "nomi-window";
  win.innerHTML = `
    <div id="nomi-header">
      <div id="nomi-header-info">
        <div id="nomi-avatar">💬</div>
        <div>
          <h3>${BOT_NAME}</h3>
          <p>${T.online}</p>
        </div>
      </div>
      <button id="nomi-close">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
    <div id="nomi-messages"></div>
    <div id="nomi-input-area">
      <textarea id="nomi-input" placeholder="${PLACEHOLDER}" rows="1"></textarea>
      <button id="nomi-send">
        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
    <div id="nomi-branding">Powered by <a href="https://landingpage-theta-tan-77.vercel.app" target="_blank">Nomi AI</a></div>
  `;

  document.body.appendChild(launcher);
  document.body.appendChild(win);

  const messagesEl = win.querySelector("#nomi-messages");
  const inputEl    = win.querySelector("#nomi-input");
  const sendBtn    = win.querySelector("#nomi-send");

  function addMessage(role, text) {
    const el = document.createElement("div");
    el.className = `nomi-msg ${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function showTyping() {
    const el = document.createElement("div");
    el.className = "nomi-msg bot typing";
    el.id = "nomi-typing";
    el.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById("nomi-typing");
    if (t) t.remove();
  }

  function openWidget() {
    isOpen = true;
    win.classList.add("open");
    launcher.innerHTML = `<svg viewBox="0 0 24 24" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
    inputEl.focus();
    if (messagesEl.children.length === 0) {
      addMessage("bot", GREETING);
    }
  }

  function closeWidget() {
    isOpen = false;
    win.classList.remove("open");
    launcher.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
  }

  launcher.addEventListener("click", () => isOpen ? closeWidget() : openWidget());
  win.querySelector("#nomi-close").addEventListener("click", closeWidget);

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isTyping) return;

    inputEl.value = "";
    inputEl.style.height = "auto";
    addMessage("user", text);
    isTyping = true;
    sendBtn.disabled = true;
    showTyping();

    const botEl = document.createElement("div");
    botEl.className = "nomi-msg bot";
    botEl.textContent = "";

    try {
      const response = await fetch(`${API_URL}/chat/${CLIENT_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text, history }),
      });

      if (!response.ok) {
        const err = await response.json();
        removeTyping();
        addMessage("bot", err.detail === "Monthly chat limit reached. Please upgrade your plan."
          ? OFFLINE_MSG
          : (err.detail || "Something went wrong. Please try again."));
        return;
      }

      removeTyping();
      messagesEl.appendChild(botEl);

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        botEl.textContent = fullText;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      history.push({ role: "user",      content: text });
      history.push({ role: "assistant", content: fullText });
      if (history.length > 12) history = history.slice(-12);

    } catch (e) {
      removeTyping();
      addMessage("bot", "Connection error. Please try again.");
    } finally {
      isTyping = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + "px";
  });
})();
