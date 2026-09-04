/* ============================================================================
   Game engine
   ----------------------------------------------------------------------------
   A day counts as LOGGED when at least one transaction carries that date.

   Boost      every logged day adds +1.00% of momentum.
   Indicators value = baseline × (1 + maxLift × (1 − e^(−momentum ÷ 120))).
              Diminishing returns, so a perfect 365-day season reaches 95.2%
              of each indicator's realistic annual ceiling instead of
              compounding to something absurd.
   Unlocks    Phase 1 — every 3 consecutive logged days frees one franchise
                        (30 teams × 3 = 90 days).
              Phase 2 — every 5 consecutive logged days inducts one legend,
                        Tier 5 up to Tier 1 (55 players × 5 = 275 days).
              90 + 275 = 365. Michael Jordan lands on the final day.
   ========================================================================== */
(function () {
  "use strict";

  const G = {};
  const S = () => window.store.state;

  G.seasonStart = function () { return S().settings.startDate || U.today(); };
  G.seasonEnd = function () { return U.addDays(G.seasonStart(), window.APP.seasonLength - 1); };

  G.seasonDay = function (date) {                 // 1-based; 0 means before tip-off
    const n = U.diffDays(G.seasonStart(), date || U.today()) + 1;
    return n;
  };

  G.loggedSet = function () {
    const set = Object.create(null);
    S().tx.forEach(function (t) { if (t.date) set[t.date] = true; });
    return set;
  };

  /* Replays the whole season every time it runs. Unlocks are therefore always
     a pure function of the ledger — editing or deleting a transaction corrects
     the collection instead of leaving orphaned rewards behind. */
  G.progress = function () {
    const start = G.seasonStart();
    const today = U.today();
    const logged = G.loggedSet();
    const total = window.APP.seasonLength;
    const p1 = window.APP.phase1, p2 = window.APP.phase2;

    const elapsed = U.clamp(U.diffDays(start, today) + 1, 0, total);
    let teams = 0, legends = 0, run = 0, counter = 0;
    let loggedDays = 0, missedDays = 0, streak = 0, best = 0;
    const unlockLog = [];
    const days = [];

    for (let i = 0; i < total; i++) {
      const date = U.addDays(start, i);
      const future = date > today;
      const isLogged = !future && !!logged[date];
      let unlockedHere = null;

      if (!future) {
        if (isLogged) {
          loggedDays++; run++; counter++;
          if (run > best) best = run;
          const phase = teams < p1.target ? 1 : 2;
          const need = phase === 1 ? p1.streak : p2.streak;
          if (counter >= need) {
            counter = 0;
            if (phase === 1) {
              const t = window.NBA_TEAMS[teams];
              teams++;
              unlockedHere = { kind: "team", item: t, date: date, day: i + 1 };
            } else if (legends < p2.target) {
              const l = window.NBA_LEGENDS[legends];
              legends++;
              unlockedHere = { kind: "legend", item: l, date: date, day: i + 1 };
            }
            if (unlockedHere) unlockLog.push(unlockedHere);
          }
        } else {
          missedDays++; run = 0; counter = 0;
        }
      }
      days.push({ date: date, day: i + 1, logged: isLogged, future: future, unlock: unlockedHere });
    }
    streak = run;

    const phase = teams < p1.target ? 1 : 2;
    const need = phase === 1 ? p1.streak : p2.streak;
    const nextItem = phase === 1
      ? window.NBA_TEAMS[teams]
      : (legends < p2.target ? window.NBA_LEGENDS[legends] : null);

    const momentum = loggedDays;                      // 1 point = +1%
    return {
      start, today, total, elapsed,
      loggedDays, missedDays,
      streak, best,
      teams, legends,
      phase, need,
      towardNext: counter,
      untilNext: nextItem ? need - counter : 0,
      nextItem: nextItem,
      nextKind: phase === 1 ? "team" : "legend",
      unlockLog, days,
      momentum: momentum,
      boostPct: momentum,                              // headline "+N%"
      consistency: elapsed > 0 ? (loggedDays / elapsed) * 100 : 0,
      daysRemaining: Math.max(0, total - elapsed),
      complete: teams >= p1.target && legends >= p2.target
    };
  };

  /* ------------------------------------------------------------ indicators */

  G.saturation = function (momentum) {
    return 1 - Math.exp(-(Number(momentum) || 0) / window.APP.saturationTau);
  };

  G.indicators = function (momentum) {
    const s = G.saturation(momentum);
    const rows = window.APP.indicators.map(function (def) {
      let value = def.base * (1 + def.gmax * s);
      if (def.cap != null) value = Math.min(def.cap, value);
      const max = def.cap != null
        ? Math.min(def.cap, def.base * (1 + def.gmax))
        : def.base * (1 + def.gmax);
      return {
        def: def,
        value: value,
        base: def.base,
        max: max,
        lift: value - def.base,
        liftPct: def.base ? ((value - def.base) / def.base) * 100 : 0,
        fill: max > def.base ? U.clamp((value - def.base) / (max - def.base), 0, 1) : 0
      };
    });

    const by = {};
    rows.forEach((r) => { by[r.def.id] = r; });

    // Cross-referenced readouts — these are what make the numbers legible.
    const games = window.APP.gamesPerSeason;
    by.viewership.derived = U.num(by.viewership.value * games / 1000, 2) +
      "B cumulative national impressions";
    by.tickets.derived = U.num(by.tickets.value * 1e6 / games, 0) + " average attendance per game";
    by.popularity.derived = "Global fan sentiment " +
      (by.popularity.value >= 85 ? "at a generational high" :
        by.popularity.value >= 78 ? "climbing fast" : "growing steadily");
    /* Extra rights holders overlap in markets already covered, so reach
       approaches a real-world ceiling rather than scaling with partner count —
       a linear multiple would claim more countries than exist. */
    const c0 = window.APP.countriesAtBaseline;
    const cMax = window.APP.countriesCeiling;
    by.broadcasters.derived = "≈ " + Math.round(c0 + (cMax - c0) * s) +
      " countries and territories reached";
    by.revenue.derived = "$" + U.num(by.revenue.value * 1e9 / (by.tickets.value * 1e6), 0) +
      " revenue per ticket sold";

    return { rows: rows, by: by, saturation: s };
  };

  /* A single 0-100 read on how the league is doing under your stewardship. */
  G.leagueHealth = function (momentum) {
    return 50 + 50 * G.saturation(momentum);
  };

  G.grade = function (consistency) {
    if (consistency >= 95) return { g: "MVP", note: "Unanimous" };
    if (consistency >= 85) return { g: "All-NBA", note: "First team" };
    if (consistency >= 70) return { g: "All-Star", note: "Starter" };
    if (consistency >= 55) return { g: "Starter", note: "Rotation locked" };
    if (consistency >= 35) return { g: "Bench", note: "Minutes available" };
    if (consistency > 0) return { g: "G League", note: "Call-up pending" };
    return { g: "Draft", note: "Not yet declared" };
  };

  /* --------------------------------------------------------- collections -- */

  G.teamState = function (progress) {
    return window.NBA_TEAMS.map(function (t, i) {
      const unlocked = i < progress.teams;
      const entry = unlocked ? progress.unlockLog.find((u) => u.kind === "team" && u.item.id === t.id) : null;
      return {
        item: t, unlocked: unlocked, index: i,
        unlockedOn: entry ? entry.date : null,
        daysAway: unlocked ? 0 : (i - progress.teams) * window.APP.phase1.streak + progress.untilNext
      };
    });
  };

  G.legendState = function (progress) {
    return window.NBA_LEGENDS.map(function (l, i) {
      const unlocked = i < progress.legends;
      const entry = unlocked ? progress.unlockLog.find((u) => u.kind === "legend" && u.item.id === l.id) : null;
      const teamsLeft = Math.max(0, window.APP.phase1.target - progress.teams);
      const daysAway = teamsLeft > 0
        ? teamsLeft * window.APP.phase1.streak - progress.towardNext + (i + 1) * window.APP.phase2.streak
        : (i - progress.legends) * window.APP.phase2.streak + progress.untilNext;
      return {
        item: l, unlocked: unlocked, index: i,
        unlockedOn: entry ? entry.date : null,
        daysAway: unlocked ? 0 : daysAway
      };
    });
  };

  /* New unlocks the user hasn't been shown yet — drives the celebration. */
  G.pendingCelebrations = function (progress) {
    const seen = S().game.seen || {};
    return progress.unlockLog.filter(function (u) {
      return !seen[u.kind + ":" + u.item.id];
    });
  };

  G.markSeen = function (list) {
    if (!list.length) return;
    window.store.update(function (s) {
      s.game.seen = s.game.seen || {};
      list.forEach((u) => { s.game.seen[u.kind + ":" + u.item.id] = Date.now(); });
    }, { silent: true });
  };

  window.Game = G;
})();
