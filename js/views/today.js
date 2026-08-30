/* TODAY — the jumbotron plus everything the daily brief needs. */
(function () {
  "use strict";
  const el = U.el;

  function courtArc() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 600 300");
    svg.setAttribute("class", "court-arc");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML =
      '<g fill="none" stroke="rgba(236,230,218,.16)" stroke-width="1.5">' +
      '<circle cx="300" cy="150" r="58"/>' +
      '<path d="M60 300 L60 150 A240 240 0 0 1 540 150 L540 300"/>' +
      '<rect x="216" y="150" width="168" height="150"/>' +
      '</g>';
    return svg;
  }

  function jumbotron(prog, ind) {
    const health = window.Game.leagueHealth(prog.momentum);
    const leds = el("div", { class: "leds" }, ind.rows.map(function (r) {
      return el("div", { class: "led" }, [
        el("div", { class: "led__label" }, [
          el("i", { style: "background:" + r.def.accent }),
          r.def.short
        ]),
        el("div", { class: "led__val", style: "color:" + r.def.accent, text: U.num(r.value, r.def.dp) }),
        el("div", { class: "led__unit", text: r.def.unit }),
        el("div", { class: "led__bar" }, [
          el("div", { class: "led__fill", style: "width:" + (r.fill * 100).toFixed(1) + "%;background:" + r.def.accent })
        ]),
        el("div", { class: "led__delta", text: (r.liftPct >= 0 ? "+" : "") + U.pct(r.liftPct, 1) + " vs baseline" })
      ]);
    }));

    return el("div", { class: "jumbo" }, [
      courtArc(),
      el("div", { class: "jumbo__top" }, [
        el("div", {}, [
          el("div", { class: "jumbo__season", text: prog.elapsed > prog.total ? "Season complete" : "Season day" }),
          el("div", { class: "jumbo__day" }, [
            String(U.clamp(prog.elapsed, 0, prog.total)),
            el("small", { text: "/ " + prog.total })
          ]),
          el("div", { class: "tiny muted", style: "margin-top:2px", text: U.longDate(U.today()) })
        ]),
        el("div", { class: "jumbo__boost" }, [
          el("div", { class: "jumbo__season", text: "League boost" }),
          el("div", { class: "jumbo__boostval", text: "+" + prog.boostPct + "%" }),
          el("div", { class: "tiny muted", text: prog.loggedDays + " days logged · health " + U.num(health, 0) + "/100" })
        ])
      ]),
      leds
    ]);
  }

  function todayCard(day, prog) {
    const pct = day.budget > 0 ? (day.spent / day.budget) * 100 : 0;
    const over = day.remaining < 0;
    const variant = pct > 100 ? "red" : pct > 80 ? "gold" : "green";

    return UI.card("Today's budget", U.dayName(day.date) + " · week " + U.prettyDate(day.week.start) + " → " + U.prettyDate(day.week.end),
      el("div", {}, [
        el("div", { class: "row", style: "align-items:baseline;gap:12px;margin-bottom:10px" }, [
          el("div", { class: "figure", style: "font-size:42px;color:" + (over ? "var(--red)" : "var(--chalk)"), text: UI.money(day.remaining) }),
          el("div", { class: "muted tiny", text: over ? "over today's slice" : "left to spend today" })
        ]),
        UI.bar(pct, variant, true),
        el("div", { class: "row", style: "margin-top:9px;justify-content:space-between" }, [
          el("span", { class: "tiny muted", text: "Spent " + UI.money(day.spent) + " of " + UI.money(day.budget) }),
          el("span", { class: "tiny muted", text: day.week.daysLeftIncl + (day.week.daysLeftIncl === 1 ? " day" : " days") + " left this week" })
        ]),
        el("div", { class: "grid grid--3", style: "margin-top:14px" }, [
          UI.metric("This week left", UI.money(day.week.remaining),
            "of " + UI.money(day.week.ceiling) + " ceiling",
            day.week.remaining < 0 ? "metric--bad" : "metric--good"),
          UI.metric("Balance on hand", UI.money(window.Finance.balance()),
            "across all accounts"),
          UI.metric("Logged today", day.logged ? "Yes" : "Not yet",
            day.logged ? day.tx.length + " " + (day.tx.length === 1 ? "entry" : "entries") + " · streak " + prog.streak
              : "Log one entry to keep the streak alive",
            day.logged ? "metric--good" : "metric--warn")
        ])
      ]));
  }

  function nextUnlockCard(prog) {
    if (prog.complete) {
      return UI.card("Collection complete", "Every franchise and all 55 legends",
        el("div", { class: "empty" }, [
          el("div", { class: "empty__title", text: "You ran the whole season" }),
          el("div", { class: "tiny", text: "365 days, 30 teams, 55 legends. Nothing left locked." })
        ]));
    }

    const item = prog.nextItem;
    const isTeam = prog.nextKind === "team";
    const pips = el("div", { class: "pips" },
      Array.from({ length: prog.need }, function (_, i) {
        return el("i", { class: "pip" + (i < prog.towardNext ? " is-on" : "") });
      }));

    return UI.card("Next unlock", prog.phase === 1
      ? "Phase 1 · " + window.APP.phase1.label + " · every 3-day streak frees a franchise"
      : "Phase 2 · " + window.APP.phase2.label + " · every 5-day streak inducts a legend",
      el("div", { class: "row", style: "gap:16px;align-items:center" }, [
        el("div", { style: "flex:none;width:78px;height:78px;display:flex;align-items:center;justify-content:center" }, [
          el("img", {
            src: isTeam ? item.logo : item.portrait, alt: "",
            style: "max-width:78px;max-height:78px;object-fit:" + (isTeam ? "contain" : "cover") +
              ";border-radius:" + (isTeam ? "0" : "4px") + ";filter:grayscale(1) brightness(.3) contrast(1.4)"
          })
        ]),
        el("div", { style: "flex:1 1 200px;min-width:0" }, [
          el("div", { class: "eyebrow", text: isTeam ? item.division + " Division" : "Tier " + item.tier + " · " + item.tierName }),
          el("div", { class: "card__title", style: "font-size:19px", text: item.name }),
          el("div", { class: "tiny muted", style: "margin:7px 0 9px", text:
            prog.untilNext + " more consecutive " + (prog.untilNext === 1 ? "day" : "days") +
            " · " + prog.towardNext + "/" + prog.need + " banked" }),
          pips
        ])
      ]));
  }

  function ledger(day) {
    const body = day.tx.length
      ? el("div", {}, day.tx.map((t) => UI.txRow(t)))
      : UI.empty("Nothing logged yet today",
        "One entry keeps your streak alive and adds +1% to every league indicator.",
        el("button", { class: "btn", text: "Log the first entry", onclick: () => UI.quickAdd({ date: day.date }) }));

    const totals = day.tx.length ? el("div", { class: "row", style: "margin-top:12px;gap:18px" }, [
      el("span", { class: "tiny muted" }, ["In ", el("b", { class: "pos", text: UI.money(day.income) })]),
      el("span", { class: "tiny muted" }, ["Out ", el("b", { class: "neg", text: UI.money(day.allOut) })]),
      el("span", { class: "tiny muted" }, ["Net ", el("b", { class: day.income - day.allOut >= 0 ? "pos" : "neg", text: UI.money(day.income - day.allOut) })])
    ]) : null;

    return UI.card("Today's ledger", U.longDate(day.date),
      el("div", {}, [body, totals]),
      el("button", { class: "icon-btn", text: "+ Add", onclick: () => UI.quickAdd({ date: day.date }) }));
  }

  window.Views = window.Views || {};
  window.Views.today = function () {
    const prog = window.Game.progress();
    const ind = window.Game.indicators(prog.momentum);
    const day = window.Finance.day(U.today());

    const wrap = el("div", { class: "stack" });
    wrap.appendChild(jumbotron(prog, ind));

    if (prog.elapsed <= 0) {
      wrap.appendChild(UI.card("Season hasn't tipped off", "Your start date is " + U.longDate(prog.start),
        el("p", { class: "muted", text: "Change the start date in Settings if you want to begin today." })));
    }

    wrap.appendChild(el("div", { class: "grid grid--2" }, [
      todayCard(day, prog),
      nextUnlockCard(prog)
    ]));

    wrap.appendChild(el("div", { class: "card" }, [
      el("div", { class: "card__head" }, [
        el("div", {}, [
          el("div", { class: "card__title", text: "Quick entry" }),
          el("div", { class: "card__note", text: "Amount, category, method, note — that's the whole ritual." })
        ])
      ]),
      UI.entryForm({ date: U.today() })
    ]));

    wrap.appendChild(ledger(day));
    return wrap;
  };
})();
