/* ============================================================================
   Store — one plain object holds everything. Saved to this browser, and mirrored
   to Firestore when a Firebase config is present so the same data shows up on
   every device you sign in from.
   ========================================================================== */
(function () {
  "use strict";

  const KEY = window.APP.storageKey;
  const listeners = [];
  let memoryOnly = null;          // fallback when localStorage is blocked

  function defaults() {
    const today = U.today();
    return {
      schema: 1,
      updatedAt: Date.now(),
      settings: {
        currency: "IDR",
        startDate: today,           // day 1 of the 365-day season
        weekStart: "monday",        // monday | sunday | payday
        paydayAnchor: today,
        cycleStartDay: 1,           // day of month the billing cycle rolls over
        openingBalance: 0,
        name: "",
        guideLang: "en"             // guide tab language: en | id
      },
      income: [],                   // { id, name, kind, amount, day }
      bills: [],                    // { id, name, amount, dueDay, category, subscription, paid:{ "YYYY-MM": true } }
      sinking: [],                  // { id, name, annual, saved, dueMonth }
      goals: [],                    // { id, name, kind:'savings'|'debt', monthly, target, current }
      budgets: {},                  // { categoryId: plannedMonthlyAmount }
      tx: [],                       // { id, date, type, amount, category, method, merchant, note, fixed, toMethod, ts }
      portfolio: { holdings: [], live: false },
                                    // holding: { ticker, name, currency,
                                    //   lots:  [{id,date,shares,price,fee}],
                                    //   sells: [{id,date,shares,price,fee}] }
      prices: {},                   // cache: { TICKER: { updated, currency, series:[{d,c}], live, meta } }
      fx: { base: "USD", rates: {}, updated: null, date: null, source: null },
      converter: { from: "IDR", to: "USD", amount: 100000 },
      game: { seen: {} },
      ui: { month: U.monthKey(today) }
    };
  }

  const store = {
    state: defaults(),
    cloud: { enabled: false, status: "local", uid: null, email: null, error: null }
  };

  /* -------------------------------------------------------- local storage */

  function readLocal() {
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return memoryOnly; }
  }

  function writeLocal(state) {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { memoryOnly = state; }
  }

  /* Merge a loaded blob over the defaults so new fields added in later
     versions never come back undefined. */
  /* Object.assign(base, raw) would alias base.settings to raw.settings, and
     the nested merges below would then merge raw onto itself — silently
     dropping every default the backup happened not to contain. Building
     fresh objects keeps the defaults intact. */
  function hydrate(raw) {
    const base = defaults();
    if (!raw || typeof raw !== "object") return base;
    const out = Object.assign({}, base, raw);
    out.settings = Object.assign({}, base.settings, raw.settings || {});
    out.portfolio = Object.assign({}, base.portfolio, raw.portfolio || {});
    out.game = Object.assign({}, base.game, raw.game || {});
    out.ui = Object.assign({}, base.ui, raw.ui || {});
    ["income", "bills", "sinking", "goals", "tx"].forEach(function (k) {
      if (!Array.isArray(out[k])) out[k] = [];
    });
    if (!Array.isArray(out.portfolio.holdings)) out.portfolio.holdings = [];
    /* v1 → v2: holdings predate selling, so give each one the arrays the
       ledger expects rather than guarding for undefined at every call site. */
    out.portfolio.holdings.forEach(function (h) {
      if (!Array.isArray(h.lots)) h.lots = [];
      if (!Array.isArray(h.sells)) h.sells = [];
    });
    if (typeof out.portfolio.live !== "boolean") out.portfolio.live = false;
    out.fx = Object.assign({}, base.fx, raw.fx || {});
    if (!out.fx.rates || typeof out.fx.rates !== "object") out.fx.rates = {};
    out.converter = Object.assign({}, base.converter, raw.converter || {});
    if (!window.CURRENCIES[out.settings.currency]) out.settings.currency = window.APP.defaultCurrency;
    if (!out.budgets || typeof out.budgets !== "object") out.budgets = {};
    if (!out.prices || typeof out.prices !== "object") out.prices = {};
    return out;
  }

  /* --------------------------------------------------------------- events */

  store.subscribe = function (fn) { listeners.push(fn); return () => {
    const i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1);
  }; };

  store.emit = function (reason) {
    listeners.forEach(function (fn) { try { fn(store.state, reason); } catch (e) { console.error(e); } });
  };

  /* Mutate + persist + notify. `silent` skips the re-render. */
  store.update = function (fn, opts) {
    opts = opts || {};
    fn(store.state);
    store.state.updatedAt = Date.now();
    writeLocal(store.state);
    pushCloud();
    if (!opts.silent) store.emit(opts.reason || "update");
  };

  store.load = function () {
    store.state = hydrate(readLocal());
    return store.state;
  };

  store.replace = function (raw, reason) {
    store.state = hydrate(raw);
    writeLocal(store.state);
    store.emit(reason || "replace");
  };

  store.export = function () { return JSON.stringify(store.state, null, 2); };

  store.import = function (json) {
    const raw = typeof json === "string" ? JSON.parse(json) : json;
    if (!raw || typeof raw !== "object") throw new Error("That file isn't a Banking on NBA backup.");
    raw.updatedAt = Date.now();
    store.replace(raw, "import");
  };

  store.reset = function () {
    store.state = defaults();
    writeLocal(store.state);
    pushCloud();
    store.emit("reset");
  };

  /* ================================================================ cloud */

  let fb = null;                 // { app, auth, db, fns... }
  let unsubDoc = null;
  let applyingRemote = false;

  function configured() {
    const c = window.FIREBASE_CONFIG || {};
    return Boolean(c.apiKey && c.projectId && c.appId);
  }
  store.cloudConfigured = configured;

  function setCloud(patch) {
    Object.assign(store.cloud, patch);
    store.emit("cloud");
  }

  store.initCloud = async function () {
    if (!configured()) { setCloud({ enabled: false, status: "local" }); return; }
    setCloud({ enabled: true, status: "connecting" });
    try {
      const [appMod, authMod, fsMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
      ]);
      const app = appMod.initializeApp(window.FIREBASE_CONFIG);
      const auth = authMod.getAuth(app);
      const db = fsMod.getFirestore(app);
      fb = { app, auth, db, authMod, fsMod };

      authMod.onAuthStateChanged(auth, function (user) {
        if (unsubDoc) { unsubDoc(); unsubDoc = null; }
        if (!user) { setCloud({ status: "signed-out", uid: null, email: null }); return; }
        setCloud({
          status: "syncing", uid: user.uid,
          email: user.isAnonymous ? null : (user.email || user.displayName || null),
          anonymous: user.isAnonymous
        });
        watchDoc(user.uid);
      });
    } catch (err) {
      console.error("Firebase init failed", err);
      setCloud({ status: "error", error: err.message || String(err) });
    }
  };

  function docRef(uid) {
    return fb.fsMod.doc(fb.db, "users", uid, "state", "main");
  }

  function watchDoc(uid) {
    unsubDoc = fb.fsMod.onSnapshot(docRef(uid), function (snap) {
      if (!snap.exists()) { pushCloud(true); setCloud({ status: "synced" }); return; }
      const remote = snap.data();
      const payload = remote && remote.blob ? safeParse(remote.blob) : null;
      if (!payload) { setCloud({ status: "synced" }); return; }
      // Newest write wins. Ties keep the local copy.
      if ((payload.updatedAt || 0) > (store.state.updatedAt || 0)) {
        applyingRemote = true;
        store.replace(payload, "cloud");
        applyingRemote = false;
      }
      setCloud({ status: "synced" });
    }, function (err) {
      console.error("Firestore listen failed", err);
      setCloud({ status: "error", error: err.message || String(err) });
    });
  }

  function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  const pushCloud = U.debounce(function (force) {
    if (!fb || !store.cloud.uid || (applyingRemote && !force)) return;
    // Firestore caps a field at 1 MiB; the blob keeps the whole doc to one write.
    const blob = JSON.stringify(store.state);
    fb.fsMod.setDoc(docRef(store.cloud.uid), {
      blob: blob,
      updatedAt: store.state.updatedAt,
      version: window.APP.version
    }).then(function () {
      if (store.cloud.status !== "synced") setCloud({ status: "synced" });
    }).catch(function (err) {
      console.error("Firestore write failed", err);
      setCloud({ status: "error", error: err.message || String(err) });
    });
  }, 900);

  store.signInAnonymously = async function () {
    if (!fb) return;
    setCloud({ status: "connecting" });
    try { await fb.authMod.signInAnonymously(fb.auth); }
    catch (e) { setCloud({ status: "error", error: friendlyAuthError(e) }); }
  };

  store.signInWithGoogle = async function () {
    if (!fb) return;
    setCloud({ status: "connecting" });
    try {
      const provider = new fb.authMod.GoogleAuthProvider();
      await fb.authMod.signInWithPopup(fb.auth, provider);
    } catch (e) { setCloud({ status: "error", error: friendlyAuthError(e) }); }
  };

  store.signInWithEmail = async function (email, password, isNew) {
    if (!fb) return;
    setCloud({ status: "connecting" });
    try {
      if (isNew) await fb.authMod.createUserWithEmailAndPassword(fb.auth, email, password);
      else await fb.authMod.signInWithEmailAndPassword(fb.auth, email, password);
    } catch (e) { setCloud({ status: "error", error: friendlyAuthError(e) }); }
  };

  /* Turns an anonymous session into a permanent Google account, keeping the
     same uid so nothing already logged is lost. */
  store.linkGoogle = async function () {
    if (!fb || !fb.auth.currentUser) return;
    try {
      const provider = new fb.authMod.GoogleAuthProvider();
      await fb.authMod.linkWithPopup(fb.auth.currentUser, provider);
      U.toast("Account linked. Your season now follows you across devices.");
    } catch (e) { setCloud({ status: "error", error: friendlyAuthError(e) }); }
  };

  store.signOut = async function () {
    if (!fb) return;
    if (unsubDoc) { unsubDoc(); unsubDoc = null; }
    await fb.authMod.signOut(fb.auth);
  };

  function friendlyAuthError(e) {
    const c = (e && e.code) || "";
    if (c.includes("popup-blocked")) return "Your browser blocked the sign-in popup. Allow popups for this site and try again.";
    if (c.includes("popup-closed")) return "Sign-in window closed before it finished.";
    if (c.includes("operation-not-allowed")) return "That sign-in method is switched off in the Firebase console. Enable it under Authentication → Sign-in method.";
    if (c.includes("unauthorized-domain")) return "This domain isn't on the Firebase authorised list. Add it under Authentication → Settings → Authorised domains.";
    if (c.includes("invalid-credential") || c.includes("wrong-password")) return "Email or password didn't match.";
    if (c.includes("email-already-in-use")) return "That email already has an account. Sign in instead.";
    if (c.includes("weak-password")) return "Password needs at least 6 characters.";
    return (e && e.message) || "Sign-in failed.";
  }

  window.store = store;
})();
