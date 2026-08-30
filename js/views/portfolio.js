/* PORTFOLIO — Yahoo Finance prices, average-cost position maths, sell planner. */
(function () {
  "use strict";
  const el = U.el;

  let range = "1Y";
  let active = null;
  let loading = false;
  let liveTimer = null;
  let liveError = false;

  /* Share prices need cents when they're small ($12.34), but a zero-decimal
     currency never does — "Rp 0,00" for a nil fee reads as a bug. */
  function fmtPrice(v, ccy) {
    const c = window.CURRENCIES[ccy];
    if (c && c.decimals === 0) return U.money(v, ccy, { decimals: 0 });
    return U.money(v, ccy, { decimals: Math.abs(v) >= 1000 ? 0 : 2 });
  }
  function signed(v, ccy) {
    return (v >= 0 ? "+" : "−") + fmtPrice(Math.abs(v), ccy);
  }

  /* ------------------------------------------------------------ live mode */

  function liveOn() { return Boolean(window.store.state.portfolio.live); }

  function setLive(on) {
    window.store.update(function (s) { s.portfolio.live = on; }, { silent: true });
    on ? startLive() : stopLive();
    window.App.render();
  }

  function startLive() {
    stopLive();
    const every = (window.APP.livePollSeconds || 60) * 1000;
    tickLive();
    liveTimer = setInterval(tickLive, every);
  }

  function stopLive() {
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = null;
  }

  async function tickLive() {
    if (document.hidden) return;                 // don't poll a background tab
    if (window.App.current !== "portfolio") { stopLive(); return; }
    try {
      const got = await window.Prices.refreshLiveAll();
      liveError = !got.length;
    } catch (e) { liveError = true; }
    if (window.App.current === "portfolio") window.App.render();
  }

  /* --------------------------------------------------------------- header */

  function statusLine(pos) {
    if (!pos.rec) return el("span", { class: "chip", text: "No data yet" });
    const hrs = pos.updated ? (Date.now() - Date.parse(pos.updated)) / 3600000 : Infinity;
    const label = hrs < (1 / 60) ? "Just now"
      : hrs < 1 ? Math.round(hrs * 60) + "m ago"
        : hrs < 24 ? Math.round(hrs) + "h ago"
          : Math.round(hrs / 24) + "d ago";
    const src = pos.live ? " · live" : pos.source === "snapshot" ? " · daily snapshot" : "";
    return el("span", {
      class: "chip" + (pos.stale && !pos.live ? " chip--soon" : " chip--paid"),
      text: label + src
    });
  }

  function positionHeader(pos) {
    const h = pos.holding;
    const up = pos.dayChange >= 0;
    return el("div", { class: "pos-head" }, [
      el("div", { style: "min-width:0" }, [
        el("div", { class: "eyebrow", text: h.ticker + (pos.rec && pos.rec.exchange ? " · " + pos.rec.exchange : "") }),
        el("div", { class: "card__title", style: "font-size:21px", text: h.name }),
        el("div", { class: "row row--tight", style: "margin-top:7px;flex-wrap:wrap" }, [
          statusLine(pos),
          pos.marketState ? el("span", { class: "chip", text: String(pos.marketState).toLowerCase() }) : null,
          h.source ? el("a", { class: "chip", href: h.source, target: "_blank", rel: "noopener", text: "Yahoo ↗" }) : null
        ])
      ]),
      el("div", { style: "text-align:right" }, [
        el("div", { class: "figure", style: "font-size:32px", text: pos.price ? fmtPrice(pos.price, pos.currency) : "—" }),
        el("div", {
          class: up ? "pos" : "neg", style: "font-size:14px",
          text: pos.price ? (up ? "▲ " : "▼ ") + fmtPrice(Math.abs(pos.dayChange), pos.currency) + "  " +
            (up ? "+" : "−") + U.pct(Math.abs(pos.dayPct), 2) : ""
        }),
        el("div", { class: "tiny muted", text: pos.live ? "live price" : (pos.lastDate ? "close " + U.prettyDate(pos.lastDate, true) : "") })
      ])
    ]);
  }

  function chartCard(pos) {
    const series = window.Prices.sliceSeries(pos.series, range);
    const ranges = ["1M", "3M", "6M", "1Y", "5Y", "MAX"];
    const first = series.length ? series[0].c : 0;
    const last = series.length ? series[series.length - 1].c : 0;
    const chg = first ? ((last - first) / first) * 100 : 0;

    return el("div", { class: "card" }, [
      positionHeader(pos),
      el("div", { class: "row", style: "justify-content:space-between;margin:14px 0 6px;flex-wrap:wrap;gap:8px" }, [
        el("div", { class: "seg" }, ranges.map((r) => el("button", {
          class: r === range ? "is-on" : "", text: r,
          onclick: function () { range = r; window.App.render(); }
        }))),
        el("div", { class: "row row--tight" }, [
          el("span", { class: "tiny " + (chg >= 0 ? "pos" : "neg"), text: (chg >= 0 ? "+" : "") + U.pct(chg, 2) + " over " + range }),
          el("button", {
            class: "icon-btn", text: loading ? "Refreshing…" : "Refresh", disabled: loading,
            onclick: refresh
          })
        ])
      ]),
      window.Chart.line(series, {
        currency: pos.currency,
        fmtY: (v) => U.num(v, v >= 1000 ? 0 : 2),
        label: pos.holding.name + " daily close",
        empty: loading ? "Fetching price history…" : "No price history yet — hit Refresh, or let the daily GitHub Action fill it in."
      })
    ]);
  }

  /* --------------------------------------------------------------- ledger */

  function ledgerTable(pos) {
    const rows = pos.ledger;
    if (!rows.length) {
      return UI.empty("Nothing recorded yet", "Add what you actually bought and the position maths starts working.");
    }
    return el("div", { class: "table-wrap" }, el("table", { class: "table" }, [
      el("thead", {}, el("tr", {}, [
        el("th", { text: "Date" }), el("th", { text: "Action" }),
        el("th", { class: "num", text: "Shares" }), el("th", { class: "num", text: "Price" }),
        el("th", { class: "num", text: "Value" }), el("th", { class: "num", text: "Result" }), el("th", {})
      ])),
      el("tbody", {}, rows.map(function (r) {
        const isSell = r.t === "sell";
        const shares = Number(r.shares) || 0;
        const price = Number(r.price) || 0;
        const value = isSell ? r.gross : shares * price + (Number(r.fee) || 0);
        const unreal = shares * pos.price - (shares * price + (Number(r.fee) || 0));
        return el("tr", { class: isSell ? "lot-sold" : "" }, [
          el("td", { class: "tiny", text: U.prettyDate(r.date, true) }),
          el("td", {}, el("span", {
            class: "chip " + (isSell ? "chip--overdue" : "chip--paid"),
            text: isSell ? "SELL" : "BUY"
          })),
          el("td", { class: "num", text: U.num(shares, 0) }),
          el("td", { class: "num", text: fmtPrice(price, pos.currency) }),
          el("td", { class: "num muted", text: fmtPrice(value, pos.currency) }),
          isSell
            ? el("td", { class: "num " + (r.gain >= 0 ? "pos" : "neg"), text: signed(r.gain, pos.currency) })
            : el("td", { class: "num " + (unreal >= 0 ? "pos" : "neg"), text: signed(unreal, pos.currency) }),
          el("td", { class: "num" }, el("button", {
            class: "tx__del", html: "&times;", "aria-label": "Remove entry",
            onclick: function () {
              UI.confirm(isSell ? "Remove this sale? Your realised gain will be recalculated."
                : "Remove this purchase?", function () {
                  window.Prices.removeLot(pos.holding.ticker, r.id, r.t);
                  U.toast("Entry removed.");
                });
            }
          }))
        ]);
      }))
    ]));
  }

  function positionCard(pos) {
    const h = pos.holding;
    const has = pos.ledger.length > 0;

    const metrics = el("div", { class: "grid grid--4", style: "margin-bottom:14px" }, [
      UI.metric("Market value", fmtPrice(pos.value, pos.currency), U.num(pos.shares, 0) + " shares held"),
      UI.metric("Cost basis", fmtPrice(pos.cost, pos.currency), "avg " + fmtPrice(pos.avg, pos.currency)),
      UI.metric("Unrealised", signed(pos.pl, pos.currency),
        (pos.plPct >= 0 ? "+" : "") + U.pct(pos.plPct, 2) + " on held shares",
        pos.pl >= 0 ? "metric--good" : "metric--bad"),
      UI.metric("Realised", signed(pos.realised, pos.currency), "banked from sales",
        pos.realised >= 0 ? "metric--good" : "metric--bad")
    ]);

    const totalRow = el("div", { class: "row", style: "justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px" }, [
      el("div", { class: "tiny muted", text: "Total return = unrealised + realised, after fees of " + fmtPrice(pos.fees, pos.currency) }),
      el("div", { class: "row row--tight" }, [
        el("span", { class: "tiny muted", text: "Total" }),
        el("span", {
          class: "figure " + (pos.totalPl >= 0 ? "pos" : "neg"), style: "font-size:20px",
          text: signed(pos.totalPl, pos.currency)
        })
      ])
    ]);

    return UI.card("Position · " + h.ticker,
      pos.shares > 0 ? U.num(pos.shares, 0) + " shares at an average of " + fmtPrice(pos.avg, pos.currency)
        : has ? "Fully sold" : "Log your buys",
      el("div", {}, [
        has ? metrics : null,
        has ? totalRow : null,
        ledgerTable(pos),
        el("div", { class: "pos-actions", style: "margin-top:13px" }, [
          el("button", { class: "btn btn--ghost btn--sm", text: "+ Buy", onclick: () => addLot(h) }),
          pos.shares > 0 ? el("button", { class: "btn btn--gold btn--sm", text: "Sell", onclick: () => sellDialog(h) }) : null,
          pos.shares > 0 ? el("button", { class: "btn btn--ghost btn--sm", text: "What if I sold?", onclick: () => sellDialog(h, { preview: true }) }) : null,
          el("div", { class: "push" }),
          el("button", { class: "btn btn--ghost btn--sm", text: "Remove investment", onclick: () => removeHolding(h) })
        ])
      ]));
  }

  /* ------------------------------------------------------------- dialogs  */

  function addLot(h) {
    const date = UI.input("Purchase date", { type: "date", value: U.today(), id: "l-date" });
    const shares = UI.input("Shares", { type: "number", min: "0", step: "any", placeholder: "100", id: "l-shares" });
    const price = UI.input("Price per share (" + (h.currency || "") + ")", { type: "number", min: "0", step: "any", id: "l-price" });
    const fee = UI.input("Fees", { type: "number", min: "0", step: "any", value: 0, id: "l-fee" });
    const body = el("div", { class: "form-grid" }, [date, shares, price, fee]);

    UI.modal({
      title: "Buy · " + h.ticker, body: body,
      footer: [
        el("button", { class: "btn btn--ghost", text: "Cancel", onclick: UI.closeModal }),
        el("button", {
          class: "btn", text: "Record purchase", onclick: function () {
            const sh = Number(body.querySelector("#l-shares").value);
            const pr = Number(body.querySelector("#l-price").value);
            if (!sh || !pr) { U.toast("Shares and price are both required.", "error"); return; }
            window.store.update(function (s) {
              const hh = s.portfolio.holdings.find((x) => x.ticker === h.ticker);
              if (hh) {
                if (!hh.lots) hh.lots = [];
                hh.lots.push({
                  id: U.uid(), date: body.querySelector("#l-date").value || U.today(),
                  shares: sh, price: pr, fee: Number(body.querySelector("#l-fee").value) || 0
                });
              }
            }, { reason: "portfolio" });
            UI.closeModal(); U.toast("Purchase recorded.");
          }
        })
      ]
    });
  }

  /* The sell planner doubles as the "what would I gain" calculator: it shows
     the full breakdown as you type and only writes anything if you confirm. */
  function sellDialog(h, opts) {
    opts = opts || {};
    const pos = window.Prices.position(h);
    const ccy = pos.currency;

    const date = UI.input("Sale date", { type: "date", value: U.today(), id: "s-date" });
    const shares = UI.input("Shares to sell", {
      type: "number", min: "0", step: "any", value: pos.shares, id: "s-shares"
    });
    const price = UI.input("Price per share (" + ccy + ")", {
      type: "number", min: "0", step: "any",
      value: pos.price ? Math.round(pos.price * 100) / 100 : "", id: "s-price"
    });
    const fee = UI.input("Fees", { type: "number", min: "0", step: "any", value: 0, id: "s-fee" });

    const preview = el("div", { class: "sell-preview" });

    function row(label, value, cls) {
      return el("div", { class: "sell-preview__row" + (cls ? " " + cls : "") }, [
        el("span", { class: "muted", text: label }),
        el("span", { class: cls ? (String(value).indexOf("−") === 0 ? "neg" : "pos") : "", text: value })
      ]);
    }

    function recompute() {
      const p = window.Prices.previewSell(h,
        body.querySelector("#s-shares").value,
        body.querySelector("#s-price").value,
        body.querySelector("#s-fee").value);

      preview.innerHTML = "";
      [
        row("Shares sold", U.num(p.shares, 0) + (p.overSold ? "  (capped — you hold " + U.num(pos.shares, 0) + ")" : "")),
        row("Gross proceeds", fmtPrice(p.gross, ccy)),
        row("Less fees", "−" + fmtPrice(p.fee, ccy)),
        row("Net proceeds", fmtPrice(p.net, ccy)),
        row("Cost basis (avg " + fmtPrice(p.avg, ccy) + ")", "−" + fmtPrice(p.basis, ccy)),
        row(p.gain >= 0 ? "Gain" : "Loss",
          signed(p.gain, ccy) + "   (" + (p.gainPct >= 0 ? "+" : "") + U.pct(p.gainPct, 2) + ")",
          "sell-preview__row--total"),
        el("div", {
          class: "tiny muted", style: "margin-top:8px", text:
            p.remaining > 0
              ? U.num(p.remaining, 0) + " shares would remain, worth " + fmtPrice(p.remaining * pos.price, ccy)
              : "This would close the position completely."
        })
      ].forEach((n) => preview.appendChild(n));
    }

    const body = el("div", {}, [
      el("div", { class: "form-grid" }, [date, shares, price, fee]),
      el("div", { class: "row row--tight", style: "margin:10px 0 6px;flex-wrap:wrap" }, [
        el("button", {
          class: "btn btn--ghost btn--sm", text: "Use market price",
          onclick: function () { body.querySelector("#s-price").value = Math.round(pos.price * 100) / 100; recompute(); }
        }),
        el("button", {
          class: "btn btn--ghost btn--sm", text: "Sell all",
          onclick: function () { body.querySelector("#s-shares").value = pos.shares; recompute(); }
        }),
        el("button", {
          class: "btn btn--ghost btn--sm", text: "Sell half",
          onclick: function () { body.querySelector("#s-shares").value = Math.floor(pos.shares / 2); recompute(); }
        })
      ]),
      preview
    ]);

    body.addEventListener("input", recompute);
    recompute();

    UI.modal({
      title: (opts.preview ? "What if I sold · " : "Sell · ") + h.ticker,
      body: body,
      footer: [
        el("button", { class: "btn btn--ghost", text: opts.preview ? "Close" : "Cancel", onclick: UI.closeModal }),
        el("button", {
          class: "btn btn--gold", text: "Record this sale", onclick: function () {
            const p = window.Prices.previewSell(h,
              body.querySelector("#s-shares").value,
              body.querySelector("#s-price").value,
              body.querySelector("#s-fee").value);
            if (!p.shares || !p.price) { U.toast("Shares and price are both required.", "error"); return; }
            window.Prices.sell(h.ticker, {
              date: body.querySelector("#s-date").value || U.today(),
              shares: p.shares, price: p.price, fee: p.fee
            });
            UI.closeModal();
            U.toast("Sale recorded — " + signed(p.gain, ccy) + " realised.", p.gain >= 0 ? "gold" : "error");
          }
        })
      ]
    });
  }

  function removeHolding(h) {
    UI.confirm(
      "Remove " + h.ticker + " from your portfolio? This deletes its purchases, sales and cached prices. Your budget data is untouched.",
      function () {
        window.Prices.removeHolding(h.ticker);
        active = null;
        U.toast(h.ticker + " removed.");
      });
  }

  function addHolding() {
    const ticker = UI.input("Yahoo Finance ticker", { placeholder: "BBRI.JK, AAPL, VOO", id: "h-ticker" });
    const name = UI.input("Display name", { placeholder: "Bank Rakyat Indonesia", id: "h-name" });
    const ccy = UI.currencySelect("Currency", window.store.state.settings.currency, { id: "h-ccy" });
    const body = el("div", {}, [
      el("div", { class: "form-grid form-grid--wide" }, [ticker, name, ccy]),
      el("p", {
        class: "hint", style: "margin-top:12px", text:
          "Use the exact symbol from the Yahoo Finance URL. Indonesian listings end in .JK — finance.yahoo.com/quote/BBCA.JK gives you BBCA.JK. To have it refreshed automatically every day, also add the ticker to data/portfolio.json in your repo (README has the two-line recipe)."
      })
    ]);

    UI.modal({
      title: "Add investment", body: body,
      footer: [
        el("button", { class: "btn btn--ghost", text: "Cancel", onclick: UI.closeModal }),
        el("button", {
          class: "btn", text: "Add & fetch", onclick: async function () {
            const t = body.querySelector("#h-ticker").value.trim().toUpperCase();
            if (!t) { U.toast("A ticker is required.", "error"); return; }
            if (window.Prices.holdings().some((h) => h.ticker === t)) { U.toast("That ticker is already tracked.", "error"); return; }
            window.store.update((s) => s.portfolio.holdings.push({
              ticker: t,
              name: body.querySelector("#h-name").value.trim() || t,
              currency: body.querySelector("#h-ccy").value,
              source: "https://finance.yahoo.com/quote/" + encodeURIComponent(t) + "/",
              lots: [], sells: []
            }), { reason: "portfolio" });
            UI.closeModal();
            active = t;
            window.App.render();
            /* The holding is already saved at this point. A failed price
               fetch must not read like the whole thing failed. */
            try {
              const rec = await window.Prices.fetch(t, { force: true });
              if (rec && rec.series && rec.series.length) U.toast(t + " added.");
              else U.toast(t + " added, but no price data came back yet. Press Refresh in a moment.", "error");
            } catch (e) {
              U.toast(t + " added. The price feed didn't answer — press Refresh in a moment.", "error");
            }
            window.App.render();
          }
        })
      ]
    });
  }

  /* Reports what actually happened. The old version announced success even
     when every request had failed, because refreshAll swallowed its errors. */
  async function refresh() {
    loading = true; window.App.render();
    const total = window.Prices.holdings().length;
    let ok = 0, failed = [];
    try {
      const done = await window.Prices.refreshAll({ force: true });
      ok = done.length;
      failed = done.failed || [];
      const live = await window.Prices.refreshLiveAll();
      liveError = Boolean(live.failed && live.failed.length) && !live.length;
    } catch (e) {
      failed = window.Prices.holdings().map((h) => h.ticker);
    }
    loading = false;
    window.App.render();

    if (!failed.length) U.toast("Prices updated.");
    else if (ok) U.toast("Updated " + ok + " of " + total + " — " + failed.join(", ") + " didn't answer.", "error");
    else U.toast("Couldn't reach the price feed. Your saved history is still here; try again in a minute.", "error");
  }

  /* ----------------------------------------------------------------- view */

  window.Views = window.Views || {};
  window.Views.portfolioStop = stopLive;

  window.Views.portfolio = function () {
    const holdings = window.Prices.holdings();
    if (!holdings.length) {
      return el("div", { class: "stack" }, [
        UI.card("Investment portfolio", "Daily closes pulled from Yahoo Finance",
          UI.empty("No holdings tracked yet", "Add a ticker to start charting it.",
            el("button", { class: "btn", text: "+ Add investment", onclick: addHolding })))
      ]);
    }

    if (!active || !holdings.some((h) => h.ticker === active)) active = holdings[0].ticker;
    const positions = holdings.map((h) => window.Prices.position(h));
    const pos = positions.find((p) => p.holding.ticker === active) || positions[0];

    /* Mixed currencies are converted to your display currency when rates are
       available; without them we show a dash rather than adding rupiah to
       dollars as if they were the same number. */
    const display = window.store.state.settings.currency;
    const rated = positions.every((p) => window.FX.has(p.currency) && window.FX.has(display));
    const conv = (v, from) => (from === display ? v : (window.FX.convert(v, from, display) || 0));

    const totals = positions.reduce(function (a, p) {
      if (!rated) return a;
      a.value += conv(p.value, p.currency);
      a.cost += conv(p.cost, p.currency);
      a.day += conv(p.dayValueChange, p.currency);
      a.realised += conv(p.realised, p.currency);
      return a;
    }, { value: 0, cost: 0, day: 0, realised: 0 });

    const mixed = new Set(positions.map((p) => p.currency)).size > 1;
    const totalPl = totals.value - totals.cost;

    const summary = UI.card("Portfolio",
      positions.length + (positions.length === 1 ? " holding" : " holdings") +
      (mixed ? (rated ? " · converted to " + display : " · mixed currencies") : ""),
      el("div", {}, [
        el("div", { class: "grid grid--4" }, [
          UI.metric("Market value", rated ? fmtPrice(totals.value, display) : "—", rated ? "at last price" : "rates unavailable"),
          UI.metric("Cost basis", rated ? fmtPrice(totals.cost, display) : "—", "what you paid"),
          UI.metric("Unrealised", rated ? signed(totalPl, display) : "—",
            totals.cost ? U.pct(totalPl / totals.cost * 100, 2) : "—",
            totalPl >= 0 ? "metric--good" : "metric--bad"),
          UI.metric("Today", rated ? signed(totals.day, display) : "—",
            "day move", totals.day >= 0 ? "metric--good" : "metric--bad")
        ])
      ]),
      el("div", { class: "row row--tight" }, [
        el("label", { class: "row row--tight", style: "cursor:pointer;font-size:13px;gap:6px" }, [
          el("span", { class: "live-dot " + (liveOn() ? (liveError ? "live-dot--err" : "live-dot--on") : "") }),
          el("input", {
            type: "checkbox", checked: liveOn(),
            onchange: function () { setLive(this.checked); }
          }),
          el("span", { text: liveOn() ? (liveError ? "Live — retrying" : "Live") : "Live off" })
        ]),
        el("button", { class: "icon-btn", text: "+ Add investment", onclick: addHolding })
      ]));

    const tabs = holdings.length > 1 ? el("div", { class: "seg", style: "margin-bottom:2px" },
      holdings.map((h) => el("button", {
        class: h.ticker === active ? "is-on" : "", text: h.ticker,
        onclick: function () { active = h.ticker; window.App.render(); }
      }))) : null;

    return el("div", { class: "stack" }, [
      summary,
      tabs,
      chartCard(pos),
      positionCard(pos),
      UI.card("How this data stays current", null, el("div", { class: "prose tiny" }, [
        el("p", { text: "A GitHub Action runs every day at 12:00 UTC, pulls the daily closes for every ticker in data/portfolio.json from Yahoo Finance and commits the result to data/prices/. The site reads that file first, so the chart loads instantly and works offline." }),
        el("p", { text: "Switch Live on and the page also polls Yahoo for the intraday price every " + (window.APP.livePollSeconds || 60) + " seconds while this tab is open, so the price and your P/L move during market hours. It pauses itself when you switch tabs or leave the page." }),
        el("p", { text: "Sales use average-cost accounting: each sale is measured against the running average of everything bought up to that date. Editing an old purchase re-derives every figure, so nothing goes stale." })
      ]))
    ]);
  };

  window.Views.portfolioInit = async function () {
    if (liveOn()) startLive();
    const holdings = window.Prices.holdings();
    const needs = holdings.filter((h) => window.Prices.isStale(window.Prices.cached(h.ticker)));
    if (!needs.length || loading) return;
    loading = true;
    window.App.render();
    for (const h of needs) {
      try { await window.Prices.fetch(h.ticker); } catch (e) { /* surfaced in the UI */ }
    }
    loading = false;
    window.App.render();
  };
})();
