/* PROGRESS — one screen that answers "how am I actually doing?" */
(function () {
  "use strict";
  const el = U.el;

  function reportCard(prog) {
    const grade = window.Game.grade(prog.consistency);
    const health = window.Game.leagueHealth(prog.momentum);

    return el("div", { class: "card" }, [
      el("div", { class: "card__head" }, [
        el("div", {}, [
          el("div", { class: "eyebrow", text: "Season report" }),
          el("div", { class: "card__title", style: "font-size:21px", text: "Day " + U.clamp(prog.elapsed, 0, 365) + " of 365" })
        ]),
        el("div", { style: "text-align:right" }, [
          el("div", { class: "figure", style: "color:var(--gold);font-size:26px", text: grade.g }),
          el("div", { class: "tiny muted", text: grade.note })
        ])
      ]),
      el("div", { class: "grid grid--4" }, [
        UI.metric("Consistency", U.pct(prog.consistency, 0), prog.loggedDays + " of " + prog.elapsed + " days logged",
          prog.consistency >= 80 ? "metric--good" : prog.consistency >= 50 ? "metric--warn" : "metric--bad"),
        UI.metric("Current streak", String(prog.streak), "personal best " + prog.best),
        UI.metric("League boost", "+" + prog.boostPct + "%", "one point per logged day"),
        UI.metric("League health", U.num(health, 0) + "/100", U.pct(window.Game.saturation(prog.momentum) * 100, 0) + " of maximum lift")
      ]),
      el("div", { style: "margin-top:16px" }, [
        el("div", { class: "row", style: "justify-content:space-between;margin-bottom:6px" }, [
          el("span", { class: "eyebrow", style: "margin:0", text: "Season completion" }),
          el("span", { class: "tiny muted", text: prog.daysRemaining + " days left" })
        ]),
        UI.bar(prog.elapsed / prog.total * 100, "gold", true)
      ])
    ]);
  }

  function indicatorTable(prog) {
    const ind = window.Game.indicators(prog.momentum);
    const rows = ind.rows.map(function (r) {
      return el("tr", {}, [
        el("td", {}, el("div", {}, [
          el("div", { class: "row row--tight" }, [
            el("i", { style: "width:8px;height:8px;border-radius:50%;background:" + r.def.accent + ";display:inline-block" }),
            el("span", { style: "font-weight:500", text: r.def.name })
          ]),
          el("div", { class: "tiny muted", style: "margin-top:2px", text: r.derived || r.def.unit })
        ])),
        el("td", { class: "num muted", text: U.num(r.base, r.def.dp) }),
        el("td", { class: "num", style: "font-family:var(--display);font-size:16px;color:" + r.def.accent, text: U.num(r.value, r.def.dp) }),
        el("td", { class: "num muted", text: U.num(r.max, r.def.dp) }),
        el("td", { class: "num pos", text: "+" + U.pct(r.liftPct, 1) }),
        el("td", { style: "min-width:96px" }, UI.bar(r.fill * 100, "gold"))
      ]);
    });

    return UI.card("League indicators", "Baseline is the real 2024-25 figure. Ceiling is what a single outstanding season could plausibly reach.",
      el("div", {}, [
        el("div", { class: "table-wrap" }, el("table", { class: "table" }, [
          el("thead", {}, el("tr", {}, [
            el("th", { text: "Indicator" }), el("th", { class: "num", text: "Baseline" }),
            el("th", { class: "num", text: "Now" }), el("th", { class: "num", text: "Ceiling" }),
            el("th", { class: "num", text: "Lift" }), el("th", { text: "Headroom used" })
          ])),
          el("tbody", {}, rows)
        ])),
        el("div", { class: "formula", style: "margin-top:15px", text:
          "value = baseline × ( 1 + maxLift × ( 1 − e^( −loggedDays ÷ 120 ) ) )" }),
        el("p", { class: "tiny muted", text:
          "Every logged day adds one point of momentum — the headline +1%. The exponential term is what keeps it honest: " +
          "at " + prog.loggedDays + " logged days you've captured " + U.pct(window.Game.saturation(prog.momentum) * 100, 1) +
          " of the available lift, and a flawless 365-day season tops out at 95.2%. Straight compounding would have multiplied league revenue by 37× instead." })
      ]));
  }

  function moneyCard() {
    const trend = window.Finance.monthlyTrend(6);
    const cur = window.Finance.plan(U.monthKey(U.today()));
    const currency = window.store.state.settings.currency;

    const avgIncome = trend.reduce((n, m) => n + m.income, 0) / trend.length;
    const avgSpend = trend.reduce((n, m) => n + m.expense, 0) / trend.length;
    const rate = avgIncome > 0 ? ((avgIncome - avgSpend) / avgIncome) * 100 : 0;

    const prog = window.Game.progress();
    const dailyAvg = prog.loggedDays > 0
      ? window.Finance.sum(window.store.state.tx.filter(window.Finance.isVariableSpend)) / prog.loggedDays : 0;

    return UI.card("Money trend", "Last six billing cycles",
      el("div", {}, [
        el("div", { class: "grid grid--4", style: "margin-bottom:16px" }, [
          UI.metric("Avg income", UI.money(avgIncome), "per cycle"),
          UI.metric("Avg spending", UI.money(avgSpend), "per cycle"),
          UI.metric("Savings rate", U.pct(rate, 0), "income kept", rate >= 20 ? "metric--good" : rate >= 0 ? "metric--warn" : "metric--bad"),
          UI.metric("Avg per logged day", UI.money(dailyAvg), "variable spending only")
        ]),
        window.Chart.columns(trend.map((m) => ({ label: m.label, a: m.income, b: m.expense })), { currency: currency }),
        el("div", { class: "legend-key", style: "margin-top:12px" }, [
          el("span", {}, [el("i", { style: "background:var(--green)" }), "Money in"]),
          el("span", {}, [el("i", { style: "background:var(--red)" }), "Money out"])
        ]),
        el("hr", { class: "divider" }),
        el("div", { class: "grid grid--3" }, [
          UI.metric("This cycle in", UI.money(cur.actualIncome), "of " + UI.money(cur.plannedIncome) + " planned"),
          UI.metric("This cycle out", UI.money(cur.totalSpent), UI.money(cur.variableSpent) + " variable"),
          UI.metric(cur.actualSurplus >= 0 ? "Net so far" : "Net shortfall", UI.money(Math.abs(cur.actualSurplus)),
            "actual in minus actual out", cur.actualSurplus >= 0 ? "metric--good" : "metric--bad")
        ])
      ]));
  }

  function topCategories() {
    const tx = window.store.state.tx.filter((t) => t.type === "expense");
    if (!tx.length) return UI.card("Spending mix", "All time", UI.empty("Nothing logged yet", "Categories show up once you record expenses."));
    const by = {};
    tx.forEach((t) => { by[t.category] = (by[t.category] || 0) + (Number(t.amount) || 0); });
    const rows = Object.keys(by).map((id) => ({ cat: U.category(id), v: by[id] }))
      .sort((a, b) => b.v - a.v).slice(0, 8);
    const total = rows.reduce((n, r) => n + r.v, 0);

    return UI.card("Spending mix", "All time, every category",
      el("div", {}, rows.map(function (r) {
        return el("div", { style: "margin-bottom:11px" }, [
          el("div", { class: "row", style: "justify-content:space-between;margin-bottom:4px" }, [
            el("span", { class: "tiny row row--tight" }, [
              el("span", { class: "tx__code", style: "width:34px;height:19px;font-size:11px;background:" + r.cat.color, text: r.cat.code }),
              r.cat.name
            ]),
            el("span", { class: "tiny muted", text: UI.money(r.v) + " · " + U.pct(r.v / total * 100, 0) })
          ]),
          el("div", { class: "bar" }, [
            el("div", { class: "bar__fill", style: "width:" + (r.v / rows[0].v * 100).toFixed(1) + "%;background:" + r.cat.color })
          ])
        ]);
      })));
  }

  function projection(prog) {
    const rate = prog.consistency / 100;
    const teamsLeft = 30 - prog.teams;
    const legendsLeft = 55 - prog.legends;

    // Streak-based unlocks need consecutive days, so a miss rate cuts deeper
    // than a simple average — the run has to restart.
    const effective = rate > 0 ? Math.pow(rate, 1.35) : 0;
    const daysNeeded = teamsLeft * 3 + legendsLeft * 5;
    const projectedDays = effective > 0 ? Math.ceil(daysNeeded / effective) : Infinity;
    const finishes = projectedDays <= prog.daysRemaining;

    const rows = [
      ["Franchises unlocked", prog.teams + " / 30", prog.teams / 30 * 100],
      ["Legends inducted", prog.legends + " / 55", prog.legends / 55 * 100],
      ["Season elapsed", U.clamp(prog.elapsed, 0, 365) + " / 365", prog.elapsed / 365 * 100]
    ];

    return UI.card("Projection", "Where this season lands if you keep the current habit",
      el("div", {}, [
        el("div", {}, rows.map(function (r) {
          return el("div", { style: "margin-bottom:12px" }, [
            el("div", { class: "row", style: "justify-content:space-between;margin-bottom:4px" }, [
              el("span", { class: "tiny", text: r[0] }),
              el("span", { class: "tiny muted", text: r[1] })
            ]),
            UI.bar(r[2], "gold")
          ]);
        })),
        el("hr", { class: "divider" }),
        prog.complete
          ? el("p", { class: "pos", text: "Everything is unlocked. All 30 franchises, all 55 legends." })
          : el("div", {}, [
            el("p", { class: "tiny muted", text:
              "You need " + daysNeeded + " more logged days to finish the collection — " + teamsLeft + " franchises at 3 days and " +
              legendsLeft + " legends at 5. Because both phases need *consecutive* days, a missed day costs more than one day of progress." }),
            el("p", { class: (finishes ? "pos" : "warn"), style: "font-size:14px", text: prog.consistency <= 0
              ? "Log your first day to start the projection."
              : finishes
                ? "At " + U.pct(prog.consistency, 0) + " consistency you'd finish in roughly " + projectedDays + " days — inside the season with " +
                  (prog.daysRemaining - projectedDays) + " to spare."
                : "At " + U.pct(prog.consistency, 0) + " consistency this takes about " + (isFinite(projectedDays) ? projectedDays : "∞") +
                  " days, which overruns the season by " + (isFinite(projectedDays) ? projectedDays - prog.daysRemaining : "—") +
                  ". Tightening the streak is worth more than any single big entry." })
          ])
      ]));
  }

  function timeline(prog) {
    const recent = prog.unlockLog.slice().reverse().slice(0, 12);
    if (!recent.length) return UI.card("Unlock history", null,
      UI.empty("Nothing unlocked yet", "Three consecutive logged days frees your first franchise."));

    return UI.card("Unlock history", prog.unlockLog.length + " earned so far",
      el("div", {}, recent.map(function (u) {
        const isTeam = u.kind === "team";
        return el("div", { class: "list-row" }, [
          el("div", { style: "flex:none;width:40px;height:40px;display:flex;align-items:center;justify-content:center" }, [
            el("img", {
              src: isTeam ? u.item.logo : u.item.portrait, alt: "", loading: "lazy",
              style: "max-width:40px;max-height:40px;object-fit:" + (isTeam ? "contain" : "cover") + ";border-radius:" + (isTeam ? "0" : "3px")
            })
          ]),
          el("div", { style: "flex:1 1 auto;min-width:0" }, [
            el("div", { style: "font-weight:500", text: u.item.name }),
            el("div", { class: "tiny muted", text: isTeam
              ? u.item.division + " Division · " + u.item.titles + (u.item.titles === 1 ? " title" : " titles")
              : "Tier " + u.item.tier + " · " + u.item.overall + " OVR" })
          ]),
          el("div", { style: "text-align:right;flex:none" }, [
            el("div", { class: "tiny", text: "Day " + u.day }),
            el("div", { class: "tiny muted", text: U.prettyDate(u.date) })
          ])
        ]);
      })));
  }

  window.Views = window.Views || {};
  window.Views.progress = function () {
    const prog = window.Game.progress();
    return el("div", { class: "stack" }, [
      reportCard(prog),
      indicatorTable(prog),
      el("div", { class: "grid grid--2" }, [moneyCard(), topCategories()]),
      el("div", { class: "grid grid--2" }, [projection(prog), timeline(prog)])
    ]);
  };
})();
