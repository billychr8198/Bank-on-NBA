/* ============================================================================
   Lightbox
   ----------------------------------------------------------------------------
   Opens an unlocked logo or portrait at full size with zoom, so the artwork
   you earned is actually worth looking at.

   Zoom: buttons, scroll wheel (ctrl/⌘ or plain), double-click/tap, pinch,
   and +/- keys. Panning is native overflow scrolling, which handles
   momentum on touch for free. Arrow keys walk the collection.
   ========================================================================== */
(function () {
  "use strict";

  const el = U.el;
  const L = {};
  const STEPS = [1, 1.5, 2, 3, 4];
  let open = null;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* items: [{ src, title, sub, meta }] ; index: which to show first */
  L.open = function (items, index) {
    L.close();
    items = (items || []).filter(function (i) { return i && i.src; });
    if (!items.length) return null;

    let i = clamp(index || 0, 0, items.length - 1);
    let zoom = 1;

    const img = el("img", { class: "lb__img", alt: "" });
    const stage = el("div", { class: "lb__stage" }, img);
    const pct = el("span", { class: "lb__pct" });
    const title = el("div", { class: "lb__title" });
    const sub = el("div", { class: "lb__sub" });
    const meta = el("div", { class: "tiny muted" });

    const prev = el("button", {
      class: "lb__nav lb__nav--prev", "aria-label": "Previous", html: "&lsaquo;",
      onclick: function (e) { e.stopPropagation(); go(-1); }
    });
    const next = el("button", {
      class: "lb__nav lb__nav--next", "aria-label": "Next", html: "&rsaquo;",
      onclick: function (e) { e.stopPropagation(); go(1); }
    });

    function setZoom(z, opts) {
      zoom = clamp(z, 1, 6);
      img.style.transform = zoom === 1 ? "" : "scale(" + zoom + ")";
      stage.classList.toggle("lb__stage--zoomed", zoom > 1);
      pct.textContent = Math.round(zoom * 100) + "%";
      if (zoom === 1) { stage.scrollTop = 0; stage.scrollLeft = 0; }
      else if (opts && opts.centre) {
        // keep the middle of the picture in view as it grows
        stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
        stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
      }
    }

    function stepZoom(dir) {
      const cur = zoom;
      if (dir > 0) {
        for (const s of STEPS) if (s > cur + .001) return setZoom(s, { centre: true });
        return setZoom(6, { centre: true });
      }
      for (let k = STEPS.length - 1; k >= 0; k--) if (STEPS[k] < cur - .001) return setZoom(STEPS[k], { centre: true });
      return setZoom(1);
    }

    function show() {
      const it = items[i];
      img.src = it.src;
      img.alt = it.title || "";
      title.textContent = it.title || "";
      sub.textContent = it.sub || "";
      meta.textContent = it.meta || "";
      sub.style.display = it.sub ? "" : "none";
      meta.style.display = it.meta ? "" : "none";
      prev.disabled = i <= 0;
      next.disabled = i >= items.length - 1;
      prev.style.display = next.style.display = items.length > 1 ? "" : "none";
      setZoom(1);
    }

    function go(d) {
      const n = clamp(i + d, 0, items.length - 1);
      if (n === i) return;
      i = n; show();
    }

    stage.addEventListener("click", function (e) {
      if (e.target === img) { stepZoom(zoom >= 4 ? -1 : 1); return; }
      if (e.target === stage && zoom === 1) L.close();
    });
    stage.addEventListener("dblclick", function (e) {
      e.preventDefault(); setZoom(zoom > 1 ? 1 : 2, { centre: true });
    });
    stage.addEventListener("wheel", function (e) {
      if (!e.ctrlKey && !e.metaKey && zoom === 1) return;   // let the page scroll
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), { centre: zoom === 1 });
    }, { passive: false });

    // pinch
    let pinchStart = 0, zoomStart = 1;
    stage.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 2) return;
      pinchStart = dist(e.touches); zoomStart = zoom;
    }, { passive: true });
    stage.addEventListener("touchmove", function (e) {
      if (e.touches.length !== 2 || !pinchStart) return;
      e.preventDefault();
      setZoom(zoomStart * (dist(e.touches) / pinchStart));
    }, { passive: false });
    stage.addEventListener("touchend", function () { pinchStart = 0; }, { passive: true });
    function dist(t) {
      const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    }

    const wrap = el("div", { class: "lb", role: "dialog", "aria-modal": "true", "aria-label": "Artwork viewer" }, [
      el("div", { class: "lb__bar" }, [
        el("div", { class: "stack", style: "gap:0;flex:1;min-width:0" }, [title, sub]),
        el("button", { class: "icon-btn", "aria-label": "Close viewer", html: "&times;", onclick: L.close })
      ]),
      el("div", { style: "position:relative;flex:1;display:flex;min-height:0" }, [stage, prev, next]),
      el("div", { class: "lb__foot" }, [
        el("div", { class: "lb__zoom" }, [
          el("button", { class: "btn btn--sm btn--ghost", "aria-label": "Zoom out", text: "−", onclick: () => stepZoom(-1) }),
          pct,
          el("button", { class: "btn btn--sm btn--ghost", "aria-label": "Zoom in", text: "+", onclick: () => stepZoom(1) }),
          el("button", { class: "btn btn--sm btn--ghost", text: "Fit", onclick: () => setZoom(1) })
        ]),
        el("div", { class: "push" }),
        meta,
        el("a", { class: "btn btn--sm btn--ghost", text: "Open original", target: "_blank", rel: "noopener",
                  href: items[i].src, onclick: function () { this.href = items[i].src; } })
      ])
    ]);

    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); L.close(); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") stepZoom(1);
      else if (e.key === "-" || e.key === "_") stepZoom(-1);
      else if (e.key === "0") setZoom(1);
    }
    document.addEventListener("keydown", onKey);

    document.body.appendChild(wrap);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    open = { wrap: wrap, onKey: onKey, prevOverflow: prevOverflow };
    show();
    return wrap;
  };

  L.close = function () {
    if (!open) return;
    document.removeEventListener("keydown", open.onKey);
    open.wrap.remove();
    document.body.style.overflow = open.prevOverflow || "";
    open = null;
  };

  L.isOpen = function () { return Boolean(open); };

  window.Lightbox = L;
})();
