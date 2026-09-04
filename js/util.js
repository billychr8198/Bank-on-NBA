/* Shared helpers: dates, money formatting, tiny DOM builders. */
(function () {
  "use strict";

  const U = {};

  /* ---------------------------------------------------------------- dates */
  /* All dates are handled as local-time "YYYY-MM-DD" strings so a transaction
     logged at 23:50 in Jakarta never slides into yesterday via UTC. */

  U.iso = function (d) {
    d = d || new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  };

  U.parse = function (s) {
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
    if (!m) return new Date();
    return new Date(+m[1], +m[2] - 1, +m[3]);
  };

  U.today = function () { return U.iso(new Date()); };

  U.addDays = function (s, n) {
    const d = U.parse(s);
    d.setDate(d.getDate() + n);
    return U.iso(d);
  };

  U.diffDays = function (a, b) {          // whole days from a to b
    const ms = U.parse(b).getTime() - U.parse(a).getTime();
    return Math.round(ms / 86400000);
  };

  U.monthKey = function (s) { return String(s).slice(0, 7); };

  U.monthBounds = function (key) {        // key = "YYYY-MM"
    const [y, m] = key.split("-").map(Number);
    return { start: U.iso(new Date(y, m - 1, 1)), end: U.iso(new Date(y, m, 0)) };
  };

  U.daysInMonth = function (key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  };

  U.shiftMonth = function (key, n) {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  };

  const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  U.monthName = function (key) {
    const [y, m] = key.split("-").map(Number);
    return MONTHS[m - 1] + " " + y;
  };
  U.monthAbbr = function (key) {
    const [y, m] = key.split("-").map(Number);
    return MONTHS[m - 1].slice(0, 3) + " " + String(y).slice(2);
  };
  U.dayName = function (s) { return DOW[U.parse(s).getDay()]; };
  U.dayAbbr = function (s) { return DOW[U.parse(s).getDay()].slice(0, 3); };

  U.prettyDate = function (s, withYear) {
    const d = U.parse(s);
    return DOW[d.getDay()].slice(0, 3) + " " + d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3) +
      (withYear ? " " + d.getFullYear() : "");
  };

  U.longDate = function (s) {
    const d = U.parse(s);
    return DOW[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  };

  /* Start of the week containing `date`, honouring the user's cycle setting. */
  U.weekStart = function (date, mode, anchor) {
    const d = U.parse(date);
    if (mode === "payday" && anchor) {
      const n = U.diffDays(anchor, date);
      return U.addDays(anchor, Math.floor(n / 7) * 7);
    }
    const startDow = mode === "sunday" ? 0 : 1;          // default Monday
    let back = d.getDay() - startDow;
    if (back < 0) back += 7;
    return U.addDays(U.iso(d), -back);
  };

  /* ---------------------------------------------------------------- money */

  /* When no code is passed, use whatever the user has selected rather than
     silently falling back to dollars. */
  U.currency = function (code) {
    if (!code) {
      try { code = window.store.state.settings.currency; } catch (e) { /* pre-boot */ }
    }
    return window.APP.currencies[code] ||
      window.APP.currencies[window.APP.defaultCurrency] ||
      window.APP.currencies.USD;
  };

  U.money = function (n, code, opts) {
    opts = opts || {};
    const c = U.currency(code);
    const v = Number(n) || 0;
    const dp = opts.decimals != null ? opts.decimals : c.decimals;
    let out;
    try {
      /* -u-nu-latn keeps Arabic- and Devanagari-locale currencies in Latin
         digits; the rest of the interface is Latin, and ١٬٢٣٤ in the middle
         of an English sentence reads as a rendering fault, not a feature. */
      out = new Intl.NumberFormat(c.locale + "-u-nu-latn", {
        minimumFractionDigits: dp, maximumFractionDigits: dp
      }).format(Math.abs(v));
    } catch (e) {
      out = Math.abs(v).toFixed(dp);
    }
    const sign = v < 0 ? "−" : (opts.plus && v > 0 ? "+" : "");
    return sign + c.symbol + " " + out;
  };

  /* Compact form for tight spaces: Rp 1.2jt / $1.2M */
  U.moneyShort = function (n, code) {
    const c = U.currency(code);
    const v = Number(n) || 0;
    const a = Math.abs(v);
    const sign = v < 0 ? "−" : "";
    const idr = c.code === "IDR";
    const units = idr
      ? [[1e12, "T"], [1e9, "M"], [1e6, "jt"], [1e3, "rb"]]
      : [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
    for (const [size, suffix] of units) {
      if (a >= size) {
        const q = a / size;
        return sign + c.symbol + " " + (q >= 100 ? q.toFixed(0) : q.toFixed(1).replace(/\.0$/, "")) + suffix;
      }
    }
    return U.money(v, code);
  };

  U.num = function (n, dp) {
    const v = Number(n) || 0;
    try { return new Intl.NumberFormat("en-US", { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 }).format(v); }
    catch (e) { return v.toFixed(dp || 0); }
  };

  U.pct = function (n, dp) { return (Number(n) || 0).toFixed(dp == null ? 1 : dp) + "%"; };

  U.clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };

  U.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  /* ------------------------------------------------------------------ DOM */

  U.el = function (tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else if (k === "text") node.textContent = v;
        else if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (k === "dataset") { for (const d in v) node.dataset[d] = v[d]; }
        else node.setAttribute(k, v === true ? "" : v);
      }
    }
    (Array.isArray(children) ? children : children != null ? [children] : []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return node;
  };

  U.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m];
    });
  };

  U.category = function (id) {
    return window.APP.categories.find((c) => c.id === id) || window.APP.categories[window.APP.categories.length - 1];
  };
  U.methodName = function (id) {
    const m = window.APP.methods.find((x) => x.id === id);
    return m ? m.name : id || "—";
  };

  U.debounce = function (fn, ms) {
    let t;
    return function () {
      const a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  };

  /* Toast notifications ------------------------------------------------- */
  U.toast = function (msg, kind) {
    let host = document.getElementById("toasts");
    if (!host) {
      host = U.el("div", { id: "toasts", class: "toasts" });
      document.body.appendChild(host);
    }
    const t = U.el("div", { class: "toast" + (kind ? " toast--" + kind : ""), text: msg });
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add("is-in"));
    setTimeout(function () {
      t.classList.remove("is-in");
      setTimeout(() => t.remove(), 300);
    }, kind === "error" ? 5200 : 3000);
  };

  window.U = U;
})();
