/* CURRENCY — converter and rate table, live from Yahoo Finance. */
(function () {
  "use strict";
  const el = U.el;

  let busy = false;
  let filter = "";
  let spin = false;

  function conv() {
    const s = window.store.state;
    if (!s.converter) {
      s.converter = { from: s.settings.currency || "IDR", to: "USD", amount: 100000 };
    }
    return s.converter;
  }

  function setConv(patch) {
    window.store.update(function (s) {
      s.converter = Object.assign({}, conv(), patch);
    }, { silent: true });
  }

  function fmt(v, code) {
    const c = window.CURRENCIES[code];
    if (!c) return U.num(v, 2);
    // Small results need real precision — 0.0000642 shouldn't render as "0".
    const dp = Math.abs(v) > 0 && Math.abs(v) < 1 ? Math.max(c.decimals, 4) : c.decimals;
    return U.money(v, code, { decimals: dp });
  }

  async function refresh(codes) {
    if (busy) return;
    busy = true; window.App.render();
    try {
      const r = await window.FX.refresh(codes, { force: true, silent: false });
      if (!Object.keys(r.got).length) {
        U.toast("Couldn't reach the rate feed just now. Try again in a moment.", "error");
      } else if (r.source === "ecb") {
        U.toast("Updated from the ECB backup — fewer currencies than usual.");
      } else {
        U.toast("Exchange rates updated.");
      }
    } catch (e) {
      U.toast("Couldn't reach the rate feed just now.", "error");
    }
    busy = false; window.App.render();
  }

  /* ------------------------------------------------------------ converter */

  function converterCard() {
    const c = conv();
    const amount = Number(c.amount) || 0;
    const out = window.FX.convert(amount, c.from, c.to);
    const rate = window.FX.pairRate(c.from, c.to);

    const amountInput = el("input", {
      class: "input", type: "number", step: "any", value: c.amount, id: "cv-amount",
      oninput: function () { setConv({ amount: this.value }); paint(); }
    });

    const fromSel = UI.currencySelect(false, c.from, {
      id: "cv-from",
      onchange: function () { setConv({ from: this.value }); ensure(); }
    });
    const toSel = UI.currencySelect(false, c.to, {
      id: "cv-to",
      onchange: function () { setConv({ to: this.value }); ensure(); }
    });

    const outBox = el("div", { class: "conv__out" });
    const rateBox = el("div", { class: "conv__rate" });
    const inverse = el("div", { class: "tiny muted" });

    function paint() {
      const a = Number(conv().amount) || 0;
      const v = window.FX.convert(a, conv().from, conv().to);
      const r = window.FX.pairRate(conv().from, conv().to);
      outBox.textContent = v == null ? "—" : fmt(v, conv().to);
      outBox.className = "conv__out " + (v == null ? "muted" : "");
      rateBox.textContent = r == null
        ? "Rate unavailable — hit Update rates"
        : "1 " + conv().from + " = " + U.num(r, r < 1 ? 6 : 4) + " " + conv().to;
      inverse.textContent = r ? "1 " + conv().to + " = " + U.num(1 / r, (1 / r) < 1 ? 6 : 4) + " " + conv().from : "";
    }

    async function ensure() {
      const need = [conv().from, conv().to].filter((x) => x !== "USD" && !window.FX.usdRate(x));
      if (need.length) await refresh(need);
      else { paint(); window.App.render(); }
    }

    paint();

    const swapBtn = el("button", {
      class: "conv__swap" + (spin ? " conv__swap--spin" : ""), "aria-label": "Swap currencies",
      html: "⇅",
      onclick: function () {
        const cur = conv();
        spin = !spin;
        setConv({ from: cur.to, to: cur.from, amount: out != null ? Math.round(out * 100) / 100 : cur.amount });
        window.App.render();
      }
    });

    const quick = [1, 10, 100, 1000, 1000000].map((n) => el("button", {
      class: "btn btn--ghost btn--sm",
      text: n >= 1000000 ? (n / 1000000) + "M" : n >= 1000 ? (n / 1000) + "K" : String(n),
      onclick: function () { setConv({ amount: n }); window.App.render(); }
    }));

    const src = window.FX.source();
    const srcLabel = src === "ecb" ? "ECB reference rates (backup source)"
      : src ? "Mid-market rates, updated daily" : "Mid-market rates";
    return UI.card("Currency converter", srcLabel,
      el("div", {}, [
        el("div", { class: "conv" }, [
          el("label", { class: "field" }, [el("span", { text: "Amount" }), amountInput, fromSel]),
          swapBtn,
          el("label", { class: "field" }, [
            el("span", { text: "Converted to" }),
            el("div", {
              class: "input", style: "display:flex;align-items:center;min-height:42px;overflow:hidden"
            }, outBox),
            toSel
          ])
        ]),
        el("div", { class: "row", style: "justify-content:space-between;margin-top:12px;flex-wrap:wrap;gap:8px" }, [
          el("div", { class: "stack", style: "gap:2px" }, [rateBox, inverse]),
          el("div", { class: "row row--tight" }, quick)
        ])
      ]),
      el("button", {
        class: "icon-btn", text: busy ? "Updating…" : "Update rates", disabled: busy,
        onclick: function () { refresh(null); }
      }));
  }

  /* ----------------------------------------------------------- rate table */

  function ratesCard() {
    const base = conv().from;
    const all = window.CURRENCIES;
    const q = filter.trim().toLowerCase();

    let codes = Object.keys(all).filter((c) => c !== base && window.FX.has(c));
    if (q) {
      codes = codes.filter((c) =>
        c.toLowerCase().indexOf(q) > -1 || all[c].name.toLowerCase().indexOf(q) > -1);
    } else {
      codes = codes.filter((c) => (window.CURRENCY_POPULAR || []).indexOf(c) > -1);
    }
    codes.sort();

    const search = el("input", {
      class: "input ccy-search", placeholder: "Search all " + Object.keys(all).length + " currencies…",
      value: filter,
      oninput: U.debounce(function () { filter = this.value; window.App.render(); }, 220)
    });

    const rows = codes.map(function (code) {
      const r = window.FX.pairRate(base, code);
      return el("button", {
        class: "rate-row", style: "width:100%;background:none;border:0;border-bottom:1px solid var(--line-soft);text-align:left;cursor:pointer",
        onclick: function () { setConv({ to: code }); window.App.render(); }
      }, [
        el("div", {}, [
          el("div", { class: "rate-row__code", text: code }),
          el("div", { class: "rate-row__name", text: all[code].name })
        ]),
        el("div", { style: "text-align:right" }, [
          el("div", { class: "rate-row__val", text: r == null ? "—" : U.num(r, r < 1 ? 6 : r < 100 ? 4 : 2) }),
          el("div", { class: "tiny muted", text: all[code].symbol })
        ])
      ]);
    });

    const rateDate = window.FX.rateDate();
    const updated = window.FX.updatedAt();
    const note = rateDate
      ? "Rates as of " + U.prettyDate(rateDate, true)
      : updated
        ? "Updated " + U.prettyDate(U.iso(new Date(updated)), true)
        : "No rates cached yet";

    return UI.card("1 " + base + " buys", note,
      el("div", {}, [
        search,
        rows.length ? el("div", {}, rows)
          : UI.empty("Nothing matches “" + filter + "”",
            "Try a currency code like SGD, or a country name.")
      ]),
      !q ? el("span", { class: "tiny muted", text: "showing common currencies — search for the rest" }) : null);
  }

  function missingCard() {
    if (!window.FX.isStale() && Object.keys(window.FX.all()).length) return null;
    return UI.card("Rates need a refresh", null,
      el("div", { class: "prose tiny" }, [
        el("p", {
          text: Object.keys(window.FX.all()).length
            ? "The cached rates are more than " + (window.APP.fxStaleHours || 12) + " hours old."
            : "No exchange rates have been fetched yet."
        }),
        el("button", { class: "btn btn--sm", text: "Fetch rates now", onclick: function () { refresh(null); } })
      ]));
  }

  window.Views = window.Views || {};

  window.Views.currency = function () {
    return el("div", { class: "stack" }, [
      missingCard(),
      converterCard(),
      ratesCard(),
      UI.card("Where these numbers come from", null, el("div", { class: "prose tiny" }, [
        el("p", { text: "Rates come from an open exchange-rate feed served over the jsDelivr CDN, covering 200+ currencies. It sends CORS headers, so your browser fetches it directly — no proxy in the way. One request returns every currency quoted against the US dollar, and any pair is derived by dividing one rate by the other." }),
        el("p", { text: "If that feed is ever unreachable the app falls back to the European Central Bank's daily reference rates. Those cover about 30 currencies, so some entries may show a dash until the main source is back." }),
        el("p", { text: "These are mid-market rates: the midpoint between buy and sell. Your bank, your card and the money changer down the road will all give you slightly less. Treat this as the honest reference number, not a quote." }),
        el("p", { text: "Rates settle once per business day, so weekend figures are Friday's close — normal for currency data, and fine for budgeting. They are cached and only re-fetched when more than " + (window.APP.fxStaleHours || 12) + " hours old, or when you press Update rates." })
      ]))
    ]);
  };

  window.Views.currencyInit = async function () {
    if (window.FX.isStale()) {
      const c = conv();
      await refresh([c.from, c.to].concat(window.CURRENCY_POPULAR || []));
    }
  };
})();
