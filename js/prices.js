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
  /* The committed snapshot is the only source that can't be blocked: it's
     served from the same origin as the page. Refresh re-reads it with a
     cache-buster so a newer commit is picked up immediately. */
  async function fromSnapshot(ticker, bust) {
    const url = "data/prices/" + encodeURIComponent(ticker) + ".json" +
      (bust ? "?t=" + Date.now() : "");
    const res = await fetch(url, { cache: bust ? "reload" : "no-cache" });
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

  /* Relays were tried one after another with no timeout, so a single hung
     proxy could stall the whole refresh for a minute before the next one was
     even attempted. Race them instead: first valid answer wins, each capped
     at `ms`, and the browser stops waiting on the losers. */
  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        reject(new Error((label || "request") + " timed out after " + (ms / 1000) + "s"));
      }, ms);
      promise.then(
        function (v) { clearTimeout(timer); resolve(v); },
        function (e) { clearTimeout(timer); reject(e); }
      );
    });
  }

  async function viaRelay(prefix, target, parse, ms) {
    const url = prefix + encodeURIComponent(target);
    const res = await withTimeout(fetch(url, { cache: "no-store" }), ms || 9000, host(prefix));
    if (!res.ok) throw new Error(res.status + " from " + host(prefix));
    /* Some relays answer 200 with an HTML error page. Read as text and parse
       ourselves so a wrong content-type doesn't masquerade as a data problem. */
    const body = await res.text();
    let json;
    try { json = JSON.parse(body); }
    catch (e) { throw new Error(host(prefix) + " returned non-JSON (" + body.slice(0, 40).replace(/\s+/g, " ") + "…)"); }
    return parse(json);
  }

  function host(u) {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "relay"; }
  }
  P.host = host;

  /* Races every relay; resolves with the first success, and if all fail
     rejects with a message naming what each one actually did. */
  async function raceRelays(target, parse, ms) {
    const proxies = window.APP.priceProxies || [];
    if (!proxies.length) throw new Error("no relays configured");
    const failures = [], errs = [];
    return new Promise(function (resolve, reject) {
      let settled = false, left = proxies.length;
      proxies.forEach(function (prefix) {
        viaRelay(prefix, target, parse, ms).then(function (v) {
          if (!settled) { settled = true; resolve(v); }
        }, function (e) {
          failures.push(host(prefix) + ": " + e.message);
          errs.push(e);
          if (--left === 0 && !settled) {
            /* If every relay independently reported the symbol as unknown,
               that's Yahoo's verdict on the ticker, not a network problem —
               and the two need completely different messages to the user. */
            const allNotFound = errs.length > 0 && errs.every((x) => x && x.notFound);
            const err = new Error(allNotFound
              ? errs[0].message
              : "every relay failed — " + failures.join("; "));
            err.notFound = allNotFound;
            err.failures = failures;
            reject(err);
          }
        });
      });
    });
  }

  async function fromRelay(ticker) {
    return raceRelays(yahooUrl(ticker), function (json) {
      return parseYahoo(ticker, json);
    });
  }

  /* ---------------------------------------------------------------- public */

  /* Always reads the committed snapshot first — it's same-origin, so it can't
     be blocked by CORS, a relay outage or Yahoo rate-limiting. Only then does
     it try for something fresher. The returned record carries `outcome` so the
     UI can say what actually happened instead of guessing. */
  P.fetch = async function (ticker, opts) {
    opts = opts || {};
    if (inflight[ticker] && !opts.force) return inflight[ticker];

    const run = (async function () {
      const cached = P.cached(ticker);
      let snap = null, snapErr = null;
      try { snap = await fromSnapshot(ticker, opts.force); }
      catch (e) { snapErr = e; }

      // Fresh committed data and no explicit refresh: nothing more to do.
      if (snap && !P.isStale(snap) && !opts.force) {
        snap.outcome = "snapshot";
        save(ticker, snap);
        return snap;
      }

      try {
        const live = await fromRelay(ticker);
        if (snap && snap.series.length > live.series.length) {
          live.series = mergeSeries(snap.series, live.series);
        }
        live.outcome = "live";
        save(ticker, live);
        return live;
      } catch (e) {
        // The live attempt failed. Fall back, and record why.
        if (snap) {
          snap.stale = P.isStale(snap);
          snap.outcome = "snapshot-fallback";
          snap.liveError = e.message;
          save(ticker, snap);
          return snap;
        }
        if (cached) {
          cached.stale = true;
          cached.outcome = "cache-fallback";
          cached.liveError = e.message;
          return cached;
        }
        const err = new Error(
          snapErr
            ? "No committed snapshot for " + ticker + " yet, and the live feed didn't answer. " + e.message
            : e.message
        );
        err.ticker = ticker;
        err.liveError = e.message;
        err.snapshotError = snapErr ? snapErr.message : null;
        throw err;
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
  /* Reports three outcomes rather than two: got fresh data, fell back to the
     committed snapshot, or has nothing at all. "Fell back" is not a failure —
     the chart still works — and shouldn't be reported as one. */
  P.refreshAll = async function (opts) {
    const results = await Promise.all(P.holdings().map(function (h) {
      return P.fetch(h.ticker, opts).then(
        function (rec) { return { ticker: h.ticker, rec: rec, outcome: rec.outcome || "snapshot" }; },
        function (e) { return { ticker: h.ticker, error: e, outcome: "none" }; }
      );
    }));
    const out = results.filter((r) => r.rec).map((r) => r.rec);
    out.live = results.filter((r) => r.outcome === "live").map((r) => r.ticker);
    out.fellBack = results.filter((r) => r.outcome === "snapshot-fallback" || r.outcome === "cache-fallback").map((r) => r.ticker);
    out.failed = results.filter((r) => r.outcome === "none").map((r) => r.ticker);
    out.errors = results.filter((r) => r.error).map((r) => r.ticker + ": " + r.error.message);
    out.results = results;
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

    const live = await raceRelays(target, function (json) {
      const r = json && json.chart && json.chart.result && json.chart.result[0];
      if (!r) {
        // Yahoo reports a genuinely unknown symbol here — worth distinguishing
        // from a network failure, because the fixes are completely different.
        const desc = json && json.chart && json.chart.error &&
          (json.chart.error.description || json.chart.error.code);
        throw new Error(desc ? "Yahoo says: " + desc : "unexpected response shape");
      }
      const meta = r.meta || {};
      let price = meta.regularMarketPrice;
      if (price == null) {
        const closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] &&
          r.indicators.quote[0].close) || [];
        for (let k = closes.length - 1; k >= 0; k--) {
          if (closes[k] != null) { price = closes[k]; break; }
        }
      }
      if (price == null || !isFinite(price)) throw new Error("no price in response");
      return {
        price: Number(price),
        previousClose: meta.chartPreviousClose != null ? Number(meta.chartPreviousClose) : null,
        marketState: meta.marketState || null,
        currency: meta.currency || null,
        name: meta.longName || meta.shortName || null,
        exchange: meta.fullExchangeName || null,
        at: new Date().toISOString()
      };
    }, 8000);

    window.store.update(function (s) {
      const rec = s.prices[ticker];
      if (rec) { rec.live = live; rec.currency = rec.currency || live.currency; }
      else {
        s.prices[ticker] = {
          symbol: ticker, currency: live.currency || "USD",
          name: live.name || ticker, series: [], live: live,
          updated: live.at, source: "live"
        };
      }
    }, { silent: true });
    return live;
  };

  /* Looks up a ticker's identity without committing to anything — used to
     auto-fill the Add-investment form and to tell a wrong symbol apart from
     an unreachable feed. */
  P.lookup = async function (ticker) {
    const target = window.APP.yahooChart + encodeURIComponent(ticker) +
      "?range=5d&interval=1d";
    return raceRelays(target, function (json) {
      const r = json && json.chart && json.chart.result && json.chart.result[0];
      if (!r) {
        const desc = json && json.chart && json.chart.error &&
          (json.chart.error.description || json.chart.error.code);
        const err = new Error(desc || "symbol not found");
        err.notFound = true;
        throw err;
      }
      const meta = r.meta || {};
      return {
        ticker: ticker,
        name: meta.longName || meta.shortName || "",
        currency: meta.currency || "",
        exchange: meta.fullExchangeName || "",
        price: meta.regularMarketPrice != null ? Number(meta.regularMarketPrice) : null
      };
    }, 8000);
  };

  /* Probes each source independently so a failure can be seen rather than
     guessed at. Powers the Connection check panel. */
  P.diagnose = async function (ticker) {
    const t = ticker || (P.holdings()[0] || {}).ticker || "BBCA.JK";
    const checks = [];

    const started = Date.now();
    try {
      await fromSnapshot(t, true);
      checks.push({ name: "Committed snapshot", detail: "data/prices/" + t + ".json",
        ok: true, ms: Date.now() - started, note: "same-origin, cannot be blocked" });
    } catch (e) {
      checks.push({ name: "Committed snapshot", detail: "data/prices/" + t + ".json",
        ok: false, ms: Date.now() - started,
        note: "Run the GitHub Action once to create it." , error: e.message });
    }

    for (const prefix of (window.APP.priceProxies || [])) {
      const t0 = Date.now();
      try {
        await viaRelay(prefix, yahooUrl(t, "5d"), function (json) {
          const r = json && json.chart && json.chart.result && json.chart.result[0];
          if (!r) throw new Error("no chart data in reply");
          return true;
        }, 9000);
        checks.push({ name: "Relay · " + host(prefix), ok: true, ms: Date.now() - t0 });
      } catch (e) {
        checks.push({ name: "Relay · " + host(prefix), ok: false, ms: Date.now() - t0, error: e.message });
      }
    }

    const t1 = Date.now();
    try {
      await window.FX.refresh(null, { force: true, silent: true });
      checks.push({ name: "Exchange rates", ok: true, ms: Date.now() - t1, note: "direct, no relay" });
    } catch (e) {
      checks.push({ name: "Exchange rates", ok: false, ms: Date.now() - t1, error: e.message });
    }

    return checks;
  };

  P.refreshLiveAll = async function () {
    const results = await Promise.all(P.holdings().map(function (h) {
      return P.fetchLive(h.ticker).then(
        function (v) { return { ok: true, v: v }; },
        function (e) { return { ok: false, ticker: h.ticker, error: e.message }; }
      );
    }));
    const out = results.filter((r) => r.ok).map((r) => r.v);
    out.failed = results.filter((r) => !r.ok).map((r) => r.ticker);
    out.errors = results.filter((r) => !r.ok).map((r) => r.ticker + ": " + r.error);
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
