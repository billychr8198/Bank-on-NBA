/* ============================================================================
   FX service — live exchange rates from Yahoo Finance
   ----------------------------------------------------------------------------
   Yahoo quotes currency pairs as tickers: "USDIDR=X", "EURUSD=X".

   Everything is stored against USD as the pivot, so N currencies need N rates
   rather than N² pairs. Any pair is then derived:

       rate(A→B) = usdPer(B) ÷ usdPer(A)

   Rates are cached in the saved state and re-fetched when older than
   APP.fxStaleHours, so switching tabs doesn't hammer the relays.
   ========================================================================== */
(function () {
  "use strict";

  const F = {};
  const inflight = {};

  function S() { return window.store.state; }

  function bank() {
    const s = S();
    if (!s.fx) s.fx = { base: "USD", rates: {}, updated: null };
    return s.fx;
  }

  F.all = function () { return bank().rates || {}; };
  F.updatedAt = function () { return bank().updated; };

  F.hoursSinceUpdate = function () {
    const u = bank().updated;
    if (!u) return Infinity;
    const t = Date.parse(u);
    return isFinite(t) ? (Date.now() - t) / 3600000 : Infinity;
  };

  F.isStale = function () {
    return F.hoursSinceUpdate() > (window.APP.fxStaleHours || 12);
  };

  /* Units of `code` that one USD buys. USD is 1 by definition. */
  F.usdRate = function (code) {
    if (code === "USD") return 1;
    const r = bank().rates[code];
    return r && isFinite(r.rate) ? r.rate : null;
  };

  F.convert = function (amount, from, to) {
    const a = Number(amount) || 0;
    if (from === to) return a;
    const f = F.usdRate(from), t = F.usdRate(to);
    if (!f || !t) return null;
    return (a / f) * t;
  };

  F.pairRate = function (from, to) {
    if (from === to) return 1;
    const f = F.usdRate(from), t = F.usdRate(to);
    if (!f || !t) return null;
    return t / f;
  };

  F.has = function (code) { return code === "USD" || F.usdRate(code) != null; };

  /* ------------------------------------------------------------- fetching */

  /* All of these send Access-Control-Allow-Origin, so the browser calls them
     directly — no CORS relay anywhere in this path. One request returns every
     currency quoted against USD, so a full refresh is a single round trip
     rather than one per currency. */

  function parsePrimary(json) {
    // { "date": "2026-08-28", "usd": { "eur": 0.858, "idr": 17696.09, ... } }
    const table = json && json.usd;
    if (!table || typeof table !== "object") throw new Error("unexpected rate payload");
    const at = json.date ? new Date(json.date + "T00:00:00Z").toISOString()
      : new Date().toISOString();
    const out = {};
    Object.keys(table).forEach(function (k) {
      const code = k.toUpperCase();
      // The feed also carries crypto and metals; keep only real currencies.
      if (!window.CURRENCIES[code]) return;
      const v = Number(table[k]);
      if (isFinite(v) && v > 0) out[code] = { rate: v, at: at };
    });
    if (!Object.keys(out).length) throw new Error("no usable rates");
    return { rates: out, date: json.date || null };
  }

  function parseFrankfurter(json) {
    // { "amount":1, "base":"USD", "date":"2026-08-28", "rates": { "EUR":0.85, ... } }
    const table = json && json.rates;
    if (!table || typeof table !== "object") throw new Error("unexpected ECB payload");
    const at = json.date ? new Date(json.date + "T00:00:00Z").toISOString()
      : new Date().toISOString();
    const out = {};
    Object.keys(table).forEach(function (code) {
      if (!window.CURRENCIES[code]) return;
      const v = Number(table[code]);
      if (isFinite(v) && v > 0) out[code] = { rate: v, at: at };
    });
    if (!Object.keys(out).length) throw new Error("no usable rates");
    return { rates: out, date: json.date || null };
  }

  async function fetchTable() {
    let lastErr;
    for (const url of window.APP.fxSources) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status + " from " + url);
        return Object.assign(parsePrimary(await res.json()), { source: "currency-api" });
      } catch (e) { lastErr = e; }
    }
    for (const url of window.APP.fxFallbacks || []) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status + " from " + url);
        return Object.assign(parseFrankfurter(await res.json()), { source: "ecb" });
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("no rate source answered");
  }

  /* `codes` is accepted for call-site compatibility but ignored — a single
     request already returns everything, so there is nothing to narrow. */
  F.refresh = async function (codes, opts) {
    opts = opts || {};
    if (inflight.all && !opts.force) return inflight.all;

    const run = (async function () {
      const table = await fetchTable();
      window.store.update(function (s) {
        if (!s.fx) s.fx = { base: "USD", rates: {}, updated: null };
        Object.assign(s.fx.rates, table.rates);
        s.fx.updated = new Date().toISOString();
        s.fx.date = table.date;
        s.fx.source = table.source;
      }, { silent: opts.silent !== false });

      // Anything the feed didn't carry (ECB's short list, mostly).
      const missing = (window.CURRENCY_POPULAR || [])
        .filter((c) => c !== "USD" && !table.rates[c]);
      return { got: table.rates, failed: missing, source: table.source, date: table.date };
    })();

    inflight.all = run;
    try { return await run; } finally { delete inflight.all; }
  };

  F.source = function () { return bank().source || null; };
  F.rateDate = function () { return bank().date || null; };

  /* The GitHub Action commits data/prices/fx.json daily, so a fresh visitor
     has rates rendered before the first network call even returns. */
  F.fromSnapshot = async function () {
    const res = await fetch("data/prices/fx.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("fx snapshot " + res.status);
    const json = await res.json();
    if (!json || !json.rates || !Object.keys(json.rates).length) throw new Error("fx snapshot empty");
    window.store.update(function (s) {
      if (!s.fx) s.fx = { base: "USD", rates: {}, updated: null };
      Object.keys(json.rates).forEach(function (code) {
        const r = json.rates[code];
        // Never let a day-old snapshot overwrite a fresher live rate.
        const have = s.fx.rates[code];
        if (!have || !have.at || Date.parse(have.at) < Date.parse(json.updated || 0)) {
          s.fx.rates[code] = { rate: r.rate, previousClose: r.previousClose, at: json.updated };
        }
      });
      if (!s.fx.updated || Date.parse(s.fx.updated) < Date.parse(json.updated || 0)) {
        s.fx.updated = json.updated;
        s.fx.date = json.date || s.fx.date;
        s.fx.source = json.source || s.fx.source;
      }
    }, { silent: true });
    return json;
  };

  /* Called on boot — only goes to the network if the cache has gone cold. */
  F.ensure = async function () {
    if (!F.isStale()) return null;
    try { await F.fromSnapshot(); } catch (e) { /* no snapshot committed yet */ }
    if (!F.isStale()) return { got: F.all(), failed: [], source: "snapshot" };
    try { return await F.refresh(null, { silent: true }); }
    catch (e) { return null; }
  };

  window.FX = F;
})();
