/* ============================================================================
   Price service
   ----------------------------------------------------------------------------
   Order of attack for every ticker:
     1. data/prices/<TICKER>.json — written once a day by the GitHub Action.
     2. If that's missing or older than APP.priceStaleHours, ask Yahoo Finance
        live through a CORS relay (browsers can't call Yahoo directly).
     3. Whatever we got last time, kept in the saved state.
   ========================================================================== */
(function () {
  "use strict";

  const P = {};
  const inflight = {};

  P.holdings = function () {
    return (window.store.state.portfolio.holdings || []);
  };

  P.cached = function (ticker) {
    return window.store.state.prices[ticker] || null;
  };

  function hoursSince(iso) {
    if (!iso) return Infinity;
    const t = Date.parse(iso);
    return isFinite(t) ? (Date.now() - t) / 3600000 : Infinity;
  }

  P.isStale = function (rec) {
    return !rec || !rec.series || rec.series.length < 2 ||
      hoursSince(rec.updated) > window.APP.priceStaleHours;
  };

  function save(ticker, rec) {
    window.store.update(function (s) { s.prices[ticker] = rec; }, { silent: true });
  }

  /* --------------------------------------------------------- snapshot file */
  async function fromSnapshot(ticker) {
    const res = await fetch("data/prices/" + encodeURIComponent(ticker) + ".json", { cache: "no-cache" });
    if (!res.ok) throw new Error("snapshot " + res.status);
    const json = await res.json();
    if (!json || !Array.isArray(json.series) || json.series.length < 2) throw new Error("snapshot empty");
    json.source = "snapshot";
    return json;
  }

  /* --------------------------------------------------------------- relay  */
  function yahooUrl(ticker, range) {
    return window.APP.yahooChart + encodeURIComponent(ticker) +
      "?range=" + (range || "2y") + "&interval=1d&includePrePost=false";
  }

  function parseYahoo(ticker, json) {
    const r = json && json.chart && json.chart.result && json.chart.result[0];
    if (!r || !r.timestamp) throw new Error("unexpected response shape");
    const closes = ((r.indicators.adjclose && r.indicators.adjclose[0] &&
      r.indicators.adjclose[0].adjclose) || r.indicators.quote[0].close) || [];
    const series = [];
    r.timestamp.forEach(function (ts, i) {
      const c = closes[i];
      if (c == null) return;
      const d = new Date(ts * 1000);
      series.push({ d: U.iso(d), c: Math.round(c * 10000) / 10000 });
    });
    if (series.length < 2) throw new Error("no usable closes");
    const meta = r.meta || {};
    return {
      symbol: ticker,
      currency: meta.currency || "USD",
      exchange: meta.fullExchangeName || meta.exchangeName || "",
      name: meta.longName || meta.shortName || ticker,
      previousClose: meta.chartPreviousClose,
      updated: new Date().toISOString(),
      series: series,
      source: "live"
    };
  }

  async function fromRelay(ticker) {
    const target = yahooUrl(ticker);
    let lastErr;
    for (const prefix of window.APP.priceProxies) {
      try {
        const res = await fetch(prefix + encodeURIComponent(target), { cache: "no-store" });
        if (!res.ok) throw new Error(res.status + " from relay");
        const json = await res.json();
        return parseYahoo(ticker, json);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("every relay failed");
  }

  /* ---------------------------------------------------------------- public */

  P.fetch = async function (ticker, opts) {
    opts = opts || {};
    if (inflight[ticker]) return inflight[ticker];

    const run = (async function () {
      const cached = P.cached(ticker);
      let snap = null;
      try { snap = await fromSnapshot(ticker); } catch (e) { /* fine, keep going */ }

      if (snap && !P.isStale(snap) && !opts.force) { save(ticker, snap); return snap; }

      try {
        const live = await fromRelay(ticker);
        // keep whichever history is longer
        if (snap && snap.series.length > live.series.length) {
          const merged = mergeSeries(snap.series, live.series);
          live.series = merged;
        }
        save(ticker, live);
        return live;
      } catch (e) {
        if (snap) { snap.stale = true; save(ticker, snap); return snap; }
        if (cached) { cached.stale = true; return cached; }
        throw e;
      }
    })();

    inflight[ticker] = run;
    try { return await run; } finally { delete inflight[ticker]; }
  };

  function mergeSeries(a, b) {
    const map = new Map();
    a.concat(b).forEach((p) => map.set(p.d, p.c));
    return Array.from(map.entries()).sort((x, y) => x[0] < y[0] ? -1 : 1)
      .map(([d, c]) => ({ d: d, c: c }));
  }

  /* Returns what succeeded AND what didn't. It used to swallow every error
     and return only the successes, which let the UI report "Prices updated"
     after a total failure. */
  P.refreshAll = async function (opts) {
    const out = [], failed = [];
    for (const h of P.holdings()) {
      try {
        const rec = await P.fetch(h.ticker, opts);
        // A stale snapshot returned after a failed live fetch is not a refresh.
        if (rec && rec.stale && opts && opts.force) failed.push(h.ticker);
        else out.push(rec);
      } catch (e) {
        failed.push(h.ticker);
      }
    }
    out.failed = failed;
    return out;
  };

  /* Loads data/portfolio.json the first time so a fresh install already has
     the BBCA position in it. The saved state wins afterwards. */
  P.bootstrap = async function () {
    if (P.holdings().length) return;
    try {
      const res = await fetch("data/portfolio.json", { cache: "no-cache" });
      if (!res.ok) return;
      const json = await res.json();
      if (!json || !Array.isArray(json.holdings) || !json.holdings.length) return;
      window.store.update(function (s) {
        s.portfolio.holdings = json.holdings.map(function (h) {
          return {
            ticker: h.ticker, name: h.name, shortName: h.shortName || h.name,
            currency: h.currency || "USD", source: h.source || "",
            lots: (h.lots || []).map((l) => Object.assign({ id: U.uid() }, l))
          };
        });
      }, { silent: true });
    } catch (e) { /* offline or file removed — no problem */ }
  };

  /* ------------------------------------------------------------ valuation */

  /* Average-cost accounting, replayed in date order.

     buy  → shares += n ; cost += n × price + fee
     sell → realise n × (price − avgCost) − fee ; cost -= n × avgCost

     Average cost is what most retail brokers and Indonesian tax treatment
     use, and unlike FIFO it doesn't need lot-by-lot matching, so editing an
     old buy can't silently rewrite which shares a past sale disposed of. */
  P.ledger = function (holding) {
    const events = []
      .concat((holding.lots || []).map((l) => ({ t: "buy", ...l })))
      .concat((holding.sells || []).map((s) => ({ t: "sell", ...s })))
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return a.t === "buy" ? -1 : 1;          // same day: buys settle first
      });

    let shares = 0, cost = 0, realised = 0, fees = 0, proceeds = 0;
    const rows = [];

    events.forEach(function (e) {
      const n = Number(e.shares) || 0;
      const price = Number(e.price) || 0;
      const fee = Number(e.fee) || 0;
      fees += fee;

      if (e.t === "buy") {
        shares += n; cost += n * price + fee;
        rows.push({ ...e, runShares: shares, runCost: cost });
      } else {
        const avg = shares > 0 ? cost / shares : 0;
        const sold = Math.min(n, shares);          // can't sell what isn't held
        const basis = avg * sold;
        const gross = sold * price;
        const gain = gross - fee - basis;
        realised += gain; proceeds += gross - fee;
        cost -= basis; shares -= sold;
        rows.push({ ...e, basis, gross, gain, runShares: shares, runCost: cost });
      }
    });

    return { rows, shares, cost, realised, fees, proceeds };
  };

  P.position = function (holding) {
    const rec = P.cached(holding.ticker);
    const series = (rec && rec.series) || [];
    const last = series.length ? series[series.length - 1] : null;
    const prev = series.length > 1 ? series[series.length - 2] : null;

    // A live intraday quote beats yesterday's close when we have one.
    const live = rec && rec.live && isFinite(rec.live.price) ? rec.live : null;
    const price = live ? live.price : (last ? last.c : 0);
    const refClose = live && isFinite(live.previousClose) ? live.previousClose
      : (prev ? prev.c : (last ? last.c : 0));

    const led = P.ledger(holding);
    const shares = led.shares;
    const cost = led.cost;
    const value = shares * price;
    const avg = shares > 0 ? cost / shares : 0;

    const dayChange = refClose ? price - refClose : 0;
    const dayPct = refClose ? (dayChange / refClose) * 100 : 0;

    return {
      holding, rec, series, price, shares, cost, value, avg,
      pl: value - cost,
      plPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
      realised: led.realised,
      totalPl: (value - cost) + led.realised,
      fees: led.fees,
      proceeds: led.proceeds,
      ledger: led.rows,
      dayChange, dayPct,
      dayValueChange: dayChange * shares,
      currency: (rec && rec.currency) || holding.currency || "USD",
      updated: (live && live.at) || (rec ? rec.updated : null),
      live: Boolean(live),
      stale: rec ? Boolean(rec.stale) : true,
      source: live ? "live" : (rec ? rec.source : null),
      lastDate: last ? last.d : null,
      marketState: live ? live.marketState : null
    };
  };

  /* What a sale would net, before you commit to it. */
  P.previewSell = function (holding, shares, price, fee) {
    const pos = P.position(holding);
    const n = Math.max(0, Math.min(Number(shares) || 0, pos.shares));
    const p = Number(price) || 0;
    const f = Number(fee) || 0;
    const basis = pos.avg * n;
    const gross = n * p;
    const net = gross - f;
    const gain = net - basis;
    return {
      shares: n, price: p, fee: f, basis, gross, net, gain,
      gainPct: basis > 0 ? (gain / basis) * 100 : 0,
      remaining: pos.shares - n,
      avg: pos.avg,
      currency: pos.currency,
      overSold: (Number(shares) || 0) > pos.shares
    };
  };

  P.sell = function (ticker, sale) {
    window.store.update(function (s) {
      const h = (s.portfolio.holdings || []).find((x) => x.ticker === ticker);
      if (!h) return;
      if (!h.sells) h.sells = [];
      h.sells.push({
        id: U.uid(), date: sale.date, shares: Number(sale.shares) || 0,
        price: Number(sale.price) || 0, fee: Number(sale.fee) || 0,
        note: sale.note || ""
      });
    });
  };

  P.removeHolding = function (ticker) {
    window.store.update(function (s) {
      s.portfolio.holdings = (s.portfolio.holdings || []).filter((h) => h.ticker !== ticker);
      delete s.prices[ticker];
    });
  };

  P.removeLot = function (ticker, lotId, kind) {
    window.store.update(function (s) {
      const h = (s.portfolio.holdings || []).find((x) => x.ticker === ticker);
      if (!h) return;
      const key = kind === "sell" ? "sells" : "lots";
      h[key] = (h[key] || []).filter((l) => l.id !== lotId);
    });
  };

  /* ----------------------------------------------------------- live quote */

  /* The chart endpoint carries a regularMarketPrice in its meta, so one
     request gets both the history and the intraday number. */
  P.fetchLive = async function (ticker) {
    const target = window.APP.yahooChart + encodeURIComponent(ticker) +
      "?range=1d&interval=5m&includePrePost=false";
    /* A direct call to Yahoo is blocked by CORS in every browser, and the
       browser logs a red console error before our catch ever runs. Only try
       it where there's no CORS enforcement to begin with. */
    const direct = typeof window.document === "undefined" || !window.location ||
      window.location.protocol === "file:";
    const attempts = (direct ? [null] : []).concat(window.APP.priceProxies);
    let lastErr;
    for (const prefix of attempts) {
      try {
        const url = prefix ? prefix + encodeURIComponent(target) : target;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status);
        const json = await res.json();
        const r = json && json.chart && json.chart.result && json.chart.result[0];
        if (!r) throw new Error("bad shape");
        const meta = r.meta || {};
        let price = meta.regularMarketPrice;
        if (price == null) {
          const closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] &&
            r.indicators.quote[0].close) || [];
          for (let k = closes.length - 1; k >= 0; k--) {
            if (closes[k] != null) { price = closes[k]; break; }
          }
        }
        if (price == null || !isFinite(price)) throw new Error("no price");
        const live = {
          price: Number(price),
          previousClose: meta.chartPreviousClose != null ? Number(meta.chartPreviousClose) : null,
          marketState: meta.marketState || null,
          at: new Date().toISOString()
        };
        window.store.update(function (s) {
          const rec = s.prices[ticker];
          if (rec) { rec.live = live; rec.currency = rec.currency || meta.currency; }
          else {
            s.prices[ticker] = {
              symbol: ticker, currency: meta.currency || "USD",
              name: meta.longName || meta.shortName || ticker,
              series: [], live: live, updated: live.at, source: "live"
            };
          }
        }, { silent: true });
        return live;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("live quote unavailable");
  };

  P.refreshLiveAll = async function () {
    const out = [], failed = [];
    for (const h of P.holdings()) {
      try { out.push(await P.fetchLive(h.ticker)); }
      catch (e) { failed.push(h.ticker); }
    }
    out.failed = failed;
    return out;
  };

  P.sliceSeries = function (series, range) {
    if (!series || !series.length) return [];
    if (range === "MAX") return series;
    const days = { "1M": 31, "3M": 93, "6M": 186, "1Y": 366, "5Y": 1830 }[range] || 366;
    const cutoff = U.addDays(U.today(), -days);
    const out = series.filter((p) => p.d >= cutoff);
    return out.length > 1 ? out : series.slice(-2);
  };

  window.Prices = P;
})();
