(() => {
  "use strict";

  // Демо-данные. Это образец интерфейса, а не проездной документ.
  const TICKET = {
    route: "Трамвай 2",
    regNumber: "ТМ0000",
    boardNumber: "№000",
    carrier: "Демо-перевозчик",
    direction: "В одну сторону",
    count: 1,
    price: 23,
    validityMinutes: 60,
  };

  const STORAGE_KEY = "demo-ticket-issued-at";
  const MONTHS = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];

  const tg = window.Telegram && window.Telegram.WebApp;
  const $ = (sel) => document.querySelector(sel);
  const field = (name) => document.querySelector(`[data-field="${name}"]`);

  // ───────── Telegram Mini App ─────────

  function setupTelegram() {
    if (!tg || (!tg.initData && tg.platform === "unknown")) return;

    tg.ready();
    tg.expand();

    const call = (method, ...args) => {
      try {
        if (typeof tg[method] === "function") tg[method](...args);
      } catch (_) { /* метод не поддерживается этой версией клиента */ }
    };

    call("setHeaderColor", "#67C1FF");
    call("setBackgroundColor", "#FFFFFF");
    call("setBottomBarColor", "#FFFFFF");
    call("disableVerticalSwipes");

    // На телефонах разворачиваемся на весь экран, чтобы градиент шапки уходил под статус-бар
    const mobile = tg.platform === "ios" || tg.platform === "android";
    if (mobile && tg.isVersionAtLeast && tg.isVersionAtLeast("8.0")) call("requestFullscreen");
  }

  function haptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === "light") tg.HapticFeedback.impactOccurred("light");
      else tg.HapticFeedback.selectionChanged();
    } catch (_) { /* нет поддержки хаптики */ }
  }

  // ───────── Время действия ─────────

  function readIssuedAt() {
    try {
      const v = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch (_) {
      return null;
    }
  }

  function writeIssuedAt(ts) {
    try { localStorage.setItem(STORAGE_KEY, String(ts)); } catch (_) { /* приватный режим */ }
  }

  function issue() {
    const now = Date.now();
    writeIssuedAt(now);
    return now;
  }

  let issuedAt = readIssuedAt() || issue();
  const validityMs = TICKET.validityMinutes * 60 * 1000;
  const expiresAt = () => issuedAt + validityMs;

  function formatValidUntil(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}г. до ${hh}:${mm}`;
  }

  // ───────── Рендер ─────────

  function renderStatic() {
    field("route").textContent = TICKET.route;
    field("regNumber").textContent = TICKET.regNumber;
    field("boardNumber").textContent = TICKET.boardNumber;
    field("carrier").textContent = TICKET.carrier;
    field("direction").textContent = TICKET.direction;
    field("count").textContent = String(TICKET.count);
    field("price").textContent = `${TICKET.price}₽`;
    field("validUntil").textContent = formatValidUntil(expiresAt());
  }

  const cells = Array.from(document.querySelectorAll(".timer__cell"));
  const ticketEl = $(".ticket");
  let shown = "";

  function tick() {
    const left = Math.max(0, expiresAt() - Date.now());
    const min = Math.floor(left / 60000);
    const sec = Math.floor((left % 60000) / 1000);
    const cs = Math.floor((left % 1000) / 10);
    const str = [min, sec, cs].map((n) => String(n).padStart(2, "0")).join("");

    if (str !== shown) {
      for (let i = 0; i < cells.length; i++) {
        if (str[i] !== shown[i]) cells[i].textContent = str[i];
      }
      shown = str;
    }

    ticketEl.classList.toggle("is-expired", left === 0);
    if (left > 0) requestAnimationFrame(tick);
  }

  // ───────── Действия ─────────

  function onAction(action, el) {
    haptic("light");

    if (action === "back") {
      if (tg && tg.close && tg.initData) tg.close();
      else history.back();
      return;
    }

    if (action === "refresh") {
      el.classList.remove("is-spinning");
      void el.offsetWidth;
      el.classList.add("is-spinning");
      // Истёкший демо-билет обновляется новым, действующий — остаётся как есть
      if (Date.now() >= expiresAt()) {
        issuedAt = issue();
        renderStatic();
        requestAnimationFrame(tick);
      }
      return;
    }

    if (action === "support") {
      const text = "Это демонстрационный интерфейс. Поддержка в образце не подключена.";
      if (tg && tg.showAlert && tg.initData) tg.showAlert(text);
      else alert(text);
    }
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) onAction(el.dataset.action, el);
  });

  document.addEventListener("animationend", (e) => {
    const btn = e.target.closest(".is-spinning");
    if (btn) btn.classList.remove("is-spinning");
  });

  setupTelegram();
  renderStatic();
  requestAnimationFrame(tick);
})();
