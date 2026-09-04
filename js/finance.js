/* ============================================================================
   Finance engine
   ----------------------------------------------------------------------------
   One flow drives every screen:

     income  −  fixed bills  −  sinking funds  −  savings & debt   =  variable pool
     variable pool  ÷  weeks left in cycle                          =  weekly ceiling
     weekly ceiling − spent this week  ÷  days left in week         =  today's budget

   Savings, debt and sinking funds are subtracted *before* anything is called
   discretionary, so a goal can never be quietly funded by skipping it.
   ========================================================================== */
(function () {
  "use strict";

  const F = {};
  const S = () => window.store.state;

  /* ------------------------------------------------------------- cycle ---- */
  /* A "cycle" is the monthly billing period. It matches the calendar month
     unless the user moves the rollover day (e.g. payday on the 25th). */

  F.cycleFor = function (date) {
    const st = S().settings;
    const startDay = Math.min(31, Math.max(1, Number(st.cycleStartDay) || 1));
    const d = U.parse(date || U.today());
    let y = d.getFullYear(), m = d.getMonth();
    if (d.getDate() < startDay) { m -= 1; if (m < 0) { m = 11; y -= 1; } }
    const dim = new Date(y, m + 1, 0).getDate();
    const start = U.iso(new Date(y, m, Math.min(startDay, dim)));
    const nextDim = new Date(y, m + 2, 0).getDate();
    const nextStart = U.iso(new Date(y, m + 1, Math.min(startDay, nextDim)));
    return {
      start: start,
      end: U.addDays(nextStart, -1),
      key: U.monthKey(startDay === 1 ? start : U.addDays(start, 15)),
      days: U.diffDays(start, nextStart)
    };
  };

  /* Cycle covering a given "YYYY-MM" key, for the month browser. */
  F.cycleForKey = function (key) {
    const st = S().settings;
    const startDay = Math.min(31, Math.max(1, Number(st.cycleStartDay) || 1));
    const [y, m] = key.split("-").map(Number);
    const dim = new Date(y, m, 0).getDate();
    return F.cycleFor(U.iso(new Date(y, m - 1, Math.min(startDay, dim))));
  };

  F.inRange = function (date, a, b) { return date >= a && date <= b; };

  /* ---------------------------------------------------------- transactions */

  F.txBetween = function (a, b) {
    return S().tx.filter((t) => t.date >= a && t.date <= b);
  };

  F.txOn = function (date) {
    return S().tx.filter((t) => t.date === date)
      .sort((x, y) => (y.ts || 0) - (x.ts || 0));
  };

  F.sum = function (list, pick) {
    return list.reduce((n, t) => n + (pick ? pick(t) : Number(t.amount) || 0), 0);
  };

  F.isVariableSpend = function (t) {
    if (t.type !== "expense" || t.fixed) return false;
    const c = U.category(t.category);
    return c.variable;
  };

  /* ---------------------------------------------------------- monthly plan */

  F.plan = function (key) {
    const st = S();
    const cycle = F.cycleForKey(key);
    const tx = F.txBetween(cycle.start, cycle.end);

    const plannedIncome = F.sum(st.income);
    const actualIncome = F.sum(tx.filter((t) => t.type === "income"));

    const billsTotal = F.sum(st.bills);
    const billsPaid = F.sum(st.bills.filter((b) => b.paid && b.paid[key]));
    const billsDue = billsTotal - billsPaid;
    const subscriptions = F.sum(st.bills.filter((b) => b.subscription));

    const sinkingMonthly = st.sinking.reduce((n, s) => n + F.sinkingMonthly(s), 0);
    const savingsMonthly = F.sum(st.goals.filter((g) => g.kind === "savings"), (g) => Number(g.monthly) || 0);
    const debtMonthly = F.sum(st.goals.filter((g) => g.kind === "debt"), (g) => Number(g.monthly) || 0);
    const committed = billsTotal + sinkingMonthly + savingsMonthly + debtMonthly;

    const variablePool = plannedIncome - committed;
    const variableSpent = F.sum(tx.filter(F.isVariableSpend));
    const variableRemaining = variablePool - variableSpent;

    const fixedSpent = F.sum(tx.filter((t) => t.type === "expense" && (t.fixed || !U.category(t.category).variable)));
    const totalSpent = F.sum(tx.filter((t) => t.type === "expense"));

    return {
      key: key, cycle: cycle,
      plannedIncome, actualIncome,
      billsTotal, billsPaid, billsDue, subscriptions,
      sinkingMonthly, savingsMonthly, debtMonthly, committed,
      variablePool, variableSpent, variableRemaining,
      fixedSpent, totalSpent,
      projectedSurplus: plannedIncome - committed - variableSpent,
      actualSurplus: actualIncome - totalSpent,
      savingsRate: plannedIncome > 0 ? ((savingsMonthly + debtMonthly + sinkingMonthly) / plannedIncome) * 100 : 0
    };
  };

  F.sinkingMonthly = function (s) {
    const annual = Number(s.annual) || 0;
    return annual / 12;
  };

  /* Planned vs actual, per variable category. */
  F.variance = function (key) {
    const st = S();
    const cycle = F.cycleForKey(key);
    const tx = F.txBetween(cycle.start, cycle.end);
    const rows = [];
    window.APP.categories.forEach(function (cat) {
      const planned = cat.variable
        ? Number(st.budgets[cat.id]) || 0
        : cat.id === "bills" ? F.sum(st.bills)
          : cat.id === "sinking" ? st.sinking.reduce((n, s) => n + F.sinkingMonthly(s), 0)
            : cat.id === "savings" ? F.sum(st.goals.filter((g) => g.kind === "savings"), (g) => Number(g.monthly) || 0)
              : cat.id === "debt" ? F.sum(st.goals.filter((g) => g.kind === "debt"), (g) => Number(g.monthly) || 0)
                : 0;
      const actual = F.sum(tx.filter((t) => t.type === "expense" && t.category === cat.id));
      if (planned === 0 && actual === 0) return;
      rows.push({
        cat: cat, planned: planned, actual: actual,
        variance: planned - actual,
        pct: planned > 0 ? (actual / planned) * 100 : (actual > 0 ? Infinity : 0)
      });
    });
    return rows.sort((a, b) => b.actual - a.actual);
  };

  /* ------------------------------------------------------------ weekly ---- */

  F.weekWindow = function (date) {
    const st = S().settings;
    const start = U.weekStart(date || U.today(), st.weekStart, st.paydayAnchor);
    return { start: start, end: U.addDays(start, 6) };
  };

  /* Safe-to-spend. The ceiling is fixed for the whole week — it is set from
     what was left when the week opened — so the countdown only moves when you
     actually spend, not because the divisor changed underneath you. */
  F.week = function (date) {
    const today = U.today();
    const ref = date || today;
    const win = F.weekWindow(ref);
    const cycle = F.cycleFor(win.start < F.cycleFor(ref).start ? ref : win.start);
    const plan = F.plan(cycle.key);

    // spent inside this cycle but before the week opened
    const spentBefore = F.sum(
      F.txBetween(cycle.start, U.addDays(win.start, -1)).filter(F.isVariableSpend)
    );
    const poolAtWeekStart = Math.max(0, plan.variablePool - spentBefore);

    const effectiveStart = win.start < cycle.start ? cycle.start : win.start;
    const daysLeftInCycle = Math.max(1, U.diffDays(effectiveStart, cycle.end) + 1);
    const weeksLeft = Math.max(1, Math.ceil(daysLeftInCycle / 7));
    const ceiling = poolAtWeekStart / weeksLeft;

    const weekTx = F.txBetween(win.start, win.end).filter(F.isVariableSpend);
    const spent = F.sum(weekTx);
    const remaining = ceiling - spent;

    const cursor = ref > win.end ? win.end : (ref < win.start ? win.start : ref);
    const daysElapsed = U.diffDays(win.start, cursor) + 1;
    const daysLeft = Math.max(0, 7 - daysElapsed);
    const daysLeftIncl = Math.max(1, Math.min(7 - daysElapsed + 1, U.diffDays(cursor, cycle.end) + 1));

    const byCat = {};
    weekTx.forEach(function (t) { byCat[t.category] = (byCat[t.category] || 0) + (Number(t.amount) || 0); });

    const byDay = [];
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(win.start, i);
      byDay.push({
        date: d,
        spent: F.sum(F.txOn(d).filter(F.isVariableSpend)),
        future: d > today
      });
    }

    return {
      start: win.start, end: win.end, cycle: cycle,
      ceiling, spent, remaining,
      pace: ceiling > 0 ? (spent / ceiling) * 100 : 0,
      onPace: ceiling > 0 ? (ceiling / 7) * daysElapsed : 0,
      daysElapsed, daysLeft, daysLeftIncl,
      perDay: remaining / daysLeftIncl,
      weeksLeftInCycle: weeksLeft,
      byCat, byDay, tx: weekTx
    };
  };

  /* ------------------------------------------------------------- daily ---- */

  F.day = function (date) {
    const d = date || U.today();
    const week = F.week(d);
    const tx = F.txOn(d);
    const spent = F.sum(tx.filter(F.isVariableSpend));
    const income = F.sum(tx.filter((t) => t.type === "income"));
    const allOut = F.sum(tx.filter((t) => t.type === "expense"));

    // Today's slice: what's left this week spread over the days still to come,
    // then add back anything already spent today so the bar starts full.
    const budget = week.remaining / week.daysLeftIncl + spent;
    return {
      date: d, week: week, tx: tx,
      budget: Math.max(0, budget),
      spent: spent, allOut: allOut, income: income,
      remaining: Math.max(0, budget) - spent,
      logged: tx.length > 0
    };
  };

  /* ----------------------------------------------------------- balances --- */

  F.balance = function (upto) {
    const st = S();
    const end = upto || U.today();
    let n = Number(st.settings.openingBalance) || 0;
    st.tx.forEach(function (t) {
      if (t.date > end) return;
      const a = Number(t.amount) || 0;
      if (t.type === "income") n += a;
      else if (t.type === "expense") n -= a;
    });
    return n;
  };

  F.balancesByMethod = function () {
    const out = {};
    window.APP.methods.forEach((m) => { out[m.id] = 0; });
    S().tx.forEach(function (t) {
      const a = Number(t.amount) || 0;
      if (t.type === "income") out[t.method] = (out[t.method] || 0) + a;
      else if (t.type === "expense") out[t.method] = (out[t.method] || 0) - a;
      else if (t.type === "transfer") {
        out[t.method] = (out[t.method] || 0) - a;
        out[t.toMethod] = (out[t.toMethod] || 0) + a;
      }
    });
    return out;
  };

  /* -------------------------------------------------------------- bills --- */

  F.billStatus = function (bill, key) {
    const paid = Boolean(bill.paid && bill.paid[key]);
    if (paid) return { id: "paid", label: "Paid" };
    const cycle = F.cycleForKey(key);
    const [y, m] = key.split("-").map(Number);
    const dim = new Date(y, m, 0).getDate();
    const due = U.iso(new Date(y, m - 1, Math.min(Number(bill.dueDay) || 1, dim)));
    const today = U.today();
    if (due < today) return { id: "overdue", label: "Overdue", due: due, days: U.diffDays(due, today) };
    if (U.diffDays(today, due) <= 3) return { id: "soon", label: "Due soon", due: due, days: U.diffDays(today, due) };
    return { id: "upcoming", label: "Upcoming", due: due, days: U.diffDays(today, due) };
  };

  /* Recording a bill payment writes a real transaction so it shows up in the
     ledger and the balance, and flags the month as settled. */
  F.payBill = function (billId, key, method) {
    window.store.update(function (s) {
      const b = s.bills.find((x) => x.id === billId);
      if (!b) return;
      b.paid = b.paid || {};
      b.paid[key] = true;
      s.tx.push({
        id: U.uid(), date: U.today(), type: "expense",
        amount: Number(b.amount) || 0, category: b.category || "bills",
        method: method || "transfer", merchant: b.name,
        note: "Bill payment · " + U.monthAbbr(key), fixed: true, billId: billId,
        ts: Date.now()
      });
    }, { reason: "bill" });
  };

  F.unpayBill = function (billId, key) {
    window.store.update(function (s) {
      const b = s.bills.find((x) => x.id === billId);
      if (b && b.paid) delete b.paid[key];
      const i = s.tx.findIndex((t) => t.billId === billId && (t.note || "").includes(U.monthAbbr(key)));
      if (i > -1) s.tx.splice(i, 1);
    }, { reason: "bill" });
  };

  /* ------------------------------------------------------------- trends --- */

  F.monthlyTrend = function (months) {
    const out = [];
    let key = U.monthKey(U.today());
    for (let i = (months || 6) - 1; i >= 0; i--) {
      const k = U.shiftMonth(key, -i);
      const c = F.cycleForKey(k);
      const tx = F.txBetween(c.start, c.end);
      out.push({
        key: k,
        label: U.monthAbbr(k),
        income: F.sum(tx.filter((t) => t.type === "income")),
        expense: F.sum(tx.filter((t) => t.type === "expense")),
        variable: F.sum(tx.filter(F.isVariableSpend))
      });
    }
    return out;
  };

  window.Finance = F;
})();
