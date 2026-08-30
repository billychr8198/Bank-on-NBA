/* WEEKLY — safe-to-spend, the 7-day countdown, and variable-category tagging. */
(function () {
  "use strict";
  const el = U.el;
  let offset = 0;                     // 0 = current week, −1 = last week…

  function header(week, prog) {
    return el("div", { class: "card" }, [
      el("div", { class: "card__head" }, [
        el("div", {}, [
          el("div", { class: "eyebrow", text: offset === 0 ? "Current week" : offset < 0 ? Math.abs(offset) + " week(s) back" : "Ahead" }),
          el("div", { class: "card__title", style: "font-size:20px", text: U.prettyDate(week.start) + " → " + U.prettyDate(week.end) })
        ]),
        el("div", { class: "seg" }, [
          el("button", { text: "‹", onclick: function () { offset--; window.App.render(); } }),
          el("button", { text: "This week", class: offset === 0 ? "is-on" : "", onclick: function () { offset = 0; window.App.render(); } }),
          el("button", { text: "›", onclick: function () { offset++; window.App.render(); } })
        ])
      ]),
      el("div", { class: "row", style: "align-items:baseline;gap:12px;margin-bottom:11px" }, [
        el("div", { class: "figure", style: "font-size:44px;color:" + (week.remaining < 0 ? "var(--red)" : "var(--chalk)"), text: UI.money(week.remaining) }),
        el("div", { class: "muted tiny", text: week.remaining < 0 ? "over the 7-day ceiling" : "safe to spend for the rest of the week" })
      ]),
      UI.bar(week.ceiling > 0 ? (week.spent / week.ceiling) * 100 : 0,
        week.spent > week.ceiling ? "red" : week.spent > week.onPace ? "gold" : "green", true),
      el("div", { class: "row", style: "justify-content:space-between;margin-top:8px" }, [
        el("span", { class: "tiny muted", text: "Spent " + UI.money(week.spent) + " of " + UI.money(week.ceiling) }),
        el("span", { class: "tiny", style: "color:" + (week.spent > week.onPace ? "var(--gold)" : "var(--green)"),
          text: week.spent > week.onPace
            ? UI.money(week.spent - week.onPace) + " ahead of pace"
            : UI.money(week.onPace - week.spent) + " under pace" })
      ]),
      el("div", { class: "grid grid--4", style: "margin-top:15px" }, [
        UI.metric("Per day left", UI.money(week.perDay), week.daysLeftIncl + " days to cover"),
        UI.metric("Days elapsed", week.daysElapsed + " / 7", week.daysLeft + " remaining"),
        UI.metric("Weeks left in cycle", String(week.weeksLeftInCycle), "cycle ends " + U.prettyDate(week.cycle.end)),
        UI.metric("Variable pool", UI.money(window.Finance.plan(week.cycle.key).variablePool), "after fixed, funds & goals")
      ])
    ]);
  }

  function dayStrip(week) {
    const max = Math.max(1, week.ceiling / 7 * 1.8, ...week.byDay.map((d) => d.spent));
    return UI.card("Daily burn", "Each bar against the even-pace line (" + UI.money(week.ceiling / 7) + "/day)",
      el("div", {}, [
        el("div", { class: "cols", style: "height:130px" }, week.byDay.map(function (d) {
          const isToday = d.date === U.today();
          return el("div", { class: "cols__item" }, [
            el("div", { class: "cols__stack", style: "position:relative" }, [
              el("div", {
                style: "position:absolute;left:8%;right:8%;bottom:" + ((week.ceiling / 7) / max * 100).toFixed(1) +
                  "%;height:1px;background:rgba(236,230,218,.28)"
              }),
              el("div", {
                class: "cols__bar",
                style: "width:64%;max-width:34px;height:" + (d.spent / max * 100).toFixed(1) + "%;background:" +
                  (d.future ? "rgba(236,230,218,.12)" : d.spent > week.ceiling / 7 ? "var(--red)" : "var(--green)"),
                title: U.prettyDate(d.date) + " · " + UI.money(d.spent)
              })
            ]),
            el("div", { class: "cols__label", style: isToday ? "color:var(--gold)" : "", text: U.dayAbbr(d.date) })
          ]);
        }))
      ]));
  }

  function categorySplit(week) {
    const rows = Object.keys(week.byCat)
      .map((id) => ({ cat: U.category(id), amount: week.byCat[id] }))
      .sort((a, b) => b.amount - a.amount);
    if (!rows.length) return UI.card("Where it went", "Variable categories only",
      UI.empty("No variable spending this week", "Groceries, food, transport and entertainment show up here."));

    const total = rows.reduce((n, r) => n + r.amount, 0);
    return UI.card("Where it went", "Variable categories only · " + UI.money(total) + " total",
      el("div", {}, rows.map(function (r) {
        return el("div", { style: "margin-bottom:11px" }, [
          el("div", { class: "row", style: "justify-content:space-between;margin-bottom:4px" }, [
            el("span", { class: "tiny" }, [
              el("span", { class: "tx__code", style: "width:34px;height:19px;font-size:11px;display:inline-flex;background:" + r.cat.color + ";margin-right:7px", text: r.cat.code }),
              r.cat.name
            ]),
            el("span", { class: "tiny muted", text: UI.money(r.amount) + " · " + U.pct(r.amount / total * 100, 0) })
          ]),
          el("div", { class: "bar" }, [
            el("div", { class: "bar__fill", style: "width:" + (r.amount / total * 100).toFixed(1) + "%;background:" + r.cat.color })
          ])
        ]);
      })));
  }

  function cycleConfig() {
    const st = window.store.state.settings;
    const mode = UI.select("Week starts on", [
      { value: "monday", label: "Monday (calendar week)" },
      { value: "sunday", label: "Sunday (calendar week)" },
      { value: "payday", label: "Custom payday anchor" }
    ], st.weekStart, {
      onchange: function (e) {
        window.store.update((s) => { s.settings.weekStart = e.target.value; }, { reason: "settings" });
      }
    });

    const anchor = UI.input("Payday anchor date", {
      type: "date", value: st.paydayAnchor, disabled: st.weekStart !== "payday",
      onchange: function (e) {
        window.store.update((s) => { s.settings.paydayAnchor = e.target.value; }, { reason: "settings" });
      }
    });

    const cycleDay = UI.input("Monthly cycle rolls over on day", {
      type: "number", min: 1, max: 28, value: st.cycleStartDay,
      onchange: function (e) {
        window.store.update((s) => { s.settings.cycleStartDay = U.clamp(Number(e.target.value) || 1, 1, 28); }, { reason: "settings" });
      }
    });

    return UI.card("Cycle setup", "Weeks can follow the calendar or your own pay rhythm",
      el("div", {}, [
        el("div", { class: "form-grid form-grid--wide" }, [mode, anchor, cycleDay]),
        el("p", { class: "hint", style: "margin-top:11px", text:
          "The payday anchor makes every 7-day window start on that weekday, so a Friday-paid week runs Friday to Thursday. The cycle rollover day does the same for the month — set it to 25 if your salary lands on the 25th." })
      ]));
  }

  window.Views = window.Views || {};
  window.Views.weekly = function () {
    const ref = U.addDays(U.today(), offset * 7);
    const week = window.Finance.week(ref);
    const prog = window.Game.progress();

    const list = week.tx.length
      ? el("div", {}, week.tx.sort((a, b) => a.date < b.date ? 1 : -1).map((t) => UI.txRow(t, { showDate: true })))
      : UI.empty("No variable spending logged", "Bills and goal contributions are tracked in the Monthly tab.");

    return el("div", { class: "stack" }, [
      header(week, prog),
      el("div", { class: "grid grid--2" }, [dayStrip(week), categorySplit(week)]),
      UI.card("This week's entries", week.tx.length + " variable " + (week.tx.length === 1 ? "transaction" : "transactions"), list,
        el("button", { class: "icon-btn", text: "+ Add", onclick: () => UI.quickAdd({}) })),
      cycleConfig()
    ]);
  };
})();
