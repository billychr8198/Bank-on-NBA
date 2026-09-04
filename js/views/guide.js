/* GUIDE — how the whole thing works, in the order a new user needs it. */
(function () {
  "use strict";
  const el = U.el;
  let open = "start";

  /* Language is remembered across sessions — an Indonesian reader shouldn't
     have to flip the switch every time they open the guide. */
  function lang() {
    const v = window.store.state.settings.guideLang;
    return v === "id" ? "id" : "en";
  }
  function setLang(v) {
    window.store.update(function (s) { s.settings.guideLang = v; }, { silent: true });
    window.App.render();
  }
  function t(en, id) { return lang() === "id" ? id : en; }

  /* Language labels live in a nested object on purpose. They used to be
     `{ id: "start", en: "...", id: "..." }` — two keys called `id`, so the
     Indonesian label silently overwrote the section identifier and every
     chip click looked up a section that didn't exist. */
  const SECTIONS = [
    { key: "start",      label: { en: "Start here",               id: "Mulai di sini" } },
    { key: "daily",      label: { en: "The daily ritual",         id: "Rutinitas harian" } },
    { key: "money",      label: { en: "How the money math works", id: "Cara hitungan uangnya" } },
    { key: "weekly",     label: { en: "Weeks & pay cycles",       id: "Minggu & siklus gajian" } },
    { key: "game",       label: { en: "Unlock rules",             id: "Aturan membuka koleksi" } },
    { key: "indicators", label: { en: "Indicator formulas",       id: "Rumus indikator" } },
    { key: "portfolio",  label: { en: "Investments",              id: "Investasi" } },
    { key: "currency",   label: { en: "Currency converter",       id: "Konverter mata uang" } },
    { key: "collection", label: { en: "Teams & legends",          id: "Tim & legenda" } },
    { key: "sync",       label: { en: "Sync & backups",           id: "Sinkronisasi & cadangan" } },
    { key: "trouble",    label: { en: "When something breaks",    id: "Kalau ada yang error" } },
    { key: "faq",        label: { en: "Questions",                id: "Pertanyaan" } }
  ];

  function p(t) { return el("p", { text: t }); }
  function h4(t) { return el("h4", { text: t }); }
  function ul(items) { return el("ul", {}, items.map((i) => el("li", { html: i }))); }
  function ol(items) { return el("ol", {}, items.map((i) => el("li", { html: i }))); }
  function formula(t) { return el("div", { class: "formula", text: t }); }

  const CONTENT_EN = {
    start: () => el("div", { class: "prose" }, [
      p("Banking on NBA is a budget tracker with a season attached. You log your money every day; the league grows because you did. Miss a day and the run resets — that's the whole pressure mechanic."),
      h4("Set it up once"),
      ol([
        "Open <b>Settings</b> (top right) and pick your currency and season start date.",
        "Go to <b>Monthly</b> and add your income sources — salary, freelance, anything predictable.",
        "Add your fixed bills with their due dates, then any sinking funds and savings or debt targets.",
        "Set category budgets at the bottom of the Monthly tab. What's left over becomes your variable pool.",
        "Come back to <b>Today</b> and log your first expense."
      ]),
      h4("Then just do this"),
      p("Open the app once a day, log what you spent, and close it. Everything else — streaks, unlocks, indicators, weekly ceilings — recalculates from your ledger automatically."),
      el("div", { class: "row", style: "margin-top:18px" }, [
        el("button", { class: "btn", text: "Go to Today", onclick: () => window.App.go("today") }),
        el("button", { class: "btn btn--ghost", text: "Set up income & bills", onclick: () => window.App.go("monthly") })
      ])
    ]),

    daily: () => el("div", { class: "prose" }, [
      p("A day counts as logged the moment it has one transaction with that date on it. One entry is enough to keep the streak and earn the boost — but the numbers only help you if they're real, so log everything."),
      h4("What each entry captures"),
      ul([
        "<b>Amount</b> — the only required field.",
        "<b>Date</b> — defaults to today, but you can backfill. Backfilling repairs a broken streak, because unlocks are recalculated from the ledger every time it changes.",
        "<b>Category</b> — box-score codes. GRO, DIN, TRN and the rest are variable spending; BIL, SNK, SAV and DBT are fixed and stay out of your weekly allowance.",
        "<b>Payment method</b> — cash, debit, credit, e-wallet or bank transfer. Drives the per-account balances.",
        "<b>Merchant and note</b> — optional, but they're what make last month's list readable."
      ]),
      h4("Three ways to log"),
      ul([
        "The quick-entry form on the <b>Today</b> tab.",
        "The red <b>+</b> button, floating bottom-right on phones.",
        "Click any square in the <b>Calendar</b> and add an entry to that specific day."
      ]),
      h4("Income and transfers"),
      p("Switch the form to Income for salary, freelance payments, gifts or refunds. Transfers move money between your own accounts — they change the per-method balances but never count as spending.")
    ]),

    money: () => el("div", { class: "prose" }, [
      p("Three layers, each feeding the next. Nothing is discretionary until every obligation has been taken out first."),
      h4("Layer 1 — the month"),
      formula("variable pool = income − fixed bills − sinking funds − savings − debt"),
      p("Sinking funds divide an annual cost by twelve so an insurance premium never lands on one unlucky month. Savings and debt payments are subtracted before the pool exists, which is the whole point — a goal you fund out of leftovers isn't a goal."),
      h4("Layer 2 — the week"),
      formula("weekly ceiling = (variable pool − spent earlier in the cycle) ÷ weeks left"),
      p("The ceiling is set when the week opens and then held steady, so your countdown only moves when you actually spend. Weeks can follow the calendar or your own payday rhythm — set that on the Weekly tab."),
      h4("Layer 3 — the day"),
      formula("today's budget = (weekly ceiling − spent this week) ÷ days left in the week"),
      p("Unspent money rolls forward automatically. Underspend on Monday and Tuesday's number goes up on its own; blow out Monday and the rest of the week tightens to absorb it."),
      h4("Planned versus actual"),
      p("The Monthly tab compares your category budgets against what actually happened and shows the surplus or deficit per category. Green means you had room left; red means the category ran over.")
    ]),

    game: () => el("div", { class: "prose" }, [
      p("The season runs 365 days from your start date, in two phases that fit the calendar exactly."),
      h4("Phase 1 — Franchise Era"),
      ul([
        "Every <b>3 consecutive</b> logged days unlocks one NBA franchise.",
        "30 franchises × 3 days = <b>90 days</b>.",
        "Teams unlock in league order: Eastern Conference by division, then Western."
      ]),
      h4("Phase 2 — Hall of Fame Era"),
      ul([
        "Opens the moment all 30 franchises are unlocked.",
        "Every <b>5 consecutive</b> logged days inducts one legend.",
        "55 legends × 5 days = <b>275 days</b>.",
        "Induction runs Tier 5 up to Tier 1, so the difficulty of the reward climbs as your habit does. Michael Jordan is the 55th and lands on day 365."
      ]),
      formula("90 + 275 = 365 — a perfect season unlocks everything on the final day"),
      h4("What a missed day costs"),
      p("Missing a day resets your progress toward the next unlock to zero, but never takes away something you already own. Your boost also stops growing that day, since boost is simply the count of days you logged."),
      p("Because both phases need consecutive days, consistency is worth far more than volume. Thirty scattered days unlock nothing at all; thirty straight days unlock ten franchises.")
    ]),

    indicators: () => el("div", { class: "prose" }, [
      p("Five league indicators sit on the jumbotron. Each starts at its real 2024-25 value and climbs as you log."),
      formula("value = baseline × ( 1 + maxLift × ( 1 − e^( −loggedDays ÷ 120 ) ) )"),
      p("Every logged day is one point of momentum — the +1% you see on the scoreboard. The exponential term applies diminishing returns, so a flawless 365-day season reaches 95.2% of each indicator's realistic ceiling instead of compounding to nonsense. Straight 1%-a-day compounding would multiply league revenue by 37× in a year, which is not a thing that happens."),
      el("div", { class: "table-wrap" }, el("table", { class: "table" }, [
        el("thead", {}, el("tr", {}, [
          el("th", { text: "Indicator" }), el("th", { text: "What it measures" }),
          el("th", { class: "num", text: "Baseline" }), el("th", { class: "num", text: "Max lift" })
        ])),
        el("tbody", {}, window.APP.indicators.map(function (d) {
          return el("tr", {}, [
            el("td", {}, el("div", {}, [
              el("div", { style: "font-weight:500", text: d.name }),
              el("div", { class: "tiny muted", text: d.basis })
            ])),
            el("td", { class: "tiny muted", text: d.measure }),
            el("td", { class: "num", text: U.num(d.base, d.dp) + " " + d.unit.split("/")[0] }),
            el("td", { class: "num", text: "+" + U.pct(d.gmax * 100, 0) })
          ]);
        }))
      ])),
      h4("Why the ceilings differ"),
      p("Ticket sales get the smallest ceiling (+8%) because NBA arenas already run near capacity — you cannot sell seats that don't exist. Viewership gets the largest (+35%) because national audiences genuinely swing that much between a flat season and a great one. Revenue sits at +18%, roughly the biggest year-over-year jump the league has managed outside a media-rights reset.")
    ]),

    portfolio: () => el("div", { class: "prose" }, [
      p("The Portfolio tab charts daily closing prices for whatever tickers you track, starting with BCA (BBCA.JK) on the Indonesia Stock Exchange."),
      h4("Where the prices come from"),
      ol([
        "A GitHub Action runs daily at 12:00 UTC, pulls the closes from Yahoo Finance and commits them to <code>data/prices/</code> in your repository.",
        "The site reads that committed file first — instant, no API key, works offline.",
        "If the file is more than 30 hours old, the page asks Yahoo for fresh numbers directly through a CORS relay."
      ]),
      h4("Adding a holding"),
      p("Use the exact symbol from the Yahoo Finance URL. Indonesian listings end in .JK, so finance.yahoo.com/quote/BBCA.JK gives you BBCA.JK. Adding it here charts it immediately. To have it refreshed automatically every day, also add the ticker to data/portfolio.json in your repo — the README has the exact snippet."),
      h4("Position maths"),
      p("Record each purchase as a lot with its date, share count, price and fees. The app tracks average cost, market value, unrealised profit and loss, and the day's move for every position."),
      el("p", { class: "muted", style: "font-size:13.5px" }, [
        el("b", { text: "Worth saying plainly: " }),
        "this is a record-keeping tool, not investment advice. Prices are delayed, may be wrong, and nothing here is a recommendation to buy or sell anything."
      ])
    ]),

    sync: () => el("div", { class: "prose" }, [
      p("Your data lives in this browser by default. Nothing is sent anywhere unless you connect Firebase."),
      h4("Same data on every device"),
      p("Once Firebase is configured in js/config.js, a Sync button appears in the header. Sign in with Google, an email address, or anonymously, and your season syncs to every device you sign in from. Changes propagate live — log something on your phone and this tab updates itself."),
      p("Anonymous sign-in works instantly but is tied to one browser. If you started anonymously, use \"Link a Google account\" to make it permanent without losing anything."),
      h4("Backups"),
      p("Settings → Export downloads your entire season as a JSON file: every transaction, budget, bill, unlock and price cache. Import reads it back. Keep one somewhere safe."),
      h4("Setting Firebase up"),
      p("The README in the repository walks through it end to end — creating the project, enabling Authentication and Firestore, pasting the config, and the exact security rules that make each user's data readable only by them. It takes about ten minutes.")
    ]),

    weekly: () => el("div", { class: "prose" }, [
      p("The weekly tab is where most day-to-day decisions actually get made, because a week is short enough to correct and long enough to absorb a bad Tuesday."),
      h4("Safe-to-spend"),
      p("The big number is what's left in this week's allowance. It's set when the week opens and then held still, so it only ever moves when you spend. A countdown that drifts on its own is a countdown nobody trusts."),
      h4("Choosing when your week starts"),
      ul([
        "<b>Monday</b> — the calendar default. Weeks line up with everyone else's.",
        "<b>Sunday</b> — if that's how you read a calendar.",
        "<b>Payday anchor</b> — pick the date you're actually paid and every week counts forward from there."
      ]),
      p("Payday anchoring is the one worth trying if your salary lands mid-month. A week that resets two days after money arrives matches how spending really behaves better than an arbitrary Monday."),
      h4("The burn chart"),
      p("Grey bars are what you spent each day; the dotted line is even pace. Bars under the line mean you're building slack for the weekend. A tall bar early isn't a failure — it just means the remaining days tighten, which the daily number already reflects."),
      h4("Cycle rollover"),
      p("Separately from weeks, your monthly cycle can start on any day of the month. Set it to your pay date and the Monthly tab's variance table lines up with your actual financial month instead of the calendar's.")
    ]),

    currency: () => el("div", { class: "prose" }, [
      p("Convert between every ISO 4217 currency — 156 of them, from IDR and USD down to the ones you'll never need."),
      h4("Using it"),
      ol([
        "Type an amount and pick the two currencies.",
        "Press <b>⇅</b> to flip the direction; the converted figure carries over as the new input.",
        "The quick buttons (1, 10, 100, 1K, 1M) jump to round amounts.",
        "Tap any row in the rate table to make it the target currency."
      ]),
      h4("Where the rates come from"),
      p("An open exchange-rate feed served over the jsDelivr CDN, covering 200+ currencies. It sends CORS headers, so your browser fetches it directly with no proxy in the way — one request returns every currency quoted against the US dollar."),
      p("If that feed is unreachable, the app falls back to the European Central Bank's daily reference rates. The ECB publishes about 30 currencies, so during a fallback some rows show a dash. The card subtitle tells you which source is in use."),
      h4("What these numbers are, and aren't"),
      p("Mid-market rates — the midpoint between buy and sell. Your bank, your card and the money changer all take a margin off that, so treat this as the honest reference figure rather than a quote you'll be offered."),
      p("Rates settle once per business day, so a Saturday lookup shows Friday's close. Normal for currency data, and fine for budgeting. This is not a trading feed."),
      h4("Display currency"),
      p("Settings → Currency changes how every figure in the app is formatted. Zero-decimal currencies like IDR, JPY and KRW are shown without cents, because nobody writes Rp 8.500,00.")
    ]),

    collection: () => el("div", { class: "prose" }, [
      p("Two collections, 85 pieces of artwork, all of it earned rather than given."),
      h4("Viewing what you've unlocked"),
      ul([
        "Tap any unlocked tile to open its card — franchise history, or a legend's tier and skill ratings.",
        "Tap the artwork itself to open it full size.",
        "<b>View all N full size</b> opens everything you've earned as one gallery."
      ]),
      h4("The full-size viewer"),
      ul([
        "<b>Zoom</b> — the + and − buttons, scroll wheel, or pinch on touch.",
        "<b>Double-tap</b> the image to zoom to 200% and back.",
        "<b>Arrow keys</b> or the side buttons walk through the collection.",
        "<b>+ / − / 0</b> zoom in, out, and reset. <b>Esc</b> closes.",
        "Once zoomed, drag or scroll to pan around."
      ]),
      h4("Locked tiles"),
      p("Locked entries stay visible but greyed, with the number of logged days still needed. Seeing what's next is the point — a locked door you can't see isn't motivating."),
      h4("Reading a legend card"),
      p("Six ratings out of 100: shooting, dribbling, strength, playmaking, rebounding and defence. The overall figure is their mean. Tier 5 legends induct first and Tier 1 last, so the cards get heavier as your streak gets longer.")
    ]),

    trouble: () => el("div", { class: "prose" }, [
      p("Short answers to the things most likely to go wrong."),
      h4("“Something broke” appeared where a tab should be"),
      p("That's the app catching its own error instead of showing you a blank screen. Your data is untouched — it lives in browser storage, not in the tab that failed. Reload the page and it will usually come back. If one particular tab keeps failing, use Settings → Export from any working tab to take a backup before doing anything else."),
      h4("The price chart is empty"),
      p("Until the GitHub Action has run once, there's no committed price history to read. Run it manually: your repository → Actions → <i>Update price &amp; FX snapshots</i> → Run workflow. After that it runs itself daily."),
      h4("Refresh says the live feed didn't answer"),
      p("Browsers aren't allowed to call Yahoo Finance directly, so live prices route through public CORS relays. Those are third-party services and they rate-limit without warning. When they don't answer, the app falls back to the snapshot committed in your repository — which is why the chart and every figure stay correct. Only the intraday price is missing."),
      p("The snapshot refreshes every two hours during the Jakarta session, so pressing Refresh re-reads a file that is rarely more than two hours old, and that read is same-origin — it can't be blocked."),
      p("Press <b>Check</b> on the Portfolio tab to test each source separately. It will tell you whether the problem is the relays or something else."),
      h4("Exchange rates won't load"),
      p("The rate feed doesn't use those relays, so it usually just works. If it doesn't, press Update rates. If rows show dashes, the app is on the ECB fallback and only about 30 currencies are available until the main source returns."),
      h4("Adding an investment seemed to fail"),
      p("The holding is saved the moment you press Add. The price fetch happens afterwards and is allowed to fail, so a blocked relay never rejects a valid ticker — you'll see the holding appear either way."),
      p("Press <b>Look up ticker</b> in the dialog before adding. It fills in the company name and currency for you, and tells you plainly whether Yahoo recognises the symbol or whether it simply couldn't be reached. Those are different problems: the first means fix the ticker, the second means wait and refresh."),
      p("A bare four-letter code like BBRI is caught instantly, before any network call — Indonesian listings need the .JK suffix."),
      h4("My streak looks wrong"),
      p("Streaks are derived from transaction dates, never stored as a score. Open the Calendar tab — any red square is a day with no entries. Add a backdated entry to that day and everything downstream repairs itself."),
      h4("Everything disappeared"),
      p("Local data lives in this browser's storage. Clearing site data, or using a private window, loses it. Settings → Export takes a backup; connecting Firebase syncs it off-device.")
    ]),

    faq: () => el("div", { class: "prose" }, [
      h4("I forgot to log yesterday. Can I fix it?"),
      p("Yes. Add an entry dated yesterday and the streak repairs itself — every unlock is recalculated from your ledger each time it changes, not stored as a separate score. Only add entries that actually happened, though; the tool is only worth as much as the data in it."),
      h4("Does one tiny entry count the same as logging everything?"),
      p("For the streak, yes — one entry marks the day. For the budget, obviously not. The game exists to get you opening the app; the numbers are what make opening it worthwhile."),
      h4("Why did my weekly allowance change mid-week?"),
      p("It shouldn't. The ceiling is fixed when the week opens. It does move if you edit your income, bills or goals, because that changes the pool it was calculated from."),
      h4("Can I start the season over?"),
      p("Settings → Reset season wipes everything and starts from day one. Export a backup first if you might want it back."),
      h4("What happens after day 365?"),
      p("The calendar stops advancing but nothing breaks — keep logging, keep your collection. Change the start date in Settings to run a fresh season."),
      h4("Is my data private?"),
      p("In local mode it never leaves your browser. With Firebase, it goes to your own Firebase project under your own account, with security rules that restrict every document to its owner. Nobody else — including whoever deployed this — can read it.")
    ])
  };


  /* ------------------------------------------------------------------------
     Bahasa Indonesia. Deliberately written in everyday Indonesian rather than
     translated word for word — the finance terms people actually use (dana
     darurat, pos pengeluaran, jatuh tempo) instead of literal renderings.
     ---------------------------------------------------------------------- */
  const CONTENT_ID = {
    start: () => el("div", { class: "prose" }, [
      p("Banking on NBA adalah pencatat keuangan yang dibungkus satu musim NBA. Kamu mencatat uangmu setiap hari; liganya ikut tumbuh karena kamu rajin. Bolong satu hari, hitungannya kembali dari nol — itulah tekanan yang bikin kebiasaan ini jalan."),
      h4("Siapkan sekali saja"),
      ol([
        "Buka <b>Settings</b> (kanan atas), pilih mata uang dan tanggal mulai musim.",
        "Masuk ke tab <b>Monthly</b>, isi sumber pemasukan — gaji, freelance, apa pun yang rutin.",
        "Tambahkan tagihan tetap beserta tanggal jatuh temponya, lalu dana sinking, target tabungan, dan cicilan utang.",
        "Atur anggaran tiap kategori di bagian bawah tab Monthly. Sisanya menjadi dana fleksibelmu.",
        "Kembali ke tab <b>Today</b> dan catat pengeluaran pertamamu."
      ]),
      h4("Setelah itu cukup begini"),
      p("Buka aplikasi sekali sehari, catat pengeluaranmu, lalu tutup. Sisanya — rentetan hari, koleksi yang terbuka, indikator liga, batas mingguan — dihitung ulang sendiri dari catatanmu."),
      el("div", { class: "row", style: "margin-top:18px" }, [
        el("button", { class: "btn", text: "Ke tab Today", onclick: () => window.App.go("today") }),
        el("button", { class: "btn btn--ghost", text: "Atur pemasukan & tagihan", onclick: () => window.App.go("monthly") })
      ])
    ]),

    daily: () => el("div", { class: "prose" }, [
      p("Satu hari dihitung tercatat begitu ada satu transaksi bertanggal hari itu. Satu entri sudah cukup untuk menjaga rentetan dan mendapat boost — tapi angkanya baru berguna kalau jujur, jadi catat semuanya."),
      h4("Isi tiap entri"),
      ul([
        "<b>Jumlah</b> — satu-satunya kolom yang wajib.",
        "<b>Tanggal</b> — otomatis hari ini, tapi bisa diisi mundur. Mengisi hari yang bolong akan memperbaiki rentetanmu, karena koleksi dihitung ulang dari catatan setiap kali ada perubahan.",
        "<b>Kategori</b> — memakai kode ala box-score. GRO, DIN, TRN dan kawan-kawan adalah pengeluaran fleksibel; BIL, SNK, SAV dan DBT bersifat tetap dan tidak masuk jatah mingguanmu.",
        "<b>Metode pembayaran</b> — tunai, debit, kredit, e-wallet, atau transfer bank. Ini yang membentuk saldo per kantong.",
        "<b>Merchant dan catatan</b> — opsional, tapi inilah yang bikin daftar bulan lalu masih terbaca."
      ]),
      h4("Tiga cara mencatat"),
      ul([
        "Formulir cepat di tab <b>Today</b>.",
        "Tombol <b>+</b> merah yang mengambang di kanan bawah layar HP.",
        "Klik kotak mana pun di <b>Calendar</b> lalu tambahkan entri untuk tanggal itu."
      ]),
      h4("Pemasukan dan transfer"),
      p("Ganti formulir ke Income untuk gaji, bayaran freelance, hadiah, atau uang kembalian. Transfer memindahkan uang antar kantongmu sendiri — saldo per metode berubah, tapi tidak pernah dihitung sebagai pengeluaran.")
    ]),

    money: () => el("div", { class: "prose" }, [
      p("Tiga lapis, masing-masing menyuapi lapis berikutnya. Tidak ada uang yang dianggap bebas dipakai sebelum semua kewajiban dikeluarkan lebih dulu."),
      h4("Lapis 1 — bulanan"),
      formula("dana fleksibel = pemasukan − tagihan tetap − dana sinking − tabungan − utang"),
      p("Dana sinking membagi biaya tahunan menjadi dua belas, supaya premi asuransi tidak menghantam satu bulan sial saja. Tabungan dan cicilan dipotong sebelum dana fleksibel terbentuk — dan memang itu intinya: target yang cuma dibiayai sisa-sisa bukanlah target."),
      h4("Lapis 2 — mingguan"),
      formula("batas mingguan = (dana fleksibel − yang sudah terpakai) ÷ sisa minggu"),
      p("Batas ini dikunci saat minggu dimulai lalu ditahan, jadi hitung mundurnya hanya bergerak kalau kamu benar-benar belanja. Minggu bisa mengikuti kalender atau ritme gajianmu sendiri — aturnya di tab Weekly."),
      h4("Lapis 3 — harian"),
      formula("jatah hari ini = (batas mingguan − terpakai minggu ini) ÷ sisa hari"),
      p("Uang yang tidak terpakai otomatis bergulir ke depan. Hemat di hari Senin, angka hari Selasa naik sendiri; jebol di hari Senin, sisa minggunya mengetat untuk menutupinya."),
      h4("Rencana versus kenyataan"),
      p("Tab Monthly membandingkan anggaran tiap kategori dengan yang benar-benar terjadi, lalu menampilkan selisihnya. Hijau berarti masih ada ruang; merah berarti kategori itu jebol.")
    ]),

    game: () => el("div", { class: "prose" }, [
      p("Musim berjalan 365 hari sejak tanggal mulaimu, dalam dua fase yang pas persis dengan kalender."),
      h4("Fase 1 — Era Franchise"),
      ul([
        "Setiap <b>3 hari berturut-turut</b> membuka satu franchise NBA.",
        "30 franchise × 3 hari = <b>90 hari</b>.",
        "Tim terbuka mengikuti urutan liga: Wilayah Timur per divisi, lalu Barat."
      ]),
      h4("Fase 2 — Era Hall of Fame"),
      ul([
        "Terbuka begitu ke-30 franchise selesai dikumpulkan.",
        "Setiap <b>5 hari berturut-turut</b> melantik satu legenda.",
        "55 legenda × 5 hari = <b>275 hari</b>.",
        "Pelantikan berjalan dari Tier 5 menuju Tier 1, jadi bobot hadiahnya menanjak seiring kebiasaanmu. Michael Jordan adalah yang ke-55 dan jatuh tepat di hari ke-365."
      ]),
      formula("90 + 275 = 365 — musim sempurna membuka semuanya di hari terakhir"),
      h4("Harga satu hari yang bolong"),
      p("Melewatkan satu hari mengembalikan hitungan menuju koleksi berikutnya ke nol, tapi tidak pernah mencabut yang sudah kamu miliki. Boost-mu juga berhenti tumbuh di hari itu, karena boost memang sekadar jumlah hari yang kamu catat."),
      p("Karena kedua fase menuntut hari berurutan, konsistensi jauh lebih berharga daripada banyak-banyakan. Tiga puluh hari yang terpencar tidak membuka apa pun; tiga puluh hari beruntun membuka sepuluh franchise.")
    ]),

    indicators: () => el("div", { class: "prose" }, [
      p("Ada lima indikator liga di papan skor. Masing-masing berangkat dari angka asli musim 2024-25 lalu menanjak seiring kamu mencatat."),
      formula("nilai = dasar × ( 1 + kenaikan maks × ( 1 − e^( −hari tercatat ÷ 120 ) ) )"),
      p("Tiap hari yang tercatat bernilai satu poin momentum — itulah +1% yang tampil di papan skor. Bagian eksponensialnya memberi hasil yang makin melandai, sehingga musim sempurna 365 hari mencapai 95,2% dari langit-langit tiap indikator, bukan menggelembung tak masuk akal. Bunga berbunga 1% per hari akan melipatgandakan pendapatan liga 37 kali dalam setahun, dan itu jelas tidak pernah terjadi."),
      el("div", { class: "table-wrap" }, el("table", { class: "table" }, [
        el("thead", {}, el("tr", {}, [
          el("th", { text: "Indikator" }), el("th", { text: "Yang diukur" }),
          el("th", { class: "num", text: "Dasar" }), el("th", { class: "num", text: "Maks" })
        ])),
        el("tbody", {}, window.APP.indicators.map(function (d) {
          return el("tr", {}, [
            el("td", {}, el("div", {}, [
              el("div", { style: "font-weight:500", text: d.nameId || d.name }),
              el("div", { class: "tiny muted", text: d.basisId || d.basis })
            ])),
            el("td", { class: "tiny muted", text: d.measureId || d.measure }),
            el("td", { class: "num", text: U.num(d.base, d.dp) + " " + d.unit.split("/")[0] }),
            el("td", { class: "num", text: "+" + U.pct(d.gmax * 100, 0) })
          ]);
        }))
      ])),
      h4("Kenapa langit-langitnya berbeda"),
      p("Penjualan tiket mendapat batas terkecil (+8%) karena arena NBA sudah nyaris penuh — kursi yang tidak ada tidak bisa dijual. Jumlah penonton mendapat yang terbesar (+35%) karena audiens nasional memang bisa berayun sejauh itu antara musim yang datar dan musim yang seru. Pendapatan berada di +18%, kira-kira lonjakan tahunan terbesar yang pernah dicapai liga di luar pembaruan hak siar.")
    ]),

    portfolio: () => el("div", { class: "prose" }, [
      p("Tab Portfolio menggambar grafik harga penutupan harian untuk saham yang kamu pantau, dimulai dari BCA (BBCA.JK) di Bursa Efek Indonesia."),
      h4("Dari mana harganya"),
      ol([
        "GitHub Action berjalan tiap hari pukul 12:00 UTC (19:00 WIB), menarik harga penutupan dari Yahoo Finance dan menyimpannya ke <code>data/prices/</code> di repositorimu.",
        "Situs membaca berkas itu lebih dulu — instan, tanpa kunci API, tetap jalan saat offline.",
        "Kalau berkasnya sudah lewat 30 jam, halaman meminta angka baru langsung ke Yahoo lewat relay CORS.",
        "Nyalakan <b>Live</b> dan halaman ikut menarik harga berjalan tiap menit selama tab ini terbuka."
      ]),
      h4("Menambah saham"),
      p("Pakai kode persis seperti di URL Yahoo Finance. Saham Indonesia berakhiran .JK, jadi finance.yahoo.com/quote/BBCA.JK memberimu BBCA.JK. Menambahkannya di sini langsung menggambar grafiknya. Supaya diperbarui otomatis tiap hari, tambahkan juga kodenya ke data/portfolio.json di repositorimu — potongan kodenya ada di README."),
      h4("Hitungan posisi"),
      p("Catat tiap pembelian lengkap dengan tanggal, jumlah lembar, harga, dan biaya. Aplikasi melacak harga rata-rata, nilai pasar, untung-rugi yang belum terealisasi, dan pergerakan hari ini untuk tiap posisi."),
      h4("Menjual dan menghitung untung"),
      p("Tombol <b>Sell</b> mencatat penjualan; <b>What if I sold?</b> memperlihatkan hitungannya tanpa menyimpan apa pun. Keduanya memakai metode harga rata-rata: tiap penjualan diukur terhadap rata-rata seluruh pembelian sampai tanggal itu, lalu memisahkan untung yang sudah terealisasi dari yang belum."),
      formula("untung = (lembar × harga jual) − biaya − (lembar × harga rata-rata)"),
      el("p", { class: "muted", style: "font-size:13.5px" }, [
        el("b", { text: "Perlu dikatakan terus terang: " }),
        "ini alat pencatat, bukan nasihat investasi. Harga tertunda, bisa saja keliru, dan tidak ada satu pun di sini yang merupakan ajakan membeli atau menjual."
      ])
    ]),

    sync: () => el("div", { class: "prose" }, [
      p("Datamu tersimpan di browser ini secara bawaan. Tidak ada yang dikirim ke mana pun kecuali kamu menyambungkan Firebase."),
      h4("Data yang sama di semua perangkat"),
      p("Setelah Firebase diisi di js/config.js, tombol Sync muncul di header. Masuk dengan Google, alamat email, atau secara anonim, dan musimmu tersinkron ke tiap perangkat tempat kamu masuk. Perubahan menyebar langsung — catat sesuatu di HP, tab ini ikut memperbarui dirinya."),
      p("Masuk secara anonim langsung jalan tapi terikat pada satu browser. Kalau kamu memulai dari anonim, pakai \"Link a Google account\" untuk membuatnya permanen tanpa kehilangan apa pun."),
      h4("Cadangan"),
      p("Settings → Export mengunduh seluruh musimmu sebagai berkas JSON: semua transaksi, anggaran, tagihan, koleksi, dan simpanan harga. Import membacanya kembali. Simpan satu di tempat aman."),
      h4("Menyiapkan Firebase"),
      p("README di repositori memandunya dari awal sampai akhir — membuat proyek, menyalakan Authentication dan Firestore, menempel konfigurasi, sampai aturan keamanan persis yang membuat data tiap orang hanya bisa dibaca dirinya sendiri. Perlu sekitar sepuluh menit.")
    ]),

    weekly: () => el("div", { class: "prose" }, [
      p("Tab mingguan adalah tempat sebagian besar keputusan sehari-hari benar-benar diambil, karena satu minggu cukup pendek untuk dikoreksi dan cukup panjang untuk menyerap satu hari Selasa yang jebol."),
      h4("Aman dipakai"),
      p("Angka besar itu adalah sisa jatah minggu ini. Dikunci saat minggu dimulai lalu ditahan, jadi hanya bergerak kalau kamu benar-benar belanja. Hitung mundur yang berubah sendiri tidak akan dipercaya siapa pun."),
      h4("Memilih awal minggu"),
      ul([
        "<b>Senin</b> — bawaan kalender. Minggumu sejajar dengan orang lain.",
        "<b>Minggu</b> — kalau begitu caramu membaca kalender.",
        "<b>Patokan gajian</b> — pilih tanggal kamu benar-benar digaji, dan tiap minggu dihitung maju dari situ."
      ]),
      p("Patokan gajian layak dicoba kalau gajimu turun di tengah bulan. Minggu yang dimulai dua hari setelah uang masuk jauh lebih cocok dengan perilaku belanja yang sebenarnya dibanding hari Senin yang asal."),
      h4("Grafik pemakaian"),
      p("Batang abu-abu adalah pengeluaran tiap hari; garis putus-putus adalah laju rata. Batang di bawah garis berarti kamu menabung ruang untuk akhir pekan. Batang tinggi di awal bukan kegagalan — hanya membuat sisa harinya lebih ketat, dan angka harianmu sudah menghitungnya."),
      h4("Pergantian siklus"),
      p("Terpisah dari minggu, siklus bulananmu bisa dimulai di tanggal berapa pun. Setel ke tanggal gajian dan tabel selisih di tab Monthly akan mengikuti bulan keuanganmu yang sebenarnya, bukan bulan kalender.")
    ]),

    currency: () => el("div", { class: "prose" }, [
      p("Konversi antar seluruh mata uang ISO 4217 — 156 mata uang, dari IDR dan USD sampai yang tidak akan pernah kamu butuhkan."),
      h4("Cara memakainya"),
      ol([
        "Ketik jumlahnya lalu pilih dua mata uang.",
        "Tekan <b>⇅</b> untuk membalik arah; hasil konversinya jadi angka masukan yang baru.",
        "Tombol cepat (1, 10, 100, 1K, 1M) melompat ke angka bulat.",
        "Ketuk baris mana pun di tabel kurs untuk menjadikannya mata uang tujuan."
      ]),
      h4("Dari mana kursnya"),
      p("Dari feed kurs terbuka yang disajikan lewat CDN jsDelivr, mencakup 200+ mata uang. Feed ini mengirim header CORS, jadi browsermu mengambilnya langsung tanpa perantara — satu permintaan mengembalikan semua mata uang terhadap dolar AS."),
      p("Kalau feed itu tidak bisa dijangkau, aplikasi memakai kurs referensi harian Bank Sentral Eropa. ECB menerbitkan sekitar 30 mata uang, jadi saat memakai cadangan sebagian baris akan menampilkan tanda hubung. Subjudul kartunya memberitahu sumber mana yang sedang dipakai."),
      h4("Angka ini apa, dan bukan apa"),
      p("Ini kurs tengah — titik tengah antara harga beli dan jual. Bank, kartu, dan money changer semuanya mengambil margin dari situ, jadi anggap ini angka acuan yang jujur, bukan penawaran yang akan kamu terima."),
      p("Kurs ditetapkan sekali tiap hari kerja, jadi pengecekan hari Sabtu menampilkan penutupan hari Jumat. Itu normal untuk data mata uang dan cukup untuk mengatur anggaran. Ini bukan feed untuk trading."),
      h4("Mata uang tampilan"),
      p("Settings → Currency mengubah format setiap angka di aplikasi. Mata uang tanpa desimal seperti IDR, JPY, dan KRW ditampilkan tanpa sen, karena tidak ada yang menulis Rp 8.500,00.")
    ]),

    collection: () => el("div", { class: "prose" }, [
      p("Dua koleksi, 85 karya gambar, semuanya didapat — bukan diberi."),
      h4("Melihat yang sudah terbuka"),
      ul([
        "Ketuk ubin mana pun yang sudah terbuka untuk membuka kartunya — sejarah franchise, atau tier dan rating keterampilan sang legenda.",
        "Ketuk gambarnya untuk membukanya dalam ukuran penuh.",
        "<b>View all N full size</b> membuka semua yang sudah kamu dapat sebagai satu galeri."
      ]),
      h4("Penampil ukuran penuh"),
      ul([
        "<b>Perbesar</b> — tombol + dan −, roda gulir, atau cubit di layar sentuh.",
        "<b>Ketuk dua kali</b> gambarnya untuk memperbesar ke 200% lalu kembali.",
        "<b>Tombol panah</b> atau tombol di samping untuk berpindah koleksi.",
        "<b>+ / − / 0</b> memperbesar, memperkecil, dan mengembalikan. <b>Esc</b> menutup.",
        "Setelah diperbesar, seret atau gulir untuk menggeser gambar."
      ]),
      h4("Ubin yang terkunci"),
      p("Yang terkunci tetap terlihat tapi diredupkan, lengkap dengan sisa hari yang masih dibutuhkan. Bisa melihat apa yang berikutnya memang tujuannya — pintu terkunci yang tak terlihat tidak memotivasi siapa pun."),
      h4("Membaca kartu legenda"),
      p("Enam rating dari 100: tembakan, dribel, kekuatan, playmaking, rebound, dan pertahanan. Angka keseluruhan adalah rata-ratanya. Legenda Tier 5 dilantik lebih dulu dan Tier 1 paling akhir, jadi kartunya makin berbobot seiring rentetanmu makin panjang.")
    ]),

    trouble: () => el("div", { class: "prose" }, [
      p("Jawaban singkat untuk hal-hal yang paling mungkin bermasalah."),
      h4("Muncul “Something broke” di tempat sebuah tab"),
      p("Itu aplikasi menangkap errornya sendiri alih-alih menampilkan layar kosong. Datamu tidak tersentuh — datanya ada di penyimpanan browser, bukan di tab yang gagal. Muat ulang halaman dan biasanya kembali normal. Kalau satu tab terus gagal, pakai Settings → Export dari tab mana pun yang masih jalan untuk mencadangkan lebih dulu."),
      h4("Grafik harga kosong"),
      p("Selama GitHub Action belum pernah berjalan, tidak ada riwayat harga tersimpan untuk dibaca. Jalankan manual: repositorimu → Actions → <i>Update price &amp; FX snapshots</i> → Run workflow. Setelah itu ia berjalan sendiri tiap hari."),
      h4("Refresh bilang feed harga tidak menjawab"),
      p("Browser tidak diizinkan memanggil Yahoo Finance secara langsung, jadi harga berjalan lewat relay CORS publik. Itu layanan pihak ketiga yang membatasi permintaan tanpa peringatan. Kalau tidak menjawab, aplikasi memakai simpanan yang tersimpan di repositorimu — itulah sebabnya grafik dan semua angkanya tetap benar. Yang hilang cuma harga berjalannya."),
      p("Simpanan itu diperbarui tiap dua jam selama sesi bursa Jakarta, jadi menekan Refresh membaca berkas yang jarang lebih tua dari dua jam, dan pembacaannya satu asal — tidak bisa diblokir."),
      p("Tekan <b>Check</b> di tab Portfolio untuk menguji tiap sumber satu per satu. Di situ akan terlihat apakah masalahnya di relay atau di tempat lain."),
      h4("Kurs mata uang tidak mau dimuat"),
      p("Feed kurs tidak memakai relay itu, jadi biasanya langsung jalan. Kalau tidak, tekan Update rates. Kalau barisnya bertanda hubung, aplikasi sedang memakai cadangan ECB dan hanya sekitar 30 mata uang tersedia sampai sumber utamanya kembali."),
      h4("Menambah investasi sepertinya gagal"),
      p("Kepemilikannya tersimpan begitu kamu menekan Add. Pengambilan harga terjadi setelahnya dan boleh gagal, jadi relay yang terblokir tidak akan pernah menolak kode yang benar — sahamnya tetap muncul di daftarmu."),
      p("Tekan <b>Look up ticker</b> di dialognya sebelum menambahkan. Nama perusahaan dan mata uangnya akan terisi sendiri, dan kamu akan diberi tahu dengan jelas apakah Yahoo mengenali kodenya atau sekadar tidak bisa dihubungi. Itu dua masalah berbeda: yang pertama berarti perbaiki kodenya, yang kedua berarti tunggu lalu refresh."),
      p("Kode empat huruf polos seperti BBRI langsung dicegat sebelum ada panggilan jaringan — saham Indonesia butuh akhiran .JK."),
      h4("Rentetanku terlihat salah"),
      p("Rentetan diturunkan dari tanggal transaksi, tidak pernah disimpan sebagai skor. Buka tab Calendar — kotak merah mana pun adalah hari tanpa catatan. Tambahkan entri bertanggal hari itu dan semuanya akan pulih sendiri."),
      h4("Semuanya hilang"),
      p("Data lokal ada di penyimpanan browser ini. Menghapus data situs, atau memakai jendela penyamaran, akan menghilangkannya. Settings → Export membuat cadangan; menyambungkan Firebase menyinkronkannya ke luar perangkat.")
    ]),

    faq: () => el("div", { class: "prose" }, [
      h4("Aku lupa mencatat kemarin. Bisa diperbaiki?"),
      p("Bisa. Tambahkan entri bertanggal kemarin dan rentetanmu pulih sendiri — tiap koleksi dihitung ulang dari catatanmu setiap ada perubahan, bukan disimpan sebagai skor terpisah. Tapi tambahkan hanya yang memang terjadi; alat ini cuma sebagus data di dalamnya."),
      h4("Apa satu entri kecil sama nilainya dengan mencatat semuanya?"),
      p("Untuk rentetan, iya — satu entri menandai hari itu. Untuk anggaran, jelas tidak. Permainannya ada supaya kamu mau membuka aplikasi; angkanyalah yang membuat membukanya jadi berguna."),
      h4("Kenapa jatah mingguanku berubah di tengah minggu?"),
      p("Seharusnya tidak. Batasnya dikunci saat minggu dimulai. Ia memang bergerak kalau kamu mengubah pemasukan, tagihan, atau target, karena itu mengubah dana yang jadi dasar hitungannya."),
      h4("Bisa mengulang musim dari awal?"),
      p("Settings → Reset season menghapus semuanya dan memulai dari hari pertama. Ekspor cadangan dulu kalau sewaktu-waktu ingin mengembalikannya."),
      h4("Apa yang terjadi setelah hari ke-365?"),
      p("Kalendernya berhenti maju tapi tidak ada yang rusak — teruslah mencatat, koleksimu tetap milikmu. Ubah tanggal mulai di Settings untuk menjalankan musim baru."),
      h4("Apakah datanya aman?"),
      p("Dalam mode lokal, data tidak pernah keluar dari browsermu. Dengan Firebase, data masuk ke proyek Firebase milikmu sendiri di bawah akunmu sendiri, dengan aturan keamanan yang mengunci tiap dokumen hanya untuk pemiliknya. Tidak ada orang lain — termasuk siapa pun yang men-deploy ini — yang bisa membacanya.")
    ])
  };

  const CONTENT = { en: CONTENT_EN, id: CONTENT_ID };

  /* A missing or half-translated section should degrade to the other
     language, or to a plain note — never to a blank tab or a thrown error. */
  function renderSection(key, L) {
    const pick = (CONTENT[L] && CONTENT[L][key]) ||
                 (CONTENT[L === "id" ? "en" : "id"] || {})[key];
    if (typeof pick !== "function") {
      return el("div", { class: "prose" }, [
        p(L === "id"
          ? "Bagian ini belum tersedia. Coba pilih bagian lain di atas."
          : "This section isn't available yet. Pick another one above.")
      ]);
    }
    try {
      return pick();
    } catch (e) {
      return el("div", { class: "prose" }, [
        p(L === "id"
          ? "Bagian ini gagal dimuat. Bagian lain tetap bisa dibuka."
          : "This section failed to load. The other sections still work."),
        el("p", { class: "tiny muted", text: String(e && e.message || e) })
      ]);
    }
  }


  window.Views = window.Views || {};
  window.Views.guide = function () {
    const L = lang();

    const nav = el("div", { class: "row row--tight", style: "margin-bottom:4px;flex-wrap:wrap" },
      SECTIONS.map((s) => el("button", {
        class: "chip", style: "cursor:pointer" + (open === s.id ? ";background:var(--chalk);color:var(--floor);border-color:var(--chalk)" : ""),
        text: s.label[L],
        onclick: function () { open = s.key; window.App.render(); }
      })));

    const langSeg = el("div", { class: "seg" }, [
      el("button", { class: L === "en" ? "is-on" : "", text: "English", onclick: () => setLang("en") }),
      el("button", { class: L === "id" ? "is-on" : "", text: "Bahasa Indonesia", onclick: () => setLang("id") })
    ]);

    const section = SECTIONS.find((s) => s.key === open) || SECTIONS[0];

    return el("div", { class: "stack" }, [
      UI.card(
        t("How to use Banking on NBA", "Cara memakai Banking on NBA"),
        t("Everything in one place — pick a section", "Semuanya di satu tempat — pilih bagiannya"),
        el("div", {}, [nav]),
        langSeg),
      UI.card(section.label[L], null, renderSection(section.key, L))
    ]);
  };
})();
