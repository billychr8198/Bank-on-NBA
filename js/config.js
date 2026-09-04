/* ============================================================================
   Banking on NBA — configuration
   ----------------------------------------------------------------------------
   FIREBASE: paste the config object from your Firebase console here.
   Leave the values empty to run the app in local-only mode (data stays in this
   browser). Full walkthrough in README.md → "Setting up Firebase".
   ========================================================================== */

window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

/* ========================================================================== */

window.APP = {
  version: "2.0.0",
  storageKey: "banking-on-nba:v1",
  seasonLength: 365,

  /* --- gamification ------------------------------------------------------ */
  phase1: { target: 30, streak: 3, label: "Franchise Era" },   // 30 teams  × 3 days = 90
  phase2: { target: 55, streak: 5, label: "Hall of Fame Era" }, // 55 legends × 5 days = 275

  /* --- money ------------------------------------------------------------- */
  /* The full ISO 4217 table lives in js/data/currencies.js. */
  get currencies() { return window.CURRENCIES; },
  defaultCurrency: "IDR",


  /* Box-score style category codes. `variable` categories are the ones the
     weekly safe-to-spend engine controls. */
  categories: [
    { id: "groceries",     code: "GRO", name: "Groceries",       variable: true,  color: "#5AA469" },
    { id: "dining",        code: "DIN", name: "Food & drink",    variable: true,  color: "#D9793E" },
    { id: "transport",     code: "TRN", name: "Transport",       variable: true,  color: "#3E8ED0" },
    { id: "shopping",      code: "SHP", name: "Shopping",        variable: true,  color: "#B268C4" },
    { id: "entertainment", code: "ENT", name: "Entertainment",   variable: true,  color: "#E0B54C" },
    { id: "health",        code: "HLT", name: "Health",          variable: true,  color: "#E0576B" },
    { id: "education",     code: "EDU", name: "Education",       variable: true,  color: "#4FB5AE" },
    { id: "personal",      code: "PSN", name: "Personal care",   variable: true,  color: "#9C8DDB" },
    { id: "household",     code: "HSE", name: "Household",       variable: true,  color: "#A98A6B" },
    { id: "gifts",         code: "GFT", name: "Gifts & giving",  variable: true,  color: "#D96B8E" },
    { id: "other",         code: "OTH", name: "Other",           variable: true,  color: "#8A8F98" },
    { id: "bills",         code: "BIL", name: "Bills & fixed",   variable: false, color: "#6E7B8B" },
    { id: "sinking",       code: "SNK", name: "Sinking fund",    variable: false, color: "#7E93AE" },
    { id: "savings",       code: "SAV", name: "Savings goal",    variable: false, color: "#3FA96B" },
    { id: "debt",          code: "DBT", name: "Debt payoff",     variable: false, color: "#CE2B37" }
  ],

  incomeKinds: [
    { id: "salary",    name: "Salary",    note: "Fixed, predictable payroll" },
    { id: "freelance", name: "Freelance", note: "Project or invoice revenue" },
    { id: "passive",   name: "Passive",   note: "Dividends, rent, interest, royalties" },
    { id: "gift",      name: "Gift",      note: "Money received, no work attached" },
    { id: "refund",    name: "Refund",    note: "Returns, reimbursements, cashback" },
    { id: "other",     name: "Other",     note: "Anything else" }
  ],

  methods: [
    { id: "cash",     name: "Cash" },
    { id: "debit",    name: "Debit card" },
    { id: "credit",   name: "Credit card" },
    { id: "ewallet",  name: "E-wallet" },
    { id: "transfer", name: "Bank transfer" }
  ],

  /* --- league indicators -------------------------------------------------
     Baselines are the real 2024-25 NBA figures. `gmax` is the most a single
     season could realistically move that number; ticket sales get a low
     ceiling because arenas already run near capacity, viewership gets a high
     one because audiences genuinely swing that much year to year.
     ---------------------------------------------------------------------- */
  gamesPerSeason: 1230,          // 30 teams × 82 games ÷ 2
  countriesAtBaseline: 214,      // NBA distribution footprint
  countriesCeiling: 232,         // there is no 275th country to sell rights in
  saturationTau: 120,            // days; controls the diminishing-returns curve

  indicators: [
    {
      id: "viewership", name: "National viewership", short: "VIEW",
      unit: "M viewers/game", base: 1.60, gmax: 0.35, dp: 2, accent: "#2F6BD1",
      measure: "Average live audience for nationally televised regular-season games.",
      basis: "2024-25 national average ≈ 1.60 million viewers per game.",
      nameId: "Jumlah penonton", measureId: "Rata-rata penonton langsung untuk laga reguler yang disiarkan nasional.",
      basisId: "Rata-rata nasional 2024-25 ≈ 1,60 juta penonton per laga."
    },
    {
      id: "tickets", name: "Ticket sales", short: "TIX",
      unit: "M tickets/season", base: 22.50, gmax: 0.08, dp: 2, accent: "#E0B54C",
      measure: "Total paid regular-season attendance across all 1,230 games.",
      basis: "2024-25 ≈ 22.5M tickets, about 18,300 per game. Arenas sit near capacity, so headroom is small by design.",
      nameId: "Penjualan tiket", measureId: "Total penonton berbayar sepanjang 1.230 laga musim reguler.",
      basisId: "2024-25 ≈ 22,5 juta tiket, sekitar 18.300 per laga. Arena sudah nyaris penuh, jadi ruang tumbuhnya memang sempit."
    },
    {
      id: "popularity", name: "Global popularity", short: "GPI",
      unit: "index /100", base: 72.0, gmax: 0.22, dp: 1, cap: 100, accent: "#CE2B37",
      measure: "Composite index: 45% social-follower reach, 35% international broadcast households, 20% League Pass subscriptions outside the US.",
      basis: "Baseline set at 72/100 — strong but well short of saturation.",
      nameId: "Popularitas global", measureId: "Indeks gabungan: 45% jangkauan pengikut media sosial, 35% rumah tangga penyiaran internasional, 20% langganan League Pass di luar AS.",
      basisId: "Titik awal 72/100 — kuat, tapi masih jauh dari jenuh."
    },
    {
      id: "broadcasters", name: "Broadcast partners", short: "BCST",
      unit: "rights holders", base: 70, gmax: 0.30, dp: 0, accent: "#4FB5AE",
      measure: "Count of international media-rights partners carrying live NBA games.",
      basis: "≈70 partners delivering games to 214 countries and territories in 60+ languages.",
      nameId: "Mitra penyiaran", measureId: "Jumlah pemegang hak siar internasional yang menayangkan laga NBA secara langsung.",
      basisId: "≈70 mitra yang menyalurkan laga ke 214 negara dan teritori dalam lebih dari 60 bahasa."
    },
    {
      id: "revenue", name: "League revenue", short: "REV",
      unit: "B USD/season", base: 13.00, gmax: 0.18, dp: 2, accent: "#3FA96B",
      measure: "Basketball-related income: national and local media rights, gate receipts, sponsorship and merchandise.",
      basis: "2024-25 league-wide revenue ≈ $13.0 billion.",
      nameId: "Pendapatan liga", measureId: "Pendapatan terkait bola basket: hak siar nasional dan lokal, penjualan tiket, sponsor, dan merchandise.",
      basisId: "Pendapatan liga 2024-25 ≈ US$13,0 miliar."
    }
  ],

  /* --- market data -------------------------------------------------------
     The GitHub Action writes data/prices/<TICKER>.json once a day. If that
     file is missing or stale the app falls back to a live fetch through one
     of these CORS relays. Order matters — first one to answer wins.
     ---------------------------------------------------------------------- */
  priceProxies: [
    "https://corsproxy.io/?url=",
    "https://api.allorigins.win/raw?url=",
    "https://api.codetabs.com/v1/proxy/?quest="
  ],
  yahooChart: "https://query1.finance.yahoo.com/v8/finance/chart/",
  priceStaleHours: 30,          // when to bypass the committed snapshot
  livePollSeconds: 60,          // portfolio auto-refresh cadence when Live is on

  /* --- exchange rates -----------------------------------------------------
     These endpoints send CORS headers, so the browser calls them directly —
     no relay in this path at all. One request returns every currency quoted
     against USD, so a full refresh is a single round trip.
     Tried in order; first to answer wins.
     ---------------------------------------------------------------------- */
  fxStaleHours: 12,
  fxSources: [
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
    "https://latest.currency-api.pages.dev/v1/currencies/usd.min.json",
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    "https://latest.currency-api.pages.dev/v1/currencies/usd.json"
  ],
  /* ECB reference rates — ~30 currencies only, so this is a backstop rather
     than a replacement. Used only if every source above is unreachable. */
  fxFallbacks: [
    "https://api.frankfurter.app/latest?from=USD",
    "https://api.frankfurter.dev/v1/latest?base=USD"
  ]
};
