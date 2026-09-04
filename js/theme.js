/* ============================================================================
   Theme
   ----------------------------------------------------------------------------
   Three settings: "dark", "light", "auto". Auto follows the OS and keeps
   following it — if you change your system theme at sunset the app moves with
   it, without a reload.

   The initial attribute is set by an inline script in index.html, before any
   stylesheet paints, so the page never flashes the wrong theme.
   ========================================================================== */
(function () {
  "use strict";

  const T = {};
  const KEY = "banking-on-nba:theme";
  const mq = typeof matchMedia === "function"
    ? matchMedia("(prefers-color-scheme: light)") : null;

  const listeners = [];

  T.stored = function () {
    try { return localStorage.getItem(KEY) || "auto"; } catch (e) { return "auto"; }
  };

  T.resolved = function (pref) {
    const p = pref || T.stored();
    if (p === "light" || p === "dark") return p;
    return mq && mq.matches ? "light" : "dark";
  };

  T.apply = function (pref, opts) {
    const p = pref || T.stored();
    const resolved = T.resolved(p);
    const root = document.documentElement;

    // Suppress transitions during the swap so the whole page doesn't
    // cross-fade one property at a time.
    if (!(opts && opts.instant === false)) {
      root.setAttribute("data-theme-switching", "");
      setTimeout(function () { root.removeAttribute("data-theme-switching"); }, 60);
    }

    root.setAttribute("data-theme", resolved);
    root.style.colorScheme = resolved;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "light" ? "#F4EFE6" : "#17110B");

    listeners.forEach(function (fn) { try { fn(resolved, p); } catch (e) {} });
    return resolved;
  };

  T.set = function (pref) {
    try { localStorage.setItem(KEY, pref); } catch (e) {}
    return T.apply(pref);
  };

  /* Cycles dark → light → auto so the button reaches every state. */
  T.next = function () {
    const order = ["dark", "light", "auto"];
    const i = order.indexOf(T.stored());
    return order[(i + 1) % order.length];
  };

  T.toggle = function () { return T.set(T.next()); };

  T.onChange = function (fn) { listeners.push(fn); };

  T.label = function () {
    const p = T.stored();
    if (p === "auto") return "Auto (" + T.resolved() + ")";
    return p === "light" ? "Light" : "Dark";
  };

  if (mq) {
    const react = function () { if (T.stored() === "auto") T.apply("auto"); };
    if (mq.addEventListener) mq.addEventListener("change", react);
    else if (mq.addListener) mq.addListener(react);
  }

  T.init = function () { T.apply(T.stored(), { instant: true }); };

  window.Theme = T;
})();
