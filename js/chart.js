/* Small dependency-free SVG charts. No CDN, no build step. */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const C = {};

  function svgEl(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }

  function niceTicks(min, max, count) {
    if (!isFinite(min) || !isFinite(max)) return [0, 1];
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const raw = span / (count || 4);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
    return out.length >= 2 ? out : [min, max];
  }

  /* ----------------------------------------------------------- line chart */
  /* series: [{ d: "YYYY-MM-DD", c: number }] ascending by date */
  C.line = function (series, opts) {
    opts = opts || {};
    const W = 1000, H = opts.height || 320;
    const pad = { t: 18, r: 58, b: 34, l: 12 };
    const wrap = U.el("div", { class: "chart" });

    if (!series || series.length < 2) {
      wrap.appendChild(U.el("div", { class: "chart__empty", text: opts.empty || "No price history yet." }));
      return wrap;
    }

    const vals = series.map((p) => p.c);
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    const padY = (hi - lo) * 0.12 || Math.abs(hi) * 0.02 || 1;
    lo -= padY; hi += padY;

    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const X = (i) => pad.l + (i / (series.length - 1)) * iw;
    const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * ih;

    const svg = svgEl("svg", {
      viewBox: "0 0 " + W + " " + H, class: "chart__svg",
      preserveAspectRatio: "none", role: "img",
      "aria-label": opts.label || "Price history"
    });

    const gradId = "g" + Math.random().toString(36).slice(2, 8);
    const defs = svgEl("defs");
    const grad = svgEl("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
    const up = series[series.length - 1].c >= series[0].c;
    const stroke = opts.color || (up ? "var(--green)" : "var(--red)");
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": stroke, "stop-opacity": ".30" }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": stroke, "stop-opacity": "0" }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    // horizontal guides + right-hand value labels
    const ticks = niceTicks(lo + padY, hi - padY, 4);
    ticks.forEach(function (v) {
      const y = Y(v);
      if (y < pad.t - 2 || y > H - pad.b + 2) return;
      svg.appendChild(svgEl("line", {
        x1: pad.l, x2: W - pad.r + 6, y1: y, y2: y, class: "chart__grid"
      }));
      const lbl = svgEl("text", { x: W - pad.r + 12, y: y + 4, class: "chart__ylabel" });
      lbl.textContent = opts.fmtY ? opts.fmtY(v) : U.num(v, 0);
      svg.appendChild(lbl);
    });

    let d = "", area = "";
    series.forEach(function (p, i) {
      const x = X(i), y = Y(p.c);
      d += (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
    });
    area = d + "L" + X(series.length - 1).toFixed(2) + " " + (H - pad.b) +
      "L" + X(0).toFixed(2) + " " + (H - pad.b) + "Z";

    svg.appendChild(svgEl("path", { d: area, fill: "url(#" + gradId + ")" }));
    svg.appendChild(svgEl("path", { d: d, class: "chart__line", stroke: stroke }));

    // x labels: first, middle, last
    [0, Math.floor(series.length / 2), series.length - 1].forEach(function (i, n) {
      const t = svgEl("text", {
        x: U.clamp(X(i), pad.l + 26, W - pad.r - 26), y: H - 10,
        class: "chart__xlabel", "text-anchor": n === 0 ? "start" : n === 2 ? "end" : "middle"
      });
      t.textContent = U.prettyDate(series[i].d, true);
      svg.appendChild(t);
    });

    // crosshair
    const hover = svgEl("g", { class: "chart__hover", opacity: "0" });
    const vline = svgEl("line", { y1: pad.t, y2: H - pad.b, class: "chart__cross" });
    const dot = svgEl("circle", { r: 5, class: "chart__dot", fill: stroke });
    hover.appendChild(vline); hover.appendChild(dot);
    svg.appendChild(hover);

    wrap.appendChild(svg);

    const tip = U.el("div", { class: "chart__tip" });
    wrap.appendChild(tip);

    function move(ev) {
      const r = svg.getBoundingClientRect();
      const cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
      let i = Math.round(((cx - pad.l) / iw) * (series.length - 1));
      i = U.clamp(i, 0, series.length - 1);
      const p = series[i];
      hover.setAttribute("opacity", "1");
      vline.setAttribute("x1", X(i)); vline.setAttribute("x2", X(i));
      dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(p.c));
      tip.classList.add("is-on");
      tip.innerHTML = '<b>' + (opts.fmtY ? opts.fmtY(p.c) : U.num(p.c, 0)) + '</b><span>' +
        U.prettyDate(p.d, true) + '</span>';
      const left = U.clamp((X(i) / W) * r.width, 60, r.width - 60);
      tip.style.left = left + "px";
    }
    function leave() { hover.setAttribute("opacity", "0"); tip.classList.remove("is-on"); }

    svg.addEventListener("mousemove", move);
    svg.addEventListener("touchmove", function (e) { move(e); }, { passive: true });
    svg.addEventListener("mouseleave", leave);
    svg.addEventListener("touchend", leave);

    return wrap;
  };

  /* ------------------------------------------------------------ sparkline */
  C.spark = function (values, opts) {
    opts = opts || {};
    const W = 120, H = opts.height || 32;
    if (!values || values.length < 2) return U.el("span", { class: "spark spark--empty" });
    const lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    const span = hi - lo || 1;
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "spark", "aria-hidden": "true" });
    let d = "";
    values.forEach(function (v, i) {
      const x = (i / (values.length - 1)) * W;
      const y = H - 2 - ((v - lo) / span) * (H - 4);
      d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    });
    svg.appendChild(svgEl("path", {
      d: d, fill: "none", "stroke-width": "2", "stroke-linecap": "round",
      stroke: opts.color || (values[values.length - 1] >= values[0] ? "var(--green)" : "var(--red)")
    }));
    return svg;
  };

  /* --------------------------------------------------- grouped bar column */
  /* rows: [{ label, a, b }] — a = income, b = expense */
  C.columns = function (rows, opts) {
    opts = opts || {};
    const wrap = U.el("div", { class: "cols" });
    const max = Math.max(1, ...rows.map((r) => Math.max(r.a, r.b)));
    rows.forEach(function (r) {
      wrap.appendChild(U.el("div", { class: "cols__item" }, [
        U.el("div", { class: "cols__stack" }, [
          U.el("div", {
            class: "cols__bar cols__bar--in",
            style: "height:" + (r.a / max * 100).toFixed(1) + "%",
            title: "In " + U.money(r.a, opts.currency)
          }),
          U.el("div", {
            class: "cols__bar cols__bar--out",
            style: "height:" + (r.b / max * 100).toFixed(1) + "%",
            title: "Out " + U.money(r.b, opts.currency)
          })
        ]),
        U.el("div", { class: "cols__label", text: r.label })
      ]));
    });
    return wrap;
  };

  window.Chart = C;
})();
