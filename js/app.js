/* App shell: navigation, header, settings, and the unlock celebration hook. */
(function () {
  "use strict";
  const el = U.el;

  const TABS = [
    { id: "today", label: "Today" },
    { id: "weekly", label: "Weekly" },
    { id: "monthly", label: "Monthly" },
    { id: "portfolio", label: "Portfolio" },
    { id: "currency", label: "Currency" },
    { id: "collection", label: "Collection" },
    { id: "calendar", label: "Calendar" },
    { id: "progress", label: "Progress" },
    { id: "guide", label: "Guide" }
  ];

  const App = { current: "today" };
  let rendering = false;

  /* ---------------------------------------------------------------- header */

  function cloudButton() {
    const c = window.store.cloud;
    const label = !c.enabled ? "Local only"
      : c.status === "synced" ? (c.email || (c.anonymous ? "Anonymous" : "Synced"))
        : c.status === "signed-out" ? "Sign in"
          : c.status === "error" ? "Sync issue"
            : "Connecting…";

    return el("button", { class: "icon-btn", onclick: cloudModal, title: "Data sync" }, [
      el("span", { class: "cloud-dot", dataset: { status: c.enabled ? c.status : "local" } }),
      el("span", { text: label })
    ]);
  }

  /* Sun and moon are stacked and cross-faded by CSS, so the switch reads as
     one object rotating rather than two icons swapping. */
  function themeButton() {
    const svgNS = "http://www.w3.org/2000/svg";
    function icon(cls, paths) {
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("class", cls);
      paths.forEach(function (d) {
        const node = document.createElementNS(svgNS, d.tag);
        Object.keys(d.attrs).forEach((k) => node.setAttribute(k, d.attrs[k]));
        svg.appendChild(node);
      });
      return svg;
    }

    const sun = icon("theme-btn__sun", [
      { tag: "circle", attrs: { cx: 12, cy: 12, r: 4 } },
      { tag: "path", attrs: { d: "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" } }
    ]);
    const moon = icon("theme-btn__moon", [
      { tag: "path", attrs: { d: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" } }
    ]);

    return el("button", {
      class: "icon-btn theme-btn",
      title: "Theme: " + window.Theme.label() + " — click to change",
      "aria-label": "Switch theme (currently " + window.Theme.label() + ")",
      onclick: function () {
        window.Theme.toggle();
        U.toast("Theme: " + window.Theme.label());
        App.render();
      }
    }, el("span", { class: "theme-btn__stack" }, [sun, moon]));
  }

  function header(prog) {
    return el("header", { class: "topbar" }, [
      el("a", { class: "brand", href: "#today", onclick: (e) => { e.preventDefault(); App.go("today"); } }, [
        el("img", { class: "brand__mark", src: "assets/logo.png", alt: "" }),
        el("span", {}, [
          el("div", { class: "brand__name", text: "Banking on NBA" }),
          el("div", { class: "brand__sub", text: "Season tracker" })
        ])
      ]),
      el("div", { class: "topbar__spacer" }),
      el("div", { class: "streak-chip", title: "Consecutive days logged" }, [
        el("span", { class: "streak-chip__flame", text: prog.streak > 0 ? "🔥" : "🏀" }),
        el("span", { class: "streak-chip__n", text: String(prog.streak) }),
        el("span", { class: "streak-chip__l", text: "day streak" })
      ]),
      themeButton(),
      cloudButton(),
      el("button", { class: "icon-btn", text: "Settings", onclick: settingsModal })
    ]);
  }

  function nav(prog) {
    return el("nav", { class: "nav", "aria-label": "Sections" }, TABS.map(function (t) {
      const badge = t.id === "collection" ? prog.teams + prog.legends : null;
      return el("button", {
        class: "nav__item" + (App.current === t.id ? " is-active" : ""),
        onclick: () => App.go(t.id),
        "aria-current": App.current === t.id ? "page" : null
      }, [
        t.label,
        badge ? el("span", { class: "nav__badge", text: String(badge) }) : null
      ]);
    }));
  }

  /* -------------------------------------------------------------- settings */

  function settingsModal() {
    const st = window.store.state.settings;
    const body = el("div", {});

    const currency = UI.currencySelect("Currency", st.currency, {
      onchange: function (e) {
        const code = e.target.value;
        window.store.update((s) => { s.settings.currency = code; }, { reason: "settings" });
        // Pull the rate for the new display currency so the portfolio can
        // convert into it straight away.
        if (window.FX && !window.FX.usdRate(code) && code !== "USD") window.FX.refresh([code]);
      }
    });

    const theme = UI.select("Theme", [
      { value: "dark", label: "Dark" },
      { value: "light", label: "Light" },
      { value: "auto", label: "Auto — follow my device" }
    ], window.Theme.stored(), {
      onchange: function (e) { window.Theme.set(e.target.value); App.render(); }
    });

    const start = UI.input("Season start (day 1 of 365)", {
      type: "date", value: st.startDate,
      onchange: (e) => window.store.update((s) => { s.settings.startDate = e.target.value || U.today(); }, { reason: "settings" })
    });

    const opening = UI.amountField("Opening balance", st.openingBalance, {
      onchange: (e) => window.store.update((s) => { s.settings.openingBalance = Number(e.target.value) || 0; }, { reason: "settings" })
    });

    const name = UI.input("Your name (optional)", {
      value: st.name || "", placeholder: "Shows nowhere but here",
      onchange: (e) => window.store.update((s) => { s.settings.name = e.target.value; }, { reason: "settings" })
    });

    body.appendChild(el("div", { class: "form-grid form-grid--wide" }, [currency, theme, start, opening, name]));

    body.appendChild(el("hr", { class: "divider" }));
    body.appendChild(el("div", { class: "eyebrow", text: "Your data" }));
    body.appendChild(el("p", { class: "hint", text: "Export downloads everything as a JSON file — transactions, budgets, bills, unlocks and the price cache." }));
    body.appendChild(el("div", { class: "row", style: "margin-top:10px" }, [
      el("button", { class: "btn btn--ghost btn--sm", text: "Export backup", onclick: exportData }),
      el("button", { class: "btn btn--ghost btn--sm", text: "Import backup", onclick: importData }),
      el("button", { class: "btn btn--red btn--sm", text: "Reset season", onclick: function () {
        UI.confirm("This erases every transaction, budget, bill and unlock, and starts a brand-new season from today. Export a backup first if you might want any of it back.", function () {
          window.store.reset();
          U.toast("Season reset. Day one.");
        }, { title: "Reset everything?", confirmLabel: "Reset it all" });
      } })
    ]));

    body.appendChild(el("hr", { class: "divider" }));
    body.appendChild(el("p", { class: "hint", text: "Banking on NBA v" + window.APP.version +
      " · budget data stays in your browser unless Firebase sync is switched on." }));

    UI.modal({ title: "Settings", body: body,
      footer: [el("button", { class: "btn", text: "Done", onclick: UI.closeModal })] });
  }

  function exportData() {
    const blob = new Blob([window.store.export()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "banking-on-nba-" + U.today() + ".json" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    U.toast("Backup downloaded.");
  }

  function importData() {
    const input = el("input", { type: "file", accept: "application/json,.json" });
    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          window.store.import(String(reader.result));
          UI.closeModal();
          U.toast("Backup restored.");
        } catch (e) {
          U.toast(e.message || "That file couldn't be read.", "error");
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /* ----------------------------------------------------------------- cloud */

  function cloudModal() {
    const c = window.store.cloud;
    const body = el("div", { class: "prose" });

    if (!c.enabled) {
      body.appendChild(el("p", { text: "Sync is switched off because no Firebase project is configured. Everything works — your season is saved in this browser — but it stays on this device." }));
      body.appendChild(el("h4", { text: "To turn sync on" }));
      body.appendChild(el("ol", {}, [
        el("li", { html: "Create a free Firebase project and enable <b>Authentication</b> and <b>Cloud Firestore</b>." }),
        el("li", { html: "Copy the web app config into <code>js/config.js</code>." }),
        el("li", { html: "Paste the security rules from the README and publish them." })
      ]));
      body.appendChild(el("p", { class: "hint", text: "Full walkthrough in README.md, section \"Setting up Firebase\". Until then, use Settings → Export for backups." }));
    } else if (c.status === "signed-out" || !c.uid) {
      body.appendChild(el("p", { text: "Sign in to carry this season across your phone, laptop and tablet. Changes sync live." }));
      const email = UI.input("Email", { type: "email", placeholder: "you@example.com", id: "c-email" });
      const pass = UI.input("Password", { type: "password", placeholder: "At least 6 characters", id: "c-pass" });
      body.appendChild(el("div", { class: "row", style: "margin:14px 0" }, [
        el("button", { class: "btn", text: "Continue with Google", onclick: () => window.store.signInWithGoogle() }),
        el("button", { class: "btn btn--ghost", text: "Use anonymously", onclick: () => window.store.signInAnonymously() })
      ]));
      body.appendChild(el("hr", { class: "divider" }));
      body.appendChild(el("div", { class: "form-grid" }, [email, pass]));
      body.appendChild(el("div", { class: "row", style: "margin-top:12px" }, [
        el("button", { class: "btn btn--ghost btn--sm", text: "Sign in", onclick: function () {
          window.store.signInWithEmail(body.querySelector("#c-email").value.trim(), body.querySelector("#c-pass").value, false);
        } }),
        el("button", { class: "btn btn--ghost btn--sm", text: "Create account", onclick: function () {
          window.store.signInWithEmail(body.querySelector("#c-email").value.trim(), body.querySelector("#c-pass").value, true);
        } })
      ]));
    } else {
      body.appendChild(el("p", {}, [
        "Signed in as ",
        el("b", { text: c.email || "an anonymous session" }),
        ". Your season syncs automatically to every device you sign in from."
      ]));
      body.appendChild(el("p", { class: "hint", text: "Status: " + c.status + (c.error ? " · " + c.error : "") }));
      if (c.anonymous) {
        body.appendChild(el("p", { class: "warn tiny", text: "Anonymous sessions live in this browser only. Clearing site data loses them — link a Google account to make it permanent. Nothing already logged is lost when you link." }));
        body.appendChild(el("button", { class: "btn btn--sm", style: "margin-top:8px", text: "Link a Google account", onclick: () => window.store.linkGoogle() }));
      }
      body.appendChild(el("div", { class: "row", style: "margin-top:16px" }, [
        el("button", { class: "btn btn--ghost btn--sm", text: "Sign out", onclick: function () {
          window.store.signOut(); UI.closeModal(); U.toast("Signed out. Data stays in this browser.");
        } })
      ]));
    }

    if (c.error) {
      body.appendChild(el("p", { class: "neg tiny", style: "margin-top:14px", text: c.error }));
    }

    UI.modal({ title: "Data sync", body: body,
      footer: [el("button", { class: "btn btn--ghost", text: "Close", onclick: UI.closeModal })] });
  }

  /* ---------------------------------------------------------------- render */

  App.go = function (id) {
    if (!TABS.some((t) => t.id === id)) id = "today";
    App.current = id;
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* file:// */ }
    App.render();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    if (id !== "portfolio" && window.Views.portfolioStop) window.Views.portfolioStop();
    if (id === "portfolio" && window.Views.portfolioInit) window.Views.portfolioInit();
    if (id === "currency" && window.Views.currencyInit) window.Views.currencyInit();
  };

  App.render = function () {
    if (rendering) return;
    rendering = true;
    try {
      const prog = window.Game.progress();
      const root = document.getElementById("app");
      root.innerHTML = "";

      const shell = el("div", { class: "shell" }, [
        header(prog),
        nav(prog),
        el("main", { class: "main", id: "view" }, (window.Views[App.current] || window.Views.today)())
      ]);
      root.appendChild(shell);
      if (window.Motion) window.Motion.hydrate(root);

      if (!document.querySelector(".fab")) {
        document.body.appendChild(el("button", {
          class: "fab", "aria-label": "Log an entry", html: "+",
          onclick: () => UI.quickAdd({})
        }));
      }
    } catch (err) {
      console.error(err);
      document.getElementById("app").innerHTML =
        '<div class="main"><div class="card"><div class="card__title">Something broke</div>' +
        '<p class="muted">' + U.esc(err.message) + '</p>' +
        '<p class="hint">Your data is safe. Reload the page, or use Settings → Export from a working tab.</p></div></div>';
    } finally {
      rendering = false;
    }
    checkCelebrations();
  };

  /* ---------------------------------------------------------- celebrations */

  let celebrating = false;
  function checkCelebrations() {
    if (celebrating) return;
    const prog = window.Game.progress();
    const pending = window.Game.pendingCelebrations(prog);
    if (!pending.length) return;
    // Don't replay history on a fresh import — only celebrate the last few.
    const show = pending.slice(-3);
    window.Game.markSeen(pending);
    celebrating = true;
    setTimeout(function () {
      UI.celebrate(show, function () { celebrating = false; App.render(); });
    }, 380);
  }

  /* ------------------------------------------------------------------ boot */

  App.start = async function () {
    /* Async failures used to disappear into the console. Surface them, so a
       problem reports itself instead of looking like nothing happened. */
    window.addEventListener("unhandledrejection", function (e) {
      const msg = (e.reason && (e.reason.message || e.reason)) || "unknown error";
      console.error("Unhandled:", e.reason);
      U.toast("Something didn't finish: " + String(msg).slice(0, 90), "error");
    });

    window.Theme.init();
    if (window.Motion) window.Motion.installRipples();
    // Re-render on an OS theme change so any inline colours follow along.
    window.Theme.onChange(function () { if (!rendering) App.render(); });

    window.store.load();

    // First run: mark everything already earned as seen so an imported or
    // pre-existing ledger doesn't fire 40 modals at once.
    const prog = window.Game.progress();
    if (!Object.keys(window.store.state.game.seen || {}).length && prog.unlockLog.length > 3) {
      window.Game.markSeen(prog.unlockLog);
    }

    const hash = (location.hash || "").replace("#", "");
    if (hash && TABS.some((t) => t.id === hash)) App.current = hash;

    window.store.subscribe(function (state, reason) {
      if (reason === "cloud" || reason === "replace" || reason === "import" || reason === "reset") App.render();
      else App.render();
    });

    App.render();

    if (App.current === "portfolio" && window.Views.portfolioInit) window.Views.portfolioInit();
    if (App.current === "currency" && window.Views.currencyInit) window.Views.currencyInit();

    await window.Prices.bootstrap();
    window.store.initCloud();

    // Exchange rates warm up quietly; the converter works the moment you open it.
    setTimeout(function () {
      window.FX.ensure().then(function (r) {
        if (r && App.current === "currency") App.render();
      });
    }, 900);

    // Warm the price cache in the background so the Portfolio tab is instant.
    setTimeout(function () {
      const stale = window.Prices.holdings().filter((h) => window.Prices.isStale(window.Prices.cached(h.ticker)));
      if (stale.length) window.Prices.refreshAll().then(function () {
        if (App.current === "portfolio") App.render();
      });
    }, 600);

    window.addEventListener("hashchange", function () {
      const h = (location.hash || "").replace("#", "");
      if (h && h !== App.current && TABS.some((t) => t.id === h)) App.go(h);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden && window.Views.portfolioStop) window.Views.portfolioStop();
      else if (App.current === "portfolio" && window.Views.portfolioInit) window.Views.portfolioInit();
    });

    // Keyboard: N logs a new entry from anywhere.
    document.addEventListener("keydown", function (e) {
      if (e.target.matches("input, textarea, select")) return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); UI.quickAdd({}); }
    });
  };

  window.App = App;
  document.addEventListener("DOMContentLoaded", App.start);
})();
