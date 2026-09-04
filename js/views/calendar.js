/* CALENDAR — the full 365-day season, month by month. */
(function () {
  "use strict";
  const el = U.el;

  function monthBlock(days, key) {
    const first = U.parse(key + "-01");
    const lead = (first.getDay() + 6) % 7;          // Monday-first grid
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(el("div", { class: "cal-cell cal-cell--void" }));

    days.forEach(function (d) {
      const cls = ["cal-cell"];
      if (d.date === U.today()) cls.push("cal-cell--today");
      if (d.future) cls.push("cal-cell--future");
      else if (d.logged) cls.push("cal-cell--logged");
      else cls.push("cal-cell--missed");
      if (d.unlock) cls.push("cal-cell--unlock");

      cells.push(el("button", {
        class: cls.join(" "),
        text: String(U.parse(d.date).getDate()),
        title: U.longDate(d.date) + " · day " + d.day + " · " +
          (d.future ? "upcoming" : d.logged ? "logged" : "missed") +
          (d.unlock ? " · unlocked " + d.unlock.item.name : ""),
        onclick: () => openDay(d)
      }));
    });

    return el("div", { class: "cal-month" }, [
      el("div", { class: "cal-month__name", text: U.monthName(key) }),
      el("div", { class: "cal-dow" }, ["M", "T", "W", "T", "F", "S", "S"].map((x) => el("span", { text: x }))),
      el("div", { class: "cal-grid" }, cells)
    ]);
  }

  function openDay(d) {
    const day = window.Finance.day(d.date);
    const body = el("div", {}, [
      el("div", { class: "row", style: "gap:10px;margin-bottom:14px" }, [
        el("span", { class: "chip", text: "Day " + d.day + " of 365" }),
        el("span", { class: "chip chip--" + (d.future ? "sub" : d.logged ? "paid" : "overdue"),
          text: d.future ? "Upcoming" : d.logged ? "Logged" : "Missed" }),
        d.unlock ? el("span", { class: "chip chip--soon", text: "Unlocked " + d.unlock.item.name }) : null
      ]),
      day.tx.length
        ? el("div", {}, day.tx.map((t) => UI.txRow(t, { readonly: d.future })))
        : UI.empty(d.future ? "Nothing logged — yet" : "No entries on this day",
          d.future ? "You can log ahead if you already know the numbers." : "Adding an entry now will recalculate every streak from here forward."),
      day.tx.length ? el("div", { class: "row", style: "margin-top:12px;gap:18px" }, [
        el("span", { class: "tiny muted" }, ["In ", el("b", { class: "pos", text: UI.money(day.income) })]),
        el("span", { class: "tiny muted" }, ["Out ", el("b", { class: "neg", text: UI.money(day.allOut) })])
      ]) : null
    ]);

    UI.modal({
      title: U.longDate(d.date), body: body,
      footer: [
        el("button", { class: "btn btn--ghost", text: "Close", onclick: UI.closeModal }),
        el("button", { class: "btn", text: "Add entry for this day", onclick: () => UI.quickAdd({ date: d.date }) })
      ]
    });
  }

  window.Views = window.Views || {};
  window.Views.calendar = function () {
    const prog = window.Game.progress();

    // group the 365 days into calendar months
    const groups = [];
    let cur = null;
    prog.days.forEach(function (d) {
      const k = U.monthKey(d.date);
      if (!cur || cur.key !== k) { cur = { key: k, days: [] }; groups.push(cur); }
      cur.days.push(d);
    });

    const unlockDays = prog.days.filter((d) => d.unlock).length;

    return el("div", { class: "stack" }, [
      UI.card("Season calendar", U.longDate(prog.start) + " → " + U.longDate(U.addDays(prog.start, 364)),
        el("div", {}, [
          el("div", { class: "grid grid--4", style: "margin-bottom:15px" }, [
            UI.metric("Days logged", String(prog.loggedDays), U.pct(prog.consistency, 0) + " of days elapsed", "metric--good"),
            UI.metric("Days missed", String(prog.missedDays), prog.missedDays ? "each one resets the run" : "spotless so far",
              prog.missedDays ? "metric--bad" : "metric--good"),
            UI.metric("Current streak", String(prog.streak), "best was " + prog.best),
            UI.metric("Unlock days", String(unlockDays), "marked with a gold dot")
          ]),
          UI.bar(prog.elapsed / prog.total * 100, "gold", true),
          el("div", { class: "row", style: "justify-content:space-between;margin-top:8px" }, [
            el("span", { class: "tiny muted", text: "Day " + U.clamp(prog.elapsed, 0, 365) + " of 365" }),
            el("span", { class: "tiny muted", text: prog.daysRemaining + " days remaining" })
          ]),
          el("div", { class: "legend-key", style: "margin-top:15px" }, [
            el("span", {}, [el("i", { style: "background:var(--green)" }), "Logged"]),
            el("span", {}, [el("i", { style: "background:rgba(206,43,55,.28)" }), "Missed"]),
            el("span", {}, [el("i", { style: "background:rgba(236,230,218,.045);border:1px solid var(--line)" }), "Upcoming"]),
            el("span", {}, [el("i", { style: "background:transparent;border:1px solid var(--gold)" }), "Today"]),
            el("span", {}, [el("i", { style: "background:var(--gold);border-radius:50%" }), "Unlock earned"])
          ])
        ])),
      el("div", { class: "card" }, [
        el("div", { class: "cal-months" }, groups.map((g) => monthBlock(g.days, g.key)))
      ])
    ]);
  };
})();
