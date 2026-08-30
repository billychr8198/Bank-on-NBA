/* Shared building blocks used across every tab. */
(function () {
  "use strict";

  const UI = {};
  const el = U.el;

  /* ---------------------------------------------------------------- modal */

  let openModal = null;

  UI.modal = function (opts) {
    UI.closeModal();
    const body = typeof opts.body === "function" ? opts.body() : opts.body;
    const foot = opts.footer ? el("div", { class: "modal__foot" }, opts.footer) : null;

    const box = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": opts.title || "Dialog" }, [
      opts.title !== false ? el("div", { class: "modal__head" }, [
        el("div", { class: "modal__title", text: opts.title || "" }),
        el("button", { class: "modal__x", "aria-label": "Close", onclick: UI.closeModal, html: "&times;" })
      ]) : null,
      el("div", { class: "modal__body" }, body),
      foot
    ]);

    const bg = el("div", {
      class: "modal-bg",
      onclick: function (e) { if (e.target === bg && opts.dismissible !== false) UI.closeModal(); }
    }, box);

    document.body.appendChild(bg);
    document.body.style.overflow = "hidden";
    openModal = bg;

    const focusable = box.querySelector("input, select, textarea, button:not(.modal__x)");
    if (focusable) setTimeout(() => focusable.focus(), 60);
    return bg;
  };

  UI.closeModal = function () {
    if (!openModal) return;
    openModal.remove();
    openModal = null;
    document.body.style.overflow = "";
  };

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") UI.closeModal();
  });

  UI.confirm = function (message, onYes, opts) {
    opts = opts || {};
    UI.modal({
      title: opts.title || "Are you sure?",
      body: el("p", { text: message, class: "muted" }),
      footer: [
        el("button", { class: "btn btn--ghost", text: "Cancel", onclick: UI.closeModal }),
        el("button", {
          class: "btn " + (opts.danger === false ? "" : "btn--red"),
          text: opts.confirmLabel || "Delete",
          onclick: function () { UI.closeModal(); onYes(); }
        })
      ]
    });
  };

  /* ------------------------------------------------------------ selectors */

  UI.select = function (label, options, value, attrs) {
    const s = el("select", Object.assign({ class: "select" }, attrs || {}),
      options.map((o) => el("option", { value: o.value, selected: String(o.value) === String(value) }, o.label)));
    return label === false ? s : el("label", { class: "field" }, [el("span", { text: label }), s]);
  };

  UI.input = function (label, attrs) {
    const i = el("input", Object.assign({ class: "input" }, attrs || {}));
    return label === false ? i : el("label", { class: "field" }, [el("span", { text: label }), i]);
  };

  /* Currency picker over the full ISO 4217 table, with the ones people
     actually reach for floated to the top. */
  UI.currencyOptions = function () {
    const all = window.CURRENCIES;
    const pop = (window.CURRENCY_POPULAR || []).filter((c) => all[c]);
    const rest = Object.keys(all).filter((c) => pop.indexOf(c) === -1).sort();
    const label = (c) => all[c].code + " · " + all[c].name + " (" + all[c].symbol + ")";
    return { popular: pop.map((c) => ({ value: c, label: label(c) })),
             rest: rest.map((c) => ({ value: c, label: label(c) })) };
  };

  UI.currencySelect = function (label, value, attrs) {
    const o = UI.currencyOptions();
    const opt = (x) => el("option", { value: x.value, selected: String(x.value) === String(value) }, x.label);
    const sel = el("select", Object.assign({ class: "select" }, attrs || {}), [
      el("optgroup", { label: "Common" }, o.popular.map(opt)),
      el("optgroup", { label: "All currencies" }, o.rest.map(opt))
    ]);
    return label === false ? sel : el("label", { class: "field" }, [el("span", { text: label }), sel]);
  };

  UI.categoryOptions = function (onlyVariable) {
    return window.APP.categories
      .filter((c) => !onlyVariable || c.variable)
      .map((c) => ({ value: c.id, label: c.code + " · " + c.name }));
  };

  UI.methodOptions = function () {
    return window.APP.methods.map((m) => ({ value: m.id, label: m.name }));
  };

  UI.incomeKindOptions = function () {
    return window.APP.incomeKinds.map((k) => ({ value: k.id, label: k.name }));
  };

  UI.money = function (n, opts) {
    return U.money(n, window.store.state.settings.currency, opts);
  };
  UI.moneyShort = function (n) {
    return U.moneyShort(n, window.store.state.settings.currency);
  };

  /* Amount inputs use a plain number field with a currency-aware step so that
     Rp inputs don't demand two decimal places nobody uses. */
  UI.amountField = function (label, value, attrs) {
    const c = U.currency(window.store.state.settings.currency);
    return UI.input(label, Object.assign({
      type: "number", inputmode: "decimal", min: "0",
      step: c.decimals ? "0.01" : "1",
      placeholder: c.symbol + " 0", value: value != null ? value : ""
    }, attrs || {}));
  };

  /* ------------------------------------------------------------ components */

  /* The rendered string stays the source of truth for formatting; data-count
     only tells the animation what number to land on. If it's absent or the
     value isn't numeric, the figure just appears — no special-casing needed. */
  UI.metric = function (label, value, foot, cls) {
    const text = String(value == null ? "" : value);
    const valueEl = el("div", { class: "metric__value", text: text });
    const n = window.Motion ? window.Motion.readNumber(text) : NaN;
    if (isFinite(n) && Math.abs(n) >= 1) valueEl.setAttribute("data-count", n);
    return el("div", { class: "metric" + (cls ? " " + cls : "") }, [
      el("div", { class: "metric__label", text: label }),
      valueEl,
      foot ? el("div", { class: "metric__foot", html: foot }) : null
    ]);
  };

  UI.bar = function (pct, variant, big) {
    return el("div", { class: "bar" + (big ? " bar--lg" : "") }, [
      el("div", {
        class: "bar__fill" + (variant ? " bar__fill--" + variant : ""),
        style: "width:" + U.clamp(pct, 0, 100).toFixed(1) + "%"
      })
    ]);
  };

  UI.empty = function (title, note, action) {
    return el("div", { class: "empty" }, [
      el("div", { class: "empty__title", text: title }),
      note ? el("div", { class: "tiny", text: note }) : null,
      action ? el("div", { style: "margin-top:14px", }, action) : null
    ]);
  };

  UI.card = function (title, note, body, headExtra) {
    return el("div", { class: "card" }, [
      title ? el("div", { class: "card__head" }, [
        el("div", {}, [
          el("div", { class: "card__title", text: title }),
          note ? el("div", { class: "card__note", text: note }) : null
        ]),
        headExtra || null
      ]) : null,
      body
    ]);
  };

  /* --------------------------------------------------------- transactions */

  UI.txRow = function (t, opts) {
    opts = opts || {};
    const cat = U.category(t.category);
    const isIncome = t.type === "income";
    const isTransfer = t.type === "transfer";
    const color = isIncome ? "var(--green)" : isTransfer ? "var(--blue)" : cat.color;
    const code = isIncome ? "IN" : isTransfer ? "TFR" : cat.code;

    const meta = [
      isTransfer ? U.methodName(t.method) + " → " + U.methodName(t.toMethod) : U.methodName(t.method),
      opts.showDate ? U.prettyDate(t.date) : null,
      t.note || null
    ].filter(Boolean).join(" · ");

    return el("div", { class: "tx" }, [
      el("div", { class: "tx__code", style: "background:" + color, text: code }),
      el("div", { class: "tx__body" }, [
        el("div", { class: "tx__name", text: t.merchant || (isIncome ? "Income" : isTransfer ? "Transfer" : cat.name) }),
        el("div", { class: "tx__meta", text: meta })
      ]),
      el("div", {
        class: "tx__amt " + (isIncome ? "pos" : isTransfer ? "muted" : ""),
        text: (isIncome ? "+" : isTransfer ? "" : "−") + UI.money(t.amount).replace(/^−/, "")
      }),
      opts.readonly ? null : el("button", {
        class: "tx__del", "aria-label": "Delete transaction", html: "&times;",
        onclick: function () {
          UI.confirm("Delete this entry? Streaks and unlocks recalculate from your ledger, so removing the only entry on a day will break that day's streak.", function () {
            window.store.update(function (s) {
              const i = s.tx.findIndex((x) => x.id === t.id);
              if (i > -1) s.tx.splice(i, 1);
            }, { reason: "tx" });
            U.toast("Entry deleted.");
          });
        }
      })
    ]);
  };

  /* The one entry form, reused by the FAB, the daily tab and the calendar. */
  UI.entryForm = function (opts) {
    opts = opts || {};
    let type = opts.type || "expense";
    const date = opts.date || U.today();
    const wrap = el("div", {});

    function render() {
      wrap.innerHTML = "";
      const seg = el("div", { class: "seg", style: "margin-bottom:14px" },
        [["expense", "Expense"], ["income", "Income"], ["transfer", "Transfer"]].map(function (p) {
          return el("button", {
            class: type === p[0] ? "is-on" : "", text: p[1],
            onclick: function () { type = p[0]; render(); }
          });
        }));

      const amount = UI.amountField("Amount", opts.amount, { id: "f-amount", required: true });
      const dateF = UI.input("Date", { type: "date", value: date, id: "f-date" });
      const method = UI.select("Payment method", UI.methodOptions(), opts.method || "cash", { id: "f-method" });
      const merchant = UI.input(type === "income" ? "Source" : "Merchant / payee",
        { placeholder: type === "income" ? "Employer, client, refund…" : "Where did it go?", id: "f-merchant" });
      const note = UI.input("Note", { placeholder: "Optional", id: "f-note" });

      let second;
      if (type === "expense") {
        second = UI.select("Category", UI.categoryOptions(), opts.category || "groceries", { id: "f-category" });
      } else if (type === "income") {
        second = UI.select("Kind", UI.incomeKindOptions(), "salary", { id: "f-kind" });
      } else {
        second = UI.select("Move to", UI.methodOptions(), "debit", { id: "f-to" });
      }

      const grid = el("div", { class: "form-grid" }, [amount, dateF, second, method]);
      const wide = el("div", { class: "form-grid form-grid--wide", style: "margin-top:11px" }, [merchant, note]);

      const submit = el("button", {
        class: "btn btn--block", style: "margin-top:16px",
        text: type === "income" ? "Record income" : type === "transfer" ? "Record transfer" : "Record expense",
        onclick: save
      });

      wrap.appendChild(seg);
      wrap.appendChild(grid);
      wrap.appendChild(wide);
      wrap.appendChild(submit);

      if (type === "expense") {
        const cats = window.APP.categories.filter((c) => c.variable).slice(0, 8);
        const quick = el("div", { class: "row row--tight", style: "margin-top:12px" },
          cats.map(function (c) {
            return el("button", {
              class: "chip", style: "cursor:pointer;color:" + c.color + ";border-color:" + c.color + "44",
              text: c.code,
              title: c.name,
              onclick: function () { wrap.querySelector("#f-category").value = c.id; }
            });
          }));
        wrap.appendChild(el("div", {}, [el("div", { class: "hint", style: "margin-top:12px", text: "Quick category" }), quick]));
      }
    }

    function save() {
      const amt = Number(wrap.querySelector("#f-amount").value);
      if (!amt || amt <= 0) { U.toast("Enter an amount above zero.", "error"); return; }
      const d = wrap.querySelector("#f-date").value || U.today();
      const rec = {
        id: U.uid(), date: d, type: type, amount: amt,
        method: wrap.querySelector("#f-method").value,
        merchant: wrap.querySelector("#f-merchant").value.trim(),
        note: wrap.querySelector("#f-note").value.trim(),
        ts: Date.now()
      };
      if (type === "expense") rec.category = wrap.querySelector("#f-category").value;
      else if (type === "income") { rec.category = "income"; rec.kind = wrap.querySelector("#f-kind").value; }
      else {
        rec.category = "transfer";
        rec.toMethod = wrap.querySelector("#f-to").value;
        if (rec.toMethod === rec.method) { U.toast("Pick two different accounts for a transfer.", "error"); return; }
      }

      const before = window.Game.progress();
      window.store.update(function (s) { s.tx.push(rec); }, { reason: "tx" });
      const after = window.Game.progress();

      UI.closeModal();
      if (after.streak > before.streak && after.streak > 0) {
        U.toast("Day " + after.elapsed + " logged · streak " + after.streak + " · boost +" + after.boostPct + "%", "gold");
      } else {
        U.toast("Entry saved.");
      }
      if (opts.onSave) opts.onSave(rec);
    }

    render();
    return wrap;
  };

  UI.quickAdd = function (opts) {
    UI.modal({
      title: "Log an entry",
      body: UI.entryForm(opts || {})
    });
  };

  /* --------------------------------------------------------- detail modals */

  UI.showTeam = function (t, unlocked) {
    UI.modal({
      title: false,
      body: el("div", { class: "unlock" }, [
        el("div", {
          class: "unlock__art", style: "cursor:zoom-in", title: "Click to view full size",
          onclick: function () {
            window.Lightbox.open([{ src: t.logo, title: t.name, sub: t.city + " · est. " + t.founded,
              meta: t.titles + (t.titles === 1 ? " title" : " titles") }], 0);
          }
        }, [el("img", { src: t.logo, alt: t.name })]),
        el("div", { class: "unlock__kicker", text: t.conference + "ern Conference · " + t.division }),
        el("div", { class: "unlock__name", text: t.name }),
        el("div", { class: "row", style: "justify-content:center;margin:10px 0 14px" }, [
          el("span", { class: "chip", text: t.titles + (t.titles === 1 ? " title" : " titles") }),
          el("span", { class: "chip", text: "Est. " + t.founded }),
          el("span", { class: "chip", text: t.city })
        ]),
        el("p", { class: "muted", style: "text-align:left;font-size:14px", text: t.blurb })
      ]),
      footer: [el("button", { class: "btn btn--ghost", text: "Close", onclick: UI.closeModal })]
    });
  };

  const RATING_LABELS = {
    shooting: "Shooting", dribbling: "Dribbling", strength: "Strength",
    playmaking: "Playmaking", rebounding: "Interior", defense: "Defense"
  };

  UI.showLegend = function (l) {
    const ratings = el("div", { class: "ratings" },
      Object.keys(RATING_LABELS).map(function (k) {
        const v = l.ratings[k] || 0;
        return el("div", { class: "rating" }, [
          el("div", { class: "rating__k", text: RATING_LABELS[k] }),
          UI.bar(v, v >= 90 ? "gold" : v >= 75 ? null : "red"),
          el("div", { class: "rating__v", text: v })
        ]);
      }));

    UI.modal({
      title: false,
      body: el("div", { class: "unlock" }, [
        el("div", {
          class: "unlock__art", style: "cursor:zoom-in", title: "Click to view full size",
          onclick: function () {
            const prog = window.Game.progress();
            const unlocked = window.NBA_LEGENDS.slice(0, prog.legends);
            const items = (unlocked.length ? unlocked : [l]).map((x) => ({
              src: x.portrait, title: x.name,
              sub: "Tier " + x.tier + " · " + x.tierName + " · #" + x.rank + " all-time",
              meta: x.overall + " OVR"
            }));
            const at = Math.max(0, items.findIndex((x) => x.title === l.name));
            window.Lightbox.open(items, at);
          }
        }, [el("img", { src: l.portrait, alt: l.name })]),
        el("div", { class: "unlock__kicker", text: "Tier " + l.tier + " · " + l.tierLabel + " · #" + l.rank + " all-time" }),
        el("div", { class: "unlock__name", text: l.name }),
        el("div", { class: "figure", style: "color:var(--gold)", text: l.overall + " OVR" }),
        el("p", { class: "muted", style: "text-align:left;font-size:14px;margin-top:14px", text: l.blurb }),
        l.blurb2 ? el("p", { class: "muted", style: "text-align:left;font-size:14px", text: l.blurb2 }) : null,
        ratings
      ]),
      footer: [el("button", { class: "btn btn--ghost", text: "Close", onclick: UI.closeModal })]
    });
  };

  /* Celebration queue — one modal per new unlock, shown back to back. */
  UI.celebrate = function (list, done) {
    if (!list.length) { if (done) done(); return; }
    const u = list[0];
    const rest = list.slice(1);
    const isTeam = u.kind === "team";
    const item = u.item;

    UI.modal({
      title: false,
      dismissible: false,
      body: el("div", { class: "unlock" }, [
        el("div", { class: "unlock__kicker", text: isTeam ? "Franchise unlocked · Day " + u.day : "Inducted · Day " + u.day }),
        el("div", {
          class: "unlock__art", style: "cursor:zoom-in", title: "Click to view full size",
          onclick: function () {
            window.Lightbox.open([{
              src: isTeam ? item.logo : item.portrait, title: item.name,
              sub: isTeam ? item.city : "Tier " + item.tier + " · " + item.tierName,
              meta: isTeam ? item.titles + " titles" : item.overall + " OVR"
            }], 0);
          }
        }, [
          el("img", { src: isTeam ? item.logo : item.portrait, alt: item.name })
        ]),
        el("div", { class: "unlock__name", text: item.name }),
        el("div", { class: "muted tiny" , text: isTeam
          ? item.city + " · " + item.titles + (item.titles === 1 ? " championship" : " championships")
          : "Tier " + item.tier + " " + item.tierName + " · " + item.overall + " OVR · #" + item.rank + " all-time" }),
        el("p", { class: "muted", style: "margin-top:14px;font-size:13.5px", text: isTeam
          ? "Three straight days in the ledger. That's a franchise."
          : "Five straight days. Another name in the rafters." })
      ]),
      footer: [
        el("button", {
          class: "btn btn--gold",
          text: rest.length ? "Next (" + rest.length + " more)" : "Let's go",
          onclick: function () { UI.closeModal(); UI.celebrate(rest, done); }
        })
      ]
    });
  };

  window.UI = UI;
})();
