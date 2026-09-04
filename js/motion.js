/* ============================================================================
   Motion
   ----------------------------------------------------------------------------
   Small interactions that make the app feel like it's responding rather than
   redrawing: headline figures count up, buttons ripple where you touched them,
   bars grow from zero.

   Everything here degrades to nothing. If a person has asked their system for
   reduced motion, each helper sets the final value immediately and returns.
   Nothing in the app depends on an animation completing.
   ========================================================================== */
(function () {
  "use strict";

  const M = {};

  function reduced() {
    return typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  M.reduced = reduced;

  /* Exposed so callers can tag an element with the number its formatted text
     represents, without duplicating the parsing rules. */
  M.readNumber = function (text) { return parseFormatted(text).value; };

  /* Counts a number up to its final value. `format` turns the running number
     into display text, so this works for money, percentages and plain counts
     without knowing anything about them. */
  M.countUp = function (node, to, format, opts) {
    opts = opts || {};
    const fmt = format || function (v) { return String(Math.round(v)); };
    const target = Number(to) || 0;

    const settle = function () {
      node.textContent = opts.finalText != null ? opts.finalText : fmt(target);
    };

    if (!node || reduced() || !target) {
      if (node) settle();
      return;
    }

    const from = Number(opts.from) || 0;
    const ms = opts.duration || 620;
    const start = performance.now();

    // easeOutExpo — fast, then settles. Reads as "landing on" a figure.
    function ease(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

    function frame(now) {
      const t = Math.min(1, (now - start) / ms);
      node.textContent = fmt(from + (target - from) * ease(t));
      if (t < 1) requestAnimationFrame(frame);
      else settle();          // exact original text, never a re-derived one
    }
    requestAnimationFrame(frame);
  };

  /* Reads a number out of already-formatted text without knowing its locale.

     This has to be exact: IDR renders 1,500,000 as "Rp 1.500.000", so naively
     stripping commas and calling parseFloat yields 1.5 — and the animation
     would then rewrite the figure on screen as "Rp 1.500". The rule that works
     for every locale: whichever separator comes last is a decimal point only
     if 1-2 digits follow it; otherwise every separator is grouping. */
  function parseFormatted(text) {
    const cleaned = String(text).replace(/[^\d.,-]/g, "");
    if (!cleaned) return { value: NaN };
    const neg = /^-/.test(cleaned);
    const body = cleaned.replace(/-/g, "");
    const lastSep = Math.max(body.lastIndexOf("."), body.lastIndexOf(","));

    let intPart = body, frac = "", decSep = "", groupSep = "";
    if (lastSep > -1) {
      const after = body.length - lastSep - 1;
      const sep = body[lastSep];
      if (after > 0 && after <= 2) {
        decSep = sep;
        groupSep = sep === "." ? "," : ".";
        intPart = body.slice(0, lastSep).replace(/[.,]/g, "");
        frac = body.slice(lastSep + 1);
      } else {
        groupSep = sep;
        intPart = body.replace(/[.,]/g, "");
      }
    }
    const value = parseFloat(intPart + (frac ? "." + frac : "")) * (neg ? -1 : 1);
    return { value: value, decimals: frac.length, decSep: decSep, groupSep: groupSep };
  }

  /* Formats a running value with the same separators the final text uses, so
     the digits never flicker between conventions mid-animation. */
  function formatLike(v, shape) {
    let s = U.num(Math.abs(v), shape.decimals || 0);   // en-US: 1,234.56
    if (shape.groupSep === "." || shape.decSep === ",") {
      s = s.replace(/,/g, "\u0000").replace(/\./g, shape.decSep || ".")
           .replace(/\u0000/g, shape.groupSep || ",");
    }
    return (v < 0 ? "-" : "") + s;
  }

  /* Applies countUp to any element carrying data-count, reusing the rendered
     text as the template so prefixes, suffixes and separators survive. */
  M.hydrateCounters = function (root) {
    (root || document).querySelectorAll("[data-count]").forEach(function (node) {
      if (node.hasAttribute("data-counted")) return;
      node.setAttribute("data-counted", "");

      const finalText = node.textContent;
      const to = Number(node.getAttribute("data-count"));
      if (!isFinite(to) || !to) return;

      const m = finalText.match(/^([^\d-]*)(-?[\d.,]+)(.*)$/);
      if (!m) return;
      const prefix = m[1], suffix = m[3];
      const shape = parseFormatted(m[2]);
      if (!isFinite(shape.value)) return;

      M.countUp(node, to, function (v) { return prefix + formatLike(v, shape) + suffix; },
        { finalText: finalText });
    });
  };

  /* A ripple centred on the pointer. Purely decorative, removed on end. */
  M.ripple = function (e) {
    const el = e.currentTarget;
    if (!el || reduced()) return;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = (e.clientX == null ? rect.width / 2 : e.clientX - rect.left);
    const y = (e.clientY == null ? rect.height / 2 : e.clientY - rect.top);

    const dot = document.createElement("span");
    dot.className = "ripple";
    dot.style.width = dot.style.height = size + "px";
    dot.style.left = (x - size / 2) + "px";
    dot.style.top = (y - size / 2) + "px";

    // The host needs to clip the ripple; only set it if it isn't already.
    const cs = getComputedStyle(el);
    if (cs.position === "static") el.style.position = "relative";
    if (cs.overflow === "visible") el.style.overflow = "hidden";

    el.appendChild(dot);
    setTimeout(function () { dot.remove(); }, 620);
  };

  /* One delegated listener rather than a handler per button, so re-rendering
     the whole view doesn't leak listeners. */
  M.installRipples = function () {
    document.addEventListener("pointerdown", function (e) {
      const hit = e.target.closest(".btn, .icon-btn, .nav__item, .seg button, .cal-cell, .tile");
      if (!hit || hit.disabled) return;
      M.ripple({ currentTarget: hit, clientX: e.clientX, clientY: e.clientY });
    }, { passive: true });
  };

  /* Grows bars and pips from zero on first paint so a fill reads as a fill. */
  M.hydrateBars = function (root) {
    if (reduced()) return;
    (root || document).querySelectorAll(".bar__fill, .led__fill").forEach(function (node) {
      if (node.hasAttribute("data-grown")) return;
      node.setAttribute("data-grown", "");
      const w = node.style.width;
      if (!w) return;
      node.style.width = "0%";
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { node.style.width = w; });
      });
    });
  };

  M.hydrate = function (root) {
    M.hydrateCounters(root);
    M.hydrateBars(root);
  };

  window.Motion = M;
})();
