(() => {
  "use strict";

  // Образец интерфейса: билет с водяным знаком, не является проездным документом.

  const DEFAULTS = {
    type: "tram",
    route: "",
    regNumber: "",
    boardNumber: "",
    carrier: "",
    direction: "one",
    validity: "60",
    count: 1,
    price: "23",
  };

  const TYPE_LABEL = { bus: "Автобус", tram: "Трамвай" };
  const DIRECTION_LABEL = { one: "В одну сторону", round: "Туда и обратно" };
  const MONTHS = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  const MAX_COUNT = 10;
  const MAX_RECENT = 5;

  const KEY_FORM = "trip-form";
  const KEY_TICKET = "trip-ticket";
  const KEY_RECENT = "trip-recent";

  const tg = window.Telegram && window.Telegram.WebApp;
  const inTelegram = Boolean(tg && tg.initData);

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ───────── Хранилище ─────────

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* приватный режим */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (_) { /* приватный режим */ }
    },
  };

  // ───────── Telegram ─────────

  const call = (fn) => {
    try { fn(); } catch (_) { /* метод не поддерживается этой версией клиента */ }
  };

  function haptic(kind) {
    if (!tg || !tg.HapticFeedback) return;
    call(() => {
      if (kind === "error" || kind === "success") tg.HapticFeedback.notificationOccurred(kind);
      else if (kind === "select") tg.HapticFeedback.selectionChanged();
      else tg.HapticFeedback.impactOccurred("light");
    });
  }

  function setupTelegram() {
    if (!inTelegram) return;

    call(() => tg.ready());
    call(() => tg.expand());
    call(() => tg.setHeaderColor("#67C1FF"));
    call(() => tg.setBackgroundColor("#FFFFFF"));
    call(() => tg.setBottomBarColor("#FFFFFF"));
    call(() => tg.disableVerticalSwipes());

    const mobile = tg.platform === "ios" || tg.platform === "android";
    if (mobile && tg.isVersionAtLeast && tg.isVersionAtLeast("8.0")) call(() => tg.requestFullscreen());

    if (tg.MainButton) {
      document.documentElement.classList.add("tg-main-button");
      call(() => tg.MainButton.setParams({
        text: "Готово",
        color: "#FCE000",
        text_color: "#21201F",
        is_active: true,
      }));
      call(() => tg.MainButton.onClick(submit));
    }

    if (tg.BackButton) call(() => tg.BackButton.onClick(showForm));
  }

  // ───────── Форма ─────────

  const form = $("#trip-form");
  const countOut = $(".stepper__value");
  const totalOut = $("[data-form-total]");
  const decBtn = $('[data-action="dec"]');
  const incBtn = $('[data-action="inc"]');

  let formState = Object.assign({}, DEFAULTS, store.get(KEY_FORM, {}));

  const SANITIZE = {
    route: (v) => v.replace(/[^0-9A-Za-zА-Яа-яЁё-]/g, "").toUpperCase(),
    regNumber: (v) => v.replace(/[^0-9A-Za-zА-Яа-яЁё]/g, "").toUpperCase(),
    boardNumber: (v) => v.replace(/\D/g, ""),
    price: (v) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, ""),
    carrier: (v) => v.replace(/\s{2,}/g, " "),
  };

  const VALIDATE = {
    route: (v) => (v ? "" : "Укажите номер маршрута"),
    price: (v) => (Number(v) > 0 ? "" : "Укажите стоимость билета"),
  };

  function fillForm(state) {
    for (const name of ["route", "regNumber", "boardNumber", "carrier", "price"]) {
      form.elements[name].value = state[name];
    }
    for (const name of ["type", "direction", "validity"]) {
      const radio = $(`input[name="${name}"][value="${state[name]}"]`, form);
      if (radio) radio.checked = true;
    }
    renderCount();
  }

  function renderCount() {
    countOut.textContent = String(formState.count);
    decBtn.disabled = formState.count <= 1;
    incBtn.disabled = formState.count >= MAX_COUNT;
    totalOut.textContent = formatPrice((Number(formState.price) || 0) * formState.count);
  }

  function saveForm() {
    store.set(KEY_FORM, formState);
  }

  function setError(name, message) {
    const field = $(`[data-field-name="${name}"]`, form);
    if (!field) return;
    field.classList.toggle("is-invalid", Boolean(message));
    $(".field__error", field).textContent = message;
  }

  form.addEventListener("input", (e) => {
    const el = e.target;
    const name = el.name;
    if (!name) return;

    if (el.type === "radio") {
      formState[name] = el.value;
      haptic("select");
    } else {
      const clean = SANITIZE[name] ? SANITIZE[name](el.value) : el.value;
      if (clean !== el.value) {
        const pos = el.selectionStart - (el.value.length - clean.length);
        el.value = clean;
        call(() => el.setSelectionRange(pos, pos));
      }
      formState[name] = clean;
      if ($(`[data-field-name="${name}"]`, form).classList.contains("is-invalid") && VALIDATE[name]) {
        setError(name, VALIDATE[name](clean));
      }
    }

    if (name === "price") renderCount();
    saveForm();
  });

  // Enter переводит фокус на следующее поле, на последнем — закрывает клавиатуру
  form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
    e.preventDefault();
    const inputs = $$(".field__input", form);
    const next = inputs[inputs.indexOf(e.target) + 1];
    if (next && e.target.enterKeyHint !== "done") next.focus();
    else e.target.blur();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });

  function validate() {
    let firstInvalid = null;
    for (const [name, check] of Object.entries(VALIDATE)) {
      const message = check(formState[name]);
      setError(name, message);
      if (message && !firstInvalid) firstInvalid = name;
    }
    return firstInvalid;
  }

  function submit() {
    const invalid = validate();
    if (invalid) {
      haptic("error");
      const field = $(`[data-field-name="${invalid}"]`, form);
      field.classList.remove("is-shaking");
      void field.offsetWidth;
      field.classList.add("is-shaking");
      field.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    haptic("success");

    const data = Object.assign({}, formState, { carrier: formState.carrier.trim() });
    ticket = { data, issuedAt: Date.now() };
    store.set(KEY_TICKET, ticket);
    pushRecent(data);
    showTicket();
  }

  // ───────── Недавние поездки ─────────

  const recentSection = $(".recent");
  const recentList = $(".recent__list");

  function recentKey(d) {
    return [d.type, d.route, d.regNumber, d.boardNumber, d.carrier].join("|");
  }

  function pushRecent(data) {
    const list = store.get(KEY_RECENT, []).filter((d) => recentKey(d) !== recentKey(data));
    list.unshift(data);
    store.set(KEY_RECENT, list.slice(0, MAX_RECENT));
    renderRecent();
  }

  function renderRecent() {
    const list = store.get(KEY_RECENT, []);
    recentSection.hidden = list.length === 0;
    recentList.textContent = "";
    list.forEach((d, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.recent = String(i);

      const title = document.createElement("span");
      title.className = "chip__title";
      title.textContent = `${TYPE_LABEL[d.type]} ${d.route}`;

      const meta = document.createElement("span");
      meta.className = "chip__meta";
      meta.textContent = [d.boardNumber && `№${d.boardNumber}`, d.carrier].filter(Boolean).join(" · ") || "Без деталей";

      btn.append(title, meta);
      recentList.append(btn);
    });
  }

  recentList.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-recent]");
    if (!chip) return;
    const d = store.get(KEY_RECENT, [])[Number(chip.dataset.recent)];
    if (!d) return;
    haptic("select");
    formState = Object.assign({}, DEFAULTS, d);
    fillForm(formState);
    for (const name of Object.keys(VALIDATE)) setError(name, "");
    saveForm();
  });

  // ───────── Билет ─────────

  let ticket = store.get(KEY_TICKET, null);

  const ticketView = $('[data-view="ticket"]');
  const cells = $$(".timer__cell", ticketView);
  const ticketEl = $(".ticket", ticketView);
  let shown = "";
  let rafId = 0;

  const validityMs = () => Number(ticket.data.validity) * 60 * 1000;
  const expiresAt = () => ticket.issuedAt + validityMs();

  function formatPrice(n) {
    return `${n.toLocaleString("ru-RU")}₽`;
  }

  function formatValidUntil(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}г. до ${hh}:${mm}`;
  }

  function renderTicket() {
    const d = ticket.data;
    const values = {
      route: `${TYPE_LABEL[d.type]} ${d.route}`,
      regNumber: d.regNumber,
      boardNumber: d.boardNumber && `№${d.boardNumber}`,
      carrier: d.carrier,
      validUntil: formatValidUntil(expiresAt()),
      direction: DIRECTION_LABEL[d.direction],
      count: String(d.count),
      price: formatPrice(Number(d.price) * d.count),
    };

    for (const [name, value] of Object.entries(values)) {
      const el = $(`[data-field="${name}"]`, ticketView);
      if (el) el.textContent = value;
      const row = $(`[data-row="${name}"]`, ticketView);
      if (row) row.hidden = !value;
    }
    shown = "";
  }

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
    rafId = left > 0 ? requestAnimationFrame(tick) : 0;
  }

  function startTimer() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  // ───────── Навигация ─────────

  const formView = $('[data-view="form"]');
  let formScroll = 0;

  function switchView(to, back) {
    const from = to === ticketView ? formView : ticketView;
    from.hidden = true;
    to.hidden = false;
    to.classList.remove("is-entering", "is-entering-back");
    void to.offsetWidth;
    to.classList.add(back ? "is-entering-back" : "is-entering");
  }

  function showTicket(instant) {
    formScroll = window.scrollY;
    renderTicket();
    switchView(ticketView, false);
    if (instant) ticketView.classList.remove("is-entering");
    window.scrollTo(0, 0);
    startTimer();
    document.title = "Мои билеты";

    if (inTelegram) {
      if (tg.MainButton) call(() => tg.MainButton.hide());
      if (tg.BackButton) call(() => tg.BackButton.show());
    }
  }

  function showForm() {
    cancelAnimationFrame(rafId);
    ticket = null;
    store.remove(KEY_TICKET);
    switchView(formView, true);
    window.scrollTo(0, formScroll);
    document.title = "Новая поездка";

    if (inTelegram) {
      if (tg.BackButton) call(() => tg.BackButton.hide());
      if (tg.MainButton) call(() => tg.MainButton.show());
    }
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;

    if (action === "dec" || action === "inc") {
      const next = formState.count + (action === "inc" ? 1 : -1);
      if (next < 1 || next > MAX_COUNT) return;
      haptic("select");
      formState.count = next;
      renderCount();
      saveForm();
      return;
    }

    haptic("light");

    if (action === "close") {
      if (inTelegram) call(() => tg.close());
      return;
    }

    if (action === "to-form") {
      showForm();
      return;
    }

    if (action === "refresh") {
      el.classList.remove("is-spinning");
      void el.offsetWidth;
      el.classList.add("is-spinning");
      // Истёкший образец обновляется, действующий остаётся как есть
      if (ticket && Date.now() >= expiresAt()) {
        ticket.issuedAt = Date.now();
        store.set(KEY_TICKET, ticket);
        renderTicket();
        startTimer();
      }
      return;
    }

    if (action === "support") {
      const text = "Это демонстрационный интерфейс. Поддержка в образце не подключена.";
      if (inTelegram && tg.showAlert) call(() => tg.showAlert(text));
      else alert(text);
    }
  });

  document.addEventListener("animationend", (e) => {
    const t = e.target;
    if (t.classList.contains("is-spinning")) t.classList.remove("is-spinning");
    const shaking = t.closest(".is-shaking");
    if (shaking) shaking.classList.remove("is-shaking");
    if (t.classList.contains("view")) t.classList.remove("is-entering", "is-entering-back");
  });

  // ───────── Старт ─────────

  setupTelegram();
  fillForm(formState);
  renderRecent();

  if (ticket && ticket.data) {
    showTicket(true);
  } else if (inTelegram && tg.MainButton) {
    call(() => tg.MainButton.show());
  }
})();
