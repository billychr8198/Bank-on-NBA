/* MONTHLY — macro cash flow: income in, obligations out, what's actually left. */
(function () {
  "use strict";
  const el = U.el;

  function monthKey() {
    return window.store.state.ui.month || U.monthKey(U.today());
  }
  function setMonth(k) {
    window.store.update((s) => { s.ui.month = k; }, { reason: "month" });
  }

  /* ------------------------------------------------------------- overview */

  function overview(plan) {
    const surplus = plan.projectedSurplus;
    return el("div", { class: "card" }, [
      el("div", { class: "card__head" }, [
        el("div", {}, [
          el("div", { class: "eyebrow", text: "Billing cycle " + U.prettyDate(plan.cycle.start) + " → " + U.prettyDate(plan.cycle.end) }),
          el("div", { class: "card__title", style: "font-size:21px", text: U.monthName(plan.key) })
        ]),
        el("div", { class: "seg" }, [
          el("button", { text: "‹", onclick: () => setMonth(U.shiftMonth(plan.key, -1)) }),
          el("button", { text: "Today", class: plan.key === U.monthKey(U.today()) ? "is-on" : "", onclick: () => setMonth(U.monthKey(U.today())) }),
          el("button", { text: "›", onclick: () => setMonth(U.shiftMonth(plan.key, 1)) })
        ])
      ]),

      el("div", { class: "grid grid--4" }, [
        UI.metric("Planned income", UI.money(plan.plannedIncome), "actual " + UI.money(plan.actualIncome)),
        UI.metric("Committed out", UI.money(plan.committed), "bills, funds, goals", "metric--warn"),
        UI.metric("Variable pool", UI.money(plan.variablePool), UI.money(plan.variableRemaining) + " still unspent"),
        UI.metric(surplus >= 0 ? "Projected surplus" : "Projected deficit", UI.money(Math.abs(surplus)),
          "after everything above", surplus >= 0 ? "metric--good" : "metric--bad")
      ]),

      el("div", { style: "margin-top:16px" }, [
        el("div", { class: "eyebrow", text: "Where every unit of income is assigned" }),
        waterfall(plan)
      ])
    ]);
  }

  /* A single stacked bar showing the allocation of planned income. */
  function waterfall(plan) {
    const total = Math.max(1, plan.plannedIncome);
    const parts = [
      { label: "Fixed bills", v: plan.billsTotal, c: "#6E7B8B" },
      { label: "Sinking funds", v: plan.sinkingMonthly, c: "#7E93AE" },
      { label: "Savings", v: plan.savingsMonthly, c: "var(--green)" },
      { label: "Debt payoff", v: plan.debtMonthly, c: "var(--red)" },
      { label: "Variable spent", v: plan.variableSpent, c: "var(--gold)" },
      { label: "Unassigned", v: Math.max(0, plan.variableRemaining), c: "rgba(236,230,218,.18)" }
    ].filter((p) => p.v > 0);

    return el("div", {}, [
      el("div", { style: "display:flex;height:26px;border-radius:4px;overflow:hidden;border:1px solid var(--line);margin:8px 0 10px" },
        parts.map((p) => el("div", {
          style: "width:" + (p.v / total * 100).toFixed(2) + "%;background:" + p.c,
          title: p.label + " · " + UI.money(p.v)
        }))),
      el("div", { class: "legend-key" }, parts.map((p) => el("span", {}, [
        el("i", { style: "background:" + p.c }),
        p.label + " " + UI.money(p.v)
      ])))
    ]);
  }

  /* --------------------------------------------------------------- income */

  function incomeCard(plan) {
    const st = window.store.state;
    const rows = st.income.length ? el("table", { class: "table" }, [
      el("thead", {}, el("tr", {}, [
        el("th", { text: "Source" }), el("th", { text: "Kind" }),
        el("th", { class: "num", text: "Day" }), el("th", { class: "num", text: "Amount" }), el("th", {})
      ])),
      el("tbody", {}, st.income.map(function (i) {
        const kind = window.APP.incomeKinds.find((k) => k.id === i.kind);
        return el("tr", {}, [
          el("td", { text: i.name }),
          el("td", {}, el("span", { class: "chip", text: kind ? kind.name : i.kind })),
          el("td", { class: "num muted", text: i.day ? "the " + i.day + "th" : "—" }),
          el("td", { class: "num", text: UI.money(i.amount) }),
          el("td", { class: "num" }, el("button", {
            class: "tx__del", html: "&times;", "aria-label": "Remove source",
            onclick: () => remove("income", i.id, i.name)
          }))
        ]);
      }))
    ]) : UI.empty("No income sources yet", "Add salary, freelance revenue and passive streams so the allocation engine has something to divide.");

    return UI.card("Income allocation", "Everything predictable that lands this cycle",
      el("div", {}, [rows, el("button", {
        class: "btn btn--ghost btn--sm", style: "margin-top:13px", text: "+ Add income source", onclick: addIncome
      })]));
  }

  function addIncome() {
    const name = UI.input("Source name", { placeholder: "Monthly salary", id: "i-name" });
    const kind = UI.select("Kind", UI.incomeKindOptions(), "salary", { id: "i-kind" });
    const amount = UI.amountField("Amount per cycle", null, { id: "i-amount" });
    const day = UI.input("Lands on day of month", { type: "number", min: 1, max: 31, value: 1, id: "i-day" });
    const body = el("div", { class: "form-grid form-grid--wide" }, [name, kind, amount, day]);

    UI.modal({
      title: "Add income source", body: body,
      footer: [
        el("button", { class: "btn btn--ghost", text: "Cancel", onclick: UI.closeModal }),
        el("button", {
          class: "btn", text: "Add source", onclick: function () {
            const n = body.querySelector("#i-name").value.trim();
            const a = Number(body.querySelector("#i-amount").value);
            if (!n || !a) { U.toast("Give it a name and an amount.", "error"); return; }
            window.store.update((s) => s.income.push({
              id: U.uid(), name: n, kind: body.querySelector("#i-kind").value,
              amount: a, day: Number(body.querySelector("#i-day").value) || 1
            }), { reason: "income" });
            UI.closeModal(); U.toast("Income source added.");
          }
        })
      ]
    });
  }

  /* ---------------------------------------------------------------- bills */

  function billsCard(plan) {
    const st = window.store.state;
    const key = plan.key;
    const sorted = st.bills.slice().sort((a, b) => (a.dueDay || 0) - (b.dueDay || 0));

    const rows = sorted.length ? el("table", { class: "table" }, [
      el("thead", {}, el("tr", {}, [
        el("th", { text: "Bill" }), el("th", { text: "Due" }), el("th", { text: "Status" }),
        el("th", { class: "num", text: "Amount" }), el("th", {})
      ])),
      el("tbody", {}, sorted.map(function (b) {
        const status = window.Finance.billStatus(b, key);
        return el("tr", {}, [
          el("td", {}, [
            el("div", { text: b.name }),
            b.subscription ? el("span", { class: "chip chip--sub", style: "margin-top:3px", text: "Subscription" }) : null
          ]),
          el("td", { class: "muted tiny", text: "the " + (b.dueDay || 1) + "th" }),
          el("td", {}, el("span", { class: "chip chip--" + status.id, text: status.label })),
          el("td", { class: "num", text: UI.money(b.amount) }),
          el("td", { class: "num" }, el("div", { class: "row row--tight", style: "justify-content:flex-end;flex-wrap:nowrap" }, [
            el("button", {
              class: "btn btn--sm " + (status.id === "paid" ? "btn--ghost" : "btn--green"),
              text: status.id === "paid" ? "Undo" : "Pay",
              onclick: function () {
                if (status.id === "paid") window.Finance.unpayBill(b.id, key);
                else { window.Finance.payBill(b.id, key, "transfer"); U.toast(b.name + " marked paid — logged to your ledger."); }
              }
            }),
            el("button", { class: "tx__del", html: "&times;", "aria-label": "Remove bill", onclick: () => remove("bills", b.id, b.name) })
          ]))
        ]);
      }))
    ]) : UI.empty("No recurring bills yet", "Rent, utilities, insurance, subscriptions — anything that repeats on a due date.");

    const summary = st.bills.length ? el("div", { class: "grid grid--3", style: "margin-top:13px" }, [
      UI.metric("Billed this cycle", UI.money(plan.billsTotal), st.bills.length + " obligations"),
      UI.metric("Settled", UI.money(plan.billsPaid), U.pct(plan.billsTotal ? plan.billsPaid / plan.billsTotal * 100 : 0, 0) + " cleared", "metric--good"),
      UI.metric("Subscriptions", UI.money(plan.subscriptions), st.bills.filter((b) => b.subscription).length + " active")
    ]) : null;

    return UI.card("Fixed bills & subscriptions", "Due dates, payment status, recurring charges",
      el("div", {}, [rows, summary, el("button", {
        class: "btn btn--ghost btn--sm", style: "margin-top:13px", text: "+ Add bill", onclick: addBill
      })]));
  }

  function addBill() {
    const name = UI.input("Bill name", { placeholder: "Rent, internet, gym…", id: "b-name" });
    const amount = UI.amountField("Amount", null, { id: "b-amount" });
    const day = UI.input("Due day of month", { type: "number", min: 1, max: 31, value: 1, id: "b-day" });
    const cat = UI.select("Category", UI.categoryOptions(), "bills", { id: "b-cat" });
    const sub = el("label", { class: "field" }, [
      el("span", { text: "Type" }),
      el("label", { class: "row row--tight", style: "gap:8px;padding:9px 0" }, [
        el("input", { type: "checkbox", id: "b-sub" }),
        el("span", { class: "tiny", text: "This is a subscription" })
      ])
    ]);
    const body = el("div", { class: "form-grid form-grid--wide" }, [name, amount, day, cat, sub]);

    UI.modal({
      title: "Add recurring bill", body: body,
      footer: [
        el("button", { class: "btn btn--ghost", text: "Cancel", onclick: UI.closeModal }),
        el("button", {
          class: "btn", text: "Add bill", onclick: function () {
            const n = body.querySelector("#b-name").value.trim();
            const a = Number(body.querySelector("#b-amount").value);
            if (!n || !a) { U.toast("Give it a name and an amount.", "error"); return; }
            window.store.update((s) => s.bills.push({
              id: U.uid(), name: n, amount: a,
              dueDay: Number(body.querySelector("#b-day").value) || 1,
              category: body.querySelector("#b-cat").value,
              subscription: body.querySelector("#b-sub").checked,
              paid: {}
            }), { reason: "bills" });
            UI.closeModal(); U.toast("Bill added.");
          }
        })
      ]
    });
  }

  /* -------------------------------------------------------- sinking funds */

  function sinkingCard(plan) {
    const st = window.store.state;
    const rows = st.sinking.length ? el("div", {}, st.sinking.map(function (f) {
      const monthly = window.Finance.sinkingMonthly(f);
      const pct = f.annual > 0 ? (Number(f.saved) || 0) / f.annual * 100 : 0;
      return el("div", { style: "margin-bottom:14px" }, [
        el("div", { class: "row", style: "justify-content:space-between;margin-bottom:5px" }, [
          el("div", {}, [
            el("div", { style: "font-weight:500", text: f.name }),
            el("div", { class: "tiny muted", text: UI.money(monthly) + "/month · " + UI.money(f.annual) + " a year" +
              (f.dueMonth ? " · due " + f.dueMonth : "") })
          ]),
          el("div", { class: "row row--tight" }, [
            el("button", {
              class: "btn btn--sm btn--ghost", text: "+ " + UI.moneyShort(monthly),
              title: "Set aside this month's slice",
              onclick: function () {
                window.store.update(function (s) {
                  const t = s.sinking.find((x) => x.id === f.id);
                  if (t) t.saved = (Number(t.saved) || 0) + monthly;
                  s.tx.push({
                    id: U.uid(), date: U.today(), type: "expense", amount: monthly,
                    category: "sinking", method: "transfer", merchant: f.name,
                    note: "Sinking fund allocation", fixed: true, ts: Date.now()
                  });
                }, { reason: "sinking" });
                U.toast("Allocated to " + f.name + ".");
              }
            }),
            el("button", { class: "tx__del", html: "&times;", "aria-label": "Remove fund", onclick: () => remove("sinking", f.id, f.name) })
          ])
        ]),
        UI.bar(pct, pct >= 100 ? "green" : "gold"),
        el("div", { class: "tiny muted", style: "margin-top:4px", text: UI.money(f.saved || 0) + " of " + UI.money(f.annual) + " banked · " + U.pct(pct, 0) })
      ]);
    })) : UI.empty("No sinking funds yet",
      "Insurance premiums, vehicle servicing, annual subscriptions — divide the yearly cost by twelve so it never ambushes a single month.");

    return UI.card("Sinking funds", plan.sinkingMonthly > 0
      ? UI.money(plan.sinkingMonthly) + " set aside every cycle" : "Spread irregular annual costs across 12 months",
      el("div", {}, [rows, el("button", {
        class: "btn btn--ghost btn--sm", style: "margin-top:6px", text: "+ Add sinking fund", onclick: addSinking
      })]));
  }

  function addSinking() {
    const name = UI.input("What is it for", { placeholder: "Car insurance", id: "s-name" });
    const annual = UI.amountField("Annual cost", null, { id: "s-annual" });
    const saved = UI.amountField("Already saved", 0, { id: "s-saved" });
    const due = UI.input("Due month", { placeholder: "e.g. March", id: "s-due" });
    const body = el("div", { class: "form-grid form-grid--wide" }, [name, annual, saved, due]);

    UI.modal({
      title: "Add sinking fund", body: body,
      footer: [
        el("button", { class: "btn btn--ghost", text: "Cancel", onclick: UI.closeModal }),
        el("button", {
          class: "btn", text: "Add fund", onclick: function () {
            const n = body.querySelector("#s-name").value.trim();
            const a = Number(body.querySelector("#s-annual").value);
            if (!n || !a) { U.toast("Give it a name and an annual cost.", "error"); return; }
            window.store.update((s) => s.sinking.push({
              id: U.uid(), name: n, annual: a,
              saved: Number(body.querySelector("#s-saved").value) || 0,
              dueMonth: body.querySelector("#s-due").value.trim()
            }), { reason: "sinking" });
            UI.closeModal(); U.toast("Sinking fund added — " + UI.money(a / 12) + " a month.");
          }
        })
      ]
    });
  }

  /* ---------------------------------------------------------------- goals */

  function goalsCard(plan) {
    const st = window.store.state;
    const rows = st.goals.length ? el("div", {}, st.goals.map(function (g) {
      const isDebt = g.kind === "debt";
      const target = Number(g.target) || 0;
      const cur = Number(g.current) || 0;
      const pct = target > 0 ? (isDebt ? (target - cur) / target : cur / target) * 100 : 0;
      const monthsLeft = g.monthly > 0 ? Math.ceil((isDebt ? cur : target - cur) / g.monthly) : null;

      return el("div", { style: "margin-bottom:15px" }, [
        el("div", { class: "row", style: "justify-content:space-between;margin-bottom:5px" }, [
          el("div", {}, [
            el("div", { class: "row row--tight" }, [
              el("span", { style: "font-weight:500", text: g.name }),
              el("span", { class: "chip", style: isDebt ? "color:var(--red);border-color:rgba(206,43,55,.4)" : "color:var(--green);border-color:rgba(63,169,107,.4)", text: isDebt ? "Debt" : "Savings" })
            ]),
            el("div", { class: "tiny muted", text: UI.money(g.monthly) + "/month" +
              (monthsLeft != null && monthsLeft > 0 ? " · " + monthsLeft + " months to go" : monthsLeft === 0 ? " · done" : "") })
          ]),
          el("div", { class: "row row--tight" }, [
            el("button", {
              class: "btn btn--sm btn--ghost", text: "+ " + UI.moneyShort(g.monthly),
              title: isDebt ? "Log this month's payment" : "Log this month's contribution",
              onclick: function () {
                window.store.update(function (s) {
                  const t = s.goals.find((x) => x.id === g.id);
                  if (!t) return;
                  t.current = isDebt
                    ? Math.max(0, (Number(t.current) || 0) - (Number(t.monthly) || 0))
                    : (Number(t.current) || 0) + (Number(t.monthly) || 0);
                  s.tx.push({
                    id: U.uid(), date: U.today(), type: "expense", amount: Number(g.monthly) || 0,
                    category: isDebt ? "debt" : "savings", method: "transfer", merchant: g.name,
                    note: isDebt ? "Debt payment" : "Savings contribution", fixed: true, ts: Date.now()
                  });
                }, { reason: "goals" });
                U.toast((isDebt ? "Payment" : "Contribution") + " logged for " + g.name + ".");
              }
            }),
            el("button", { class: "tx__del", html: "&times;", "aria-label": "Remove goal", onclick: () => remove("goals", g.id, g.name) })
          ])
        ]),
        UI.bar(pct, isDebt ? "red" : "green"),
        el("div", { class: "tiny muted", style: "margin-top:4px", text: isDebt
          ? UI.money(cur) + " still owed of " + UI.money(target) + " · " + U.pct(pct, 0) + " cleared"
          : UI.money(cur) + " of " + UI.money(target) + " · " + U.pct(pct, 0) })
      ]);
    })) : UI.empty("No targets set", "Savings and debt payoff are subtracted before anything is called discretionary.");

    return UI.card("Savings & debt targets", plan.savingsMonthly + plan.debtMonthly > 0
      ? UI.money(plan.savingsMonthly + plan.debtMonthly) + " committed each cycle · " + U.pct(plan.savingsRate, 0) + " of income"
      : "Pay yourself before the discretionary pool is calculated",
      el("div", {}, [rows, el("button", {
        class: "btn btn--ghost btn--sm", style: "margin-top:6px", text: "+ Add target", onclick: addGoal
      })]));
  }

  function addGoal() {
    const name = UI.input("Target name", { placeholder: "Emergency fund / Credit card", id: "g-name" });
    const kind = UI.select("Type", [
      { value: "savings", label: "Savings — build it up" },
      { value: "debt", label: "Debt — pay it down" }
    ], "savings", { id: "g-kind" });
    const monthly = UI.amountField("Monthly commitment", null, { id: "g-monthly" });
    const target = UI.amountField("Target / balance owed", null, { id: "g-target" });
    const current = UI.amountField("Currently saved / still owed", 0, { id: "g-current" });
    const body = el("div", { class: "form-grid form-grid--wide" }, [name, kind, monthly, target, current]);

    UI.modal({
      title: "Add savings or debt target", body: body,
      footer: [
        el("button", { class: "btn btn--ghost", text: "Cancel", onclick: UI.closeModal }),
        el("button", {
          class: "btn", text: "Add target", onclick: function () {
            const n = body.querySelector("#g-name").value.trim();
            const m = Number(body.querySelector("#g-monthly").value);
            if (!n || !m) { U.toast("Give it a name and a monthly amount.", "error"); return; }
            window.store.update((s) => s.goals.push({
              id: U.uid(), name: n, kind: body.querySelector("#g-kind").value,
              monthly: m,
              target: Number(body.querySelector("#g-target").value) || 0,
              current: Number(body.querySelector("#g-current").value) || 0
            }), { reason: "goals" });
            UI.closeModal(); U.toast("Target added.");
          }
        })
      ]
    });
  }

  /* ------------------------------------------------------------- variance */

  function varianceCard(plan) {
    const rows = window.Finance.variance(plan.key);
    const st = window.store.state;

    const table = rows.length ? el("table", { class: "table" }, [
      el("thead", {}, el("tr", {}, [
        el("th", { text: "Category" }), el("th", { class: "num", text: "Planned" }),
        el("th", { class: "num", text: "Actual" }), el("th", { class: "num", text: "Variance" }),
        el("th", { text: "Pace" })
      ])),
      el("tbody", {}, rows.map(function (r) {
        const over = r.variance < 0;
        return el("tr", {}, [
          el("td", {}, el("span", { class: "row row--tight" }, [
            el("span", { class: "tx__code", style: "width:36px;height:21px;font-size:11px;background:" + r.cat.color, text: r.cat.code }),
            r.cat.name
          ])),
          el("td", { class: "num muted", text: r.planned ? UI.money(r.planned) : "—" }),
          el("td", { class: "num", text: UI.money(r.actual) }),
          el("td", { class: "num " + (over ? "neg" : "pos"), text: (over ? "−" : "+") + UI.money(Math.abs(r.variance)).replace(/^[−+]/, "") }),
          el("td", { style: "min-width:110px" }, UI.bar(isFinite(r.pct) ? r.pct : 100, over ? "red" : "green"))
        ]);
      }))
    ]) : UI.empty("Nothing to compare yet", "Set category budgets below, then log some spending.");

    const editor = el("div", { class: "form-grid", style: "margin-top:15px" },
      window.APP.categories.filter((c) => c.variable).map(function (c) {
        return UI.amountField(c.code + " · " + c.name, st.budgets[c.id] || "", {
          onchange: function (e) {
            const v = Number(e.target.value) || 0;
            window.store.update(function (s) {
              if (v > 0) s.budgets[c.id] = v; else delete s.budgets[c.id];
            }, { reason: "budgets" });
          }
        });
      }));

    const planned = Object.values(st.budgets).reduce((n, v) => n + (Number(v) || 0), 0);
    const note = planned > plan.variablePool
      ? el("p", { class: "tiny warn", style: "margin-top:11px", text:
        "Your category budgets total " + UI.money(planned) + ", which is " + UI.money(planned - plan.variablePool) +
        " more than the variable pool. Trim a category or lower a commitment." })
      : el("p", { class: "tiny muted", style: "margin-top:11px", text:
        "Budgeted " + UI.money(planned) + " of a " + UI.money(plan.variablePool) + " variable pool · " +
        UI.money(plan.variablePool - planned) + " unassigned." });

    return UI.card("Planned vs actual", "Surplus or deficit per category, this cycle",
      el("div", {}, [
        table,
        el("hr", { class: "divider" }),
        el("div", { class: "eyebrow", text: "Category budgets" }),
        editor,
        note
      ]));
  }

  function remove(list, id, name) {
    UI.confirm("Remove " + name + "?", function () {
      window.store.update(function (s) {
        const i = s[list].findIndex((x) => x.id === id);
        if (i > -1) s[list].splice(i, 1);
      }, { reason: list });
      U.toast(name + " removed.");
    });
  }

  window.Views = window.Views || {};
  window.Views.monthly = function () {
    const plan = window.Finance.plan(monthKey());
    return el("div", { class: "stack" }, [
      overview(plan),
      el("div", { class: "grid grid--2" }, [incomeCard(plan), billsCard(plan)]),
      el("div", { class: "grid grid--2" }, [sinkingCard(plan), goalsCard(plan)]),
      varianceCard(plan)
    ]);
  };
})();
